// The control server, played in the browser for the public demo. It answers
// the /api routes the screens call with the example data in fixtures.js and
// never reaches the network. Writes that matter to the walk-through (sending a
// message, creating an agent) answer with a canned reply; the rest say, in the
// error the screen already shows, that the demo changes nothing.

import * as fixtures from './fixtures.js'

const collection = items => ({ items, page: { limit: items.length || 50, offset: 0, total: items.length, hasMore: false } })

// Events that carry the thread with them, as the server's bot stream does.
const THREAD_CHANGES = new Set(['status', 'approval_requested', 'approval_resolved', 'title'])

const ok = body => ({ status: 200, body })
const created = body => ({ status: 201, body })
const fail = (status, code, message) => ({ status, body: { error: { code, message } } })
const refuse = () => fail(409, 'DEMO', fixtures.DEMO_REFUSAL)

let counter = 0
const newId = () => (globalThis.crypto?.randomUUID ? globalThis.crypto.randomUUID() : `demo-${Date.now()}-${++counter}`)

export function createFakeApi({ now = () => Math.floor(Date.now() / 1000), replyDelayMs = 900, schedule = (fn, ms) => setTimeout(fn, ms) } = {}) {
    const start = now()
    const bots = fixtures.bots(start)
    const aiAccounts = fixtures.aiAccounts(start)
    const files = fixtures.computerFiles(start)
    const listeners = new Map()
    let seq = 0

    // Every bot's tasks and events, numbered in order like task_events.
    const tasks = new Map()
    const events = new Map()
    for (const [botId, conversation] of Object.entries(fixtures.conversations(start))) {
        for (const task of conversation.tasks) tasks.set(task.id, { ...task, botId })
        events.set(
            botId,
            conversation.events.map(event => ({ id: newId(), seq: ++seq, botId, ...event }))
        )
    }
    for (const bot of bots) if (!events.has(bot.id)) events.set(bot.id, [])

    const publish = (channel, event) => {
        for (const listener of listeners.get(channel) ?? []) listener(event)
    }

    /** Listen to 'account' (the account stream) or `bot:<id>` (one conversation). */
    const subscribe = (channel, listener) => {
        if (!listeners.has(channel)) listeners.set(channel, new Set())
        listeners.get(channel).add(listener)
        return () => listeners.get(channel)?.delete(listener)
    }

    const findBot = id => bots.find(bot => bot.id === id)
    const latestTask = botId => [...tasks.values()].filter(task => task.botId === botId).sort((a, b) => b.createdAt - a.createdAt)[0] ?? null

    const threadOf = botId => {
        const task = latestTask(botId)
        if (!task) return null
        return {
            id: task.id,
            botId,
            prompt: task.prompt,
            title: task.title ?? null,
            status: task.status,
            waitingReason: null,
            waitingDetail: null,
            enabledTools: [],
            result: null,
            error: null,
            cost: 0,
            createdAt: task.createdAt,
            updatedAt: task.updatedAt ?? task.createdAt,
            finishedAt: task.finishedAt ?? null,
            workSeconds: 0,
            contextTokens: null,
            contextParts: null,
            isComputerReleased: 0,
            stepTimings: [],
            compactedSummary: null,
            compactedUntil: null,
            mandate: null,
            approvals: [],
            queue: [],
            contextShare: null,
            releasable: { connected: 0, isComputer: true },
            context: null,
        }
    }

    const emit = (botId, taskId, type, data) => {
        const event = { id: newId(), seq: ++seq, taskId, botId, type, data, createdAt: now() }
        events.get(botId).push(event)
        const bot = findBot(botId)
        if (bot) {
            bot.lastActivityAt = event.createdAt
            if (type === 'assistant') bot.lastMessage = data.text.split('\n')[0]
        }
        publish(`bot:${botId}`, THREAD_CHANGES.has(type) ? { ...event, thread: threadOf(botId) } : event)
        publish('account', { type: 'changed', botIds: [botId] })
        return event
    }

    const setTaskStatus = (task, status) => {
        task.status = status
        task.updatedAt = now()
        if (['done', 'failed', 'cancelled'].includes(status)) task.finishedAt = task.updatedAt
        const bot = findBot(task.botId)
        if (bot) bot.runningCount = status === 'running' ? 1 : 0
        emit(task.botId, task.id, 'status', { status })
    }

    // A message: stored at once, answered a moment later with the canned reply.
    const sendMessage = (botId, text) => {
        const bot = findBot(botId)
        let task = latestTask(botId)
        const isWorking = task?.status === 'running'
        if (!isWorking) {
            task = { id: newId(), botId, prompt: text, title: null, status: 'queued', createdAt: now() }
            tasks.set(task.id, task)
        }
        emit(botId, task.id, 'user_message', { text, messageSeq: 0 })
        if (!isWorking) setTaskStatus(task, 'running')
        schedule(() => {
            if (!findBot(botId)) return
            emit(botId, task.id, 'assistant', { text: fixtures.DEMO_REPLY, isFinal: true, turnId: newId() })
            // The Software Engineer's own task stays "working": that is the example it shows.
            if (!isWorking) setTaskStatus(task, 'done')
            bot.hasNews = true
        }, replyDelayMs)
        return threadOf(botId)
    }

    const createBot = body => {
        const template = body.templateId ? fixtures.templates.items.find(item => item.id === body.templateId) : null
        const name = body.name || template?.name || 'Novo agente'
        const account = body.aiAccount ? aiAccounts.find(item => item.id === body.aiAccount) : aiAccounts[0]
        const slug = name.toLowerCase().normalize('NFD').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'agente'
        const bot = {
            ...fixtures.bots(now())[1],
            id: newId(),
            name,
            folder: `agents/${slug}/docs`,
            agentDir: `agents/${slug}`,
            instructionsPath: `agents/${slug}/INSTRUCTIONS.md`,
            templateId: template?.id ?? null,
            instructions: body.instructions ?? template?.instructions ?? '',
            model: body.model || template?.model || fixtures.GEMINI_MODELS[0].id,
            aiAccount: account?.id ?? fixtures.ACCOUNT_IDS.gemini,
            effort: body.effort ?? template?.effort ?? 'high',
            createdAt: now(),
            updatedAt: now(),
            lastActivityAt: now(),
            lastMessage: null,
        }
        bots.push(bot)
        events.set(bot.id, [])
        publish('account', { type: 'changed', botIds: [bot.id] })
        return bot
    }

    const brains = () =>
        aiAccounts.map(account => ({
            account: { id: account.id, name: account.name, provider: account.provider, providerName: account.providerName },
            models: account.models.map(id => ({ id, label: id })),
        }))

    const documentsOf = bot => {
        const items = [
            {
                path: bot.instructionsPath,
                name: 'INSTRUCTIONS.md',
                relativePath: 'INSTRUCTIONS.md',
                group: 'instructions',
                size: bot.instructions.length,
                sha: null,
                updatedAt: bot.updatedAt,
                ext: 'md',
                mimeType: 'text/markdown',
                isEditable: true,
                isDeletable: false,
            },
        ]
        return { folder: bot.folder, defaultFolder: bot.folder, agentDir: bot.agentDir, mode: 'local', counts: { all: 1, work: 0, core: 1, instructions: 1, routine: 0, memory: 0, skill: 0 }, items }
    }

    const repoFiles = () =>
        [{ path: 'README.md', content: '# Projeto de exemplo\n\nOs agentes, documentos e habilidades deste workspace, em Markdown.\n' }, ...bots.map(bot => ({ path: bot.instructionsPath, content: bot.instructions }))].map(file => ({
            ...file,
            sha: null,
            size: file.content.length,
            updatedAt: start - 3600,
        }))

    // [method, pattern, handler({ params, query, body })]. A pattern segment ":name" matches one segment.
    const routes = [
        ['GET', '/api/health', () => ok({ isOk: true })],
        ['GET', '/api/me', () => ok(fixtures.me(bots.length))],
        ['PUT', '/api/me/wish', () => ok(fixtures.me(bots.length))],
        ['GET', '/api/accounts', () => ok(collection([{ ...fixtures.me(bots.length), createdAt: start - 3 * 86400, lastSeenAt: now(), repo: null, botCount: bots.length, costToday: 0, costTotal: 0 }]))],
        ['GET', '/api/metrics/outcomes', ({ query }) => ok({ days: Number(query.get('days')) || 30, since: start - 30 * 86400, outcomes: {}, failures: {}, pendingApprovals: 0, accounts: [], bots: [] })],

        ['GET', '/api/bots', () => ok(collection(bots))],
        ['POST', '/api/bots', ({ body }) => created(createBot(body ?? {}))],
        ['POST', '/api/bots/design', () => refuse()],
        ['GET', '/api/bots/:id', ({ bot }) => ok({ ...bot, documents: { count: 1, workCount: 0, folder: bot.folder, agentDir: bot.agentDir, recent: [] } })],
        [
            'PATCH',
            '/api/bots/:id',
            ({ bot, body }) => {
                Object.assign(bot, body ?? {}, { updatedAt: now() })
                publish('account', { type: 'changed', botIds: [bot.id] })
                return ok(bot)
            },
        ],
        [
            'DELETE',
            '/api/bots/:id',
            ({ bot }) => {
                bots.splice(bots.indexOf(bot), 1)
                return ok({ id: bot.id, deleted: true })
            },
        ],
        [
            'POST',
            '/api/bots/:id/read',
            ({ bot }) => {
                bot.hasNews = false
                return ok({ isRead: true })
            },
        ],
        [
            'DELETE',
            '/api/bots/:id/read',
            ({ bot }) => {
                bot.hasNews = true
                return ok({ isRead: false })
            },
        ],
        [
            'GET',
            '/api/bots/:id/conversation',
            ({ bot, query }) => {
                const after = Number(query.get('after')) || 0
                const before = Number(query.get('before')) || null
                const items = events.get(bot.id).filter(event => event.seq > after && (!before || event.seq < before))
                return ok({ items, hasMore: false, thread: threadOf(bot.id) })
            },
        ],
        ['GET', '/api/bots/:id/thread', ({ bot }) => ok(threadOf(bot.id))],
        ['POST', '/api/bots/:id/messages', ({ bot, body }) => ok(sendMessage(bot.id, String(body?.text ?? '')))],
        ['POST', '/api/bots/:id/side-question', () => ok({ answer: fixtures.DEMO_REPLY })],
        ['GET', '/api/bots/:id/tasks', ({ bot }) => ok(collection([...tasks.values()].filter(task => task.botId === bot.id)))],
        ['GET', '/api/bots/:id/tools', () => ok(collection(fixtures.tools))],
        ['GET', '/api/bots/:id/skills', () => ok(collection([]))],
        ['GET', '/api/bots/:id/memories', () => ok(collection([]))],
        ['GET', '/api/bots/:id/routines', () => ok(collection([]))],
        ['GET', '/api/bots/:id/secrets', () => ok(collection([]))],
        ['GET', '/api/bots/:id/bookmarks', () => ok(collection([]))],
        ['GET', '/api/bots/:id/branches', () => ok(collection([]))],
        ['GET', '/api/bots/:id/checkpoints', () => ok(collection([]))],
        ['GET', '/api/bots/:id/artifacts', () => ok(collection([]))],
        ['GET', '/api/bots/:id/audit', () => ok(collection([]))],
        ['GET', '/api/bots/:id/members', () => ok({ items: [] })],
        // The agent folder (the files MCP's routes): each example agent has its own small tree.
        ['GET', '/api/bots/:id/fs/tree', ({ bot }) => ok({ path: '', items: demoTree(bot.id), isTruncated: false })],
        ['GET', '/api/bots/:id/fs/read', ({ bot, query }) => ok({ path: query.get('path'), content: DEMO_FILES[bot.id]?.[query.get('path')] ?? '', totalLines: 1, offset: 1 })],
        ['GET', '/api/bots/:id/handoffs', () => ok({ from: [], to: [] })],
        ['GET', '/api/bots/:id/approval-rate', () => ok({ weeks: Array.from({ length: 8 }, () => ({ approved: 0, decided: 0 })) })],
        ['GET', '/api/bots/:id/inbox', ({ bot }) => ok({ url: `https://sua-central.example/in/exemplo-${bot.id.slice(0, 8)}`, createdAt: start })],
        ['GET', '/api/bots/:id/documents', ({ bot }) => ok(documentsOf(bot))],
        ['GET', '/api/bots/:id/files', ({ bot }) => ok(collection((files[bot.id] ?? []).map(({ content, ...file }) => file)))],
        [
            'GET',
            '/api/bots/:id/files/content',
            ({ bot, query }) => {
                const file = (files[bot.id] ?? []).find(item => item.path === query.get('path'))
                return file ? { status: 200, body: file.content, type: 'text/plain; charset=utf-8' } : fail(404, 'NOT_FOUND', 'arquivo desconhecido')
            },
        ],
        [
            'POST',
            '/api/tasks/:taskId/cancel',
            ({ params }) => {
                const task = tasks.get(params.taskId)
                if (!task) return fail(404, 'NOT_FOUND', 'tarefa desconhecida')
                setTaskStatus(task, 'cancelled')
                return ok(threadOf(task.botId))
            },
        ],

        ['GET', '/api/sections', () => ok(collection([]))],
        ['GET', '/api/templates', () => ok({ ...collection(fixtures.templates.items), areas: fixtures.templates.areas })],
        ['GET', '/api/deliveries', () => ok(collection([]))],
        ['GET', '/api/models', () => ok(collection(fixtures.GEMINI_MODELS))],
        ['GET', '/api/mascots', () => ok(collection([]))],
        ['GET', '/api/skills', () => ok(collection([]))],
        ['GET', '/api/people', () => ok({ items: [] })],
        ['GET', '/api/memories', () => ok({ items: [] })],
        ['GET', '/api/push', () => ok({ isReady: false, publicKey: null, devices: 0 })],
        ['GET', '/api/user-browser', () => ok({ isLinked: false })],

        ['GET', '/api/ai-accounts', () => ok(collection(aiAccounts))],
        ['POST', '/api/ai-accounts', () => refuse()],
        ['GET', '/api/ai-providers', () => ok(collection(fixtures.PROVIDERS))],
        [
            'GET',
            '/api/ai-accounts/:accountId/available-models',
            ({ params }) => {
                const account = aiAccounts.find(item => item.id === params.accountId)
                if (!account) return fail(404, 'NOT_FOUND', 'conta de IA desconhecida')
                const known = [...fixtures.GEMINI_MODELS, ...fixtures.SUBSCRIPTION_MODELS]
                return ok(collection(account.models.map(id => ({ id, label: known.find(model => model.id === id)?.label ?? id }))))
            },
        ],
        ['GET', '/api/brains', () => ok(collection(brains()))],

        ['GET', '/api/apps', () => ok({ ...collection(fixtures.appCatalog().items), categories: fixtures.appCatalog().categories })],
        ['GET', '/api/connections', () => ok(collection([]))],
        ['POST', '/api/connections', () => refuse()],
        ['GET', '/api/registry', () => ok(collection([]))],

        ['GET', '/api/files', () => ok({ ...collection(repoFiles().map(({ content, ...file }) => file)), repo: null })],
        [
            'GET',
            '/api/files/content',
            ({ query }) => {
                const file = repoFiles().find(item => item.path === query.get('path'))
                return file ? ok({ path: file.path, sha: null, content: file.content }) : fail(404, 'NOT_FOUND', 'arquivo desconhecido')
            },
        ],
        ['GET', '/api/files/history', () => ok(collection([]))],
        ['GET', '/api/files/diff', () => ok({ patch: '' })],
    ].map(([method, pattern, handler]) => ({ method, pattern, parts: pattern.split('/').filter(Boolean), handler }))

    /** The route that answers this method and path, with its params, or null. */
    const match = (method, pathname) => {
        const parts = pathname.split('/').filter(Boolean)
        for (const route of routes) {
            if (route.method !== method || route.parts.length !== parts.length) continue
            const params = {}
            const isMatch = route.parts.every((part, index) => {
                if (part.startsWith(':')) return (params[part.slice(1)] = decodeURIComponent(parts[index])), true
                return part === parts[index]
            })
            if (isMatch) return { route, params }
        }
        return null
    }

    /**
     * Answers one request: { status, body, type? }. A GET no route knows
     * answers an empty list, so a screen the demo did not plan for shows its
     * empty state instead of breaking; a write no route knows is refused.
     */
    const handle = (method, url, body) => {
        const { pathname, searchParams } = new URL(url, 'http://demo.invalid')
        const found = match(method.toUpperCase(), pathname)
        if (!found) return method.toUpperCase() === 'GET' ? { ...ok(collection([])), isFallback: true } : refuse()
        const { route, params } = found
        const bot = params.id ? findBot(params.id) : null
        if (params.id && !bot) return fail(404, 'NOT_FOUND', 'bot desconhecido')
        return route.handler({ params, query: searchParams, body, bot })
    }

    /** The stored events of a bot after a place, for a stream that opens late. */
    const eventsAfter = (botId, afterSeq = 0) => (events.get(botId) ?? []).filter(event => event.seq > afterSeq)

    return { handle, match, subscribe, eventsAfter, routes: routes.map(({ method, pattern }) => `${method} ${pattern}`) }
}

