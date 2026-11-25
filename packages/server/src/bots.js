import { config } from './config.js';
import { db, newId, now, toApi } from './db.js';
import { chooseMascot, isMascot } from './mascots.js';
import { removeBotAttachments } from './attachments.js';
import { countPendingChoices } from './artifacts.js';
import { today } from './accounts.js';
import { agentFolders, slugOf } from './repo-files.js';
import { hasAiAccount, isModelOf } from './ai-accounts.js';
import { listCheckpoints } from './sprites.js';
import { ensureLocalWorkspace } from './local-runtime.js';

// A bot is a conversation first. Its computer is this machine: the first
// time it needs a shell it is marked ready, and its work stays in its folder.
//
//   idle          no computer yet
//   provisioning  a computer is being prepared or upgraded
//   ready         its computer answers
//   failed        the last preparation failed; the next use tries again

const listeners = new Set();

export function onBotChange(listener) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function notify(botId) {
  const bot = fetchBot(botId);
  for (const listener of listeners) listener(bot);
}

// connection_ids is a JSON list of the account's connections the agent uses, or null for all of them.
const BOT_JSON = ['connection_ids'];

// bots.section is the name a bot's section had before sections had ids; the
// bot points at its section by section_id now, and the old column is never read.
function present(row) {
  const bot = toApi(row, BOT_JSON);
  if (bot) delete bot.section;
  return bot;
}

export function agentDirOf(bot) {
  if (!bot?.id) return null;
  const siblings = db
    .query(
      'SELECT id, name, created_at FROM bots WHERE account_id IS ? ORDER BY created_at',
    )
    .all(bot.accountId ?? null)
    .map((row) => ({ id: row.id, name: row.name, createdAt: row.created_at }));
  const slug = agentFolders(siblings).get(bot.id);
  return slug ? `agents/${slug}` : null;
}

export function fetchBot(botId) {
  const bot = present(db.query('SELECT * FROM bots WHERE id = ?').get(botId));
  if (!bot) return null;
  const dir = agentDirOf(bot);
  if (dir) {
    bot.agentDir = dir;
    bot.instructionsPath = `${dir}/INSTRUCTIONS.md`;
  }
  return bot;
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
    .slice(0, 140);
}

/** "Marcar como não lida": the mark goes back to just before the latest news, which counts again. */
export function markBotUnread(botId) {
  const latest = db
    .query(
      `SELECT MAX(e.id) AS id FROM task_events e JOIN tasks t ON t.id = e.task_id
             WHERE t.bot_id = ? AND (e.type IN ('assistant', 'files', 'approval_requested', 'colleague')
               OR (e.type = 'tool_call' AND json_extract(e.data, '$.name') = 'ask_user'))`,
    )
    .get(botId)?.id;
  if (latest)
    db.query('UPDATE bots SET read_event_id = ? WHERE id = ?').run(
      latest - 1,
      botId,
    );
}

/** The owner opened the conversation: everything in it up to now is read. */
export function markBotRead(botId) {
  db.query(
    'UPDATE bots SET read_event_id = (SELECT MAX(e.id) FROM task_events e JOIN tasks t ON t.id = e.task_id WHERE t.bot_id = ?) WHERE id = ?',
  ).run(botId, botId);
}

/** The account's bots, in the order they were made. */
export function listBots(accountId) {
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
             FROM bots WHERE account_id = ?
             ORDER BY created_at`,
    )
    .all(accountId)
    .map((row, _, rows) => {
      const bot = present(row);
      // Where its instructions live in the repository: agents/<its folder>/INSTRUCTIONS.md.
      const siblings = rows
        .filter((other) => other.account_id === row.account_id)
        .map((other) => ({
          id: other.id,
          name: other.name,
          createdAt: other.created_at,
        }));
      const agentDir = `agents/${agentFolders(siblings).get(row.id)}`;
      bot.agentDir = agentDir;
      bot.instructionsPath = `${agentDir}/INSTRUCTIONS.md`;
      bot.access = 'owner';
      bot.lastMessage = row.last_message
        ? toPreview(JSON.parse(row.last_message).text)
        : null;
      bot.hasNews = Boolean(row.has_news);
      // Choices offered in its latest deliveries that no one made yet: they wait for a person too.
      bot.pendingChoices = countPendingChoices(row.id);
      bot.spendToday =
        db
          .query('SELECT cost FROM bot_usage WHERE bot_id = ? AND day = ?')
          .get(row.id, today())?.cost ?? 0;
      delete bot.readEventId;
      return bot;
    });
}

function updateBot(botId, fields) {
  const columns = Object.keys(fields);
  db.query(
    `UPDATE bots SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
  ).run(...columns.map((column) => fields[column]), now(), botId);
  notify(botId);
}

