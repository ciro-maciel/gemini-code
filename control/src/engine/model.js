import { config, IS_IN_SPRITE } from '../config.js'
import { estimateCost, headersFor, providerOf } from '../providers.js'
import { completeClaude } from './anthropic.js'
import { completeGemini, geminiIdOf } from './gemini.js'

/** A Claude model in Anthropic's own id: "anthropic/claude-haiku-5.5" and "claude-haiku-5-5" → "claude-haiku-5-5"; null otherwise. */
export function claudeIdOf(model) {
    const id = String(model || '').replace(/^anthropic\//, '')
    return /^claude-[a-z]+-[\d.-]+$/.test(id) ? id.replace(/\./g, '-') : null
}

// An agent on one of the account's keys talks straight to that provider.
function endpoint(account) {
    if (account) return { url: `${providerOf(account.provider).base}/chat/completions`, headers: headersFor(account.provider, account.key), name: providerOf(account.provider).name, isOpenRouter: account.provider === 'openrouter' }
    if (IS_IN_SPRITE && config.openrouterConnectorId) {
        return { url: `https://api.sprites.dev/v1/gateway/openrouter/${config.openrouterConnectorId}/v1/chat/completions`, headers: {}, name: 'OpenRouter', isOpenRouter: true, isHouse: true }
    }
    if (!config.openrouterApiKey) throw new Error('sem acesso ao OpenRouter: defina OPENROUTER_CONNECTOR_ID (no Sprite) ou OPENROUTER_API_KEY')
    return { url: 'https://openrouter.ai/api/v1/chat/completions', headers: { Authorization: `Bearer ${config.openrouterApiKey}` }, name: 'OpenRouter', isOpenRouter: true, isHouse: true }
}

// Anthropic models cache a prompt prefix when it is marked. Tools and the
// system prompt are ~7k tokens resent on every step; marking the system message
// caches both (tools come before it in the prefix).
function withPromptCache(model, messages) {
    if (!model.startsWith('anthropic/')) return messages
    return messages.map((message, index) =>
        index === 0 && message.role === 'system' && typeof message.content === 'string' ? { ...message, content: [{ type: 'text', text: message.content, cache_control: { type: 'ephemeral' } }] } : message
    )
}

// A provider sometimes answers with the model's raw template: on 21/10/2026 a
// DeepSeek reply began with "<｜begin▁of▁sentence｜>" and went on to recite the
// system prompt, translated. Such a reply is thrown away and asked again of
// another provider.
const RAW_TOKEN = /<｜[^｜]{0,40}｜>|begin▁of▁sentence|<\|(?:im_start|im_end|endoftext|eot_id)\|>/
const PROMPT_ECHO = /^#+ ?(?:Date|How to work|Como trabalhar)\b|\n#+ ?(?:How to work|Como trabalhar|Serviços conectados)\b/

export class BrokenReplyError extends Error {
    constructor(provider) {
        super(`o provedor ${provider || 'do modelo'} devolveu um texto quebrado`)
        this.provider = provider
    }
}

const isBroken = text => RAW_TOKEN.test(text) || PROMPT_ECHO.test(text)

// The first words are held until they can be checked, so a broken reply
// never reaches the screen.
const HOLD_CHARS = 32

/** Reads an OpenAI-style SSE stream into one assistant message. */
async function readStream(response, onText, name = 'OpenRouter') {
    const message = { role: 'assistant', content: '', tool_calls: [] }
    let usage = null
    let provider = null
    // Why the model stopped: "length" is the output limit, reached before a word or a call on 31/10/2026.
    let finishReason = null
    let held = ''
    let isReleased = false
    const release = text => {
        if (isReleased) return onText(text)
        held += text
        if (held.length < HOLD_CHARS) return
        if (isBroken(held)) throw new BrokenReplyError(provider)
        isReleased = true
        onText(held)
    }
    const decoder = new TextDecoder()
    let buffer = ''
    for await (const chunk of response.body) {
        buffer += decoder.decode(chunk, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop()
        for (const line of lines) {
            if (!line.startsWith('data: ')) continue
            const payload = line.slice(6).trim()
            if (payload === '[DONE]') continue
            let data
            try {
                data = JSON.parse(payload)
            } catch {
                continue
            }
            if (data.error) throw new Error(`${name}: ${data.error.message || JSON.stringify(data.error)}`)
            if (data.usage) usage = data.usage
            if (data.provider) provider = data.provider
            if (data.choices?.[0]?.finish_reason) finishReason = data.choices[0].finish_reason
            const delta = data.choices?.[0]?.delta
            if (!delta) continue
            if (delta.content) {
                message.content += delta.content
                release(delta.content)
            }
            for (const part of delta.tool_calls ?? []) {
                const slot = (message.tool_calls[part.index ?? 0] ??= { id: '', type: 'function', function: { name: '', arguments: '' } })
                if (part.id) slot.id = part.id
                if (part.function?.name) slot.function.name += part.function.name
                if (part.function?.arguments) slot.function.arguments += part.function.arguments
            }
        }
    }
    if (message.tool_calls.length === 0) delete message.tool_calls
    if (isBroken(message.content)) throw new BrokenReplyError(provider)
    if (!isReleased && held) onText(held)
    return { message, usage, provider, finishReason }
}

/**
 * One chat completion. Returns the assistant message and what it cost in
 * dollars, as OpenRouter reports it. With `onText`, the answer streams and
 * each piece of text is handed over as it arrives.
 */
// Models that refused the effort field (an OpenAI model that does not reason,
// say): asked again without it, and not sent it again while the central runs.
const NO_EFFORT = new Set()

export async function complete({ model, effort = null, account = null, messages, tools, responseFormat, maxTokens = 8000, onText, onThinking = null, avoid = [], signal = null }, attempt = 0) {
    // House calls on Gemini go straight to Google Gemini when GEMINI_API_KEY is configured.
    const houseGemini = !account && config.geminiApiKey ? geminiIdOf(model) : null
    if (houseGemini) {
        const answer = await completeGemini({ apiKey: config.geminiApiKey, model: houseGemini, messages, tools, responseFormat, maxTokens, isQuick: true, onText: onText ? text => onText(text) : null, signal })
        const cost = await estimateCost(houseGemini, { prompt_tokens: answer.usage.priced_prompt_tokens, completion_tokens: answer.usage.completion_tokens }).catch(() => 0)
        return { message: answer.message, cost, promptTokens: answer.usage.prompt_tokens, finishReason: answer.finishReason }
    }
    // A person's Google Gemini key uses the native Gemini API: streaming, thinking summaries, and cached tokens.
    if (account?.provider === 'google') {
        const answer = await completeGemini({ apiKey: account.key, model, effort, messages, tools, responseFormat, maxTokens: Math.max(maxTokens, 16384), onText: onText ? text => onText(text) : null, onThinking, signal })
        if (process.env.TIMING) console.log(`[timing] gemini ${model} ${answer.totalMs}ms first=${answer.firstMs}ms in=${answer.usage.prompt_tokens} cached=${answer.usage.cached_tokens} out=${answer.usage.completion_tokens}`)
        const cost = await estimateCost(model, { prompt_tokens: answer.usage.priced_prompt_tokens, completion_tokens: answer.usage.completion_tokens }).catch(() => 0)
        return { message: answer.message, cost, promptTokens: answer.usage.prompt_tokens, finishReason: answer.finishReason, timing: { firstMs: answer.firstMs, totalMs: answer.totalMs, cachedTokens: answer.usage.cached_tokens, promptTokens: answer.usage.prompt_tokens, outputTokens: answer.usage.completion_tokens } }
    }
    // House calls on a Claude model go straight to Anthropic when ANTHROPIC_API_KEY is configured.
    const houseClaude = !account && config.anthropicApiKey ? claudeIdOf(model) : null
    if (houseClaude) {
        const answer = await completeClaude({ apiKey: config.anthropicApiKey, model: houseClaude, messages, tools, maxTokens, isQuick: true, onText: onText ? text => onText(text) : null, signal })
        const cost = await estimateCost(houseClaude, { prompt_tokens: answer.usage.priced_prompt_tokens, completion_tokens: answer.usage.completion_tokens }).catch(() => 0)
        return { message: answer.message, cost, promptTokens: answer.usage.prompt_tokens, finishReason: answer.finishReason }
    }
    // A person's Anthropic key goes through Claude's own API: cache, effort and thinking work there.
    if (account?.provider === 'anthropic' && !responseFormat) {
        const answer = await completeClaude({ apiKey: account.key, model, effort, messages, tools, maxTokens: Math.max(maxTokens, 32000), onText: onText ? text => onText(text) : null, onThinking, signal })
        if (process.env.TIMING) console.log(`[timing] model ${model} ${answer.totalMs}ms first=${answer.firstMs}ms in=${answer.usage.prompt_tokens} cached=${answer.usage.cached_tokens} out=${answer.usage.completion_tokens}`)
        const cost = await estimateCost(model, { prompt_tokens: answer.usage.priced_prompt_tokens, completion_tokens: answer.usage.completion_tokens }).catch(() => 0)
        return { message: answer.message, cost, promptTokens: answer.usage.prompt_tokens, finishReason: answer.finishReason, timing: { firstMs: answer.firstMs, totalMs: answer.totalMs, cachedTokens: answer.usage.cached_tokens, promptTokens: answer.usage.prompt_tokens, outputTokens: answer.usage.completion_tokens } }
    }
    const { url, headers, name, isOpenRouter, isHouse } = endpoint(account)
    const again = changes => complete({ model, effort, account, messages, tools, responseFormat, maxTokens, onText, avoid, signal, ...changes }, changes.attempt ?? attempt)
    // The fastest provider of the model, not OpenRouter's default pick: on
    // DeepSeek V4.1 Flash the first word came in 1.56 s (p50) and up to 2.8 s
    // by default, and in 0.42 s with no outlier past 0.45 s sorted by
    // throughput (measured 21/10/2026, 8 calls each).
    const body = { model, messages: isHouse ? withPromptCache(model, messages) : messages, max_tokens: maxTokens }
    if (isOpenRouter) Object.assign(body, { usage: { include: true }, provider: { sort: 'throughput', ...(avoid.length ? { ignore: avoid } : {}) } })
    // How hard the agent's model thinks, where the model reasons; others ignore it.
    const sendsEffort = Boolean(effort) && !NO_EFFORT.has(`${name}:${model}`)
    if (sendsEffort) {
        if (isOpenRouter) body.reasoning = { effort }
        else body.reasoning_effort = effort
    }
    if (tools?.length) {
        body.tools = tools
        body.tool_choice = 'auto'
        body.parallel_tool_calls = false
    }
    if (responseFormat) body.response_format = responseFormat
    if (onText) {
        body.stream = true
        if (!isOpenRouter) body.stream_options = { include_usage: true }
    }

    const startedAt = performance.now()
    const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'X-Title': 'Assistant', ...headers },
        body: JSON.stringify(body),
        signal: signal ? AbortSignal.any([AbortSignal.timeout(180_000), signal]) : AbortSignal.timeout(180_000),
    })

    if ((response.status === 429 || response.status >= 500) && attempt < 4) {
        // Logged: under load this is where the time goes, and it is invisible otherwise.
        console.warn(`[model] ${model} respondeu ${response.status}; tentativa ${attempt + 2} em ${2 ** attempt} s`)
        await Bun.sleep(1000 * 2 ** attempt)
        signal?.throwIfAborted()
        return again({ attempt: attempt + 1 })
    }
    if (!response.ok) {
        const text = (await response.text()).slice(0, 400)
        if (response.status === 400 && sendsEffort && /reasoning|effort|thinking/i.test(text)) {
            NO_EFFORT.add(`${name}:${model}`)
            return again({})
        }
        throw new Error(`${name} ${response.status}: ${text}`)
    }

    let message
    let usage
    let finishReason = null
    try {
        if (onText) {
            ;({ message, usage, finishReason } = await readStream(response, onText, name))
        } else {
            const data = await response.json()
            if (data.error) throw new Error(`${name}: ${data.error.message || JSON.stringify(data.error)}`)
            message = data.choices?.[0]?.message
            finishReason = data.choices?.[0]?.finish_reason ?? null
            usage = data.usage
            if (isBroken(message?.content || '')) throw new BrokenReplyError(data.provider)
        }
    } catch (error) {
        if (!(error instanceof BrokenReplyError) || !isOpenRouter || avoid.length >= 2) throw error
        console.warn(`[model] ${model}: ${error.message}; pedindo de novo a outro provedor`)
        response.body?.cancel?.().catch(() => {})
        return again({ avoid: [...avoid, error.provider || 'Together'] })
    }
    if (process.env.TIMING) console.log(`[timing] model ${model} ${Math.round(performance.now() - startedAt)}ms in=${usage?.prompt_tokens} out=${usage?.completion_tokens} cached=${usage?.prompt_tokens_details?.cached_tokens ?? 0}`)
    if (!message) throw new Error(`${name} devolveu uma resposta sem mensagem`)
    // OpenRouter says what a call cost; the other providers only count tokens.
    const cost = usage?.cost ?? (account ? await estimateCost(model, usage).catch(() => 0) : 0)
    return { message, cost, promptTokens: usage?.prompt_tokens ?? null, finishReason }
}

/** Asks for a JSON object and parses it, tolerating a fenced block. */
// A provider now and then answers empty or cut ("Unexpected EOF" sent a bot's
// routine command to an approval on 23/10): the object is read out of the
// text, and an answer without one is asked once more before giving up.
export async function completeJson({ model, system, user, maxTokens = 800, account = null }, attempt = 0) {
    const { message, cost } = await complete({
        model,
        account,
        maxTokens,
        // Claude's own API has no JSON mode; the prompt asks for JSON and the parse below finds it.
        ...(account?.provider === 'anthropic' || (!account && config.anthropicApiKey && claudeIdOf(model)) ? {} : { responseFormat: { type: 'json_object' } }),
        messages: [
            { role: 'system', content: system },
            { role: 'user', content: user },
        ],
    })
    const text = (message.content || '').replace(/```(?:json)?|```/g, '').trim()
    try {
        return { value: JSON.parse(text.slice(text.indexOf('{'), text.lastIndexOf('}') + 1) || text), cost }
    } catch (error) {
        if (attempt >= 1) throw error
        const again = await completeJson({ model, system, user, maxTokens, account }, attempt + 1)
        return { value: again.value, cost: cost + again.cost }
    }
}
