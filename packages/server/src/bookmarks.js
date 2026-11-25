import { db, now, toApi } from './db.js'

// An agent's reply a person marked to find again. Each person keeps their own
// marks; the words are kept with the mark, so a rewind that cuts the reply
// does not take what was marked with it.

export function listBookmarks(accountId, botId) {
    return db
        .query('SELECT event_id, text, created_at FROM bookmarks WHERE account_id = ? AND bot_id = ? ORDER BY created_at DESC')
        .all(accountId, botId)
        .map(row => toApi(row))
}

/** Marks the agent's reply by its event's UUID; only a reply of this agent can be marked. */
export function addBookmark(accountId, botId, eventId) {
    const event = db
        .query("SELECT e.data FROM task_events e JOIN tasks t ON t.id = e.task_id WHERE e.uuid = ? AND t.bot_id = ? AND e.type = 'assistant'")
        .get(eventId, botId)
    if (!event) return null
    const text = String(JSON.parse(event.data).text || '').trim()
    if (!text) return null
    db.query('INSERT OR IGNORE INTO bookmarks (account_id, bot_id, event_id, text, created_at) VALUES (?, ?, ?, ?, ?)').run(accountId, botId, eventId, text, now())
    return listBookmarks(accountId, botId)
}

export function removeBookmark(accountId, botId, eventId) {
    db.query('DELETE FROM bookmarks WHERE account_id = ? AND bot_id = ? AND event_id = ?').run(accountId, botId, eventId)
    return listBookmarks(accountId, botId)
}
