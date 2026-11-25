import { db, now } from './db.js'
import { today } from './accounts.js'

// The Assistant watches itself (10/11/2026). Until then only someone reading the database saw that
// 101 tool calls had failed in a week, that the Acme Studio Instagram had expired and that nine
// routines had been off for six days. Every morning the account's director gets the last day's
// failures, the connections that stopped, the routines turned off, the approvals left waiting and
// what each agent cost; what repeats in one of the account's products becomes a product request.

const TIMEZONE = 'America/Sao_Paulo'
const SEND_HOUR = 6
const STALLED_HOURS = 6
const WAITING_FOR = { question: 'uma resposta à pergunta', connection: 'uma reconexão', takeover: 'o computador de volta', limit: 'o limite de custo', step_limit: 'licença para seguir além do limite de passos' }
const ACCESS_PROBLEM = /venceu|expir|reconect|NotAuthorized|Unauthorized|\b401\b|credencial|sem permiss/i

const hourIn = date => Number(new Intl.DateTimeFormat('en-GB', { timeZone: TIMEZONE, hour: '2-digit', hourCycle: 'h23' }).format(date))
const dayIn = date => new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit' }).format(date)

const companyOf = folder => (folder ? String(folder).split('/')[0] : null)

/**
 * Each director with the agents it hears about. An account can hold several companies, one per
 * folder ("acme-studio/...", "personal/..."), each with its own director; an agent whose
 * company has no director (or that has no folder) goes to the director of the largest company.
 */
export function directorsOf(accountId) {
    const bots = db.query('SELECT id, name, folder, template_id, connection_ids FROM bots WHERE account_id = ? ORDER BY created_at').all(accountId)
    const directors = bots.filter(bot => bot.template_id === 'operations-director')
    if (!directors.length) return []
    const byCompany = new Map(directors.map(director => [companyOf(director.folder), { id: director.id, name: director.name, bots: [] }]))
    const size = company => bots.filter(bot => companyOf(bot.folder) === company).length
    const largest = [...byCompany.keys()].sort((a, b) => size(b) - size(a))[0]
    for (const bot of bots) (byCompany.get(companyOf(bot.folder)) ?? byCompany.get(largest)).bots.push(bot)
    return [...byCompany.values()]
}

/** What failed, by agent, tool and error code, with one sample each; the most frequent first. */
function failureGroups(accountId, since, isMine) {
    const rows = db.query("SELECT f.bot_id, f.kind, f.context, b.name FROM failures f JOIN bots b ON b.id = f.bot_id WHERE b.account_id = ? AND f.created_at >= ? AND f.kind IN ('tool_error', 'task_failed', 'judge_unavailable')").all(accountId, since).filter(row => isMine(row.bot_id))
    const groups = new Map()
    for (const row of rows) {
        const context = String(row.context)
        const tool = row.kind === 'tool_error' ? context.split(':')[0].trim() : row.kind
        const code = context.match(/"code":"([A-Z_]+)"/)?.[1] ?? (ACCESS_PROBLEM.test(context) ? 'ACESSO' : 'ERRO')
        const key = `${row.name}|${tool}|${code}`
        const group = groups.get(key) ?? { agent: row.name, tool, code, count: 0, sample: context.slice(context.indexOf(':') + 1).replace(/\s+/g, ' ').trim().slice(0, 160), isAccess: ACCESS_PROBLEM.test(context) }
        group.count += 1
        groups.set(key, group)
    }
    return [...groups.values()].sort((a, b) => b.count - a.count)
}

