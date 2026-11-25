import { db, newId, now } from './db.js';

// "Voltar para aqui" cuts what came after a message; the cut part is kept as a
// version to read (04/11/2026). It never runs again: the agent goes on from the
// message, and the old path stays where the person can open it.

const KEPT_TYPES = new Set([
  'user_message',
  'assistant',
  'tool_call',
  'tool_result',
  'artifact',
  'files',
  'page',
  'approval_resolved',
  'colleague',
  'skill_learned',
  'warning',
]);

/** Keeps the events from `fromEventId` on (this task's and the later tasks'), before they are deleted. */
export function keepBranch({
  botId,
  taskId,
  fromEventId,
  laterTaskIds,
  title,
}) {
  const ids = [taskId, ...laterTaskIds];
  const rows = db
    .query(
      `SELECT uuid, task_id, type, data, created_at, id FROM task_events WHERE (task_id = ? AND id >= ?) OR task_id IN (${laterTaskIds.map(() => '?').join(', ') || "''"}) ORDER BY id`,
    )
    .all(taskId, fromEventId, ...laterTaskIds)
    .filter((row) => KEPT_TYPES.has(row.type));
  // Only the message itself was cut: nothing worth keeping.
  if (rows.length <= 1 || !ids.length) return null;
  const events = rows.map((row) => ({
    id: row.uuid,
    seq: row.id,
    taskId: row.task_id,
    botId,
    type: row.type,
    data: JSON.parse(row.data),
    createdAt: row.created_at,
  }));
  const id = newId();
  db.query(
    'INSERT INTO branches (id, bot_id, title, events, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(
    id,
    botId,
    String(title || 'Mensagem').slice(0, 140),
    JSON.stringify(events),
    now(),
  );
  return id;
}

export function listBranches(botId) {
  return db
    .query(
      'SELECT id, title, created_at, json_array_length(events) AS size FROM branches WHERE bot_id = ? ORDER BY created_at DESC',
    )
    .all(botId)
    .map((row) => ({
      id: row.id,
      title: row.title,
      createdAt: row.created_at,
      size: row.size,
    }));
}

export function fetchBranch(botId, branchId) {
  const row = db
    .query(
      'SELECT id, title, events, created_at FROM branches WHERE id = ? AND bot_id = ?',
    )
    .get(branchId, botId);
  return row
    ? {
        id: row.id,
        title: row.title,
        createdAt: row.created_at,
        events: JSON.parse(row.events),
      }
    : null;
}
