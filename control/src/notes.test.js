import { expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-notes-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { db, now } = await import('./db.js')
const { emitTaskEvent } = await import('./events.js')
const notes = await import('./notes.js')

const ana = { id: 'n-ana', name: 'Ana' }
const leo = { id: 'n-leo', email: 'leo@exemplo.com' }
db.query("INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at) VALUES ('n-bot', 'n', 'sprite-n', 'idle', 'x/y', 1, 1)").run()

test('a note needs a conversation that already started, and words', () => {
    expect(notes.writeNote('n-bot', ana, 'oi')).toEqual({ error: 'a nota entra numa conversa que já começou' })
    db.query("INSERT INTO tasks (id, bot_id, prompt, status, created_at, updated_at) VALUES ('n-task', 'n-bot', 'p', 'done', ?, ?)").run(now(), now())
    expect(notes.writeNote('n-bot', ana, '   ')).toEqual({ error: 'escreva a nota' })
})

test('the note is seen by the people and never reaches the model', () => {
    const { event } = notes.writeNote('n-bot', ana, 'acho que o corte 2 é melhor')
    expect(event).toMatchObject({ type: 'note', data: { text: 'acho que o corte 2 é melhor', author: 'Ana', accountId: 'n-ana' } })
    expect(db.query("SELECT COUNT(*) AS n FROM task_messages WHERE task_id = 'n-task'").get().n).toBe(0)
})

test('only who wrote it sends it to the bot, and only once', () => {
    const { event } = notes.writeNote('n-bot', ana, 'manda o corte 2')
    expect(notes.takeNote('n-bot', leo, event.id)).toBeNull()
    expect(notes.takeNote('other-bot', ana, event.id)).toBeNull()
    expect(notes.takeNote('n-bot', ana, event.id)).toMatchObject({ id: event.id, text: 'manda o corte 2', author: 'Ana' })
    emitTaskEvent('n-task', 'user_message', { text: 'manda o corte 2', fromNote: event.id })
    expect(notes.takeNote('n-bot', ana, event.id)).toBeNull()
})
