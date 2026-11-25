import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test'

process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { config } = await import('../config.js')
const { useClient } = await import('./anthropic.js')
const { claudeIdOf, complete, completeJson } = await import('./model.js')

// The house's own calls (titles, mascots, the designer, the judges' fallback) on Claude go straight to
// Anthropic with the house key (07/11/2026): never to OpenRouter, with thinking off and no JSON mode.
const sent = []
const keys = []
const network = []
const realFetch = globalThis.fetch
let saved

beforeAll(() => {
    saved = { anthropicApiKey: config.anthropicApiKey, openrouterApiKey: config.openrouterApiKey }
    config.anthropicApiKey = 'sk-ant-house'
    config.openrouterApiKey = 'sk-or-dead'
    // Any HTTP call is recorded and refused: OpenRouter must not be asked (the price list may be, and fails here).
    globalThis.fetch = async url => {
        network.push(String(url))
        return new Response('{}', { status: 404 })
    }
    useClient(apiKey => {
        keys.push(apiKey)
        const stream = body => {
            sent.push(body)
            return {
                async *[Symbol.asyncIterator]() {},
                finalMessage: async () => ({ content: [{ type: 'text', text: 'Aqui: {"title":"Relatório semanal"}' }], stop_reason: 'end_turn', usage: { input_tokens: 40, output_tokens: 8 } }),
            }
        }
        return { messages: { stream }, beta: { messages: { stream } } }
    })
})

afterEach(() => {
    sent.length = 0
    keys.length = 0
    network.length = 0
})

afterAll(() => {
    Object.assign(config, saved)
    globalThis.fetch = realFetch
    useClient(apiKey => ({ apiKey }))
})

describe('the house defaults and optional Claude routing', () => {
    test('the default and risk models are Gemini 3.5 Flash-Lite; the default lineup is Gemini-first', () => {
        expect(config.defaultModel).toBe('gemini-3.5-flash-lite')
        expect(config.riskModel).toBe('gemini-3.5-flash-lite')
        expect(config.models.map(model => model.id)).toEqual(['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash'])
    })

    test('claudeIdOf: the OpenRouter id and the native one are the same model; others are not Claude', () => {
        expect(claudeIdOf('anthropic/claude-haiku-5.5')).toBe('claude-haiku-5-5')
        expect(claudeIdOf('claude-haiku-5-5')).toBe('claude-haiku-5-5')
        expect(claudeIdOf('deepseek/deepseek-v4.1-flash')).toBeNull()
        expect(claudeIdOf('google/gemini-2.5-flash')).toBeNull()
    })

    test('a house JSON job explicitly targeting Claude goes to Anthropic with the house key, thinking off, no beta, and the JSON is read', async () => {
        const { value } = await completeJson({ model: 'claude-haiku-5-5', system: 'Dê um título. Responda {"title":"..."}.', user: 'relatório da semana' })
        expect(value).toEqual({ title: 'Relatório semanal' })
        expect(keys).toEqual(['sk-ant-house'])
        expect(sent).toHaveLength(1)
        expect(sent[0]).toMatchObject({ model: 'claude-haiku-5-5', thinking: { type: 'disabled' } })
        expect(sent[0].betas).toBeUndefined()
        expect(sent[0].response_format).toBeUndefined()
        expect(network.some(url => url.includes('/chat/completions'))).toBe(false)
    })

    test("the house's \"Claude Haiku 5.5\" option (OpenRouter's id) also goes to Anthropic", async () => {
        await complete({ model: 'anthropic/claude-haiku-5.5', messages: [{ role: 'system', content: 's' }, { role: 'user', content: 'oi' }] })
        expect(sent[0].model).toBe('claude-haiku-5-5')
        expect(network.some(url => url.includes('/chat/completions'))).toBe(false)
    })

    test("a person's own key is untouched: their Anthropic key keeps adaptive thinking, and is the one used", async () => {
        await complete({ model: 'claude-haiku-5-5', account: { provider: 'anthropic', key: 'sk-ant-person' }, messages: [{ role: 'user', content: 'oi' }] })
        expect(keys).toEqual(['sk-ant-person'])
        expect(sent[0].thinking.type).toBe('adaptive')
    })

    test('a house call on a model that is not Claude still goes to OpenRouter', async () => {
        await expect(complete({ model: 'deepseek/deepseek-v4.1-flash', messages: [{ role: 'user', content: 'oi' }] })).rejects.toThrow('OpenRouter 404')
        expect(network).toContain('https://openrouter.ai/api/v1/chat/completions')
        expect(sent).toHaveLength(0)
    })
})