export const EFFORTS = ['low', 'medium', 'high'];

/** The connections an agent uses: the ones it picked, or every one of its account. */
export const usesConnection = (bot, connectionId) =>
  !Array.isArray(bot.connectionIds) || bot.connectionIds.includes(connectionId);

/** A working folder inside the workspace: no leading or trailing slash, no way up. */
export function cleanFolder(folder) {
  if (folder === null || folder === undefined || folder === '') return null;
  const parts = String(folder)
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  if (parts.some((part) => part === '..' || part === '.'))
    throw new Error('the folder cannot leave the workspace');
  return parts.join('/').slice(0, 200) || null;
}

export function updateBotSettings(
  botId,
  {
    name,
    model,
    instructions,
    mascot,
    sectionId,
    effort,
    folder,
    aiAccount,
    templateId,
    connectionIds,
    project,
  },
) {
  const fields = {};
  // The repository it works on, relative to the projects folder; the route
  // checks it is one (projects.js).
  if (project !== undefined)
    fields.project =
      typeof project === 'string' && project.trim()
        ? project.trim().slice(0, 300)
        : null;
  const accountId = fetchBot(botId)?.accountId;
  if (effort !== undefined) {
    if (effort !== null && !EFFORTS.includes(effort))
      throw new Error(`effort not in the list: ${effort}`);
    fields.effort = effort;
  }
  if (folder !== undefined) fields.folder = cleanFolder(folder);
  if (aiAccount !== undefined) {
    if (aiAccount !== null && !hasAiAccount(accountId, aiAccount))
      throw new Error('unknown AI account');
    fields.ai_account = aiAccount;
  }
  if (templateId !== undefined)
    fields.template_id =
      typeof templateId === 'string' && templateId
        ? templateId.slice(0, 64)
        : null;
  if (connectionIds !== undefined) {
    if (connectionIds !== null && !Array.isArray(connectionIds))
      throw new Error('connectionIds is a list');
    const known = new Set(
      db
        .query('SELECT id FROM connections WHERE account_id = ?')
        .all(accountId)
        .map((row) => row.id),
    );
    fields.connection_ids =
      connectionIds === null
        ? null
        : JSON.stringify(
            [...new Set(connectionIds)].filter((id) => known.has(id)),
          );
  }
  if (sectionId !== undefined) {
    // A section of the bot's own account, by its id; null is "Sem seção".
    if (
      sectionId !== null &&
      !fetchSection(fetchBot(botId)?.accountId, sectionId)
    )
      throw new Error('unknown section');
    fields.section_id = sectionId;
    // Moved by the menu: it lands at the end of its new section.
    fields.position = null;
  }
  if (typeof name === 'string' && name.trim())
    fields.name = name.trim().slice(0, 60);
  // The model runs on the account picked with it, or on the one the agent already has.
  // The same model again (an agent file saved with its model line) is no change.
  if (
    typeof model === 'string' &&
    !(aiAccount === undefined && model === fetchBot(botId)?.model)
  ) {
    const on =
      aiAccount !== undefined
        ? aiAccount
        : (fetchBot(botId)?.aiAccount ?? null);
    if (!isModelOf(accountId, on, model))
      throw new Error(`model not in the list: ${model}`);
    fields.model = model;
  }
  if (typeof instructions === 'string')
    fields.instructions = instructions.slice(0, 8000);
  if (typeof mascot === 'string') {
    if (!isMascot(mascot)) throw new Error('unknown illustration');
    fields.mascot = mascot;
  }
  if (Object.keys(fields).length) updateBot(botId, fields);
  return fetchBot(botId);
}

function newSpriteName() {
  return `${config.botPrefix}${crypto.randomUUID().slice(0, 8)}`;
}

// --- The computer's code ---------------------------------------------------

// The computer is this machine: there is nothing to install or upgrade, so
// its version is a constant the engine compares against.
export const COMPUTER_VERSION = 'local';

