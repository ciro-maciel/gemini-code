import { expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-push-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { db, now } = await import('./db.js')
const push = await import('./push.js')
const { enterBot } = await import('./presence.js')

const person = (id, email) => db.query('INSERT INTO accounts (id, email, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)').run(id, email, 'active', now(), now())
person('pu-own', 'own@push.com')
person('pu-ana', 'ana@push.com')
db.query("INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES ('pu-bot', 'Métricas', 's', 'idle', 'm', 1, 1, 'pu-own')").run()
db.query("INSERT INTO bot_members (bot_id, email, access, created_at) VALUES ('pu-bot', 'ana@push.com', 'enter', 1)").run()
const device = name => ({ endpoint: `https://push.exemplo.com/${name}`, keys: { p256dh: 'p', auth: 'a' } })

const sent = []
push.useSender(async (subscription, payload) => {
    if (subscription.endpoint.endsWith('/gone')) throw Object.assign(new Error('gone'), { statusCode: 410 })
    sent.push([subscription.endpoint.split('/').pop(), JSON.parse(payload)])
})

test('a subscription is kept only when it is a real one', () => {
    expect(push.savePushSubscription('pu-own', { endpoint: 'http://x' })).toBe(false)
    expect(push.savePushSubscription('pu-own', device('phone'))).toBe(true)
    expect(push.savePushSubscription('pu-ana', device('ana-phone'))).toBe(true)
    expect(push.countPushSubscriptions('pu-own')).toBe(1)
})

test('what the phone says, opening on the agent', () => {
    const bot = { id: 'pu-bot', name: 'Métricas' }
    expect(push.noticeOf({ type: 'approval_requested', data: { summary: 'Publicar o post' } }, bot)).toEqual({ isOwnerOnly: true, title: 'Métricas precisa de você', body: 'Publicar o post', url: '/agents/pu-bot' })
    expect(push.noticeOf({ type: 'artifact', data: { title: 'Relatório' } }, bot)).toMatchObject({ isOwnerOnly: false, title: 'Métricas entregou' })
    expect(push.noticeOf({ type: 'assistant', data: {} }, bot)).toBeNull()
})

test('approvals reach only the owner; deliveries reach the members too, but not who is looking', async () => {
    expect(await push.notifyEvent({ botId: 'pu-bot', type: 'approval_requested', data: { summary: 's' } })).toBe(1)
    expect(sent.at(-1)[0]).toBe('phone')
    sent.length = 0
    const leave = enterBot('pu-bot', { id: 'pu-own', name: 'Dono' })
    expect(await push.notifyEvent({ botId: 'pu-bot', type: 'artifact', data: { title: 'Relatório' } })).toBe(1)
    expect(sent.map(([to]) => to)).toEqual(['ana-phone'])
    leave()
})

test('a phone that said no more is forgotten', async () => {
    push.savePushSubscription('pu-own', device('gone'))
    await push.notifyEvent({ botId: 'pu-bot', type: 'approval_requested', data: {} })
    expect(push.countPushSubscriptions('pu-own')).toBe(1)
})
