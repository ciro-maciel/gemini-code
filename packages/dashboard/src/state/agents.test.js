import { describe, expect, test } from 'bun:test'
import { listAgents, shortWhen, stateOf, waitsOn } from './agents.js'

const bot = (id, o = {}) => ({ id, status: 'idle', createdAt: 100, ...o })

describe('stateOf and waitsOn', () => {
    test('an approval waiting counts and reads as "espera você"', () => {
        const b = bot('a', { needsYou: 'approval', waitingCount: 2 })
        expect(waitsOn(b)).toBe(2)
        expect(stateOf(b)).toEqual({ word: 'espera você', mark: 'wait' })
    })
    test('open choices in its deliveries wait for a person too', () => {
        expect(waitsOn(bot('a', { pendingChoices: 2 }))).toBe(2)
        expect(stateOf(bot('a', { pendingChoices: 1 })).mark).toBe('wait')
    })
    test('running, finished and quiet', () => {
        expect(stateOf(bot('a', { runningCount: 1 })).word).toBe('rodando')
        expect(stateOf(bot('a', { hasNews: true })).word).toBe('terminou')
        expect(stateOf(bot('a')).mark).toBeNull()
    })
    test('a computer that failed says so before anything else', () => {
        expect(stateOf(bot('a', { status: 'failed', runningCount: 1 })).mark).toBe('stopped')
    })
})

describe('listAgents', () => {
    test('the most recent always on top, whatever waits or runs', () => {
        const list = listAgents([bot('quiet', { lastActivityAt: 900 }), bot('wait', { needsYou: 'question', lastActivityAt: 300 }), bot('run', { runningCount: 1, lastActivityAt: 950 }), bot('old', { lastActivityAt: 50 })])
        expect(list.map(b => b.id)).toEqual(['run', 'quiet', 'wait', 'old'])
    })
    test('mine and shared', () => {
        const bots = [bot('a'), bot('b', { sharedBy: 'ana' })]
        expect(listAgents(bots, 'mine').map(b => b.id)).toEqual(['a'])
        expect(listAgents(bots, 'shared').map(b => b.id)).toEqual(['b'])
    })
})

test('shortWhen', () => {
    expect(shortWhen(1000, 1010)).toBe('agora')
    expect(shortWhen(1000, 1000 + 12 * 60)).toBe('12 min')
    expect(shortWhen(1000, 1000 + 3 * 3600)).toBe('3 h')
    expect(shortWhen(1000, 1000 + 30 * 3600)).toBe('ontem')
    expect(shortWhen(1000, 1000 + 3 * 86400)).toBe('3 d')
})