// --- Sections: the column's own order, per account ------------------------

const sectionName = (name) =>
  typeof name === 'string' && name.trim() ? name.trim().slice(0, 40) : null;

// A section is addressed by its id (house rule, 25/10/2026); its name is the
// label, still one per account. An id of another account is the same as none.
const findSection = (accountId, sectionId) =>
  typeof sectionId === 'string'
    ? db
        .query(
          'SELECT id, name, position FROM sections WHERE account_id = ? AND id = ?',
        )
        .get(accountId, sectionId)
    : null;

/** The section by its id, or null: another account's id finds nothing. */
export function fetchSection(accountId, sectionId) {
  const row = findSection(accountId, sectionId);
  return row ? { id: row.id, name: row.name } : null;
}

/** The account's sections, empty ones included: in the order they were dragged to, then the rest by name. */
export function listSections(accountId) {
  return db
    .query('SELECT id, name, position FROM sections WHERE account_id = ?')
    .all(accountId)
    .sort(
      (first, second) =>
        (first.position ?? Infinity) - (second.position ?? Infinity) ||
        first.name.localeCompare(second.name, 'pt-BR'),
    )
    .map((row) => ({ id: row.id, name: row.name }));
}

/** Puts the sections in this order; an id the account does not have is skipped. */
export function reorderSections(accountId, sectionIds) {
  db.transaction(() => {
    sectionIds.forEach((sectionId, index) => {
      db.query(
        'UPDATE sections SET position = ? WHERE account_id = ? AND id = ?',
      ).run(index, accountId, sectionId);
    });
  })();
}

/** Creates a section; a name the account already has gives back that section. */
export function createSection(accountId, name) {
  const target = sectionName(name);
  if (!target) throw new Error('give the section a name');
  db.query(
    'INSERT OR IGNORE INTO sections (id, account_id, name, created_at) VALUES (?, ?, ?, ?)',
  ).run(newId(), accountId, target, now());
  const row = db
    .query('SELECT id, name FROM sections WHERE account_id = ? AND name = ?')
    .get(accountId, target);
  return { id: row.id, name: row.name };
}

/**
 * Puts these bots, in this order, into one section (null is "Sem seção").
 * Bots of that section left out keep their place after them. Returns false,
 * changing nothing, when the section is not one of the account's.
 */
export function reorderSection(accountId, sectionId, botIds) {
  if (sectionId !== null && !findSection(accountId, sectionId)) return false;
  db.transaction(() => {
    botIds.forEach((botId, index) => {
      db.query(
        'UPDATE bots SET section_id = ?, position = ?, updated_at = ? WHERE id = ? AND account_id = ?',
      ).run(sectionId, index, now(), botId, accountId);
    });
  })();
  return true;
}

/**
 * Renames a section, or null when the account has no such id. Renaming onto
 * the name of another section joins the two: its bots move there, and the
 * one that stays takes this one's place in the column.
 */
export function renameSection(accountId, sectionId, to) {
  const name = sectionName(to);
  if (!name) throw new Error('give the section a name');
  const section = findSection(accountId, sectionId);
  if (!section) return null;
  const other = db
    .query(
      'SELECT id FROM sections WHERE account_id = ? AND name = ? AND id != ?',
    )
    .get(accountId, name, sectionId);
  if (!other) {
    db.query('UPDATE sections SET name = ? WHERE id = ?').run(name, sectionId);
    return fetchSection(accountId, sectionId);
  }
  db.transaction(() => {
    db.query('DELETE FROM sections WHERE id = ?').run(sectionId);
    if (section.position !== null)
      db.query('UPDATE sections SET position = ? WHERE id = ?').run(
        section.position,
        other.id,
      );
    db.query(
      'UPDATE bots SET section_id = ? WHERE section_id = ? AND account_id = ?',
    ).run(other.id, sectionId, accountId);
  })();
  return fetchSection(accountId, other.id);
}

/** Deleting a section only ungroups: its bots go back to "Sem seção". False when the account has no such id. */
export function deleteSection(accountId, sectionId) {
  if (!findSection(accountId, sectionId)) return false;
  db.transaction(() => {
    db.query('DELETE FROM sections WHERE id = ?').run(sectionId);
    db.query(
      'UPDATE bots SET section_id = NULL, position = NULL WHERE section_id = ? AND account_id = ?',
    ).run(sectionId, accountId);
  })();
  return true;
}

