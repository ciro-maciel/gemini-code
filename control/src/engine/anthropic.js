import Anthropic from '@anthropic-ai/sdk'

// A person's Anthropic key talks to the native Messages API (29/10/2026), not
// to the OpenAI compatibility door, which caches no prompt, ignores the
// effort and hides the thinking. The central keeps its conversation in the
// OpenAI shape; this module turns it into Claude's blocks and the answer back.

// Lets a block the history no longer matches be dropped instead of failing the turn.
const BINDING_BETA = 'thinking-binding-controls-2026-08-01'
const EFFORTS = new Set(['low', 'medium', 'high', 'xhigh', 'max'])

/** Claude 4.6 and later think adaptively and take an effort; older ones take neither from here. */
export const thinksAdaptively = model => /claude-[a-z]+-(?:5|4-[678])(?:-|$)/.test(model) && !/haiku-4/.test(model)

let makeClient = apiKey => new Anthropic({ apiKey, maxRetries: 3 })

/** For tests: a client that answers without the network. */
export function useClient(factory) {
    makeClient = factory
}

const imageBlock = url => {
    const data = /^data:([^;]+);base64,(.+)$/.exec(url)
    return data ? { type: 'image', source: { type: 'base64', media_type: data[1], data: data[2] } } : { type: 'image', source: { type: 'url', url } }
}

const userBlocks = content =>
    typeof content === 'string'
        ? [{ type: 'text', text: content || ' ' }]
        : content.map(part => (part.type === 'image_url' ? imageBlock(part.image_url?.url ?? part.image_url) : { type: 'text', text: part.text ?? String(part) }))

const parseInput = text => {
    try {
        return JSON.parse(text || '{}')
    } catch {
        return {}
    }
}

/**
 * The central's messages as Claude's. The system prompt is the first message;
 * tool results that follow one another become one user turn. A reply keeps
 * its own blocks (`native`), thinking included, only in the turn running now:
 * dropping every earlier thinking block is the leading run the API allows.
 */
export function toClaude(messages) {
    const [first, ...rest] = messages
    const system = first?.role === 'system' ? String(first.content) : ''
    const history = first?.role === 'system' ? rest : messages
    const turnStart = history.findLastIndex(message => message.role === 'user')
    const out = []
    const push = (role, blocks) => {
        const last = out.at(-1)
        if (last?.role === role) last.content.push(...blocks)
        else out.push({ role, content: [...blocks] })
    }
    history.forEach((message, index) => {
        if (message.role === 'tool') return push('user', [{ type: 'tool_result', tool_use_id: message.tool_call_id, content: String(message.content ?? '') }])
        if (message.role === 'user' || message.role === 'system') return push('user', userBlocks(message.content))
        if (message.role !== 'assistant') return
        if (Array.isArray(message.native)) {
            const blocks = index > turnStart ? message.native : message.native.filter(block => block.type !== 'thinking' && block.type !== 'redacted_thinking')
            if (blocks.length) return push('assistant', blocks)
        }
        const blocks = []
        if (message.content) blocks.push({ type: 'text', text: message.content })
        for (const call of message.tool_calls ?? []) blocks.push({ type: 'tool_use', id: call.id, name: call.function.name, input: parseInput(call.function.arguments) })
        if (blocks.length) push('assistant', blocks)
    })
    return { system, messages: out }
}

/** Claude's answer in the central's shape, with its own blocks kept for the next step. */
export function fromClaude(message) {
    const text = message.content
        .filter(block => block.type === 'text')
        .map(block => block.text)
        .join('')
    const calls = message.content.filter(block => block.type === 'tool_use').map(block => ({ id: block.id, type: 'function', function: { name: block.name, arguments: JSON.stringify(block.input ?? {}) } }))
    const refused = message.stop_reason === 'refusal' ? 'O modelo recusou este pedido. Reformule, ou escolha outro modelo no chip de modelo.' : ''
    return { role: 'assistant', content: text || refused, ...(calls.length ? { tool_calls: calls } : {}), native: message.content }
}

/** What the call used, in the OpenAI-shaped usage the central prices: a cached read costs a tenth, a write a quarter more. */
export function usageOf(usage) {
    const input = usage?.input_tokens ?? 0
    const read = usage?.cache_read_input_tokens ?? 0
    const written = usage?.cache_creation_input_tokens ?? 0
    return { prompt_tokens: input + read + written, priced_prompt_tokens: input + read * 0.1 + written * 1.25, completion_tokens: usage?.output_tokens ?? 0, cached_tokens: read }
}

/**
 * One step of an agent on Claude. Tools, system and the conversation so far
 * are cached; thinking is adaptive at the agent's effort and its summary
 * streams to `onThinking` while the words stream to `onText`.
 */
// `isQuick`: the house's short jobs (a title, a judgment, a JSON answer): thinking off, as Haiku takes it.
export async function completeClaude({ apiKey, model, effort = null, messages, tools = [], maxTokens = 32000, onText = null, onThinking = null, signal = null, isQuick = false }) {
    const { system, messages: history } = toClaude(messages)
    const claudeTools = tools.map((tool, index) => ({
        name: tool.function.name,
        description: tool.function.description ?? '',
        input_schema: tool.function.parameters ?? { type: 'object', properties: {} },
        ...(index === tools.length - 1 ? { cache_control: { type: 'ephemeral' } } : {}),
    }))
    const isAdaptive = thinksAdaptively(model) && !isQuick
    const body = {
        model,
        max_tokens: maxTokens,
        messages: history,
        ...(system ? { system: [{ type: 'text', text: system, cache_control: { type: 'ephemeral' } }] } : {}),
        ...(claudeTools.length ? { tools: claudeTools } : {}),
        // The conversation so far: its last block is cached for the next step.
        cache_control: { type: 'ephemeral' },
        ...(isAdaptive ? { thinking: { type: 'adaptive', display: 'summarized', block_binding: { prefix_mismatch_behavior: 'drop_block' } }, betas: [BINDING_BETA] } : {}),
        ...(isAdaptive && EFFORTS.has(effort) ? { output_config: { effort } } : {}),
        // Haiku thinks by default; off is "disabled" there (Sonnet 5.5 refuses it and takes "between_tools").
        ...(isQuick ? { thinking: { type: model.startsWith('claude-sonnet') ? 'between_tools' : 'disabled' } } : {}),
    }
    const client = makeClient(apiKey)
    const options = signal ? { signal } : undefined
    const stream = isAdaptive ? client.beta.messages.stream(body, options) : client.messages.stream(body, options)
    let firstAt = null
    const startedAt = performance.now()
    for await (const event of stream) {
        if (event.type !== 'content_block_delta') continue
        firstAt ??= performance.now()
        if (event.delta.type === 'text_delta' && onText) onText(event.delta.text)
        if (event.delta.type === 'thinking_delta' && onThinking) onThinking(event.delta.thinking)
    }
    const message = await stream.finalMessage()
    // Said the OpenAI way, as the loop reads every provider: the output limit is "length".
    const finishReason = message.stop_reason === 'max_tokens' ? 'length' : (message.stop_reason ?? null)
    return { message: fromClaude(message), usage: usageOf(message.usage), finishReason, firstMs: firstAt === null ? null : Math.round(firstAt - startedAt), totalMs: Math.round(performance.now() - startedAt) }
}
