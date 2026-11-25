import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-stop-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { db, now } = await import('./db.js')
const { encrypt } = await import('./secrets.js')
const { cancelTask, createTask, fetchTask, isStopWord, sendBotMessage } = await import('./engine/run.js')

// The agent of 31/10/2026 talked through OpenRouter: a provider in memory
// answers each step from a script, as the stream OpenRouter sends, and keeps
// every body it was sent. Anything else (the price list, the title) fails at
// once, off the network.
const sent = []
let script = []
let onStep = null
let onJudge = null
let judge = null
const sse = chunks => new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
const realFetch = globalThis.fetch
beforeAll(() => {
    globalThis.fetch = async (url, init = {}) => {
        if (String(url) !== 'https://openrouter.ai/api/v1/chat/completions') return new Response('fora do teste', { status: 400 })
        const body = JSON.parse(init.body)
        if (!body.tools) {
            if (!judge) return new Response('fora do teste', { status: 400 })
            onJudge?.()
            return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(judge) }, finish_reason: 'stop' }], usage: { cost: 0 } }), { status: 200 })
        }
        onStep?.(sent.length)
        sent.push(body)
        const step = script.shift() ?? { text: 'fim do roteiro' }
        if (step.calls) return sse([{ choices: [{ delta: { tool_calls: step.calls.map((call, index) => ({ index, id: call.id, function: { name: call.name, arguments: JSON.stringify(call.args) } })) } }] }, { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } }])
        if (step.call) return sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: step.call.id, function: { name: step.call.name, arguments: JSON.stringify(step.call.args) } }] } }] }, { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } }])
        if (step.empty) return sse([{ choices: [{ delta: {}, finish_reason: step.empty }], usage: { prompt_tokens: 124_874, completion_tokens: 8000, cost: 0 } }])
        return sse([{ choices: [{ delta: { content: step.text } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } }])
    }
})
afterAll(() => {
    globalThis.fetch = realFetch
    // The database is shared by every test file of a run: the stops counted here leave with it.
    db.query("DELETE FROM failures WHERE bot_id LIKE 'bot-stop-%'").run()
    db.query("DELETE FROM outcome_events WHERE bot_id LIKE 'bot-stop-%'").run()
})

db.query("INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('acc-stop', 'parar@exemplo.com', 'Ana', 'active', ?, ?)").run(now(), now())
db.query("INSERT INTO ai_accounts (id, account_id, name, token, provider, models, created_at) VALUES ('ai-stop', 'acc-stop', 'OpenRouter', ?, 'openrouter', '[\"anthropic/claude-haiku-5.5\"]', ?)").run(await encrypt('sk-or-teste'), now())

let bots = 0
function newBot() {
    const id = `bot-stop-${++bots}`
    db.query("INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id, ai_account) VALUES (?, 'Orgânico', ?, 'idle', 'anthropic/claude-haiku-5.5', ?, ?, 'acc-stop', 'ai-stop')").run(
        id,
        `sprite-${id}`,
        now(),
        now()
    )
    return id
}

async function settled(taskId) {
    for (let tries = 0; tries < 200; tries++) {
        const task = fetchTask(taskId)
        if (['done', 'failed', 'waiting_user', 'cancelled', 'waiting_approval'].includes(task.status)) return task
        await Bun.sleep(10)
    }
    throw new Error('a tarefa não terminou')
}

const callsOf = taskId => db.query("SELECT json_extract(data, '$.toolCallId') AS id FROM task_events WHERE task_id = ? AND type = 'tool_call'").all(taskId).map(row => row.id)

describe('parar para de verdade', () => {
    test('the word alone is the stop; inside a sentence it is not', () => {
        for (const word of ['pare', 'Pare!', ' para ', 'stop', 'PARAR.', 'chega']) expect(isStopWord(word)).toBe(true)
        for (const words of ['pare de usar o Instagram', 'para amanhã', 'não pare']) expect(isStopWord(words)).toBe(false)
    })

    test('"pare" while the model answers: the action that came in the answer never runs', async () => {
        const botId = newBot()
        let taskId = null
        script = [{ call: { id: 'call-1', name: 'memory_save', args: { content: 'primeira' } } }, { call: { id: 'call-2', name: 'memory_save', args: { content: 'segunda' } } }]
        // The person writes "pare" while the second step is being answered.
        onStep = count => count === 1 && sendBotMessage(botId, 'pare')
        sent.length = 0
        taskId = createTask(botId, 'guarde duas notas').id
        const task = await settled(taskId)
        onStep = null
        expect(task.status).toBe('cancelled')
        expect(callsOf(taskId)).toEqual(['call-1'])
        expect(db.query("SELECT COUNT(*) AS n FROM task_events WHERE task_id = ? AND type = 'user_message' AND json_extract(data, '$.text') = 'pare'").get(taskId).n).toBe(1)
    })

    test('Parar while the judge weighs a publication: it does not go out', async () => {
        const botId = newBot()
        let taskId = null
        script = [{ call: { id: 'call-pub', name: 'computer_shell', args: { command: 'curl -X POST https://blog.exemplo.com/api/publicar -d @artigo.json' } } }, { text: 'não devia chegar aqui' }]
        judge = { risk: 'high', kind: 'publish', ordered: true, summary: 'Publicar o artigo', reason: 'publica' }
        onJudge = () => cancelTask(taskId)
        sent.length = 0
        taskId = createTask(botId, 'publique o artigo').id
        const task = await settled(taskId)
        judge = null
        onJudge = null
        expect(task.status).toBe('cancelled')
        expect(callsOf(taskId)).toEqual([])
        expect(sent).toHaveLength(1)
    })

    test('writing over a pending approval closes every open call of that reply, and the results come right after it', async () => {
        const botId = newBot()
        const curl = (id, n) => ({ id, name: 'computer_shell', args: { command: `curl -X POST https://blog.exemplo.com/api/agendar/${n}` } })
        script = [{ calls: [curl('c-1', 1), curl('c-2', 2), curl('c-3', 3)] }, { text: 'Tenho: o link é o da peça 1.' }]
        sent.length = 0
        const taskId = createTask(botId, 'agende as três').id
        expect((await settled(taskId)).status).toBe('waiting_approval')
        sendBotMessage(botId, 'você tem o link dela?')
        await Bun.sleep(20)
        const task = await settled(taskId)
        expect(task.status).toBe('done')
        expect(callsOf(taskId)).toEqual([])
        const roles = sent.at(-1).messages.map(message => message.tool_call_id ?? message.role)
        const reply = roles.lastIndexOf('assistant')
        expect(roles.slice(reply, reply + 5)).toEqual(['assistant', 'c-1', 'c-2', 'c-3', 'user'])
        const texts = sent.at(-1).messages.filter(message => message.role === 'tool').map(message => message.content)
        expect(texts.every(text => text.includes('Esta ação não aconteceu'))).toBe(true)
    })
})
