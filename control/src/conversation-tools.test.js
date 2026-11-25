import { afterAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-conversation-tools-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { db, now } = await import('./db.js')
const { emitTaskEvent } = await import('./events.js')
const { previewRewind, rewindTask } = await import('./engine/run.js')
const { fetchBranch, listBranches } = await import('./branches.js')
const { addBookmark, listBookmarks, removeBookmark } = await import('./bookmarks.js')
const { markBotRead, markBotUnread } = await import('./bots.js')
const { askSideQuestion, recentWork } = await import('./engine/side-question.js')

const BOT = 'ct-bot'
db.query("INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at) VALUES (?, 'Blog', 'sprite-ct', 'idle', 'x/y', 1, 1)").run(BOT)
const task = id => db.query("INSERT INTO tasks (id, bot_id, prompt, status, created_at, updated_at) VALUES (?, ?, 'p', 'done', ?, ?)").run(id, BOT, now(), now())
const uuidOf = (taskId, type) => db.query('SELECT uuid FROM task_events WHERE task_id = ? AND type = ? ORDER BY id DESC LIMIT 1').get(taskId, type).uuid

task('ct-1')
emitTaskEvent('ct-1', 'user_message', { text: 'escreva o artigo', messageSeq: 0 })
const first = uuidOf('ct-1', 'user_message')
emitTaskEvent('ct-1', 'tool_call', { toolCallId: 'c1', name: 'computer_shell', arguments: { command: 'ls' } })
emitTaskEvent('ct-1', 'tool_result', { toolCallId: 'c1', name: 'computer_shell', preview: 'artigo.md' })
emitTaskEvent('ct-1', 'assistant', { text: 'Escrevi o artigo em artigo.md.' })
const reply = uuidOf('ct-1', 'assistant')
task('ct-2')
emitTaskEvent('ct-2', 'user_message', { text: 'publique', messageSeq: 0 })
emitTaskEvent('ct-2', 'assistant', { text: 'Publicado em https://blog.exemplo.com/artigo.' })

describe('voltar para aqui', () => {
    test('says what it would undo before undoing anything', () => {
        expect(previewRewind('ct-1', first)).toEqual({ messages: 1, replies: 2, steps: 1, laterTasks: 1, diskAt: null })
        // Nothing was cut by looking.
        expect(db.query("SELECT COUNT(*) AS n FROM tasks WHERE bot_id = ?").get(BOT).n).toBe(2)
    })

    test('a reply marked before the cut keeps its words after it', () => {
        expect(addBookmark('acc-1', BOT, first)).toBeNull()
        expect(addBookmark('acc-1', BOT, reply).map(item => item.text)).toEqual(['Escrevi o artigo em artigo.md.'])
    })

    test('the cut part stays as a version to read, and the conversation goes on from the message', async () => {
        await rewindTask('ct-1', first)
        expect(db.query("SELECT COUNT(*) AS n FROM tasks WHERE bot_id = ?").get(BOT).n).toBe(1)
        const [version] = listBranches(BOT)
        expect(version).toMatchObject({ title: 'escreva o artigo' })
        const kept = fetchBranch(BOT, version.id)
        expect(kept.events.map(event => event.type)).toEqual(['user_message', 'tool_call', 'tool_result', 'assistant', 'user_message', 'assistant'])
        expect(kept.events.at(-1).data.text).toContain('https://blog.exemplo.com/artigo')
        expect(fetchBranch('other-bot', version.id)).toBeNull()
        expect(listBookmarks('acc-1', BOT).map(item => item.text)).toEqual(['Escrevi o artigo em artigo.md.'])
        expect(removeBookmark('acc-1', BOT, reply)).toEqual([])
    })
})

describe('marcar como não lida', () => {
    const hasNews = () => db.query(`SELECT EXISTS (SELECT 1 FROM task_events e JOIN tasks t ON t.id = e.task_id WHERE t.bot_id = ? AND e.id > COALESCE((SELECT read_event_id FROM bots WHERE id = ?), 0) AND e.type = 'assistant') AS v`).get(BOT, BOT).v

    test('brings the latest news back, and reading takes it away again', () => {
        task('ct-3')
        emitTaskEvent('ct-3', 'user_message', { text: 'oi', messageSeq: 0 })
        emitTaskEvent('ct-3', 'assistant', { text: 'Oi! O que faço?' })
        markBotRead(BOT)
        expect(hasNews()).toBe(0)
        markBotUnread(BOT)
        expect(hasNews()).toBe(1)
        markBotRead(BOT)
        expect(hasNews()).toBe(0)
    })
})

describe('perguntar sem parar', () => {
    const realFetch = globalThis.fetch
    let sent = null
    afterAll(() => (globalThis.fetch = realFetch))

    test('answers from the conversation and leaves no trace in it', async () => {
        process.env.OPENROUTER_API_KEY ||= 'sk-house'
        globalThis.fetch = async (url, init) => {
            sent = JSON.parse(init.body)
            return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: 'Ele está no começo: só cumprimentou.' }, finish_reason: 'stop' }], usage: { cost: 0.001 } }), { status: 200 })
        }
        const before = db.query('SELECT COUNT(*) AS n FROM task_events').get().n
        const { answer } = await askSideQuestion({ id: BOT, name: 'Blog', model: 'x/y' }, 'em que pé está?')
        expect(answer).toBe('Ele está no começo: só cumprimentou.')
        expect(sent.messages[1].content).toContain('Agente: Oi! O que faço?')
        expect(sent.messages[1].content).toContain('Pergunta: em que pé está?')
        expect(db.query('SELECT COUNT(*) AS n FROM task_events').get().n).toBe(before)
        expect(recentWork('nobody')).toBe('')
    })
})
