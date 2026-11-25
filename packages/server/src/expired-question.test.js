import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-expire-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { db, now } = await import('./db.js')
const { encrypt } = await import('./secrets.js')
const { createTask, fetchTask, sendBotMessage, QUESTION_EXPIRES_SECONDS } = await import('./engine/run.js')

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
        if (String(url) !== 'https://openrouter.ai/api/v1/chat/completions' || init.headers?.Authorization !== 'Bearer sk-or-expire-test') return new Response('fora do teste', { status: 400 })
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
    db.query("DELETE FROM failures WHERE bot_id LIKE 'bot-expire-%'").run()
    db.query("DELETE FROM outcome_events WHERE bot_id LIKE 'bot-expire-%'").run()
})

db.query("INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('acc-expire', 'vencer@exemplo.com', 'Ana', 'active', ?, ?)").run(now(), now())
db.query("INSERT INTO ai_accounts (id, account_id, name, token, provider, models, created_at) VALUES ('ai-expire', 'acc-expire', 'OpenRouter', ?, 'openrouter', '[\"anthropic/claude-haiku-5.5\"]', ?)").run(await encrypt('sk-or-expire-test'), now())

let bots = 0
function newBot() {
    const id = `bot-expire-${++bots}`
    db.query("INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id, ai_account) VALUES (?, 'Diretor', ?, 'idle', 'anthropic/claude-haiku-5.5', ?, ?, 'acc-expire', 'ai-expire')").run(id, `sprite-${id}`, now(), now())
    return id
}

async function reaches(taskId, statuses) {
    for (let tries = 0; tries < 300; tries++) {
        const task = fetchTask(taskId)
        if (statuses.includes(task.status)) return task
        await Bun.sleep(10)
    }
    return fetchTask(taskId)
}

/** The agent asks and nobody answers; the question is pushed back in time by `hoursAgo` */
async function askedAndLeft(hoursAgo) {
    const botId = newBot()
    script = [{ call: { id: 'ask-1', name: 'ask_user', args: { question: 'Publico o relatório agora ou espero você?' } } }]
    const taskId = createTask(botId, 'faça o relatório').id
    const task = await reaches(taskId, ['waiting_user', 'failed', 'done'])
    expect(task.status).toBe('waiting_user')
    db.query("UPDATE task_events SET created_at = created_at - ? WHERE task_id = ? AND type = 'status'").run(hoursAgo * 3600, taskId)
    return { botId, taskId }
}

const routine = { routine: { id: 'r-1', name: 'Relatório das 7h' } }

describe('a question nobody answers does not hold the routines', () => {
    test('a routine hours after the question: the question expires and the routine runs now', async () => {
        const { botId, taskId } = await askedAndLeft(QUESTION_EXPIRES_SECONDS / 3600 + 1)
        script = [{ text: 'Escolhi esperar a publicação e fiz o relatório.' }]
        sent.length = 0
        sendBotMessage(botId, 'Rode o relatório das 7h.', routine)
        const task = await reaches(taskId, ['done', 'failed'])
        expect(task.status).toBe('done')
        const answer = sent.at(-1).messages.find(message => message.tool_call_id === 'ask-1')
        expect(String(answer.content)).toContain('venceu')
        expect(String(answer.content)).toContain('Rode o relatório das 7h.')
        const shown = db.query("SELECT data FROM task_events WHERE task_id = ? AND type = 'user_message' ORDER BY id DESC LIMIT 1").get(taskId)
        expect(JSON.parse(shown.data)).toMatchObject({ text: 'Rode o relatório das 7h.', routine: { name: 'Relatório das 7h' } })
    })

    test('a routine minutes after the question still waits for the person, and the person answers it', async () => {
        const { botId, taskId } = await askedAndLeft(0)
        sent.length = 0
        sendBotMessage(botId, 'Rode o relatório das 7h.', routine)
        await Bun.sleep(50)
        expect(fetchTask(taskId).status).toBe('waiting_user')
        expect(sent).toHaveLength(0)
        script = [{ text: 'Publicado.' }]
        sendBotMessage(botId, 'publique agora')
        expect((await reaches(taskId, ['done', 'failed'])).status).toBe('done')
    })
})
