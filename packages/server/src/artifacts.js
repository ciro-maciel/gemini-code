import { db, newId, now } from './db.js';

// What a bot hands over to be looked at, not read: an artifact. It is a list of
// generic blocks the panel draws with the design system (a heading with the
// verdict, numbers, a table, items with a state, a short text), and any item,
// or the artifact itself, may carry choices the person taps. The Assistant
// never knows what an artifact means to the bot: it keeps the versions, draws
// the blocks and hands each choice back to the bot as a message.
//
// Publishing again with the same key makes the next version of the same
// artifact; a choice belongs to one item of one version and is made once. A
// version is addressed by its own UUID; its number is only the label.

export const BLOCK_TYPES = [
  'heading',
  'stats',
  'table',
  'items',
  'text',
  'images',
  'videos',
];
export const TONES = ['attention', 'ok', 'neutral', 'bad'];
export const ARTIFACT_ITEM = '_artifact';

const KEY = /^[a-z0-9][a-z0-9-]{0,63}$/;
const ITEM_ID = /^[A-Za-z0-9][A-Za-z0-9_.:-]{0,63}$/;
const MAX_BYTES = 64 * 1024;
const LIMITS = {
  blocks: 40,
  stats: 8,
  columns: 8,
  rows: 60,
  items: 40,
  choices: 4,
  images: 12,
  videos: 4,
};

class ArtifactError extends Error {}
const fail = (message) => {
  throw new ArtifactError(message);
};

/** A string the block may carry: trimmed and cut, or an error when required and missing. */
function text(value, max, where, { isRequired = false } = {}) {
  if (value === undefined || value === null || value === '') {
    if (isRequired) fail(`${where} is required`);
    return undefined;
  }
  if (typeof value === 'number') value = String(value);
  if (typeof value !== 'string') fail(`${where} must be text`);
  const clean = value.trim();
  if (isRequired && !clean) fail(`${where} is required`);
  if (clean.length > max) fail(`${where} is longer than ${max} characters`);
  return clean || undefined;
}

const tone = (value, where) => {
  if (value === undefined || value === null) return undefined;
  if (!TONES.includes(value)) fail(`${where}: tone is ${TONES.join(', ')}`);
  return value;
};

function list(value, max, where, { min = 1 } = {}) {
  if (!Array.isArray(value)) fail(`${where} must be a list`);
  if (value.length < min) fail(`${where} is empty`);
  if (value.length > max) fail(`${where} has more than ${max}`);
  return value;
}

function choices(value, where) {
  if (value === undefined || value === null) return undefined;
  const seen = new Set();
  return list(value, LIMITS.choices, `${where}.choices`).map(
    (choice, index) => {
      const at = `${where}.choices[${index}]`;
      const clean = {
        label: text(choice?.label, 32, `${at}.label`, { isRequired: true }),
        value: text(choice?.value, 64, `${at}.value`, { isRequired: true }),
      };
      if (seen.has(clean.value)) fail(`${at}.value repete "${clean.value}"`);
      seen.add(clean.value);
      if (choice.needsNote === true) clean.needsNote = true;
      return clean;
    },
  );
}