// --- Example agent folders --------------------------------------------------

const { BOT_IDS } = fixtures

const DEMO_FILES = {
    [BOT_IDS.neon]: {
        'INSTRUCTIONS.md': '# Neon Engineer\n\nVocê é um engenheiro de software. Responda em português.\n',
        'soma.js': 'export function soma(a, b) {\n    return a + b\n}\n',
        'soma.test.js': "import { expect, test } from 'bun:test'\nimport { soma } from './soma.js'\n\ntest('soma positivos', () => expect(soma(2, 3)).toBe(5))\ntest('soma negativos', () => expect(soma(-2, -3)).toBe(-5))\ntest('soma com zero', () => expect(soma(0, 7)).toBe(7))\n",
    },
    [BOT_IDS.engineer]: {
        'INSTRUCTIONS.md': '# Software Engineer\n\nImplementa mudanças pequenas, com teste.\n',
        'projeto/src/routes/orders.js': "export async function getOrders(req) {\n    const url = new URL(req.url)\n    const limit = Math.min(Number(url.searchParams.get('limit') ?? 20), 100)\n    return Response.json({ items: [], limit })\n}\n",
        'projeto/test/orders.test.js': "import { test } from 'bun:test'\n\ntest('pagina os pedidos', () => {})\n",
        'projeto/package.json': '{ "name": "loja", "type": "module" }\n',
    },
    [BOT_IDS.reviewer]: { 'INSTRUCTIONS.md': '# Code Reviewer\n\nRevisa pull requests e aponta o que quebra.\n' },
}
const DEMO_MARKS = { 'soma.js': 'A', 'soma.test.js': 'A', 'projeto/src/routes/orders.js': 'M', 'projeto/test/orders.test.js': 'A' }

/** The files of one example agent as the tree route answers it: folders first, marks on what changed. */
export function demoTree(botId) {
    const root = []
    for (const filePath of Object.keys(DEMO_FILES[botId] ?? {})) {
        const parts = filePath.split('/')
        let level = root
        parts.forEach((name, index) => {
            const at = parts.slice(0, index + 1).join('/')
            const isFile = index === parts.length - 1
            let node = level.find(item => item.name === name)
            if (!node) {
                node = { path: at, name, kind: isFile ? 'file' : 'folder', size: isFile ? DEMO_FILES[botId][filePath].length : null, modifiedAt: 0, ...(isFile ? (DEMO_MARKS[at] ? { mark: DEMO_MARKS[at] } : {}) : { children: [] }) }
                level.push(node)
            }
            if (!isFile) level = node.children
        })
    }
    const sort = items => items.sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1)).forEach(item => item.children && sort(item.children))
    sort(root)
    return root
}
