import { describe, expect, test } from 'bun:test'

import { companiesToGroup, companyOf, groupAgents, moveBefore, shortNameOf } from './groups'

const bot = (id, name, extra = {}) => ({ id, name, createdAt: 1, ...extra })

describe('groups in the column', () => {
    test('agents fall in their group, the most recent on top even when dragged; shared ones stay out of groups', () => {
        const groups = [{ id: 'g1', name: 'Acme Studio' }, { id: 'g2', name: 'Vazio' }]
        const bots = [
            bot('a', 'Acme Studio - SEO', { sectionId: 'g1', position: 1, lastActivityAt: 30 }),
            bot('b', 'Acme Studio - Suporte', { sectionId: 'g1', position: 0, lastActivityAt: 10 }),
            bot('c', 'Acme Studio - Financeiro', { sectionId: 'g1', needsYou: true, lastActivityAt: 20 }),
            bot('d', 'Dr. Mais Vida - SEO', { sectionId: 'gone' }),
            bot('e', 'De outra conta', { sectionId: 'g1', sharedBy: 'Ana' }),
        ]
        const { groups: shown, loose } = groupAgents(bots, groups)
        expect(shown.map(group => [group.id, group.bots.map(item => item.id), group.waiting])).toEqual([
            ['g1', ['a', 'c', 'b'], 1],
            ['g2', [], 0],
        ])
        expect(loose.map(item => item.id)).toEqual(['d', 'e'])
    })

    test('the group with the most recent agent goes on top; empty groups last', () => {
        const groups = [{ id: 'old', name: 'Velho' }, { id: 'empty', name: 'Vazio' }, { id: 'new', name: 'Novo' }]
        const bots = [bot('a', 'Velho - A', { sectionId: 'old', lastActivityAt: 10 }), bot('b', 'Novo - B', { sectionId: 'new', lastActivityAt: 90 }), bot('c', 'Velho - C', { sectionId: 'old', lastActivityAt: 50 })]
        expect(groupAgents(bots, groups).groups.map(group => group.id)).toEqual(['new', 'old', 'empty'])
    })

    test('the filter applies inside groups', () => {
        const { groups } = groupAgents([bot('a', 'X - A', { sectionId: 'g1' }), bot('b', 'X - B', { sectionId: 'g1', sharedBy: 'Ana' })], [{ id: 'g1', name: 'X' }], 'shared')
        expect(groups[0].bots).toEqual([])
    })

    test('inside its company group an agent shows only its role', () => {
        expect(companyOf('Acme Studio - Diretor de operações')).toBe('Acme Studio')
        expect(companyOf('Assistente')).toBeNull()
        expect(shortNameOf({ name: 'Acme Studio - Diretor de operações' }, { name: 'Acme Studio' })).toBe('Diretor de operações')
        expect(shortNameOf({ name: 'Acme Studio - SEO' }, { name: 'Marketing' })).toBe('Acme Studio - SEO')
    })

    test('grouping by company is offered for two companies or more, before any group exists', () => {
        const bots = [bot('a', 'A - SEO'), bot('b', 'A - Blog'), bot('c', 'B - SEO'), bot('d', 'Solto')]
        expect(companiesToGroup(bots, [])).toEqual(['A', 'B'])
        // An empty group left from before does not hide the offer; an agent in a group does.
        expect(companiesToGroup(bots, [{ id: 'g1', name: 'A' }])).toEqual(['A', 'B'])
        expect(companiesToGroup([...bots.slice(1), bot('a', 'A - SEO', { sectionId: 'g1' })], [{ id: 'g1', name: 'A' }])).toEqual([])
        expect(companiesToGroup([bot('a', 'A - SEO')], [])).toEqual([])
    })

    test('moving an id before another, or to the end', () => {
        expect(moveBefore(['a', 'b', 'c'], 'c', 'a')).toEqual(['c', 'a', 'b'])
        expect(moveBefore(['a', 'b', 'c'], 'a')).toEqual(['b', 'c', 'a'])
        expect(moveBefore(['a', 'b'], 'x', 'b')).toEqual(['a', 'x', 'b'])
    })

    test('an agent with nothing for 14 days goes to Parados; anything new brings it back', () => {
        const day = 86400
        const now = 100 * day
        const bots = [
            bot('old', 'Antigo', { lastActivityAt: now - 20 * day }),
            bot('news', 'Terminou', { lastActivityAt: now - 20 * day, hasNews: true }),
            bot('wait', 'Espera', { lastActivityAt: now - 20 * day, needsYou: 'approval' }),
            bot('fresh', 'Recente', { lastActivityAt: now - 2 * day, sectionId: 'g1' }),
            bot('grouped', 'Agrupado antigo', { lastActivityAt: now - 30 * day, sectionId: 'g1' }),
        ]
        const { groups, loose, idle } = groupAgents(bots, [{ id: 'g1', name: 'G' }], 'all', { nowSeconds: now })
        expect(idle.map(item => item.id).sort()).toEqual(['grouped', 'old'])
        expect(groups[0].bots.map(item => item.id)).toEqual(['fresh'])
        expect(loose.map(item => item.id).sort()).toEqual(['news', 'wait'])
        // Without a clock, nothing is idle (the old tests' agents date from 1970).
        expect(groupAgents(bots, [], 'all').idle).toEqual([])
    })
})
