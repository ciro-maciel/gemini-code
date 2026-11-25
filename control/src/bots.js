import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import path from 'node:path'
import { $ } from 'bun'
import { config } from './config.js'
import { db, newId, now, toApi } from './db.js'
import { listMembers } from './members.js'
import { chooseMascot, isMascot } from './mascots.js'
import { closeBrowserSession } from './engine/browser.js'
import { removeBotAttachments } from './attachments.js'
import { countPendingChoices } from './artifacts.js'
import { today } from './accounts.js'
import { agentFolders, slugOf } from './repo-files.js'
import { hasAiAccount, isModelOf } from './ai-accounts.js'
import { createSprite, deleteSprite, fetchSprite, fetchSpriteHttp, listCheckpoints, restoreCheckpoint, runCommand, writeFile } from './sprites.js'
import { ensureLocalWorkspace, isLocalMode } from './local-runtime.js'

// A bot is a conversation first and a computer second. It is born without one
// ('idle') and gets a computer the first time it needs a screen or a shell —
// from the spares when there is one (instant), prepared from scratch when not
// (minutes). A bot that only talks never costs a machine.
//
//   idle          no computer yet
//   provisioning  a computer is being prepared or upgraded
//   ready         its computer answers
//   failed        the last preparation failed; the next use tries again

const listeners = new Set()

export function onBotChange(listener) {
    listeners.add(listener)
    return () => listeners.delete(listener)
}

function notify(botId) {
    const bot = fetchBot(botId)
    for (const listener of listeners) listener(bot)
}

// connection_ids is a JSON list of the account's connections the agent uses, or null for all of them.
const BOT_JSON = ['connection_ids']

// bots.section is the name a bot's section had before sections had ids; the
// bot points at its section by section_id now, and the old column is never read.
function present(row) {
    const bot = toApi(row, BOT_JSON)
    if (bot) delete bot.section
    return bot
}

export function agentDirOf(bot) {
    if (!bot?.id) return null
    const siblings = db
        .query('SELECT id, name, created_at FROM bots WHERE account_id IS ? ORDER BY created_at')
        .all(bot.accountId ?? null)
        .map(row => ({ id: row.id, name: row.name, createdAt: row.created_at }))
    const slug = agentFolders(siblings).get(bot.id)
    return slug ? `agents/${slug}` : null
}

export function fetchBot(botId) {
    const bot = present(db.query('SELECT * FROM bots WHERE id = ?').get(botId))
    if (!bot) return null
    const dir = agentDirOf(bot)
    if (dir) {
        bot.agentDir = dir
        bot.instructionsPath = `${dir}/INSTRUCTIONS.md`
    }
    return bot
}

