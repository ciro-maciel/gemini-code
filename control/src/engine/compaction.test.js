import { describe, expect, test } from 'bun:test'

import { cutPoint, shouldCompact, summarize, transcriptOf, visibleMessages } from './compaction.js'

const words = size => 'x'.repeat(size)
const conversation = [
    { role: 'user', content: words(1000) },
    { role: 'assistant', content: '', tool_calls: [{ id: 'a', type: 'function', function: { name: 'file_read', arguments: '{"path":"pauta.md"}' } }] },
    { role: 'tool', tool_call_id: 'a', content: words(3000) },
    { role: 'assistant', content: words(500) },
    { role: 'user', content: words(400) },
    { role: 'assistant', content: '', tool_calls: [{ id: 'b', type: 'function', function: { name: 'files_list', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: 'b', content: words(600) },
    { role: 'assistant', content: words(300) },
]

describe('compacting a full conversation', () => {
    test('it starts past 70% of the window, and never without a known window', () => {
        // A big window still compacts at the working budget: speed and cost, not only room.
        expect(shouldCompact(81_000, 1_000_000)).toBe(true)
        expect(shouldCompact(79_000, 1_000_000)).toBe(false)
        // A small window compacts at its own 70% first.
        expect(shouldCompact(50_000, 64_000)).toBe(true)
        expect(shouldCompact(81_000, null)).toBe(true)
        expect(shouldCompact(0, 1_000_000)).toBe(false)
    })

    test('the cut keeps about the last 30% word for word and never begins on a tool result', () => {
        const cut = cutPoint(conversation)
        expect(cut).toBe(4)
        expect(conversation[cut].role).not.toBe('tool')
        // A tail made only of a long call keeps its call with it.
        const long = [{ role: 'user', content: 'oi' }, { role: 'assistant', content: '', tool_calls: [{ id: 'c', type: 'function', function: { name: 'x', arguments: '{}' } }] }, { role: 'tool', tool_call_id: 'c', content: words(9000) }]
        expect(cutPoint(long)).toBe(1)
    })

    test('a later cut starts after the earlier one; nothing left to fold gives null', () => {
        expect(cutPoint(conversation, 4)).toBeGreaterThan(4)
        expect(cutPoint([{ role: 'user', content: 'oi' }])).toBeNull()
        // A huge conversation keeps at most ~60k characters word for word, not 30% of it.
        const huge = Array.from({ length: 200 }, (_, i) => ({ role: i % 2 ? 'assistant' : 'user', content: 'x'.repeat(5_000) }))
        const kept = huge.slice(cutPoint(huge)).reduce((sum, m) => sum + m.content.length, 0)
        expect(kept).toBeLessThanOrEqual(65_000)
    })

    test('the model reads the summary and the tail; the stored messages are untouched', () => {
        const seen = visibleMessages(conversation, { summary: 'Pedido: pauta.', until: 4 })
        expect(seen).toHaveLength(5)
        expect(seen[0].content).toContain('Pedido: pauta.')
        expect(seen[1]).toBe(conversation[4])
        expect(visibleMessages(conversation, { summary: null, until: null })).toBe(conversation)
        // A cut past the end (the conversation went back): no summary.
        expect(visibleMessages(conversation.slice(0, 3), { summary: 'velho', until: 4 })).toHaveLength(3)
    })

    test('the transcript names who spoke and which tool ran, and folds in the earlier summary', () => {
        const text = transcriptOf(conversation.slice(0, 3), 'antes')
        expect(text).toStartWith('RESUMO ANTERIOR:\nantes')
        expect(text).toContain('AGENTE CHAMOU file_read {"path":"pauta.md"}')
        expect(text).toContain('[…cortado]')
    })

    test('the summary is written by the agent own model and account, without tools', async () => {
        const calls = []
        const complete = async request => (calls.push(request), { message: { content: ' 1. Pedidos: pauta ' }, cost: 0.01 })
        const answer = await summarize({ complete, model: 'claude-haiku-5-5', account: { id: 'acc' }, previous: null, messages: conversation })
        expect(answer).toEqual({ summary: '1. Pedidos: pauta', cost: 0.01 })
        expect(calls[0].model).toBe('claude-haiku-5-5')
        expect(calls[0].tools).toBeUndefined()
        await expect(summarize({ complete: async () => ({ message: { content: '' } }), model: 'm', account: null, messages: conversation })).rejects.toThrow('vazio')
    })
})
