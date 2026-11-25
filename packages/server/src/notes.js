import { db } from './db.js';
import { emitTaskEvent } from './events.js';

// "Entre nós" (29/10/2026): a note between the people in a bot. It is an
// event of the conversation, so everyone in it sees it live, but never a
// message of the task, so the model never reads it. Sent to the bot later,
// it becomes a signed message and the note leaves the conversation.

const MAX_NOTE = 4000;

const threadOf = (botId) =>
  db
    .query(
      'SELECT id FROM tasks WHERE bot_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .get(botId)?.id ?? null;

export function writeNote(botId, account, text) {
  const clean = String(text || '')
    .trim()
    .slice(0, MAX_NOTE);
  if (!clean) return { error: 'escreva a nota' };
  const taskId = threadOf(botId);
  if (!taskId) return { error: 'a nota entra numa conversa que já começou' };
  return {
    event: emitTaskEvent(taskId, 'note', {
      text: clean,
      author: account.name || account.email,
      accountId: account.id,
    }),
  };
}

/** The note, if it is in this bot, still a note, and written by this account. */
export function takeNote(botId, account, eventId) {
  // Events are addressed by their UUID; the number is only their place.
  const row = db
    .query(
      "SELECT e.uuid, e.data FROM task_events e JOIN tasks t ON t.id = e.task_id WHERE e.uuid = ? AND t.bot_id = ? AND e.type = 'note'",
    )
    .get(String(eventId), botId);
  if (!row) return null;
  const note = JSON.parse(row.data);
  const isSent = db
    .query(
      "SELECT 1 FROM task_events e JOIN tasks t ON t.id = e.task_id WHERE t.bot_id = ? AND e.type = 'user_message' AND json_extract(e.data, '$.fromNote') = ?",
    )
    .get(botId, row.uuid);
  return note.accountId === account.id && !isSent
    ? { id: row.uuid, ...note }
    : null;
}
