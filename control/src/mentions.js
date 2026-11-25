import { db } from './db.js'
import { emitTaskEvent } from './events.js'
import { colleaguesOf, takeHandoffSlot } from './handoff.js'

// Calling another agent by name (29/10/2026): "@Métricas, quanto deu o ep39?"
// in one agent's conversation goes to Métricas through the handoff that
// already exists, and what Métricas answers comes back into the conversation
// it was called from. The agent you are in does not answer that message.

const threadOf = botId => db.query('SELECT id FROM tasks WHERE bot_id = ? ORDER BY created_at DESC LIMIT 1').get(botId)?.id ?? null

/** The colleague named with @ in the text; the longest name wins ("@Diretor de operações" over "@Diretor"). */
export function findMention(bot, text) {
    const lower = String(text || '').toLowerCase()
    return (
        colleaguesOf(bot)
            .filter(colleague => lower.includes(`@${colleague.name.toLowerCase()}`))
            .sort((a, b) => b.name.length - a.name.length)[0] ?? null
    )
}

/**
 * Shows the message where it was written and delivers it to the colleague;
 * null when it cannot go that way (no conversation yet, or too many this hour)
 * and the message should go to the bot as usual.
 */
export function callColleague(bot, colleague, text, author, { deliver }) {
    const taskId = threadOf(bot.id)
    if (!taskId || !takeHandoffSlot(bot.id, colleague.id)) return null
    emitTaskEvent(taskId, 'user_message', { text, ...(author ? { author } : {}), mention: { botId: colleague.id, name: colleague.name } })
    const who = author || 'Uma pessoa'
    deliver(colleague.id, text, {
        handoff: { from: `${who} em ${bot.name}`, fromBotId: bot.id },
        replyTo: bot.id,
        modelText: `[${who} chamou você com @${colleague.name} na conversa de ${bot.name}, outro bot desta conta. Responda a essa pessoa: a sua resposta aparece lá. Suas aprovações continuam valendo.]\n\n${text}`,
    })
    return taskId
}

/** When the called colleague stops (done, or asking back), its last answer goes to where it was called. */
export function relayReply(taskId) {
    const asked = db.query("SELECT id, data FROM task_events WHERE task_id = ? AND type = 'user_message' AND json_extract(data, '$.replyTo') IS NOT NULL ORDER BY id DESC LIMIT 1").get(taskId)
    if (!asked) return false
    if (db.query("SELECT 1 FROM task_events WHERE task_id = ? AND type = 'relayed' AND id > ?").get(taskId, asked.id)) return false
    const answer = db.query("SELECT data FROM task_events WHERE task_id = ? AND type = 'assistant' AND id > ? AND json_extract(data, '$.isFinal') = 1 ORDER BY id DESC LIMIT 1").get(taskId, asked.id)
    const toBotId = JSON.parse(asked.data).replyTo
    const target = threadOf(toBotId)
    if (!answer || !target) return false
    const from = db.query('SELECT b.id, b.name FROM bots b JOIN tasks t ON t.bot_id = b.id WHERE t.id = ?').get(taskId)
    emitTaskEvent(target, 'colleague', { botId: from.id, name: from.name, text: JSON.parse(answer.data).text })
    emitTaskEvent(taskId, 'relayed', { toBotId })
    return true
}
