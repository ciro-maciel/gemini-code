import { expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-queue-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { db, now } = await import('./db.js')
const queue = await import('./queue.js')

test('the queue gives messages back in the order they were sent, one at a time', () => {
    db.query('INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run('q-bot', 'q', 'sprite-q', 'idle', 'x/y', now(), now())
    queue.enqueue('q-bot', 'primeiro', ['att-1'])
    queue.enqueue('q-bot', 'segundo')
    expect(queue.listQueue('q-bot').map(item => item.text)).toEqual(['primeiro', 'segundo'])
    expect(queue.takeNext('q-bot')).toMatchObject({ text: 'primeiro', attachmentIds: ['att-1'] })
    expect(queue.takeNext('q-bot').text).toBe('segundo')
    expect(queue.takeNext('q-bot')).toBeNull()
})

test('a person can take a message out of the queue before it goes', () => {
    const id = queue.enqueue('q-bot', 'desisti')
    expect(queue.removeQueued('q-bot', id)).toBe(true)
    expect(queue.listQueue('q-bot')).toEqual([])
})
