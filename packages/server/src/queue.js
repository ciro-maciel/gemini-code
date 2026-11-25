import { db, newId, now } from './db.js';

// What a person sends "for when it finishes": it waits here, in the order it
// was sent, and the engine takes the next one each time the bot's task stops.

const MAX_PER_BOT = 20;

export function enqueue(botId, text, attachmentIds = [], author = null) {
  const count = db
    .query('SELECT COUNT(*) AS n FROM bot_queue WHERE bot_id = ?')
    .get(botId).n;
  if (count >= MAX_PER_BOT) return null;
  const id = newId();
  db.query(
    'INSERT INTO bot_queue (id, bot_id, text, attachment_ids, author, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, botId, text, JSON.stringify(attachmentIds), author, now());
  return id;
}

export function listQueue(botId) {
  return db
    .query(
      'SELECT id, text, attachment_ids, author, created_at FROM bot_queue WHERE bot_id = ? ORDER BY created_at, rowid',
    )
    .all(botId)
    .map((row) => ({
      id: row.id,
      text: row.text,
      attachmentIds: JSON.parse(row.attachment_ids),
      author: row.author,
      createdAt: row.created_at,
    }));
}

export function removeQueued(botId, id) {
  return (
    db.query('DELETE FROM bot_queue WHERE id = ? AND bot_id = ?').run(id, botId)
      .changes > 0
  );
}

/** Takes the oldest waiting message out of the queue, or null when there is none. */
export function takeNext(botId) {
  const [next] = listQueue(botId);
  if (!next) return null;
  removeQueued(botId, next.id);
  return next;
}
