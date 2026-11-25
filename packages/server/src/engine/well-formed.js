// A tool call with no name and no id came back from Qwen on OpenRouter on
// 30/10/2026: it was stored, asked for approval as "Usar ", and from then on
// every provider refused the conversation, whichever model was chosen. A call
// without a name is never stored, and what reaches the model is only calls
// with a name and an id, each followed by its result.

/** The calls worth running: named ones, each with an id. */
export const wellFormedCalls = calls => (calls ?? []).filter(call => call?.function?.name?.trim()).map(call => (call.id ? call : { ...call, id: `call_${crypto.randomUUID().replaceAll('-', '')}` }))

// Each result goes right after the reply that asked for it (04/11/2026): a reply
// with three calls, the first waiting on an approval, a person who wrote, and the
// other two results stored after their message; Claude refused the conversation
// ("tool_use ids were found without tool_result blocks immediately after").

/** The conversation without nameless or idless calls, results without a call, or replies left empty; each result right after its call. */
export function wellFormedHistory(messages) {
    const results = new Map()
    for (const message of messages) if (message.role === 'tool' && !results.has(message.tool_call_id)) results.set(message.tool_call_id, message)
    const kept = []
    const placed = new Set()
    for (const message of messages) {
        if (message.role === 'tool') continue
        if (message.role !== 'assistant' || !message.tool_calls) {
            kept.push(message)
            continue
        }
        const calls = message.tool_calls.filter(call => call?.id && call.function?.name?.trim())
        if (calls.length === message.tool_calls.length) kept.push(message)
        else if (calls.length || message.content) {
            // Claude's own blocks describe the old calls; without them the reply is rebuilt from the calls kept.
            const { native, tool_calls, ...rest } = message
            kept.push(calls.length ? { ...rest, tool_calls: calls } : rest)
        }
        for (const call of calls) {
            if (!results.has(call.id) || placed.has(call.id)) continue
            placed.add(call.id)
            kept.push(results.get(call.id))
        }
    }
    return kept
}
