import { describe, expect, test } from 'bun:test'
import { buildRows } from './rows.js'

let id = 0
const ev = (type, data = {}, extra = {}) => ({ id: ++id, type, data, createdAt: id, taskId: 't1', botId: 'b1', ...extra })

describe('buildRows', () => {
    test('a turn: the message, the work block with its steps, and the answer', () => {
        const rows = buildRows([
            ev('user_message', { text: 'oi' }),
            ev('assistant', { text: 'vou ler', isFinal: false }),
            ev('tool_call', { name: 'computer_shell', toolCallId: 'c1', arguments: { command: 'ls' } }),
            ev('tool_result', { toolCallId: 'c1', preview: 'a.md' }),
            ev('assistant', { text: 'pronto', isFinal: true }),
        ])
        expect(rows.map(r => r.kind)).toEqual(['user', 'work', 'bot'])
        expect(rows[1].entries[0].thought).toBe('vou ler')
        expect(rows[1].entries[0].steps[0].result).toBe('a.md')
        expect(rows[2].text).toBe('pronto')
    })

    test('older texts without isFinal are read from what comes next', () => {
        const rows = buildRows([ev('assistant', { text: 'lendo' }), ev('tool_call', { name: 'read', toolCallId: 'c2' }), ev('assistant', { text: 'fim' })])
        expect(rows.map(r => r.kind)).toEqual(['work', 'bot'])
    })

    test('ask_user is an answer, not a step', () => {
        const rows = buildRows([ev('tool_call', { name: 'ask_user', arguments: { question: 'qual?' } })])
        expect(rows).toEqual([expect.objectContaining({ kind: 'bot', text: 'qual?', memories: [] })])
    })

    test('requests, artifacts, failures and pages become their own rows', () => {
        const rows = buildRows([
            ev('approval_requested', { approvalId: 'a1' }),
            ev('artifact', { key: 'k' }),
            ev('page', { url: 'https://a' }),
            ev('page', { url: 'https://b' }),
            ev('status', { status: 'failed', error: 'caiu' }),
        ])
        expect(rows.map(r => r.kind)).toEqual(['request', 'artifact', 'pages', 'failure'])
        expect(rows[2].pages).toHaveLength(2)
    })

    test('a requested connection that got made shrinks to ready', () => {
        const rows = buildRows([ev('connection_requested', { connectionId: 'x', title: 'Gmail' }), ev('connection_ready', { connectionId: 'x', title: 'Gmail' })])
        expect(rows[0].isReady).toBe(true)
    })

    test('another agent called with @ answers as its own message', () => {
        const rows = buildRows([ev('user_message', { text: '@Métricas e o ep39?', mention: { botId: 'b2', name: 'Métricas' } }), ev('colleague', { botId: 'b2', name: 'Métricas', text: '12 mil' })])
        expect(rows.map(r => r.kind)).toEqual(['user', 'colleague'])
        expect(rows[0].mention.name).toBe('Métricas')
        expect(rows[1]).toMatchObject({ botId: 'b2', name: 'Métricas', text: '12 mil' })
    })

    test('a note between people shows, and leaves once it was sent to the agent', () => {
        const note = ev('note', { text: 'o 2 é melhor', author: 'Ana', accountId: 'ana' })
        const other = ev('note', { text: 'concordo', author: 'Léo', accountId: 'leo' })
        expect(buildRows([note, other]).map(r => [r.kind, r.author])).toEqual([['note', 'Ana'], ['note', 'Léo']])
        const rows = buildRows([note, other, ev('user_message', { text: 'o 2 é melhor', author: 'Ana', fromNote: note.id })])
        expect(rows.map(r => r.kind)).toEqual(['note', 'user'])
        expect(rows[0].author).toBe('Léo')
    })
})

describe('the folded work', () => {
    test('a step redone by the same tool is recovered; one never redone is unresolved', () => {
        const rows = buildRows([
            ev('user_message', { text: 'publica' }),
            ev('tool_call', { name: 'mcp__blogs__blogs_write', toolCallId: 'w1' }),
            ev('tool_result', { toolCallId: 'w1', preview: 'erro: formato' }),
            ev('tool_call', { name: 'mcp__feeds__feeds_read', toolCallId: 'f1' }),
            ev('tool_result', { toolCallId: 'f1', preview: 'erro: fora do ar' }),
            ev('tool_call', { name: 'mcp__blogs__blogs_guide', toolCallId: 'g1' }),
            ev('tool_result', { toolCallId: 'g1', preview: 'guia' }),
            ev('tool_call', { name: 'mcp__blogs__blogs_write', toolCallId: 'w2' }),
            ev('tool_result', { toolCallId: 'w2', preview: '{"ok":true}' }),
            ev('tool_call', { name: 'mcp__messages__messages_delete', toolCallId: 'd1' }),
            ev('tool_result', { toolCallId: 'd1', preview: 'erro: rota' }),
            ev('assistant', { text: 'feito', isFinal: true }),
        ])
        const work = rows.find(r => r.kind === 'work')
        expect(work.stepCount).toBe(5)
        expect(work.recovered).toBe(1)
        expect(work.unresolved).toBe(2)
        expect(work.hasAnswer).toBe(true)
        expect(work.entries[0].steps[0].recovered).toBe(true)
        expect(work.entries[0].steps[1].recovered).toBe(false)
        expect(work.entries[0].steps[4].recovered).toBe(false)
    })

    test('a work block with no answer after it says so', () => {
        const rows = buildRows([ev('assistant', { text: 'vou apagar', isFinal: false }), ev('tool_call', { name: 'x', toolCallId: 'x1' }), ev('approval_requested', { summary: 'Apagar' })])
        expect(rows[0].hasAnswer).toBe(false)
    })
})
