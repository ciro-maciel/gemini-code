import { db, newId, now, toApi } from '../db.js'

const PROMPT_LIMIT = 60
const OBSERVATION_DAYS = 30

// Three kinds, as the panel shows them: a decision a person made (a refusal
// with a reason is one), a preference a person has, and an observation the
// bot made while working. Decisions and preferences are followed always;
// observations help and expire after thirty days.
export const MEMORY_KINDS = ['decision', 'preference', 'observation']
export const memoryKind = kind => (MEMORY_KINDS.includes(kind) ? kind : 'observation')
const isAlive = (row, at = now()) => row.kind !== 'observation' || row.created_at > at - OBSERVATION_DAYS * 86400

export function saveMemory({ botId, kind = 'observation', content, sourceTaskId = null }) {
    const id = newId()
    db.query('INSERT INTO memories (id, bot_id, kind, content, source_task_id, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, botId, memoryKind(kind), content.slice(0, 2000), sourceTaskId, now())
    return id
}

/** The bot's memories still in force, newest first; each observation says how many days it has left. */
export function listMemories(botId, at = now()) {
    return db
        .query('SELECT * FROM memories WHERE bot_id = ? ORDER BY created_at DESC')
        .all(botId)
        .filter(row => isAlive(row, at))
        .map(row => ({ ...toApi(row), ...(row.kind === 'observation' ? { daysLeft: Math.ceil((row.created_at + OBSERVATION_DAYS * 86400 - at) / 86400) } : {}) }))
}

/** A person fixing what the bot remembers: the text changes, the kind and origin stay. */
export function updateMemory(botId, memoryId, content) {
    return db.query('UPDATE memories SET content = ? WHERE id = ? AND bot_id = ?').run(content.slice(0, 2000), memoryId, botId).changes > 0
}

export function deleteMemory(botId, memoryId) {
    db.query('DELETE FROM memories WHERE id = ? AND bot_id = ?').run(memoryId, botId)
}

/** The memories that go into the bot's prompt, as the panel names them ("usou N memórias"). */
export const memoriesInPrompt = botId => listMemories(botId).slice(0, PROMPT_LIMIT).map(memory => memory.content)

/** Every memory of the account's bots with the words, for the ⌘K search. */
export function searchMemories(accountId, query, limit = 8) {
    const words = String(query || '').trim().toLowerCase()
    if (!words) return []
    return db
        .query('SELECT m.*, b.name AS bot_name FROM memories m JOIN bots b ON b.id = m.bot_id WHERE b.account_id = ? AND lower(m.content) LIKE ? ORDER BY m.created_at DESC LIMIT 40')
        .all(accountId, `%${words.replace(/[%_]/g, '')}%`)
        .filter(row => isAlive(row, now()))
        .slice(0, limit)
        .map(row => ({ id: row.id, botId: row.bot_id, botName: row.bot_name, kind: row.kind, content: row.content }))
}

export function formatMemoriesForPrompt(botId) {
    const memories = listMemories(botId).slice(0, PROMPT_LIMIT)
    if (memories.length === 0) return ''
    const followed = memories.filter(memory => memory.kind !== 'observation')
    const observed = memories.filter(memory => memory.kind === 'observation')
    const lines = []
    if (followed.length) lines.push('### Decisões e preferências do usuário (siga sempre)', ...followed.map(memory => `- ${memory.content}`))
    if (observed.length) lines.push('### O que você observou', ...observed.map(memory => `- ${memory.content}`))
    return lines.join('\n')
}
