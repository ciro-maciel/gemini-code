import { describe, expect, test } from 'bun:test'

import { keepIfSame } from './keep-if-same'

describe('keepIfSame', () => {
    test('an equal value keeps the current one, so the screen does not redraw', () => {
        const current = [{ id: 'a', name: 'SEO' }]
        expect(keepIfSame([{ id: 'a', name: 'SEO' }])(current)).toBe(current)
    })
    test('a different value, or nothing yet, takes the new one', () => {
        const next = [{ id: 'a', name: 'Blog' }]
        expect(keepIfSame(next)([{ id: 'a', name: 'SEO' }])).toBe(next)
        expect(keepIfSame(next)(null)).toBe(next)
    })
})
