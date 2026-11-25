import { describe, expect, test } from 'bun:test'

import { createFakeApi } from './fake-api.js'
import { ACCOUNT_IDS, BOT_IDS, DEMO_REPLY } from './fixtures.js'
import { isApiUrl } from './install.js'
import { buildRows } from '../conversation/rows.js'

const bot = BOT_IDS.neon

// What the main screens ask for on the way in: the command center, the agent
// list, an agent's conversation and its side panels, settings > AI accounts,
// and the connectors. Each must have its own route, not the empty fallback.
const SCREEN_ROUTES = [
    ['GET', '/api/me'],
    ['GET', '/api/bots'],
    ['GET', '/api/sections'],
    ['GET', '/api/templates'],
    ['GET', '/api/deliveries'],
    ['GET', '/api/models'],
    ['GET', '/api/brains'],
    ['GET', '/api/files'],
    ['GET', `/api/bots/${bot}/conversation`],
    ['GET', `/api/bots/${bot}/thread`],
    ['GET', `/api/bots/${bot}/documents`],
    ['GET', `/api/bots/${bot}/tools`],
    ['GET', `/api/bots/${bot}/skills`],
    ['GET', `/api/bots/${bot}/files`],
    ['GET', `/api/bots/${bot}/files/content?path=${encodeURIComponent('/home/sprite/workspace/soma.js')}`],
    ['GET', `/api/bots/${bot}/inbox`],
    ['GET', '/api/ai-accounts'],
    ['GET', '/api/ai-providers'],
    ['GET', `/api/ai-accounts/${ACCOUNT_IDS.subscription}/available-models`],
    ['GET', '/api/apps'],
    ['GET', '/api/connections'],
    ['POST', `/api/bots/${bot}/messages`],
    ['POST', `/api/bots/${bot}/read`],
    ['POST', '/api/bots'],
]

const pathOf = url => url.split('?')[0]

describe('the demo fake API', () => {
    test.each(SCREEN_ROUTES)('%s %s has its own route and answers 2xx', (method, url) => {
        const api = createFakeApi({ schedule: () => {} })
        expect(api.match(method, pathOf(url))).not.toBeNull()
        const answer = api.handle(method, url, method === 'POST' ? { text: 'oi' } : undefined)
        expect(answer.isFallback).toBeUndefined()
        expect(answer.status).toBeGreaterThanOrEqual(200)
        expect(answer.status).toBeLessThan(300)
    })

    test('lists the three example agents with their accounts and models', () => {
        const { body } = createFakeApi().handle('GET', '/api/bots')
        expect(body.items.map(item => item.name)).toEqual(['Software Engineer', 'Code Reviewer', 'Neon Engineer'])
        const neon = body.items.find(item => item.name === 'Neon Engineer')
        expect(neon).toMatchObject({ model: 'gemini-4-neon-low', aiAccount: ACCOUNT_IDS.subscription })
        expect(body.items.find(item => item.name === 'Software Engineer').runningCount).toBe(1)
        expect(body.items.find(item => item.name === 'Code Reviewer').runningCount).toBe(0)
    })

    test('AI accounts are Google Gemini with three models and the Google subscription', () => {
        const { body } = createFakeApi().handle('GET', '/api/ai-accounts')
        expect(body.items.map(item => item.name)).toEqual(['Google Gemini', 'Assinatura Google'])
        expect(body.items[0].models).toEqual(['gemini-3.5-flash-lite', 'gemini-3.6-flash', 'gemini-3.5-flash'])
        expect(body.items[1].models).toContain('gemini-4-neon-low')
    })

    test("the Neon Engineer's conversation reads as steps that wrote soma.js and soma.test.js and a 3 pass answer", () => {
        const { body } = createFakeApi().handle('GET', `/api/bots/${bot}/conversation`)
        const rows = buildRows(body.items)
        const steps = rows.filter(row => row.kind === 'work').flatMap(row => row.entries.flatMap(entry => entry.steps))
        expect(steps.map(step => step.args.path ?? step.args.command)).toEqual(['/home/sprite/workspace/soma.js', '/home/sprite/workspace/soma.test.js', 'bun test soma.test.js'])
        expect(steps.at(-1).result).toContain('3 pass')
        expect(rows.find(row => row.kind === 'bot').text).toContain('3 pass')
        expect(rows.find(row => row.kind === 'files').files.map(file => file.name)).toEqual(['soma.js', 'soma.test.js'])
        expect(body.thread.status).toBe('done')
    })

    test('a message comes back on the stream, then the canned reply', () => {
        let later = null
        const api = createFakeApi({ schedule: fn => (later = fn) })
        const heard = []
        api.subscribe(`bot:${bot}`, event => heard.push(event))
        const thread = api.handle('POST', `/api/bots/${bot}/messages`, { text: 'Some 2 e 2' }).body
        expect(thread.status).toBe('running')
        expect(heard.map(event => event.type)).toEqual(['user_message', 'status'])
        later()
        expect(heard.map(event => event.type)).toEqual(['user_message', 'status', 'assistant', 'status'])
        expect(heard[2].data.text).toBe(DEMO_REPLY)
        expect(heard[3].thread.status).toBe('done')
        // A stream that opens after the send still gets what it missed.
        expect(api.eventsAfter(bot, heard[0].seq - 1).map(event => event.type)).toEqual(['user_message', 'status', 'assistant', 'status'])
    })

    test('a new agent joins the list', () => {
        const api = createFakeApi({ schedule: () => {} })
        const created = api.handle('POST', '/api/bots', { name: 'Revisor de testes', templateId: 'test-engineer' }).body
        expect(api.handle('GET', '/api/bots').body.items.map(item => item.id)).toContain(created.id)
        expect(api.handle('GET', `/api/bots/${created.id}/conversation`).body.items).toEqual([])
    })

    test('an unknown write is refused with words, never a sign-out', () => {
        const answer = createFakeApi().handle('POST', '/api/connections', { appId: 'github' })
        expect(answer.status).toBe(409)
        expect(answer.body.error.message).toContain('github.com/ciro-maciel/gemini-code')
    })

    test('an unknown agent answers 404', () => {
        expect(createFakeApi().handle('GET', '/api/bots/nao-existe/conversation').status).toBe(404)
    })

    test('only /api addresses are faked', () => {
        expect(isApiUrl('/api/bots', 'https://example.test')).toBe(true)
        expect(isApiUrl('https://example.test/api/stream?token=x', 'https://example.test')).toBe(true)
        expect(isApiUrl('/gemini-code/assets/index.js', 'https://example.test')).toBe(false)
        expect(isApiUrl('https://fonts.googleapis.com/css2', 'https://example.test')).toBe(false)
    })
})
