import { expect, test } from 'bun:test'

const { contextParts, contextShare, contextWindow, refreshWindows, useModels } = await import('./context.js')

test('the ring is what the model read over its window, empty until the window is known', async () => {
    useModels(async () => ({ data: [{ id: 'x/flash', context_length: 1000 }, { id: 'x/none' }, { id: 'anthropic/claude-haiku-5.5', context_length: 200000 }] }))
    expect(contextShare('x/flash', 250)).toBeNull()
    await refreshWindows()
    expect(contextShare('x/flash', 250)).toBe(0.25)
    expect(contextShare('x/flash', 5000)).toBe(1)
    expect(contextShare('x/none', 250)).toBeNull()
    expect(contextShare('x/flash', null)).toBeNull()
    // A model on its own provider's key is found by the model part of the id.
    expect(contextWindow('claude-haiku-5-5')).toBe(200000)
})

test('the step is split by part, in the share of the characters each took', () => {
    const parts = contextParts(
        {
            system: 'R'.repeat(300) + 'I'.repeat(100),
            instructions: 'I'.repeat(100),
            // 103 characters as JSON
            tools: [{ name: 'x'.repeat(90) }],
            messages: [
                { role: 'user', content: 'p'.repeat(200) },
                { role: 'assistant', content: 'a'.repeat(100), tool_calls: null },
                { role: 'tool', content: 'r'.repeat(200) },
            ],
        },
        1003
    )
    expect(parts).toEqual({ instructions: 100, rules: 300, tools: 103, people: 200, answers: 100, results: 200, toolCount: 1 })
    expect(contextParts({ system: '', instructions: '', tools: [], messages: [] }, 0)).toBeNull()
})