/** The report of the last 24 hours about some of an account's agents (all, by default), or null when there is nothing to act on. */
export function buildHealthReport(accountId, { at = new Date(), bots = null } = {}) {
    const since = Math.floor(at.getTime() / 1000) - 86400
    const mine = bots ? new Set(bots.map(bot => bot.id)) : null
    const isMine = botId => !mine || mine.has(botId)
    // A connection belongs in the report when one of these agents uses it (no list means all of them).
    const usesIt = id => !bots || bots.some(bot => { const ids = bot.connection_ids ? JSON.parse(bot.connection_ids) : null; return !Array.isArray(ids) || ids.includes(id) })
    const failures = failureGroups(accountId, since, isMine)
    const connections = db.query("SELECT id, title, status, status_detail FROM connections WHERE account_id = ? AND status != 'connected'").all(accountId).filter(connection => usesIt(connection.id))
    const routines = db.query('SELECT r.bot_id, r.name, b.name AS agent FROM routines r JOIN bots b ON b.id = r.bot_id WHERE b.account_id = ? AND r.is_enabled = 0 AND (r.run_at IS NULL OR r.run_at > ?)').all(accountId, since).filter(row => isMine(row.bot_id))
    const waiting = db.query("SELECT t.bot_id, a.summary, b.name AS agent, a.created_at FROM approvals a JOIN tasks t ON t.id = a.task_id JOIN bots b ON b.id = t.bot_id WHERE b.account_id = ? AND a.status = 'pending' AND a.created_at < ?").all(accountId, since).filter(row => isMine(row.bot_id))
    // An agent whose conversation waits for a person (a question, a reconnection) for hours is silent: on 17/11/2026
    // one question held the operations director for two days and nothing said so
    const stalledBefore = Math.floor(at.getTime() / 1000) - STALLED_HOURS * 3600
    const stalled = db
        .query(
            `SELECT t.bot_id, t.waiting_reason, t.waiting_detail, b.name AS agent,
                    (SELECT e.created_at FROM task_events e WHERE e.task_id = t.id AND e.type = 'status' ORDER BY e.id DESC LIMIT 1) AS since
             FROM tasks t JOIN bots b ON b.id = t.bot_id
             WHERE b.account_id = ? AND t.status = 'waiting_user'
               AND t.id = (SELECT id FROM tasks WHERE bot_id = t.bot_id ORDER BY created_at DESC LIMIT 1)`,
        )
        .all(accountId)
        .filter(row => isMine(row.bot_id) && row.since != null && row.since < stalledBefore)
    const yesterday = dayIn(new Date(at.getTime() - 86400 * 1000))
    const costs = db.query('SELECT u.bot_id, b.name, u.cost FROM bot_usage u JOIN bots b ON b.id = u.bot_id WHERE b.account_id = ? AND u.day = ? AND u.cost > 0 ORDER BY u.cost DESC').all(accountId, yesterday).filter(row => isMine(row.bot_id))

    const parts = []
    const repeated = failures.filter(group => group.count >= 2 || group.isAccess)
    if (repeated.length) {
        parts.push('Erros que se repetiram:')
        for (const group of repeated.slice(0, 15)) parts.push(`- ${group.agent} · ${group.tool} · ${group.code} · ${group.count} ${group.count === 1 ? 'vez' : 'vezes'}: ${group.sample}`)
    }
    if (connections.length) {
        parts.push('', 'Conexões fora do ar:')
        for (const connection of connections) parts.push(`- ${connection.title}: ${connection.status}${connection.status_detail ? ` (${String(connection.status_detail).slice(0, 120)})` : ''}`)
    }
    if (routines.length) {
        parts.push('', 'Rotinas desligadas:')
        for (const routine of routines) parts.push(`- ${routine.agent}: ${routine.name}`)
    }
    if (waiting.length) {
        parts.push('', 'Aprovações esperando há mais de 24 horas:')
        for (const approval of waiting.slice(0, 10)) parts.push(`- ${approval.agent}: ${approval.summary}`)
    }
    if (stalled.length) {
        parts.push('', `Agentes parados esperando resposta há mais de ${STALLED_HOURS} horas:`)
        for (const row of stalled) {
            const hours = Math.floor((Math.floor(at.getTime() / 1000) - row.since) / 3600)
            const question = String(JSON.parse(row.waiting_detail || '{}')?.question ?? '').replace(/\s+/g, ' ').trim().slice(0, 140)
            parts.push(`- ${row.agent}: ${WAITING_FOR[row.waiting_reason] ?? 'uma resposta'}, há ${hours} horas${question ? `: "${question}"` : ''}`)
        }
    }
    if (!parts.length) return null
    if (costs.length) parts.push('', `Custo de ontem por agente (US$): ${costs.map(row => `${row.name} ${row.cost.toFixed(2)}`).join('; ')}.`)

    return [
        'Saúde do Assistant nas últimas 24 horas (relatório automático das 6h).',
        '',
        ...parts,
        '',
        'O que fazer, sem perguntar: o erro que se repete num produto da conta vira pedido de produto no pedidos-de-produto.md da sua pasta, com o agente, a ferramenta, o erro e como conferir; o erro de uso (nome ou argumento errado) vai ao agente dono com bot_handoff e a forma certa; acesso vencido ou conexão fora do ar, peça ao usuário a reconexão uma vez, dizendo o que ela destrava; rotina desligada sem motivo registrado, religue; aprovação parada ou agente esperando resposta, lembre o usuário em uma frase, com a pergunta. Entregue o resumo como Artifact.',
    ].join('\n')
}

/** Sends each director its company's report once a day, from 6h in São Paulo; a restart never sends it twice. */
export function sendHealthReports(send, { at = new Date() } = {}) {
    if (hourIn(at) < SEND_HOUR) return 0
    const day = today()
    let sent = 0
    for (const { id: accountId } of db.query('SELECT id FROM accounts').all()) {
        for (const director of directorsOf(accountId)) {
            if (db.query('SELECT 1 FROM health_reports WHERE bot_id = ? AND day = ?').get(director.id, day)) continue
            db.query('INSERT INTO health_reports (bot_id, day, created_at) VALUES (?, ?, ?)').run(director.id, day, now())
            const report = buildHealthReport(accountId, { at, bots: director.bots })
            if (!report) continue
            send(director.id, report)
            sent += 1
        }
    }
    return sent
}

export function startHealthReports(send) {
    const run = () => {
        try {
            sendHealthReports(send)
        } catch (error) {
            console.warn(`[health] ${error.message}`)
        }
    }
    run()
    setInterval(run, 10 * 60 * 1000).unref?.()
}
