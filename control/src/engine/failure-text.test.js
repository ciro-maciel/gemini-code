import { describe, expect, test } from 'bun:test'

import { modelFailureText } from './failure-text.js'

const on = (error, provider = 'anthropic') => modelFailureText(error, { model: 'qwen/qwen3.8-omni-flash', provider })

describe('a failed model call, as the person reads it', () => {
    test('the 30/10 case: a model the key does not have names the model and the chip, never the JSON', () => {
        const text = on(new Error('404 {"type":"error","error":{"type":"not_found_error","message":"model: qwen/qwen3.8-omni-flash"},"request_id":"req_011"}'))
        expect(text).toBe('O modelo qwen/qwen3.8-omni-flash não existe na conta Anthropic. Escolha outro no chip de modelo e mande a mensagem de novo.')
        expect(text).not.toContain('{')
    })

    test('the status comes from the SDK error or from "Provider 401:" in the message', () => {
        expect(on(Object.assign(new Error('x'), { status: 401 }))).toContain('recusou a chave')
        expect(on(new Error('OpenRouter 401: {"error":"no auth"}'), 'openrouter')).toBe('OpenRouter recusou a chave desta conta de IA. Confira a chave em Configurações, Contas de IA.')
    })

    test('credit, limit, size, outage and timeout each say what to do', () => {
        expect(on(new Error('400 {"message":"Your credit balance is too low"}'))).toContain('Acabou o crédito')
        expect(on(new Error('OpenRouter 402: {}'), 'openrouter')).toContain('Acabou o crédito')
        expect(on(new Error('429 rate limited'))).toContain('limite de chamadas')
        expect(on(new Error('400 prompt is too long: 250000 tokens'))).toContain('longa demais')
        expect(on(new Error('529 {"type":"overloaded_error"}'))).toContain('sobrecarregado')
        expect(on(Object.assign(new Error('The operation timed out.'), { name: 'TimeoutError' }))).toContain('demorou demais')
    })

    test('anything else is still a sentence, without the raw answer', () => {
        expect(on(new Error('400 {"weird":true}'))).toBe('Anthropic não conseguiu responder agora. Mande a mensagem de novo; se repetir, escolha outro modelo no chip de modelo.')
    })
})
