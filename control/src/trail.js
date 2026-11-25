import { db, newId, now } from './db.js'

/*
 * Three records of what the bots did, all per account:
 *
 *  - judgments: every action that went through a judgment (a rule the person
 *    set, the risk judge, a service's write). The person sees and downloads it
 *    per bot (Registro de decisões). It goes with the bot.
 *  - outcome_events: what happened to each approval, plus takeovers and
 *    restores. Only kinds and ids, no text, so the counts outlive the bot.
 *  - failures: the moments the agent went wrong or needed a person, with a
 *    short context, for evals later. Never a secret, a password, what was
 *    typed, or a file's content. It goes with the bot.
 */

// After this long without an answer an approval counts as timed out. The
// action still waits: nothing runs without a person.
export const APPROVAL_TIMEOUT_SECONDS = 24 * 3600

export const OUTCOME_KINDS = ['approval_requested', 'approved', 'approved_task', 'approved_always', 'rejected', 'cancelled', 'superseded', 'timed_out', 'takeover', 'checkpoint_restored']

export const FAILURE_KINDS = ['approval_rejected', 'ask_user', 'takeover', 'checkpoint_restored', 'tool_error', 'judge_unavailable', 'task_failed', 'task_cancelled', 'step_limit', 'empty_reply', 'daily_limit', 'concurrency']

// Rules worth a line in the trail: the ones that ran no judgment at all
// (always free, read-only, local shell) would bury the rest.
const AUDITED_RULES = new Set(['free', 'confirm', 'human', 'judged', 'service', 'granted', 'unknown', 'judge_unavailable'])

const TYPING_TOOLS = new Set(['browser_type', 'browser_fill_form', 'browser_press_key'])

const CONTEXT_MAX = 300

function ownerOf(botId) {
    return db.query('SELECT account_id, model FROM bots WHERE id = ?').get(botId) ?? { account_id: null, model: null }
}

/** Every string inside the arguments, at any depth. */
function stringsOf(value, found = []) {
    if (typeof value === 'string') found.push(value)
    else if (Array.isArray(value)) value.forEach(item => stringsOf(item, found))
    else if (value && typeof value === 'object') Object.values(value).forEach(item => stringsOf(item, found))
    return found
}

/**
 * Text safe to keep for evals. What a typing tool typed is cut out (a judge's
 * summary may quote it), and so is anything shaped like a credential.
 */
export function redact(text, { toolName, args } = {}) {
    let clean = String(text ?? '')
    if (TYPING_TOOLS.has(toolName)) {
        for (const typed of stringsOf(args)
            .filter(value => value.length >= 3)
            .sort((a, b) => b.length - a.length))
            clean = clean.split(typed).join('[texto digitado]')
    }
    return clean
        .replace(/\b(bearer|token|senha|password|passwd|secret|api[_-]?key|authorization)\b(\s*[:=]\s*|\s+)(?:(?:bearer|basic)\s+)?\S+/gi, '$1$2[oculto]')
        .replace(/\b(sk|pk|rk|ghp|gho|github_pat|xox[abp])[-_][A-Za-z0-9_-]{8,}/g, '[oculto]')
        .replace(/[A-Za-z0-9+/_-]{32,}={0,2}/g, '[oculto]')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, CONTEXT_MAX)
}

// --- Writing -------------------------------------------------------------

/** One action that went through a judgment. `rule` comes from policy.decide. */
export function recordJudgment({ botId, taskId, toolCallId, toolName, summary, rule, verdict, reason, approvalId = null }) {
    if (!AUDITED_RULES.has(rule)) return
    const { account_id: accountId } = ownerOf(botId)
    try {
        db.query('INSERT INTO judgments (uuid, account_id, bot_id, task_id, tool_call_id, tool_name, summary, rule, verdict, reason, approval_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
            newId(),
            accountId,
            botId,
            taskId,
            toolCallId ?? null,
            toolName,
            String(summary || toolName).slice(0, 500),
            rule,
            verdict,
            reason ? String(reason).slice(0, 500) : null,
            approvalId,
            now()
        )
    } catch (error) {
        // A record never stops the work it records.
        console.error('[trail] judgment', error.message)
    }
}