// The last line of a conversation, as plain text: the column and the palette
// show it in one line, where Markdown marks would read as noise.
function toPreview(text) {
    return String(text || '')
        .replace(/```[\s\S]*?```/g, ' ')
        .replace(/[*_`#>]+/g, '')
        .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
        .replace(/\s+/g, ' ')
        .trim()
        .slice(0, 140)
}

/** "Marcar como não lida": the mark goes back to just before the latest news, which counts again. */
export function markBotUnread(botId) {
    const latest = db
        .query(
            `SELECT MAX(e.id) AS id FROM task_events e JOIN tasks t ON t.id = e.task_id
             WHERE t.bot_id = ? AND (e.type IN ('assistant', 'files', 'approval_requested', 'colleague')
               OR (e.type = 'tool_call' AND json_extract(e.data, '$.name') = 'ask_user'))`
        )
        .get(botId)?.id
    if (latest) db.query('UPDATE bots SET read_event_id = ? WHERE id = ?').run(latest - 1, botId)
}

/** The owner opened the conversation: everything in it up to now is read. */
export function markBotRead(botId) {
    db.query('UPDATE bots SET read_event_id = (SELECT MAX(e.id) FROM task_events e JOIN tasks t ON t.id = e.task_id WHERE t.bot_id = ?) WHERE id = ?').run(botId, botId)
}

/**
 * The account's bots, and after them the ones shared with it (by its e-mail),
 * each saying how far the account may go in it and who owns it.
 */
export function listBots(accountId, email = null) {
    return db
        .query(
            `SELECT bots.*,
                (SELECT COUNT(*) FROM tasks WHERE tasks.bot_id = bots.id AND tasks.status IN ('running', 'queued')) AS running_count,
                (SELECT COUNT(*) FROM tasks WHERE tasks.bot_id = bots.id AND tasks.status IN ('waiting_approval', 'waiting_user')) AS waiting_count,
                (SELECT MAX(updated_at) FROM tasks WHERE tasks.bot_id = bots.id) AS last_activity_at,
                (SELECT e.data FROM task_events e JOIN tasks t ON t.id = e.task_id
                  WHERE t.bot_id = bots.id AND e.type IN ('assistant', 'user_message') ORDER BY e.id DESC LIMIT 1) AS last_message,
                EXISTS (SELECT 1 FROM task_events e JOIN tasks t ON t.id = e.task_id
                  WHERE t.bot_id = bots.id AND e.id > COALESCE(bots.read_event_id, 0)
                    AND (e.type IN ('assistant', 'files', 'approval_requested', 'colleague')
                      OR (e.type = 'tool_call' AND json_extract(e.data, '$.name') = 'ask_user'))) AS has_news,
                (SELECT CASE WHEN status = 'waiting_approval' THEN 'approval'
                             WHEN status = 'waiting_user' AND waiting_reason IN ('question', 'connection') THEN waiting_reason END
                   FROM tasks WHERE tasks.bot_id = bots.id ORDER BY created_at DESC LIMIT 1) AS needs_you
                , (SELECT access FROM bot_members WHERE bot_id = bots.id AND email = ?) AS shared_access
                , (SELECT COALESCE(name, email) FROM accounts WHERE accounts.id = bots.account_id) AS owner_name
             FROM bots WHERE account_id = ? OR id IN (SELECT bot_id FROM bot_members WHERE email = ?)
             ORDER BY account_id = ? DESC, created_at`
        )
        .all(email, accountId, email, accountId)
        .map((row, _, rows) => {
            const bot = present(row)
            // Where its instructions live in the repository: agents/<its folder>/INSTRUCTIONS.md.
            const siblings = rows.filter(other => other.account_id === row.account_id).map(other => ({ id: other.id, name: other.name, createdAt: other.created_at }))
            const agentDir = `agents/${agentFolders(siblings).get(row.id)}`
            bot.agentDir = agentDir
            bot.instructionsPath = `${agentDir}/INSTRUCTIONS.md`
            const isMine = row.account_id === accountId
            bot.access = isMine ? 'owner' : row.shared_access
            bot.sharedBy = isMine ? null : row.owner_name
            bot.members = listMembers(row.id)
            delete bot.sharedAccess
            delete bot.ownerName
            bot.lastMessage = row.last_message ? toPreview(JSON.parse(row.last_message).text) : null
            bot.hasNews = Boolean(row.has_news)
            // Choices offered in its latest deliveries that no one made yet: they wait for a person too.
            bot.pendingChoices = countPendingChoices(row.id)
            bot.spendToday = db.query('SELECT cost FROM bot_usage WHERE bot_id = ? AND day = ?').get(row.id, today())?.cost ?? 0
            delete bot.readEventId
            return bot
        })
}

function updateBot(botId, fields) {
    const columns = Object.keys(fields)
    db.query(`UPDATE bots SET ${columns.map(column => `${column} = ?`).join(', ')}, updated_at = ? WHERE id = ?`).run(...columns.map(column => fields[column]), now(), botId)
    notify(botId)
}

export const EFFORTS = ['low', 'medium', 'high']

/** The connections an agent uses: the ones it picked, or every one of its account. */
export const usesConnection = (bot, connectionId) => !Array.isArray(bot.connectionIds) || bot.connectionIds.includes(connectionId)

/** A working folder inside the workspace: no leading or trailing slash, no way up. */
export function cleanFolder(folder) {
    if (folder === null || folder === undefined || folder === '') return null
    const parts = String(folder).split('/').map(part => part.trim()).filter(Boolean)
    if (parts.some(part => part === '..' || part === '.')) throw new Error('a pasta não pode sair do workspace')
    return parts.join('/').slice(0, 200) || null
}

export function updateBotSettings(botId, { name, model, instructions, mascot, sectionId, effort, folder, aiAccount, templateId, connectionIds }) {
    const fields = {}
    const accountId = fetchBot(botId)?.accountId
    if (effort !== undefined) {
        if (effort !== null && !EFFORTS.includes(effort)) throw new Error(`esforço fora da lista: ${effort}`)
        fields.effort = effort
    }
    if (folder !== undefined) fields.folder = cleanFolder(folder)
    if (aiAccount !== undefined) {
        if (aiAccount !== null && !hasAiAccount(accountId, aiAccount)) throw new Error('conta de IA desconhecida')
        fields.ai_account = aiAccount
    }
    if (templateId !== undefined) fields.template_id = typeof templateId === 'string' && templateId ? templateId.slice(0, 64) : null
    if (connectionIds !== undefined) {
        if (connectionIds !== null && !Array.isArray(connectionIds)) throw new Error('connectionIds é uma lista')
        const known = new Set(db.query('SELECT id FROM connections WHERE account_id = ?').all(accountId).map(row => row.id))
        fields.connection_ids = connectionIds === null ? null : JSON.stringify([...new Set(connectionIds)].filter(id => known.has(id)))
    }
    if (sectionId !== undefined) {
        // A section of the bot's own account, by its id; null is "Sem seção".
        if (sectionId !== null && !fetchSection(fetchBot(botId)?.accountId, sectionId)) throw new Error('seção desconhecida')
        fields.section_id = sectionId
        // Moved by the menu: it lands at the end of its new section.
        fields.position = null
    }
    if (typeof name === 'string' && name.trim()) fields.name = name.trim().slice(0, 60)
    // The model runs on the account picked with it, or on the one the agent already has.
    // The same model again (an agent file saved with its model line) is no change.
    if (typeof model === 'string' && !(aiAccount === undefined && model === fetchBot(botId)?.model)) {
        const on = aiAccount !== undefined ? aiAccount : (fetchBot(botId)?.aiAccount ?? null)
        if (!isModelOf(accountId, on, model)) throw new Error(`modelo fora da lista: ${model}`)
        fields.model = model
    }
    if (typeof instructions === 'string') fields.instructions = instructions.slice(0, 8000)
    if (typeof mascot === 'string') {
        if (!isMascot(mascot)) throw new Error('ilustração desconhecida')
        fields.mascot = mascot
    }
    if (Object.keys(fields).length) updateBot(botId, fields)
    return fetchBot(botId)
}

function newSpriteName() {
    return `${config.botPrefix}${crypto.randomUUID().slice(0, 8)}`
}

// --- The computer's code ---------------------------------------------------

const COMPUTER_FILES = ['server.js', 'browser.js', 'package.json', 'bun.lock']

// A hash of the computer's code. A Sprite installed with another one is
// upgraded before its next use, so a deploy reaches every bot on its own.
export const COMPUTER_VERSION = createHash('sha256')
    .update(COMPUTER_FILES.map(file => readFileSync(path.join(config.computerDir, file))).join('\0'))
    .update(readFileSync(path.join(config.computerDir, 'provision.sh')))
    .digest('hex')
    .slice(0, 12)

const UPLOAD_DIR = '/home/sprite/.assistant'

let bundle = null
async function computerBundle() {
    if (!bundle) bundle = await $`tar czf - -C ${config.computerDir} ${COMPUTER_FILES}`.arrayBuffer()
    return Buffer.from(bundle)
}

/**
 * Makes a Sprite into a computer: creates it if missing and installs the
 * virtual screen, Chrome, VNC, the bridge and the browser tools. Idempotent,
 * so it also upgrades. Takes minutes the first time (Chrome and the fonts are
 * ~300 MB), which is why spares exist.
 */
async function prepareComputer(spriteName, onProgress) {
    let sprite
    try {
        sprite = await fetchSprite(spriteName)
    } catch (error) {
        if (error.status !== 404) throw error
        sprite = await createSprite(spriteName)
    }
    onProgress?.({ spriteUrl: sprite.url })
    // The sprite user's own folder: on the first computers /tmp/provision.sh
    // belongs to another user and could not be written over.
    await writeFile(spriteName, `${UPLOAD_DIR}/computer.tgz`, await computerBundle())
    await writeFile(spriteName, `${UPLOAD_DIR}/provision.sh`, readFileSync(path.join(config.computerDir, 'provision.sh')))
    const { exitCode, output } = await runCommand(spriteName, `bash ${UPLOAD_DIR}/provision.sh`, { timeoutSeconds: 900, cwd: '/home/sprite' })
    if (exitCode !== 0) throw new Error(`a preparação falhou (${exitCode}): ${output.slice(-800)}`)
    return sprite.url
}

// --- Spares: computers prepared ahead, so a bot gets one at once ----------

let isFillingSpares = false
const recentClaims = []
const CLAIM_WINDOW_SECONDS = 600

// At least the minimum; one more for each computer handed out in the last ten
// minutes, so a burst of new people finds machines waiting.
function spareTarget() {
    // Zero is off (development on the Mac): demand never creates spares there.
    if (config.spareComputers === 0) return 0
    while (recentClaims.length && recentClaims[0] < now() - CLAIM_WINDOW_SECONDS) recentClaims.shift()
    return Math.min(config.spareComputersMax, config.spareComputers + recentClaims.length)
}

export async function fillSpares() {
    // Off means off: on the Mac a spare row left half-prepared once came back
    // to life as a Sprite nobody asked for.
    if (isFillingSpares || config.spareComputers === 0) return
    isFillingSpares = true
    try {
        // A spare caught mid-preparation by a restart, or installed with older
        // code, is prepared again (idempotent).
        const stale = db.query("SELECT sprite_name FROM spare_computers WHERE status = 'provisioning' OR computer_version IS NOT ? OR computer_version IS NULL").all(COMPUTER_VERSION)
        await Promise.all(stale.map(({ sprite_name }) => prepareSpare(sprite_name)))
        // Several at once: preparing is waiting on apt and downloads, not CPU here.
        for (;;) {
            const ready = db.query("SELECT COUNT(*) AS count FROM spare_computers WHERE status IN ('ready', 'provisioning')").get().count
            const missing = spareTarget() - ready
            if (missing <= 0) break
            const names = Array.from({ length: Math.min(missing, 3) }, newSpriteName)
            for (const spriteName of names) db.query('INSERT INTO spare_computers (sprite_name, status, created_at) VALUES (?, ?, ?)').run(spriteName, 'provisioning', now())
            const results = await Promise.all(names.map(prepareSpare))
            if (results.some(isReady => !isReady)) break
        }
    } finally {
        isFillingSpares = false
    }
}

async function prepareSpare(spriteName) {
    db.query("UPDATE spare_computers SET status = 'provisioning' WHERE sprite_name = ?").run(spriteName)
    try {
        const spriteUrl = await prepareComputer(spriteName, ({ spriteUrl }) => {
            db.query('UPDATE spare_computers SET sprite_url = ? WHERE sprite_name = ?').run(spriteUrl, spriteName)
        })
        db.query("UPDATE spare_computers SET status = 'ready', sprite_url = ?, computer_version = ? WHERE sprite_name = ?").run(spriteUrl, COMPUTER_VERSION, spriteName)
        return true
    } catch (error) {
        if (error.code === 'SPRITE_LIMIT') console.warn(`spare ${spriteName}: ${error.message}`)
        else console.error(`spare ${spriteName}`, error)
        // A spare that failed is destroyed, never left behind as an orphan Sprite.
        db.query('DELETE FROM spare_computers WHERE sprite_name = ?').run(spriteName)
        await deleteSprite(spriteName).catch(() => {})
        return false
    }
}

function claimSpare() {
    const spare = db.transaction(() => {
        const found = db.query("SELECT * FROM spare_computers WHERE status = 'ready' AND computer_version = ? ORDER BY created_at LIMIT 1").get(COMPUTER_VERSION)
        if (found) db.query('DELETE FROM spare_computers WHERE sprite_name = ?').run(found.sprite_name)
        return found
    })()
    recentClaims.push(now())
    fillSpares()
    return spare
}

// --- Sections: the column's own order, per account ------------------------

const sectionName = name => (typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : null)

// A section is addressed by its id (house rule, 25/10/2026); its name is the
// label, still one per account. An id of another account is the same as none.
const findSection = (accountId, sectionId) => (typeof sectionId === 'string' ? db.query('SELECT id, name, position FROM sections WHERE account_id = ? AND id = ?').get(accountId, sectionId) : null)

/** The section by its id, or null: another account's id finds nothing. */
export function fetchSection(accountId, sectionId) {
    const row = findSection(accountId, sectionId)
    return row ? { id: row.id, name: row.name } : null
}

/** The account's sections, empty ones included: in the order they were dragged to, then the rest by name. */
export function listSections(accountId) {
    return db
        .query('SELECT id, name, position FROM sections WHERE account_id = ?')
        .all(accountId)
        .sort((first, second) => (first.position ?? Infinity) - (second.position ?? Infinity) || first.name.localeCompare(second.name, 'pt-BR'))
        .map(row => ({ id: row.id, name: row.name }))
}

/** Puts the sections in this order; an id the account does not have is skipped. */
export function reorderSections(accountId, sectionIds) {
    db.transaction(() => {
        sectionIds.forEach((sectionId, index) => {
            db.query('UPDATE sections SET position = ? WHERE account_id = ? AND id = ?').run(index, accountId, sectionId)
        })
    })()
}

/** Creates a section; a name the account already has gives back that section. */
export function createSection(accountId, name) {
    const target = sectionName(name)
    if (!target) throw new Error('dê um nome à seção')
    db.query('INSERT OR IGNORE INTO sections (id, account_id, name, created_at) VALUES (?, ?, ?, ?)').run(newId(), accountId, target, now())
    const row = db.query('SELECT id, name FROM sections WHERE account_id = ? AND name = ?').get(accountId, target)
    return { id: row.id, name: row.name }
}

/**
 * Puts these bots, in this order, into one section (null is "Sem seção").
 * Bots of that section left out keep their place after them. Returns false,
 * changing nothing, when the section is not one of the account's.
 */
export function reorderSection(accountId, sectionId, botIds) {
    if (sectionId !== null && !findSection(accountId, sectionId)) return false
    db.transaction(() => {
        botIds.forEach((botId, index) => {
            db.query('UPDATE bots SET section_id = ?, position = ?, updated_at = ? WHERE id = ? AND account_id = ?').run(sectionId, index, now(), botId, accountId)
        })
    })()
    return true
}

/**
 * Renames a section, or null when the account has no such id. Renaming onto
 * the name of another section joins the two: its bots move there, and the
 * one that stays takes this one's place in the column.
 */
export function renameSection(accountId, sectionId, to) {
    const name = sectionName(to)
    if (!name) throw new Error('dê um nome à seção')
    const section = findSection(accountId, sectionId)
    if (!section) return null
    const other = db.query('SELECT id FROM sections WHERE account_id = ? AND name = ? AND id != ?').get(accountId, name, sectionId)
    if (!other) {
        db.query('UPDATE sections SET name = ? WHERE id = ?').run(name, sectionId)
        return fetchSection(accountId, sectionId)
    }
    db.transaction(() => {
        db.query('DELETE FROM sections WHERE id = ?').run(sectionId)
        if (section.position !== null) db.query('UPDATE sections SET position = ? WHERE id = ?').run(section.position, other.id)
        db.query('UPDATE bots SET section_id = ? WHERE section_id = ? AND account_id = ?').run(other.id, sectionId, accountId)
    })()
    return fetchSection(accountId, other.id)
}

/** Deleting a section only ungroups: its bots go back to "Sem seção". False when the account has no such id. */
export function deleteSection(accountId, sectionId) {
    if (!findSection(accountId, sectionId)) return false
    db.transaction(() => {
        db.query('DELETE FROM sections WHERE id = ?').run(sectionId)
        db.query('UPDATE bots SET section_id = NULL, position = NULL WHERE section_id = ? AND account_id = ?').run(sectionId, accountId)
    })()
    return true
}

// --- Bots -----------------------------------------------------------------

export function countBots(accountId) {
    return db.query('SELECT COUNT(*) AS count FROM bots WHERE account_id = ?').get(accountId).count
}

/** Instant: the computer comes later, the first time the bot needs one. */
export function createBot({ accountId, name, model, instructions = '', folder = undefined }) {
    const id = newId()
    const cleanName = (name || '').trim().slice(0, 60) || 'Assistente'
    const timestamp = now()
    const explicitFolder = folder !== undefined ? cleanFolder(folder) : undefined
    db.query('INSERT INTO bots (id, account_id, name, sprite_name, status, model, instructions, folder, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)').run(
        id,
        accountId,
        cleanName,
        newSpriteName(),
        'idle',
        config.models.some(option => option.id === model) ? model : config.defaultModel,
        String(instructions).slice(0, 8000),
        explicitFolder ?? null,
        timestamp,
        timestamp
    )
    if (folder === undefined) {
        const base = slugOf(cleanName)
        const usedFolders = new Set(
            db
                .query('SELECT folder FROM bots WHERE account_id IS ? AND folder IS NOT NULL')
                .all(accountId ?? null)
                .map(row => row.folder)
        )
        let candidate = `agents/${base}/docs`
        for (let suffix = 2; usedFolders.has(candidate); suffix++) candidate = `agents/${base}-${suffix}/docs`
        db.query('UPDATE bots SET folder = ? WHERE id = ?').run(candidate, id)
    }
    assignMascot(id)
    return fetchBot(id)
}

/** Picks the illustration that fits the bot; the panel shows it when it lands. */
export async function assignMascot(botId) {
    const bot = fetchBot(botId)
    if (!bot || bot.mascot) return
    const usedIds = db
        .query('SELECT mascot FROM bots WHERE mascot IS NOT NULL AND id != ? AND account_id IS ?')
        .all(botId, bot.accountId)
        .map(row => row.mascot)
    const mascot = await chooseMascot({ name: bot.name, instructions: bot.instructions, usedIds })
    if (mascot) updateBot(botId, { mascot })
}

const inFlight = new Map()

/**
 * The bot with a computer that answers and runs the current code. Called on
 * the first screen or shell tool of a task; `onProgress(text)` tells the
 * conversation why it waits. Concurrent callers share one preparation.
 */
export function ensureComputer(botId, onProgress = () => {}) {
    if (inFlight.has(botId)) return inFlight.get(botId)
    const bot = fetchBot(botId)
    if (isLocalMode()) {
        ensureLocalWorkspace()
        if (bot.status !== 'ready' || bot.computerVersion !== COMPUTER_VERSION) {
            updateBot(bot.id, { status: 'ready', status_detail: null, computer_version: COMPUTER_VERSION })
            for (const listener of readyListeners) listener(bot.id)
        }
        return Promise.resolve(fetchBot(bot.id))
    }
    if (bot.status === 'ready' && bot.computerVersion === COMPUTER_VERSION) return Promise.resolve(bot)
    const work = prepareBotComputer(bot, onProgress).finally(() => inFlight.delete(botId))
    inFlight.set(botId, work)
    return work
}

async function prepareBotComputer(bot, onProgress) {
    // A bot that ever had a computer keeps it: its Chrome logins and files
    // live there. Only a bot that never had one takes a spare. (A failed
    // upgrade once handed bot 002 a spare and left its own computer behind.)
    const hasComputer = Boolean(bot.spriteUrl)
    if (!hasComputer) {
        const spare = claimSpare()
        if (spare) {
            updateBot(bot.id, { sprite_name: spare.sprite_name, sprite_url: spare.sprite_url, status: 'ready', status_detail: null, computer_version: spare.computer_version })
            for (const listener of readyListeners) listener(bot.id)
            return fetchBot(bot.id)
        }
    }
    const detail = hasComputer ? 'Atualizando o computador' : 'Ligando o computador pela primeira vez'
    onProgress(hasComputer ? 'Atualizando o computador antes de usar (leva alguns segundos).' : 'Ligando o computador pela primeira vez (leva alguns minutos).')
    try {
        updateBot(bot.id, { status: 'provisioning', status_detail: detail })
        const spriteUrl = await prepareComputer(bot.spriteName, ({ spriteUrl }) => updateBot(bot.id, { sprite_url: spriteUrl }))
        updateBot(bot.id, { status: 'ready', status_detail: null, sprite_url: spriteUrl, computer_version: COMPUTER_VERSION })
        for (const listener of readyListeners) listener(bot.id)
        return fetchBot(bot.id)
    } catch (error) {
        // At the plan's limit nothing failed: the bot goes back to how it was
        // and the task waits for a slot (engine/run.js).
        if (error.code === 'SPRITE_LIMIT') {
            updateBot(bot.id, { status: hasComputer ? 'ready' : 'idle', status_detail: null })
            throw error
        }
        console.error(`computer ${bot.id}`, error)
        updateBot(bot.id, { status: 'failed', status_detail: error.message.slice(0, 1000) })
        throw new Error('o computador deste bot não ficou pronto; tente de novo em instantes')
    }
}

/** "Preparar de novo" and "Ligar agora" in the panel. */
export function provision(botId) {
    ensureComputer(botId).catch(() => {})
}

const readyListeners = new Set()

/** Called when a bot's computer becomes ready: messages written meanwhile run. */
export function onBotReady(listener) {
    readyListeners.add(listener)
}

export async function deleteBot(botId) {
    const bot = fetchBot(botId)
    if (!bot) return
    // An idle bot's Sprite never existed; deleteSprite takes the 404.
    await deleteSprite(bot.spriteName)
    db.transaction(() => {
        // Connections are the account's pool: the row only remembers the bot
        // that made it, and that memory goes; the connection stays.
        db.query('UPDATE connections SET bot_id = NULL WHERE bot_id = ?').run(botId)
        db.query('DELETE FROM bots WHERE id = ?').run(botId)
    })()
    removeBotAttachments(botId)
}

export async function fetchComputerHealth(botId) {
    const bot = fetchBot(botId)
    if (!bot?.spriteUrl || bot.status !== 'ready') return { isChromeReady: false }
    try {
        const response = await fetchSpriteHttp(bot.spriteUrl, '/health')
        return response.ok ? response.json() : { isChromeReady: false }
    } catch {
        return { isChromeReady: false }
    }
}

export async function listBotCheckpoints(botId) {
    const bot = fetchBot(botId)
    if (bot.status !== 'ready') return []
    return listCheckpoints(bot.spriteName)
}

/** Puts the bot's disk back as it was; Chrome and the screen restart. */
export async function restoreBotCheckpoint(botId, checkpointId) {
    const bot = fetchBot(botId)
    await closeBrowserSession(bot)
    await restoreCheckpoint(bot.spriteName, checkpointId)
}

export function recoverBots() {
    for (const { id } of db.query("SELECT id FROM bots WHERE status = 'provisioning'").all()) provision(id)
    fillSpares()
    ;(async () => {
        for (const { id } of db.query('SELECT id FROM bots WHERE mascot IS NULL ORDER BY created_at').all()) await assignMascot(id)
    })()
}
