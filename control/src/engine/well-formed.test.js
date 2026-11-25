import { describe, expect, test } from 'bun:test'

import { wellFormedCalls, wellFormedHistory } from './well-formed.js'

// The tail of the conversation that stopped answering on 30/10/2026, as stored.
const click = { id: 'call_dd76', type: 'function', function: { name: 'chrome_click', arguments: '{"ref":"37"}' } }
const poisoned = [
    { role: 'user', content: 'Abra as capas.' },
    { role: 'assistant', content: 'Voltei ao calendário.', tool_calls: [click] },
    { role: 'tool', tool_call_id: 'call_dd76', content: '{"text":"clicked 37"}' },
    { role: 'assistant', content: '', tool_calls: [{ id: '', type: 'function', function: { name: '', arguments: '{}' } }] },
    { role: 'tool', tool_call_id: '', content: 'erro ao executar : ferramenta desconhecida: ' },
    { role: 'user', content: 'Tente de novo.' },
]

describe('a malformed tool call never reaches a model', () => {
    test('the 30/10 conversation goes out without the nameless call and its result', () => {
        const sent = wellFormedHistory(poisoned)
        expect(sent).toEqual([poisoned[0], poisoned[1], poisoned[2], poisoned[5]])
    })

    test('a reply with words keeps them and loses only the bad call, and Claude blocks with it', () => {
        const mixed = { role: 'assistant', content: 'Vou clicar.', native: [{ type: 'tool_use' }], tool_calls: [click, { id: 'x', type: 'function', function: { name: ' ', arguments: '{}' } }] }
        const sent = wellFormedHistory([mixed, { role: 'tool', tool_call_id: 'call_dd76', content: 'ok' }, { role: 'tool', tool_call_id: 'x', content: 'erro' }])
        expect(sent).toEqual([{ role: 'assistant', content: 'Vou clicar.', tool_calls: [click] }, { role: 'tool', tool_call_id: 'call_dd76', content: 'ok' }])
    })

    test('a clean conversation is the same objects', () => {
        const sent = wellFormedHistory(poisoned.slice(0, 3))
        sent.forEach((message, index) => expect(message).toBe(poisoned[index]))
    })

    test('on the way in, a nameless call is dropped and a named one without id gets one', () => {
        expect(wellFormedCalls([{ id: '', type: 'function', function: { name: '', arguments: '{}' } }])).toEqual([])
        const [call] = wellFormedCalls([{ id: '', type: 'function', function: { name: 'files_list', arguments: '{}' } }])
        expect(call.id).toMatch(/^call_[0-9a-f]{32}$/)
        expect(wellFormedCalls(undefined)).toEqual([])
    })

    test('each result goes right after the reply that asked for it, even when stored after a message', () => {
        const call = id => ({ id, type: 'function', function: { name: 'feeds_schedule_piece', arguments: '{}' } })
        const sent = wellFormedHistory([
            { role: 'user', content: 'agende a semana' },
            { role: 'assistant', content: '', tool_calls: [call('a'), call('b'), call('c')] },
            { role: 'tool', tool_call_id: 'a', content: 'não aconteceu' },
            { role: 'user', content: 'você tem o link dela?' },
            { role: 'tool', tool_call_id: 'b', content: 'não aconteceu' },
            { role: 'user', content: 'e a outra?' },
            { role: 'tool', tool_call_id: 'c', content: 'agendada' },
        ])
        expect(sent.map(message => message.tool_call_id ?? message.content)).toEqual(['agende a semana', '', 'a', 'b', 'c', 'você tem o link dela?', 'e a outra?'])
    })
})
