import { describe, expect, test } from 'bun:test'

import { refresh, remember, remembered } from './remembered'

describe('what the panel already read', () => {
    test('two screens asking at once make one call, and the answer stays for the next', async () => {
        let calls = 0
        const load = () => {
            calls++
            return Promise.resolve(['SEO'])
        }
        const [first, second] = await Promise.all([refresh('teste:lista', load), refresh('teste:lista', load)])
        expect(calls).toBe(1)
        expect(first).toEqual(['SEO'])
        expect(second).toBe(first)
        expect(remembered('teste:lista')).toBe(first)
    })

    test('a failed call keeps what was there and lets the next one try', async () => {
        remember('teste:falha', ['antes'])
        await expect(refresh('teste:falha', () => Promise.reject(new Error('rede')))).rejects.toThrow('rede')
        expect(remembered('teste:falha')).toEqual(['antes'])
        expect(await refresh('teste:falha', () => Promise.resolve(['depois']))).toEqual(['depois'])
    })

    test('only the twelve most recent conversations stay in memory; other values are kept', () => {
        remember('connections', ['Bing'])
        for (let index = 0; index < 15; index++) remember(`conversation:bot-${index}`, { events: [] })
        expect(remembered('conversation:bot-0')).toBeUndefined()
        expect(remembered('conversation:bot-2')).toBeUndefined()
        expect(remembered('conversation:bot-3')).toEqual({ events: [] })
        expect(remembered('conversation:bot-14')).toEqual({ events: [] })
        expect(remembered('connections')).toEqual(['Bing'])
    })
})