export function recordOutcome({ botId, taskId = null, approvalId = null, kind }) {
    if (!OUTCOME_KINDS.includes(kind)) throw new Error(`desfecho desconhecido: ${kind}`)
    const { account_id: accountId } = ownerOf(botId)
    try {
        db.query('INSERT INTO outcome_events (account_id, bot_id, task_id, approval_id, kind, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(accountId, botId, taskId, approvalId, kind, now())
    } catch (error) {
        console.error('[trail] outcome', error.message)
    }
}

/** `context` is redacted here, whatever the caller passed. */
export function recordFailure({ botId, taskId = null, kind, context = '', model = null, toolName, args }) {
    if (!FAILURE_KINDS.includes(kind)) throw new Error(`falha desconhecida: ${kind}`)
    const bot = ownerOf(botId)
    try {
        db.query('INSERT INTO failures (account_id, bot_id, task_id, kind, context, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(bot.account_id, botId, taskId, kind, redact(context, { toolName, args }), model ?? bot.model, now())
    } catch (error) {
        console.error('[trail] failure', error.message)
    }
}

/**
 * Approvals left without an answer past the timeout are counted once as timed
 * out. Their status stays pending: the action keeps waiting for the person.
 */
export function sweepTimedOutApprovals() {
    const stale = db
        .query("SELECT approvals.id, approvals.task_id, tasks.bot_id FROM approvals JOIN tasks ON tasks.id = approvals.task_id WHERE approvals.status = 'pending' AND approvals.timed_out_at IS NULL AND approvals.created_at < ?")
        .all(now() - APPROVAL_TIMEOUT_SECONDS)
    for (const row of stale) {
        db.query('UPDATE approvals SET timed_out_at = ? WHERE id = ?').run(now(), row.id)
        recordOutcome({ botId: row.bot_id, taskId: row.task_id, approvalId: row.id, kind: 'timed_out' })
    }
    return stale.length
}

// --- Reading: the person's trail -----------------------------------------

export const RULE_LABEL = {
    free: 'Livre (regra sua)',
    confirm: 'Confirma (regra sua)',
    human: 'Só humano (regra sua)',
    judged: 'Risco julgado',
    service: 'Ação de aplicativo',
    granted: 'Aprovação estendida',
    unknown: 'Sem regra conhecida',
    judge_unavailable: 'Sem avaliação',
}

export const OUTCOME_LABEL = {
    ran: 'Rodou',
    refused: 'Não permitido',
    pending: 'Esperando você',
    approved: 'Aprovada',
    approved_task: 'Aprovada até o fim da tarefa',
    approved_always: 'Aprovada para sempre',
    rejected: 'Recusada',
    cancelled: 'Cancelada com a tarefa',
}

function outcomeOf(row) {
    if (row.approval_id) return row.approval_status === 'pending' ? 'pending' : row.approval_outcome || row.approval_status
    return row.verdict === 'refuse' ? 'refused' : 'ran'
}

function presentEntry(row) {
    const outcome = outcomeOf(row)
    // The UUID is the entry's id; its number is only its place, for paging back.
    return {
        id: row.uuid,
        seq: row.id,
        createdAt: row.created_at,
        taskId: row.task_id,
        taskTitle: row.task_title,
        toolName: row.tool_name,
        action: row.summary,
        rule: row.rule,
        ruleLabel: RULE_LABEL[row.rule] ?? row.rule,
        risk: row.rule === 'judged' ? (row.verdict === 'ask' ? 'high' : 'low') : null,
        reason: row.reason,
        approvalId: row.approval_id,
        outcome,
        outcomeLabel: OUTCOME_LABEL[outcome] ?? outcome,
        resolvedBy: row.resolved_by_email,
        resolvedAt: row.resolved_at,
        timedOutAt: row.timed_out_at,
        note: row.note,
        checkpointId: row.checkpoint_id,
    }
}

/** The bot's trail, newest first. `beforeSeq` (a place, not an address) pages back. */
export function listAudit(botId, { limit = 50, beforeSeq = null } = {}) {
    const rows = db
        .query(
            `SELECT judgments.*, tasks.title AS task_title,
                approvals.status AS approval_status, approvals.outcome AS approval_outcome, approvals.resolved_at, approvals.timed_out_at,
                approvals.note, approvals.checkpoint_id, accounts.email AS resolved_by_email
             FROM judgments
             LEFT JOIN tasks ON tasks.id = judgments.task_id
             LEFT JOIN approvals ON approvals.id = judgments.approval_id
             LEFT JOIN accounts ON accounts.id = approvals.resolved_by
             WHERE judgments.bot_id = ? AND (? IS NULL OR judgments.id < ?)
             ORDER BY judgments.id DESC LIMIT ?`
        )
        .all(botId, beforeSeq, beforeSeq, limit)
    const { total } = db.query('SELECT COUNT(*) AS total FROM judgments WHERE bot_id = ?').get(botId)
    return { items: rows.map(presentEntry), total }
}

const isoOrEmpty = seconds => (seconds ? new Date(seconds * 1000).toISOString() : '')

const CSV_COLUMNS = [
    ['data_hora', entry => isoOrEmpty(entry.createdAt)],
    ['tarefa', entry => entry.taskTitle ?? ''],
    ['acao', entry => entry.action],
    ['ferramenta', entry => entry.toolName],
    ['decisao', entry => entry.ruleLabel],
    ['risco', entry => (entry.risk === 'high' ? 'alto' : entry.risk === 'low' ? 'baixo' : '')],
    ['motivo', entry => entry.reason ?? ''],
    ['resultado', entry => entry.outcomeLabel],
    ['decidido_por', entry => entry.resolvedBy ?? ''],
    ['decidido_em', entry => isoOrEmpty(entry.resolvedAt)],
    ['sem_resposta_desde', entry => isoOrEmpty(entry.timedOutAt)],
    ['observacao', entry => entry.note ?? ''],
    ['ponto_de_restauracao', entry => entry.checkpointId ?? ''],
]

// A cell that starts like a formula is opened by a spreadsheet as one.
const csvCell = value => {
    const text = String(value ?? '')
    const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text
    return /[",\n\r;]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe
}

/** The whole trail of the bot, oldest first. */
export function auditJson(botId) {
    const entries = []
    let beforeSeq = null
    for (;;) {
        const { items } = listAudit(botId, { limit: 1000, beforeSeq })
        if (!items.length) break
        entries.push(...items)
        beforeSeq = items.at(-1).seq
    }
    return entries.reverse()
}

/** The same trail as CSV (UTF-8 with BOM, so Excel reads the accents). */
export function auditCsv(botId) {
    const lines = [CSV_COLUMNS.map(([name]) => name).join(','), ...auditJson(botId).map(entry => CSV_COLUMNS.map(([, read]) => csvCell(read(entry))).join(','))]
    return `\uFEFF${lines.join('\r\n')}\r\n`
}

// --- Reading: the bot's approval rate --------------------------------------

const WEEK_SECONDS = 7 * 86400
const APPROVED_OUTCOMES = ['approved', 'approved_task', 'approved_always']

/**
 * Of the approvals the person decided, how many were a yes, in 7-day windows
 * back from now: weeks[0] is the last 7 days. Cancelled and superseded ones
 * were never decided, so they count for neither side.
 */
export function approvalRate(botId, { weeks = 8 } = {}) {
    const end = now()
    const rows = db
        .query(
            `SELECT approvals.outcome, approvals.resolved_at FROM approvals JOIN tasks ON tasks.id = approvals.task_id
             WHERE tasks.bot_id = ? AND approvals.resolved_at > ? AND approvals.outcome IN ('approved', 'approved_task', 'approved_always', 'rejected')`
        )
        .all(botId, end - weeks * WEEK_SECONDS)
    const windows = Array.from({ length: weeks }, () => ({ approved: 0, decided: 0 }))
    for (const row of rows) {
        const window = windows[Math.floor((end - row.resolved_at) / WEEK_SECONDS)]
        if (!window) continue
        window.decided += 1
        if (APPROVED_OUTCOMES.includes(row.outcome)) window.approved += 1
    }
    return { weeks: windows }
}

// --- Reading: the owner's counts -----------------------------------------

const countBy = rows => Object.fromEntries(rows.map(row => [row.kind, row.count]))

/** Counts since `days` ago: outcomes and failures, in total and per account. */
export function outcomeMetrics({ days = 30 } = {}) {
    const since = now() - days * 86400
    const outcomes = countBy(db.query('SELECT kind, COUNT(*) AS count FROM outcome_events WHERE created_at >= ? GROUP BY kind').all(since))
    const failures = countBy(db.query('SELECT kind, COUNT(*) AS count FROM failures WHERE created_at >= ? GROUP BY kind').all(since))
    const { pending } = db.query("SELECT COUNT(*) AS pending FROM approvals WHERE status = 'pending'").get()
    const perAccount = new Map()
    const slot = accountId => {
        if (!perAccount.has(accountId)) perAccount.set(accountId, { accountId, outcomes: {}, failures: {} })
        return perAccount.get(accountId)
    }
    for (const row of db.query('SELECT account_id, kind, COUNT(*) AS count FROM outcome_events WHERE created_at >= ? GROUP BY account_id, kind').all(since)) slot(row.account_id).outcomes[row.kind] = row.count
    for (const row of db.query('SELECT account_id, kind, COUNT(*) AS count FROM failures WHERE created_at >= ? GROUP BY account_id, kind').all(since)) slot(row.account_id).failures[row.kind] = row.count
    const emails = new Map(
        db
            .query('SELECT id, email FROM accounts')
            .all()
            .map(row => [row.id, row.email])
    )
    const accounts = [...perAccount.values()].map(entry => ({ ...entry, email: emails.get(entry.accountId) ?? null }))
    const perBot = db
        .query(
            `SELECT outcome_events.bot_id, bots.name, outcome_events.kind, COUNT(*) AS count FROM outcome_events
             LEFT JOIN bots ON bots.id = outcome_events.bot_id WHERE outcome_events.created_at >= ? GROUP BY outcome_events.bot_id, outcome_events.kind`
        )
        .all(since)
    const bots = new Map()
    for (const row of perBot) {
        if (!bots.has(row.bot_id)) bots.set(row.bot_id, { botId: row.bot_id, name: row.name ?? null, outcomes: {} })
        bots.get(row.bot_id).outcomes[row.kind] = row.count
    }
    return { days, since, outcomes, failures, pendingApprovals: pending, accounts, bots: [...bots.values()] }
}
