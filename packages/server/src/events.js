import { db, newId, now, toApi } from './db.js';

// Every step of a task is written to task_events and pushed to whoever is
// watching. A dashboard that reconnects asks for the events after the last id
// it saw, so nothing is lost between the database and the stream.
//
// An event is addressed by its UUID (`id`), the one "Voltar para aqui" names
// (house rule, 25/10/2026). Its number is only its place in the conversation
// (`seq`): what the panel asks for is "what came after the last one I saw",
// and a place still works after a rewind deleted the event that held it.
const listeners = new Map();

const botOfTask = new Map();

function findBotId(taskId) {
  if (!botOfTask.has(taskId))
    botOfTask.set(
      taskId,
      db.query('SELECT bot_id FROM tasks WHERE id = ?').get(taskId)?.bot_id,
    );
  return botOfTask.get(taskId);
}

export function emitTaskEvent(taskId, type, data = {}) {
  const createdAt = now();
  const id = newId();
  let seq;
  try {
    ({ id: seq } = db
      .query(
        'INSERT INTO task_events (uuid, task_id, type, data, created_at) VALUES (?, ?, ?, ?, ?) RETURNING id',
      )
      .get(id, taskId, type, JSON.stringify(data), createdAt));
  } catch (error) {
    // The task went with its bot (deleted while it worked): nothing to record,
    // and nothing to bring the server down over.
    if (error.code === 'SQLITE_CONSTRAINT_FOREIGNKEY') return null;
    throw error;
  }
  const botId = findBotId(taskId);
  const event = { id, seq, taskId, botId, type, data, createdAt };
  for (const key of [taskId, `bot:${botId}`, '*']) {
    for (const listener of listeners.get(key) ?? []) listener(event);
  }
  return event;
}

/**
 * Pushed to watchers but never stored: the pieces of an answer while it
 * streams. The full text is stored once, as the 'assistant' event, when the
 * answer ends.
 */
export function publishLive(taskId, type, data) {
  const botId = findBotId(taskId);
  const event = {
    id: null,
    seq: null,
    taskId,
    botId,
    type,
    data,
    isLive: true,
  };
  for (const key of [taskId, `bot:${botId}`]) {
    for (const listener of listeners.get(key) ?? []) listener(event);
  }
}

/**
 * Pushed to a bot's watchers, never stored, about the bot rather than a task:
 * who is looking at it, its members. The account streams hear it too.
 */
export function publishBot(botId, type, data) {
  const event = {
    id: null,
    seq: null,
    taskId: null,
    botId,
    type,
    data,
    isLive: true,
  };
  for (const key of [`bot:${botId}`, 'changes']) {
    for (const listener of listeners.get(key) ?? []) listener(event);
  }
}

/** Pushed to one account's streams, never stored: its repository just got a commit. */
export function publishAccount(accountId, type, data = null) {
  const event = {
    id: null,
    seq: null,
    taskId: null,
    botId: null,
    accountId,
    type,
    data,
    isLive: true,
  };
  for (const listener of listeners.get(`account:${accountId}`) ?? [])
    listener(event);
}

/** A stored event as it leaves the server: its UUID is its id, its number only its place. */
function present(row) {
  const { uuid, id, ...rest } = toApi(row, ['data']);
  return { id: uuid, seq: id, ...rest };
}

/** The bot's whole conversation: every event of every task, in order. `afterSeq` and `beforeSeq` are places. */
export function listBotEvents(
  botId,
  { afterSeq = 0, beforeSeq = null, limit = 400 } = {},
) {
  const rows = beforeSeq
    ? db
        .query(
          'SELECT e.* FROM task_events e JOIN tasks t ON t.id = e.task_id WHERE t.bot_id = ? AND e.id < ? ORDER BY e.id DESC LIMIT ?',
        )
        .all(botId, beforeSeq, limit)
        .reverse()
    : afterSeq
      ? db
          .query(
            'SELECT e.* FROM task_events e JOIN tasks t ON t.id = e.task_id WHERE t.bot_id = ? AND e.id > ? ORDER BY e.id LIMIT ?',
          )
          .all(botId, afterSeq, limit)
      : db
          .query(
            'SELECT e.* FROM task_events e JOIN tasks t ON t.id = e.task_id WHERE t.bot_id = ? ORDER BY e.id DESC LIMIT ?',
          )
          .all(botId, limit)
          .reverse();
  return rows.map((row) => ({ ...present(row), botId }));
}

export function listTaskEvents(taskId, afterSeq = 0) {
  return db
    .query('SELECT * FROM task_events WHERE task_id = ? AND id > ? ORDER BY id')
    .all(taskId, afterSeq)
    .map(present);
}

/** @param {string} taskId a task id, or '*' for every task */
export function subscribe(taskId, listener) {
  if (!listeners.has(taskId)) listeners.set(taskId, new Set());
  listeners.get(taskId).add(listener);
  return () => listeners.get(taskId)?.delete(listener);
}
