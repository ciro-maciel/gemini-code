import { afterAll, beforeAll, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-missing-tool-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { db, now } = await import('./db.js')
const { encrypt } = await import('./secrets.js')
const { createTask, fetchTask } = await import('./engine/run.js')

// 10/11/2026: five agents called connector tools by the names they had before the four tools
// (blogs_get_post, analytics_overview). The call waited for a person to approve a tool that could
// not run, for days. Now it goes back to the agent at once, with today's names.
const sent = []
let script = []
const sse = chunks => new Response(chunks.map(chunk => `data: ${JSON.stringify(chunk)}\n\n`).join('') + 'data: [DONE]\n\n', { headers: { 'Content-Type': 'text/event-stream' } })
const realFetch = globalThis.fetch
beforeAll(() => {
    globalThis.fetch = async (url, init = {}) => {
        if (String(url) !== 'https://openrouter.ai/api/v1/chat/completions') return new Response('fora do teste', { status: 400 })
        const body = JSON.parse(init.body)
        if (!body.tools) return new Response('fora do teste', { status: 400 })
        sent.push(body)
        const step = script.shift() ?? { text: 'fim do roteiro' }
        if (step.call) return sse([{ choices: [{ delta: { tool_calls: [{ index: 0, id: step.call.id, function: { name: step.call.name, arguments: JSON.stringify(step.call.args) } }] } }] }, { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } }])
        return sse([{ choices: [{ delta: { content: step.text } }] }, { choices: [{ delta: {}, finish_reason: 'stop' }], usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 } }])
    }
})
afterAll(() => {
    globalThis.fetch = realFetch
})

db.query("INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('acc-missing', 'falta@exemplo.com', 'Ana', 'active', ?, ?)").run(now(), now())
db.query("INSERT INTO ai_accounts (id, account_id, name, token, provider, models, created_at) VALUES ('ai-missing', 'acc-missing', 'OpenRouter', ?, 'openrouter', '[\"anthropic/claude-haiku-5.5\"]', ?)").run(await encrypt('sk-or-teste'), now())
const fourTools = ['blogs_guide', 'blogs_read', 'blogs_write', 'blogs_delete'].map(name => ({ name, description: name, inputSchema: { type: 'object' } }))
db.query("INSERT INTO connections (id, account_id, server_name, title, url, transport, status, tools, created_at, updated_at) VALUES ('c-missing-blogs', 'acc-missing', 'blogs', 'Blogs', 'https://missing-blogs.test/mcp', 'streamable', 'connected', ?, 0, 0)").run(JSON.stringify(fourTools))
db.query("INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id, ai_account) VALUES ('bot-missing', 'SEO', 'sprite-missing', 'idle', 'anthropic/claude-haiku-5.5', ?, ?, 'acc-missing', 'ai-missing')").run(now(), now())

async function settled(taskId) {
    for (let tries = 0; tries < 200; tries++) {
        const task = fetchTask(taskId)
        if (['done', 'failed', 'waiting_user', 'cancelled', 'waiting_approval'].includes(task.status)) return task
        await Bun.sleep(10)
    }
    throw new Error('a tarefa não terminou')
}

test('a connector tool by an old name goes back to the agent with the names it has now, without asking anyone', async () => {
    script = [{ call: { id: 'call-old', name: 'mcp__blogs__blogs_get_post', args: { postId: 'p-1' } } }, { text: 'Li pelo blogs_read.' }]
    const task = await settled(createTask('bot-missing', 'leia o post p-1').id)
    expect(task.status).toBe('done')
    expect(db.query("SELECT COUNT(*) AS n FROM approvals WHERE task_id = ?").get(task.id).n).toBe(0)
    const answer = sent.at(-1).messages.find(message => message.role === 'tool' && message.tool_call_id === 'call-old')
    expect(answer.content).toContain('mcp__blogs__blogs_get_post não existe')
    expect(answer.content).toContain('mcp__blogs__blogs_read')
})