function block(input, index, itemIds) {
  const at = `blocks[${index}]`;
  if (!input || typeof input !== 'object') fail(`${at} must be an object`);
  if (!BLOCK_TYPES.includes(input.type))
    fail(`${at}.type is ${BLOCK_TYPES.join(', ')}`);
  if (input.type === 'heading')
    return {
      type: 'heading',
      title: text(input.title, 160, `${at}.title`, { isRequired: true }),
      text: text(input.text, 400, `${at}.text`),
    };
  if (input.type === 'text')
    return {
      type: 'text',
      text: text(input.text, 4000, `${at}.text`, { isRequired: true }),
    };
  if (input.type === 'stats') {
    return {
      type: 'stats',
      items: list(input.items, LIMITS.stats, `${at}.items`).map(
        (stat, position) => {
          const where = `${at}.items[${position}]`;
          const delta = stat?.delta;
          if (delta !== undefined && delta !== null && !Number.isFinite(delta))
            fail(`${where}.delta must be a number`);
          return {
            label: text(stat?.label, 40, `${where}.label`, {
              isRequired: true,
            }),
            value: text(stat?.value, 24, `${where}.value`),
            unit: text(stat?.unit, 8, `${where}.unit`),
            note: text(stat?.note, 80, `${where}.note`),
            ...(Number.isFinite(delta) ? { delta } : {}),
          };
        },
      ),
    };
  }
  // Pictures by their https address (a Designs export link, a published page's image): the panel shows them.
  if (input.type === 'images') {
    return {
      type: 'images',
      title: text(input.title, 80, `${at}.title`),
      items: list(input.items, LIMITS.images, `${at}.items`).map(
        (image, position) => {
          const where = `${at}.items[${position}]`;
          const src = text(image?.src, 2000, `${where}.src`, {
            isRequired: true,
          });
          if (!/^https:\/\/[^\s"'<>]+$/.test(src))
            fail(`${where}.src is an https address`);
          return { src, caption: text(image.caption, 120, `${where}.caption`) };
        },
      ),
    };
  }
  // Videos by their https address (a Designs MP4 export link): the panel plays them where they are (30/10/2026).
  if (input.type === 'videos') {
    const https = (value, where) => {
      if (!/^https:\/\/[^\s"'<>]+$/.test(value))
        fail(`${where} is an https address`);
      return value;
    };
    return {
      type: 'videos',
      title: text(input.title, 80, `${at}.title`),
      items: list(input.items, LIMITS.videos, `${at}.items`).map(
        (video, position) => {
          const where = `${at}.items[${position}]`;
          const src = https(
            text(video?.src, 2000, `${where}.src`, { isRequired: true }),
            `${where}.src`,
          );
          const poster = text(video.poster, 2000, `${where}.poster`);
          return {
            src,
            ...(poster ? { poster: https(poster, `${where}.poster`) } : {}),
            caption: text(video.caption, 120, `${where}.caption`),
          };
        },
      ),
    };
  }
  if (input.type === 'table') {
    const columns = list(input.columns, LIMITS.columns, `${at}.columns`).map(
      (column, position) =>
        text(column, 40, `${at}.columns[${position}]`, { isRequired: true }),
    );
    const rows = list(input.rows, LIMITS.rows, `${at}.rows`).map(
      (row, position) => {
        const cells = list(row, columns.length, `${at}.rows[${position}]`);
        return columns.map(
          (_, column) =>
            text(cells[column], 200, `${at}.rows[${position}][${column}]`) ??
            '',
        );
      },
    );
    return {
      type: 'table',
      title: text(input.title, 80, `${at}.title`),
      columns,
      rows,
    };
  }
  return {
    type: 'items',
    title: text(input.title, 80, `${at}.title`),
    items: list(input.items, LIMITS.items, `${at}.items`).map(
      (item, position) => {
        const where = `${at}.items[${position}]`;
        const id = text(item?.id, 64, `${where}.id`, { isRequired: true });
        if (!ITEM_ID.test(id))
          fail(`${where}.id has letters, numbers and _.:- (up to 64)`);
        if (itemIds.has(id)) fail(`${where}.id repete "${id}"`);
        itemIds.add(id);
        return {
          id,
          title: text(item.title, 200, `${where}.title`, { isRequired: true }),
          detail: text(item.detail, 600, `${where}.detail`),
          tag: text(item.tag, 24, `${where}.tag`),
          tone: tone(item.tone, where),
          choices: choices(item.choices, where),
        };
      },
    ),
  };
}

/** The artifact as the panel draws it, or an error that says exactly what is wrong. */
export function validateArtifact(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input))
    fail('the artifact is an object {key, title, blocks}');
  if (JSON.stringify(input).length > MAX_BYTES)
    fail(`the artifact is larger than ${MAX_BYTES / 1024} KB`);
  const key = text(input.key, 64, 'key', { isRequired: true });
  if (!KEY.test(key))
    fail('key has lowercase letters, numbers and hyphens (up to 64)');
  const itemIds = new Set();
  const blocks = list(input.blocks, LIMITS.blocks, 'blocks').map(
    (each, index) => block(each, index, itemIds),
  );
  return JSON.parse(
    JSON.stringify({
      key,
      title: text(input.title, 120, 'title', { isRequired: true }),
      blocks,
      choices: choices(input.choices, 'artifact'),
    }),
  );
}

export const isArtifactError = (error) => error instanceof ArtifactError;

/** Saves the next version of the bot's artifact with this key. */
export function publishArtifact(botId, taskId, input) {
  const content = validateArtifact(input);
  const existing = db
    .query('SELECT id, version FROM artifacts WHERE bot_id = ? AND key = ?')
    .get(botId, content.key);
  const id = existing?.id ?? newId();
  const version = (existing?.version ?? 0) + 1;
  const versionId = newId();
  db.transaction(() => {
    if (existing)
      db.query(
        'UPDATE artifacts SET title = ?, version = ?, updated_at = ? WHERE id = ?',
      ).run(content.title, version, now(), id);
    else
      db.query(
        'INSERT INTO artifacts (id, bot_id, key, title, version, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(id, botId, content.key, content.title, version, now(), now());
    db.query(
      'INSERT INTO artifact_versions (id, artifact_id, version, content, task_id, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    ).run(versionId, id, version, JSON.stringify(content), taskId, now());
  })();
  return {
    id,
    botId,
    key: content.key,
    title: content.title,
    versionId,
    version,
    content,
  };
}

/** The bot's artifacts, the most recently published first. */
export function listArtifacts(botId) {
  return db
    .query(
      'SELECT id, key, title, version, created_at, updated_at FROM artifacts WHERE bot_id = ? ORDER BY updated_at DESC LIMIT 200',
    )
    .all(botId)
    .map((row) => ({
      id: row.id,
      key: row.key,
      title: row.title,
      version: row.version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }));
}

/** Every place in a version that offers choices: the artifact itself and each item with choices. */
function choiceTargets(content) {
  const targets = content.choices?.length ? [ARTIFACT_ITEM] : [];
  for (const each of content.blocks)
    if (each.type === 'items')
      for (const item of each.items)
        if (item.choices?.length) targets.push(item.id);
  return targets;
}

/** When the person last spoke to the bot: a message or a choice, never a routine, a colleague or the door. */
function lastPersonWordAt(botId) {
  return (
    db
      .query(
        `SELECT MAX(e.created_at) AS at FROM task_events e JOIN tasks t ON t.id = e.task_id
                 WHERE t.bot_id = ? AND e.type = 'user_message' AND json_extract(e.data, '$.routine') IS NULL
                   AND json_extract(e.data, '$.handoff') IS NULL AND json_extract(e.data, '$.inbound') IS NULL AND json_extract(e.data, '$.isSetup') IS NULL`,
      )
      .get(botId)?.at ?? 0
  );
}

/**
 * A choice the conversation left behind is no longer waiting (29/10/2026):
 * the person spoke to the bot after it was published, or the bot published a
 * newer one. Its card still takes a click; it just stops asking.
 */
function openChoicesOf(botId) {
  const spokeAt = lastPersonWordAt(botId);
  const rows = db
    .query(
      'SELECT a.id, a.version, a.updated_at, v.content FROM artifacts a JOIN artifact_versions v ON v.artifact_id = a.id AND v.version = a.version WHERE a.bot_id = ? ORDER BY a.updated_at DESC',
    )
    .all(botId);
  const open = new Map();
  let newestChoiceAt = null;
  for (const row of rows) {
    const targets = choiceTargets(JSON.parse(row.content));
    if (!targets.length) continue;
    const made = new Set(
      db
        .query(
          'SELECT item_id FROM artifact_choices WHERE artifact_id = ? AND version = ?',
        )
        .all(row.id, row.version)
        .map((choice) => choice.item_id),
    );
    const isLeftBehind =
      spokeAt > row.updated_at ||
      (newestChoiceAt !== null && newestChoiceAt > row.updated_at);
    newestChoiceAt ??= row.updated_at;
    open.set(row.id, {
      pending: isLeftBehind ? 0 : targets.filter((id) => !made.has(id)).length,
      isLeftBehind: isLeftBehind && made.size === 0,
    });
  }
  return open;
}

/** How many choices of the latest versions of a bot's artifacts still wait for a person. */
export function countPendingChoices(botId) {
  let count = 0;
  for (const { pending } of openChoicesOf(botId).values()) count += pending;
  return count;
}

/** The account's latest deliveries across its bots: title, verdict and the choices still open; options left behind unchosen leave the list. */
export function listRecentDeliveries(accountId, limit = 8) {
  const openByBot = new Map();
  const openOf = (botId) => {
    if (!openByBot.has(botId)) openByBot.set(botId, openChoicesOf(botId));
    return openByBot.get(botId);
  };
  return db
    .query(
      `SELECT a.id, a.bot_id, a.title, a.version, a.updated_at, b.name AS bot_name, v.content
             FROM artifacts a JOIN bots b ON b.id = a.bot_id JOIN artifact_versions v ON v.artifact_id = a.id AND v.version = a.version
             WHERE b.account_id = ? ORDER BY a.updated_at DESC LIMIT ?`,
    )
    .all(accountId, limit * 4)
    .filter((row) => !openOf(row.bot_id).get(row.id)?.isLeftBehind)
    .slice(0, limit)
    .map((row) => {
      const content = JSON.parse(row.content);
      const heading = content.blocks.find((each) => each.type === 'heading');
      return {
        id: row.id,
        botId: row.bot_id,
        botName: row.bot_name,
        title: row.title,
        verdict: heading?.text || heading?.title || '',
        version: row.version,
        updatedAt: row.updated_at,
        pendingChoices: openOf(row.bot_id).get(row.id)?.pending ?? 0,
      };
    });
}

/** One version of an artifact, by its UUID, with the choices already made in it and whether it is the latest. */
export function fetchArtifactVersion(botId, artifactId, versionId) {
  const artifact = db
    .query('SELECT * FROM artifacts WHERE id = ? AND bot_id = ?')
    .get(artifactId, botId);
  if (!artifact) return null;
  const row = db
    .query(
      'SELECT version, content, created_at FROM artifact_versions WHERE id = ? AND artifact_id = ?',
    )
    .get(String(versionId), artifactId);
  if (!row) return null;
  const choices = db
    .query(
      'SELECT item_id, value, label, note, created_at FROM artifact_choices WHERE artifact_id = ? AND version = ?',
    )
    .all(artifactId, row.version);
  return {
    id: artifactId,
    versionId: String(versionId),
    key: artifact.key,
    title: artifact.title,
    version: row.version,
    latestVersion: artifact.version,
    isLatest: row.version === artifact.version,
    content: JSON.parse(row.content),
    createdAt: row.created_at,
    choices: Object.fromEntries(
      choices.map((choice) => [
        choice.item_id,
        {
          value: choice.value,
          label: choice.label,
          note: choice.note,
          createdAt: choice.created_at,
        },
      ]),
    ),
  };
}

/** Where a choice lives: an item of the version, or the artifact itself. */
function choiceTarget(content, itemId) {
  if (itemId === ARTIFACT_ITEM)
    return { title: content.title, choices: content.choices };
  for (const each of content.blocks)
    if (each.type === 'items')
      for (const item of each.items) if (item.id === itemId) return item;
  return null;
}

/**
 * Records the person's choice and returns what the bot is told. Only the
 * latest version takes choices, once per item; a choice that asks for a note
 * comes with one.
 */
export function recordChoice(
  botId,
  artifactId,
  versionId,
  { itemId, value, note },
) {
  const artifact = fetchArtifactVersion(botId, artifactId, versionId);
  if (!artifact) fail('unknown artifact');
  if (!artifact.isLatest)
    fail(
      `there is a newer version of this artifact (${artifact.latestVersion}); choose in it`,
    );
  const target = choiceTarget(artifact.content, itemId);
  const choice = target?.choices?.find((each) => each.value === value);
  if (!choice) fail('this choice does not exist in this artifact');
  if (artifact.choices[itemId]) fail('this item was already answered');
  const cleanNote = text(note, 2000, 'o recado');
  if (choice.needsNote && !cleanNote) fail(`"${choice.label}" asks for a note`);
  db.query(
    'INSERT INTO artifact_choices (artifact_id, version, item_id, value, label, note, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    artifactId,
    artifact.version,
    itemId,
    choice.value,
    choice.label,
    cleanNote ?? null,
    now(),
  );
  const isWhole = itemId === ARTIFACT_ITEM;
  return {
    shown: `${choice.label}${cleanNote ? `: ${cleanNote}` : ''}`,
    choice: {
      artifactId,
      versionId: artifact.versionId,
      version: artifact.version,
      title: artifact.title,
      item: isWhole ? null : target.title,
    },
    modelText: `[O usuário tocou numa escolha do seu artifact "${artifact.title}" (key ${artifact.key}, versão ${artifact.version})${isWhole ? '' : `, no item "${target.title}" (id ${itemId})`}: "${choice.label}" (value ${choice.value})${cleanNote ? `, com o recado: ${cleanNote}` : ''}. Siga as suas instruções para essa escolha.]`,
  };
}
