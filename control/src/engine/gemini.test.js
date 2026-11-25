import { afterEach, describe, expect, test } from 'bun:test'
import { cleanGeminiSchema, completeGemini, geminiIdOf, geminiThinks, toGemini, useGeminiFetch } from './gemini.js'

afterEach(() => {
    useGeminiFetch((...args) => fetch(...args))
})

describe('native Google Gemini adapter', () => {
    test('normalizes model ids and detects thinking models', () => {
        expect(geminiIdOf('google/gemini-2.5-pro')).toBe('gemini-2.5-pro')
        expect(geminiIdOf('models/gemini-2.5-flash')).toBe('gemini-2.5-flash')
        expect(geminiIdOf('anthropic/claude-haiku-5.5')).toBeNull()
        expect(geminiThinks('gemini-2.5-pro')).toBe(true)
        expect(geminiThinks('gemini-2.0-flash')).toBe(false)
    })

    test('converts OpenAI-shaped history with tool calls and responses into Gemini contents', () => {
        const { systemInstruction, contents } = toGemini([
            { role: 'system', content: 'You are Gemini Code.' },
            { role: 'user', content: 'List files' },
            { role: 'assistant', content: 'Checking.', tool_calls: [{ id: 'c1', type: 'function', function: { name: 'files_list', arguments: '{"folder":"src"}' } }] },
            { role: 'tool', tool_call_id: 'c1', content: 'index.js' },
        ])
        expect(systemInstruction.parts[0].text).toBe('You are Gemini Code.')
        expect(contents).toHaveLength(3)
        expect(contents[1].role).toBe('model')
        expect(contents[1].parts[1].functionCall).toEqual({ name: 'files_list', args: { folder: 'src' } })
        expect(contents[2].parts[0].functionResponse).toEqual({ name: 'files_list', response: { output: 'index.js' } })
    })

    test('cleans unsupported JSON Schema keywords recursively while preserving required and enum string arrays', () => {
        const cleaned = cleanGeminiSchema({
            $schema: 'http://json-schema.org/draft-07/schema#',
            type: 'object',
            additionalProperties: false,
            properties: {
                path: { type: ['string', 'null'], default: 'a' },
                kind: { type: 'string', enum: ['decision', 'preference', 'observation'] },
                names: { type: 'array', items: { type: 'string' } },
            },
            required: ['path', 'kind'],
        })
        expect(cleaned).toEqual({
            type: 'object',
            properties: {
                path: { type: 'string', nullable: true },
                kind: { type: 'string', enum: ['decision', 'preference', 'observation'] },
                names: { type: 'array', items: { type: 'string' } },
            },
            required: ['path', 'kind'],
        })
    })

    test('retries without thinkingConfig if a model rejects thinking parameters, and preserves thoughtSignature', async () => {
        const bodies = []
        useGeminiFetch(async (_url, init) => {
            const parsed = JSON.parse(init.body)
            bodies.push(parsed)
            if (bodies.length === 1) {
                return new Response(JSON.stringify({ error: { code: 400, message: 'thinkingBudget is not supported by this model' } }), { status: 400 })
            }
            const sse =
                'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"files_list","args":{}},"thoughtSignature":"sig-123"}]},"finishReason":"STOP"}]}\n\n'
            return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sse)); c.close() } }), { status: 200 })
        })

        const result = await completeGemini({
            apiKey: 'AIza-test',
            model: 'gemini-4-neon',
            effort: 'medium',
            messages: [{ role: 'user', content: 'oi' }],
            tools: [
                { type: 'function', function: { name: 'computer_shell', description: 'Run shell', parameters: { type: 'object', properties: { command: { type: 'string' } }, required: ['command'] } } },
                { type: 'function', function: { name: 'routine_list', description: 'List routines', parameters: { type: 'object', properties: {}, required: [] } } },
            ],
            onText: () => {},
        })

        expect(bodies).toHaveLength(2)
        expect(bodies[0].tools[0].functionDeclarations[0].parameters.required).toEqual(['command'])
        expect(bodies[0].tools[0].functionDeclarations[1].parameters).toBeUndefined()
        expect(bodies[0].generationConfig.thinkingConfig).toBeDefined()
        expect(bodies[1].generationConfig.thinkingConfig).toBeUndefined()
        expect(result.message.tool_calls[0].thought_signature).toBe('sig-123')

        const nextTurn = toGemini([
            { role: 'user', content: 'oi' },
            result.message,
            { role: 'tool', tool_call_id: result.message.tool_calls[0].id, content: 'README.md' },
        ])
        expect(nextTurn.contents[1].parts[0].thoughtSignature).toBe('sig-123')
    })

    test('streams text, thinking deltas, tool calls, and usage via x-goog-api-key header', async () => {
        let seenUrl = ''
        let seenHeaders = {}
        const sse = [
            'data: {"candidates":[{"content":{"parts":[{"thought":true,"text":"Inspecting repo"}]}}]}\n\n',
            'data: {"candidates":[{"content":{"parts":[{"text":"Hello from Gemini Code"}]}}]}\n\n',
            'data: {"candidates":[{"content":{"parts":[{"functionCall":{"name":"computer_shell","args":{"command":"git status"}}}]},"finishReason":"STOP"}],"usageMetadata":{"promptTokenCount":100,"cachedContentTokenCount":40,"candidatesTokenCount":25}}\n\n',
        ].join('')
        useGeminiFetch(async (url, init) => {
            seenUrl = String(url)
            seenHeaders = init.headers
            return new Response(new ReadableStream({ start(c) { c.enqueue(new TextEncoder().encode(sse)); c.close() } }), { status: 200 })
        })

        const texts = []
        const thoughts = []
        const result = await completeGemini({
            apiKey: 'AIza-test-key',
            model: 'gemini-2.5-pro',
            effort: 'medium',
            messages: [{ role: 'user', content: 'Check status' }],
            onText: t => texts.push(t),
            onThinking: t => thoughts.push(t),
        })

        expect(seenUrl).toContain('/models/gemini-2.5-pro:streamGenerateContent?alt=sse')
        expect(seenUrl).not.toContain('AIza-test-key')
        expect(seenHeaders['x-goog-api-key']).toBe('AIza-test-key')
        expect(thoughts).toEqual(['Inspecting repo'])
        expect(texts).toEqual(['Hello from Gemini Code'])
        expect(result.message.content).toBe('Hello from Gemini Code')
        expect(result.message.tool_calls).toHaveLength(1)
        expect(result.message.tool_calls[0].function.name).toBe('computer_shell')
        expect(result.usage.prompt_tokens).toBe(100)
        expect(result.usage.cached_tokens).toBe(40)
        expect(result.finishReason).toBe('stop')
    })
})
