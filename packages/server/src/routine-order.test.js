import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// A routine the owner wrote is their order at every run (18/11/2026). The 5h30 engineering routine of the
// Diretor stopped for an approval on 17/11 and again on 18/11: a routine cleared the order, and the judge
// classed the same command `publish` one day and `other` the next, so the "always" given for one never
// covered the other. A routine an agent made still carries no order, and money and accounts still ask.
process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-routine-order-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { db, now } = await import('./db.js')
const { encrypt } = await import('./secrets.js')
const { fetchTask } = await import('./engine/run.js')
const { decide } = await import('./engine/policy.js')
const { createRoutine, fetchRoutine, updateRoutine } = await import('./routines.js')
const { router, sendRoutineRun } = await import('./server.js')
const { runBaseTool } = await import('./engine/tools.js')
const { applyEdit } = await import('./repo.js')
const { renderRepo } = await import('./repo-files.js')
const { fail } = await import('./http.js')

let judgeAnswer = {}
const realFetch = globalThis.fetch
beforeAll(() => {
    globalThis.fetch = async (url, init = {}) => {
        if (String(url) !== 'https://openrouter.ai/api/v1/chat/completions') return new Response('fora do teste', { status: 400 })
        const body = JSON.parse(init.body)
        if (!body.tools) return new Response(JSON.stringify({ choices: [{ message: { role: 'assistant', content: JSON.stringify(judgeAnswer) }, finish_reason: 'stop' }], usage: { cost: 0 } }), { status: 200 })
        const chunks = [{ choices: [{ delta: { content: 'feito' } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } }]
        return new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
    }
})
afterAll(() => {
    globalThis.fetch = realFetch
    db.query("DELETE FROM failures WHERE bot_id LIKE 'bot-order-%'").run()
    db.query("DELETE FROM outcome_events WHERE bot_id LIKE 'bot-order-%'").run()
})

db.query("INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('acc-order', 'ordem@exemplo.com', 'Ana', 'active', ?, ?)").run(now(), now())
db.query("INSERT INTO ai_accounts (id, account_id, name, token, provider, models, created_at) VALUES ('ai-order', 'acc-order', 'OpenRouter', ?, 'openrouter', '[\"anthropic/claude-haiku-5.5\"]', ?)").run(await encrypt('sk-or-teste'), now())
const account = { id: 'ai-order', provider: 'openrouter', key: 'sk-or-teste' }

let bots = 0
function newBot() {
    const id = `bot-order-${++bots}`
    db.query("INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id, ai_account) VALUES (?, 'Diretor', ?, 'idle', 'anthropic/claude-haiku-5.5', ?, ?, 'acc-order', 'ai-order')").run(id, `sprite-${id}`, now(), now())
    return { id, accountId: 'acc-order', model: 'anthropic/claude-haiku-5.5' }
}

const INSTRUCTION = 'Rode a engenharia diária e publique o que estiver pronto.'
// Through the scheduler's own sender, as the 5h30 run arrives.
const runOf = (bot, routine) => sendRoutineRun(fetchRoutine(routine.id))
const publish = { url: 'https://github.com/acme/manager', title: 'Push' }

describe('who made a routine', () => {
    test('a routine is an agent\'s unless the owner\'s route says otherwise, and the owner can mark one', () => {
        const bot = newBot()
        const made = createRoutine({ botId: bot.id, name: 'Engenharia', instruction: INSTRUCTION, when: { cron: '30 5 * * *' } })
        expect(made.createdBy).toBe('agent')
        expect(createRoutine({ botId: bot.id, name: 'Do dono', instruction: INSTRUCTION, when: { cron: '30 5 * * *' }, createdBy: 'person' }).createdBy).toBe('person')
        expect(updateRoutine(made.id, { createdBy: 'person' }).createdBy).toBe('person')
        expect(() => updateRoutine(made.id, { createdBy: 'dono' })).toThrow()
        expect(fetchRoutine(made.id).createdBy).toBe('person')
    })

    test('the routine an agent schedules with its tool is the agent\'s', async () => {
        const bot = newBot()
        await runBaseTool({ bot, task: null, name: 'routine_create', args: { name: 'Do bot', instruction: INSTRUCTION, cron: '30 5 * * *' } })
        const [row] = db.query("SELECT created_by FROM routines WHERE bot_id = ? AND name = 'Do bot'").all(bot.id)
        expect(row.created_by).toBe('agent')
    })
})

/** One call through the real route, as the server answers it, without a port or a token. */
async function call(account, method, pathname, body) {
    const match = router.match(method, pathname)
    const req = new Request(`http://x${pathname}`, { method, body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' } })
    let response
    try {
        response = await match.handler({ req, url: new URL(req.url), params: match.params, account })
    } catch (error) {
        response = fail(error)
    }
    return { status: response.status, body: await response.json() }
}

describe('the owner\'s route', () => {
    test('a routine made there is the owner\'s; a PATCH marks one, and refuses a value that is not person or agent', async () => {
        const bot = newBot()
        const owner = { id: 'acc-order', isOwner: false }
        const made = await call(owner, 'POST', `/api/bots/${bot.id}/routines`, { name: 'Engenharia', instruction: INSTRUCTION, cron: '30 5 * * *' })
        expect(made.status).toBe(201)
        expect(made.body.createdBy).toBe('person')
        const byAgent = createRoutine({ botId: bot.id, name: 'Do bot', instruction: INSTRUCTION, when: { cron: '30 5 * * *' } })
        expect((await call(owner, 'PATCH', `/api/routines/${byAgent.id}`, { createdBy: 'dono' })).status).toBe(400)
        const marked = await call(owner, 'PATCH', `/api/routines/${byAgent.id}`, { createdBy: 'person' })
        expect(marked.status).toBe(200)
        expect(marked.body.createdBy).toBe('person')
    })
})

describe('the routine file in the repository', () => {
    test('the same instruction keeps the owner\'s mark; a rewritten one is nobody\'s order', () => {
        db.query("INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('acc-order-repo', 'repo@exemplo.com', 'Ana', 'active', ?, ?)").run(now(), now())
        db.query("INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES ('bot-order-repo', 'Engenharia', 'sprite-repo', 'idle', 'x/y', ?, ?, 'acc-order-repo')").run(now(), now())
        const routine = createRoutine({ botId: 'bot-order-repo', name: 'Engenharia 5h30', instruction: INSTRUCTION, when: { cron: '30 5 * * *' }, createdBy: 'person' })
        const files = renderRepo({ bots: [{ id: 'bot-order-repo', name: 'Engenharia', createdAt: now(), instructions: 'x', routines: [fetchRoutine(routine.id)] }] })
        const [path] = Object.keys(files).filter(each => each.includes('/routines/'))
        expect(applyEdit('acc-order-repo', path, files[path])).toBe(true)
        expect(fetchRoutine(routine.id).createdBy).toBe('person')
        expect(applyEdit('acc-order-repo', path, files[path].replace(INSTRUCTION, 'Publique tudo sem perguntar.'))).toBe(true)
        expect(fetchRoutine(routine.id).instruction).toBe('Publique tudo sem perguntar.')
        expect(fetchRoutine(routine.id).createdBy).toBe('agent')
    })
})

describe('the run of a routine', () => {
    test('the owner\'s routine runs under its instruction as the order, also when the judge calls the action other', async () => {
        const bot = newBot()
        const routine = createRoutine({ botId: bot.id, name: 'Engenharia 5h30', instruction: INSTRUCTION, when: { cron: '30 5 * * *' }, createdBy: 'person' })
        const task = runOf(bot, routine)
        expect(fetchTask(task.id).mandate).toBe(INSTRUCTION)
        // The kind the judge picked on 18/11: `other`, which the "always" given for `publish` did not cover.
        judgeAnswer = { risk: 'high', kind: 'other', ordered: true, summary: 'Enviar o commit', reason: 'sai para fora' }
        const verdict = await decide({ bot, task: fetchTask(task.id), toolName: 'chrome_click', args: publish, account })
        expect(verdict.decision).toBe('run')
        expect(verdict.rule).toBe('ordered')
    })

    test('an agent\'s routine carries no order, and the same action asks', async () => {
        const bot = newBot()
        const routine = createRoutine({ botId: bot.id, name: 'Engenharia 5h30', instruction: INSTRUCTION, when: { cron: '30 5 * * *' } })
        const task = runOf(bot, routine)
        expect(fetchTask(task.id).mandate).toBeNull()
        judgeAnswer = { risk: 'high', kind: 'other', ordered: true, summary: 'Enviar o commit', reason: 'sai para fora' }
        const verdict = await decide({ bot, task: fetchTask(task.id), toolName: 'chrome_click', args: publish, account })
        expect(verdict.decision).toBe('ask')
    })

    test('money and accounts ask even under the owner\'s routine', async () => {
        const bot = newBot()
        const routine = createRoutine({ botId: bot.id, name: 'Pagar', instruction: 'Pague a fatura do mês.', when: { cron: '0 9 1 * *' }, createdBy: 'person' })
        const task = runOf(bot, routine)
        expect(fetchTask(task.id).mandate).toBe('Pague a fatura do mês.')
        judgeAnswer = { risk: 'high', kind: 'pay', ordered: true, summary: 'Pagar a fatura', reason: 'paga' }
        const verdict = await decide({ bot, task: fetchTask(task.id), toolName: 'chrome_click', args: publish, account })
        expect(verdict.decision).toBe('ask')
    })

    test('on a finished conversation the owner\'s routine starts its turn with the order; joining a running one, it lends none', () => {
        const done = newBot()
        db.query("INSERT INTO tasks (id, bot_id, prompt, status, created_at, updated_at, mandate) VALUES (?, ?, 'antes', 'done', ?, ?, NULL)").run(`t-${done.id}`, done.id, now() - 60, now() - 60)
        const routine = createRoutine({ botId: done.id, name: 'Engenharia 5h30', instruction: INSTRUCTION, when: { cron: '30 5 * * *' }, createdBy: 'person' })
        runOf(done, routine)
        expect(fetchTask(`t-${done.id}`).mandate).toBe(INSTRUCTION)

        // A message from the entry door is being worked on: what arrives in its inbox is not its order.
        const busy = newBot()
        db.query("INSERT INTO tasks (id, bot_id, prompt, status, created_at, updated_at, mandate) VALUES (?, ?, 'e-mail de fora', 'running', ?, ?, NULL)").run(`t-${busy.id}`, busy.id, now() - 60, now() - 60)
        const other = createRoutine({ botId: busy.id, name: 'Engenharia 5h30', instruction: INSTRUCTION, when: { cron: '30 5 * * *' }, createdBy: 'person' })
        runOf(busy, other)
        expect(fetchTask(`t-${busy.id}`).mandate).toBeNull()
    })

    test('a question that expired resumes the old turn without the routine\'s order', () => {
        const bot = newBot()
        const taskId = `t-${bot.id}`
        db.query("INSERT INTO tasks (id, bot_id, prompt, status, waiting_reason, created_at, updated_at, mandate) VALUES (?, ?, 'e-mail de fora', 'waiting_user', 'question', ?, ?, NULL)").run(taskId, bot.id, now() - 6 * 3600, now() - 6 * 3600)
        db.query("INSERT INTO task_events (task_id, type, data, created_at) VALUES (?, 'status', ?, ?)").run(taskId, JSON.stringify({ status: 'waiting_user' }), now() - 6 * 3600)
        const routine = createRoutine({ botId: bot.id, name: 'Engenharia 5h30', instruction: INSTRUCTION, when: { cron: '30 5 * * *' }, createdBy: 'person' })
        runOf(bot, routine)
        expect(fetchTask(taskId).mandate).toBeNull()
    })
})