// --- Bots -----------------------------------------------------------------

export function countBots(accountId) {
  return db
    .query('SELECT COUNT(*) AS count FROM bots WHERE account_id = ?')
    .get(accountId).count;
}

/** Instant: the computer comes later, the first time the bot needs one. */
export function createBot({
  accountId,
  name,
  model,
  instructions = '',
  folder = undefined,
}) {
  const id = newId();
  const cleanName = (name || '').trim().slice(0, 60) || 'Assistente';
  const timestamp = now();
  const explicitFolder = folder !== undefined ? cleanFolder(folder) : undefined;
  db.query(
    'INSERT INTO bots (id, account_id, name, sprite_name, status, model, instructions, folder, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    accountId,
    cleanName,
    newSpriteName(),
    'idle',
    config.models.some((option) => option.id === model)
      ? model
      : config.defaultModel,
    String(instructions).slice(0, 8000),
    explicitFolder ?? null,
    timestamp,
    timestamp,
  );
  if (folder === undefined) {
    const base = slugOf(cleanName);
    const usedFolders = new Set(
      db
        .query(
          'SELECT folder FROM bots WHERE account_id IS ? AND folder IS NOT NULL',
        )
        .all(accountId ?? null)
        .map((row) => row.folder),
    );
    let candidate = `agents/${base}/docs`;
    for (let suffix = 2; usedFolders.has(candidate); suffix++)
      candidate = `agents/${base}-${suffix}/docs`;
    db.query('UPDATE bots SET folder = ? WHERE id = ?').run(candidate, id);
  }
  assignMascot(id);
  return fetchBot(id);
}

/** Picks the illustration that fits the bot; the panel shows it when it lands. */
export async function assignMascot(botId) {
  const bot = fetchBot(botId);
  if (!bot || bot.mascot) return;
  const usedIds = db
    .query(
      'SELECT mascot FROM bots WHERE mascot IS NOT NULL AND id != ? AND account_id IS ?',
    )
    .all(botId, bot.accountId)
    .map((row) => row.mascot);
  const mascot = await chooseMascot({
    name: bot.name,
    instructions: bot.instructions,
    usedIds,
  });
  if (mascot) updateBot(botId, { mascot });
}

/**
 * The bot with a computer that answers and runs the current code. Called on
 * the first screen or shell tool of a task; `onProgress(text)` tells the
 * conversation why it waits. Concurrent callers share one preparation.
 */
export function ensureComputer(botId) {
  const bot = fetchBot(botId);
  ensureLocalWorkspace();
  if (bot.status !== 'ready' || bot.computerVersion !== COMPUTER_VERSION) {
    updateBot(bot.id, {
      status: 'ready',
      status_detail: null,
      computer_version: COMPUTER_VERSION,
    });
    for (const listener of readyListeners) listener(bot.id);
  }
  return Promise.resolve(fetchBot(bot.id));
}

/** "Preparar de novo" and "Ligar agora" in the panel. */
export function provision(botId) {
  ensureComputer(botId).catch(() => {});
}

const readyListeners = new Set();

/** Called when a bot's computer becomes ready: messages written meanwhile run. */
export function onBotReady(listener) {
  readyListeners.add(listener);
}

export async function deleteBot(botId) {
  const bot = fetchBot(botId);
  if (!bot) return;
  db.transaction(() => {
    // Connections are the account's pool: the row only remembers the bot
    // that made it, and that memory goes; the connection stays.
    db.query('UPDATE connections SET bot_id = NULL WHERE bot_id = ?').run(
      botId,
    );
    db.query('DELETE FROM bots WHERE id = ?').run(botId);
  })();
  removeBotAttachments(botId);
}

export async function listBotCheckpoints(botId) {
  const bot = fetchBot(botId);
  if (bot.status !== 'ready') return [];
  return listCheckpoints(bot.spriteName);
}

export function recoverBots() {
  for (const { id } of db
    .query("SELECT id FROM bots WHERE status = 'provisioning'")
    .all())
    provision(id);
  (async () => {
    for (const { id } of db
      .query('SELECT id FROM bots WHERE mascot IS NULL ORDER BY created_at')
      .all())
      await assignMascot(id);
  })();
}
