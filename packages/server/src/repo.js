import { createHmac, timingSafeEqual } from 'node:crypto';
import path from 'node:path';

import { config } from './config.js';
import { db, now } from './db.js';
import { publishAccount } from './events.js';
import { fetchAccount } from './accounts.js';
import { updateBotSettings } from './bots.js';
import { listConnections } from './engine/catalog.js';
import { listMemories, saveMemory, deleteMemory } from './engine/memory.js';
import { listRoutines, updateRoutine } from './routines.js';
import {
  createSkill,
  listAccountSkills,
  listSkills,
  updateSkill,
} from './skills.js';
import { listTemplates, saveTemplate } from './templates.js';
import {
  commitFiles,
  ensureRepo,
  fileDiff,
  fileHistory,
  isGithubReady,
  listTree,
  readBlob,
  readFile,
  repoNameOf,
} from './github.js';
import {
  ensureLocalFolder,
  listLocalTree,
  localFileDiff,
  localFileHistory,
  readLocalFile,
  writeLocalFiles,
} from './local-repo.js';
import {
  agentFolders,
  diffFiles,
  isOwned,
  readEdit,
  renderRepo,
} from './repo-files.js';

// The person's workspace documents kept in step with the central:
// - When GitHub App is configured (isGithubReady()), syncs with the private GitHub repo.
// - Otherwise (default open-source local mode), operates directly on config.localWorkspaceDir
//   with local revision history & diffs via SQLite/Git.

export const isDocumentsReady = () =>
  isGithubReady() || Boolean(config.localWorkspaceDir);

export function repoInfoOf(accountId) {
  if (isGithubReady()) {
    return {
      mode: 'github',
      org: config.githubOrg,
      name: repoNameOf(accountId),
      syncedAt: syncedAtOf(accountId),
    };
  }
  return {
    mode: 'local',
    name: path.basename(config.localWorkspaceDir || 'workspace'),
    path: config.localWorkspaceDir,
    syncedAt: syncedAtOf(accountId),
  };
}

const SYNC_DELAY_MS = 1500;
const SWEEP_MS = 60_000;
const timers = new Map();

/** Everything the repository is made of, read from the central. */
export function accountState(accountId) {
  const account = fetchAccount(accountId);
  const connections = listConnections(accountId);
  const bots = db
    .query('SELECT * FROM bots WHERE account_id = ? ORDER BY created_at')
    .all(accountId)
    .map((row) => {
      const ids = row.connection_ids ? JSON.parse(row.connection_ids) : null;
      return {
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
        templateId: row.template_id,
        model: row.model,
        effort: row.effort,
        folder: row.folder,
        instructions: row.instructions,
        uses: connections
          .filter((connection) => !ids || ids.includes(connection.id))
          .map((connection) => connection.title),
        skills: listSkills(row.id).map((skill) => skill.name),
        routines: listRoutines(row.id),
        memories: listMemories(row.id),
      };
    });
  return {
    accountName: account?.name || '',
    bots,
    skills: listAccountSkills(accountId),
    templates: listTemplates(accountId).filter((template) => !template.isHouse),
  };
}

const written = (accountId) =>
  Object.fromEntries(
    db
      .query('SELECT path, content FROM repo_files WHERE account_id = ?')
      .all(accountId)
      .map((row) => [row.path, row.content]),
  );
function remember(accountId, write, remove) {
  for (const file of write)
    db.query(
      'INSERT INTO repo_files (account_id, path, content, updated_at) VALUES (?, ?, ?, ?) ON CONFLICT (account_id, path) DO UPDATE SET content = excluded.content, updated_at = excluded.updated_at',
    ).run(accountId, file.path, file.content, now());
  for (const path of remove)
    db.query('DELETE FROM repo_files WHERE account_id = ? AND path = ?').run(
      accountId,
      path,
    );
}

/** Writes what changed since the last sync as one commit (GitHub) or local revision (workspace). */
export async function syncAccount(
  accountId,
  { message = 'Updated by Gemini Code', author = null } = {},
) {
  if (!isDocumentsReady()) return null;
  const state = accountState(accountId);
  const files = renderRepo(state);

  if (!isGithubReady()) {
    const before = written(accountId);
    const changes = diffFiles(before, files);
    // Ensure any rendered central file missing on disk (e.g. brand-new workspace) is materialized.
    const queued = new Set(changes.write.map((file) => file.path));
    for (const [relPath, content] of Object.entries(files)) {
      if (!queued.has(relPath) && !readLocalFile(relPath)) {
        changes.write.push({ path: relPath, content });
      }
    }
    // Ensure every agent's work folder directory exists locally.
    for (const bot of state.bots) {
      if (bot.folder) {
        try {
          ensureLocalFolder(bot.folder);
        } catch {}
      }
    }
    const rev = writeLocalFiles(accountId, changes, message, author);
    if (changes.write.length || changes.remove.length) {
      repoChanged(accountId);
      remember(accountId, changes.write, changes.remove);
    }
    db.query('UPDATE accounts SET repo_synced_at = ? WHERE id = ?').run(
      now(),
      accountId,
    );
    return rev;
  }

  const name = repoNameOf(accountId);
  const account = fetchAccount(accountId);
  if (!account?.repo) {
    await ensureRepo(name, files['README.md']);
    db.query('UPDATE accounts SET repo = ? WHERE id = ?').run(name, accountId);
    remember(
      accountId,
      [{ path: 'README.md', content: files['README.md'] }],
      [],
    );
  }
  const changes = diffFiles(written(accountId), files);
  const sha = await commitFiles(name, changes, message, author);
  repoChanged(accountId);
  remember(accountId, changes.write, changes.remove);
  db.query('UPDATE accounts SET repo_synced_at = ? WHERE id = ?').run(
    now(),
    accountId,
  );
  return sha;
}

/** After a change in the panel: the account's repository follows in a moment, once. */
/** The repository just changed: the account's panels read the files again, no waiting for their poll. */
export const repoChanged = (accountId) => publishAccount(accountId, 'repo');

export function scheduleSync(accountId) {
  if (!isDocumentsReady() || !accountId) return;
  clearTimeout(timers.get(accountId));
  timers.set(
    accountId,
    setTimeout(() => {
      timers.delete(accountId);
      syncAccount(accountId).catch((error) =>
        console.error(`[repo] ${accountId}: ${error.message}`),
      );
    }, SYNC_DELAY_MS),
  );
}

/** What agents change by themselves (a memory, a skill, a routine) reaches the repository each minute. */
export function startRepoSweep() {
  if (!isDocumentsReady()) return;
  setInterval(() => {
    const rows = isGithubReady()
      ? db.query('SELECT id FROM accounts WHERE repo IS NOT NULL').all()
      : db.query("SELECT id FROM accounts WHERE status = 'active'").all();
    for (const row of rows) scheduleSync(row.id);
  }, SWEEP_MS);
}

/** An edited file, back into the central. */
export function applyEdit(accountId, path, content) {
  const edit = readEdit(path, content);
  if (!edit) return false;
  const botOf = (folder) => {
    const rows = db
      .query('SELECT id, name, created_at FROM bots WHERE account_id = ?')
      .all(accountId);
    const folders = agentFolders(
      rows.map((row) => ({
        id: row.id,
        name: row.name,
        createdAt: row.created_at,
      })),
    );
    return rows.find((row) => folders.get(row.id) === folder)?.id ?? null;
  };
  if (edit.kind === 'agent') {
    const botId = botOf(edit.folder);
    if (botId) updateBotSettings(botId, edit.fields);
    return Boolean(botId);
  }
  if (edit.kind === 'routine') {
    const botId = botOf(edit.folder);
    const routine =
      botId && listRoutines(botId).find((each) => each.name === edit.name);
    // A new instruction from the repository is nobody's order: whoever can push there (an agent too) wrote it.
    // The owner's own edit in the panel's file view takes the same way; marking it theirs again is a PATCH.
    const isRewritten =
      routine &&
      typeof edit.fields.instruction === 'string' &&
      edit.fields.instruction.trim() &&
      edit.fields.instruction.trim().slice(0, 4000) !== routine.instruction;
    if (routine)
      updateRoutine(routine.id, {
        instruction: edit.fields.instruction,
        ...(edit.fields.isEnabled !== undefined
          ? { isEnabled: edit.fields.isEnabled }
          : {}),
        ...(isRewritten ? { createdBy: 'agent' } : {}),
      });
    return Boolean(routine);
  }
  if (edit.kind === 'memory') {
    const botId = botOf(edit.folder);
    if (!botId) return false;
    // The file is the list of decisions and preferences: what left it is forgotten, what is new is kept.
    const current = listMemories(botId).filter(
      (memory) => memory.kind !== 'observation',
    );
    const wanted = new Set(
      edit.memories.map((memory) => `${memory.kind}\n${memory.content}`),
    );
    for (const memory of current)
      if (!wanted.has(`${memory.kind}\n${memory.content}`))
        deleteMemory(botId, memory.id);
    const kept = new Set(
      current.map((memory) => `${memory.kind}\n${memory.content}`),
    );
    for (const memory of edit.memories)
      if (!kept.has(`${memory.kind}\n${memory.content}`))
        saveMemory({ botId, kind: memory.kind, content: memory.content });
    return true;
  }
  if (edit.kind === 'skill') {
    const skill = listAccountSkills(accountId).find(
      (each) => each.name.toLowerCase() === edit.name.toLowerCase(),
    );
    if (skill) updateSkill(skill.id, edit.fields);
    else {
      const anyBot = db
        .query(
          'SELECT id FROM bots WHERE account_id = ? ORDER BY created_at LIMIT 1',
        )
        .get(accountId);
      if (!anyBot) return false;
      createSkill({
        botId: anyBot.id,
        name: edit.name,
        whenToUse: edit.fields.whenToUse,
        steps: edit.fields.steps,
      });
    }
    return true;
  }
  if (edit.kind === 'template') {
    saveTemplate(accountId, { id: edit.id, ...edit.fields });
    return true;
  }
  return false;
}

/** A person saved a file in the panel: one commit/revision in their name, then the central reads it back. */
export async function saveFile(accountId, filePath, content) {
  if (!isDocumentsReady()) throw new Error('document storage is not set up');
  const clean = cleanRepoPath(filePath);
  if (!isSafePath(clean)) throw new Error('invalid path');
  const account = fetchAccount(accountId);
  await syncAccount(accountId);
  if (!isGithubReady()) {
    if (readLocalFile(clean)?.content === content) return { path: clean };
    writeLocalFiles(
      accountId,
      { write: [{ path: clean, content }] },
      `Editado no Gemini Code: ${clean}`,
      authorOf(account),
    );
    repoChanged(accountId);
    remember(accountId, [{ path: clean, content }], []);
    applyEdit(accountId, clean, content);
    return { path: clean };
  }
  // Compared with the repository itself: what the central remembers can be stale after a delete on GitHub.
  if ((await readFile(repoNameOf(accountId), clean))?.content === content)
    return { path: clean };
  await commitFiles(
    repoNameOf(accountId),
    { write: [{ path: clean, content }] },
    `Editado no Assistant: ${clean}`,
    {
      name: account?.name || account?.email || 'Pessoa',
      email: account?.email || 'no-email@gemini-code.invalid',
    },
  );
  repoChanged(accountId);
  remember(accountId, [{ path: clean, content }], []);
  applyEdit(accountId, clean, content);
  return { path: clean };
}

const authorOf = (account) => ({
  name: account?.name || account?.email || 'Pessoa',
  email: account?.email || 'no-email@gemini-code.invalid',
});
// Each agent's default work folder (`agents/<slug>/docs`) is writable as normal documents;
// the central metadata roots (`agents/`, `agents/<slug>`, `skills/`, `templates/`) are managed via panel.
const isAgentDocsFolder = (folder) => /^agents\/[^/]+\/docs(\/|$)/.test(folder);
const isCentralFolder = (folder) =>
  /^(agents|skills|templates)(\/|$)/.test(folder) && !isAgentDocsFolder(folder);
export const cleanRepoPath = (value) =>
  String(value || '')
    .trim()
    .replace(/^\/+|\/+$/g, '');
const isSafePath = (value) =>
  Boolean(value) &&
  !value.split('/').some((part) => !part || part === '.' || part === '..');

/** Files the person sent from the panel ("Upload files here"): one commit/revision in their name. */
export async function uploadFiles(accountId, folder, files) {
  if (!isDocumentsReady()) throw new Error('document storage is not set up');
  const where = cleanRepoPath(folder);
  if (where && (!isSafePath(where) || isCentralFolder(where)))
    throw new Error(
      'upload to a work folder, outside agents/, skills/ and templates/',
    );
  const write = files.map((file) => ({
    path: where ? `${where}/${file.name}` : file.name,
    bytes: file.bytes,
  }));
  if (write.some((file) => !isSafePath(file.path) || isOwned(file.path)))
    throw new Error('invalid file name');
  await syncAccount(accountId);
  const msg =
    write.length === 1
      ? `Uploaded from Gemini Code: ${write[0].path}`
      : `${write.length} files uploaded from Gemini Code`;
  if (!isGithubReady()) {
    writeLocalFiles(
      accountId,
      { write },
      msg,
      authorOf(fetchAccount(accountId)),
    );
    repoChanged(accountId);
    remember(
      accountId,
      [],
      write.map((file) => file.path),
    );
    return { paths: write.map((file) => file.path) };
  }
  await commitFiles(
    repoNameOf(accountId),
    { write },
    write.length === 1
      ? `Uploaded from Gemini Code: ${write[0].path}`
      : `${write.length} files uploaded from Gemini Code`,
    authorOf(fetchAccount(accountId)),
  );
  repoChanged(accountId);
  remember(
    accountId,
    [],
    write.map((file) => file.path),
  );
  return { paths: write.map((file) => file.path) };
}

/** A work folder renamed: everything in it moves in one commit/revision. */
export async function renameFolder(accountId, from, to) {
  if (!isDocumentsReady()) throw new Error('document storage is not set up');
  const [source, target] = [cleanRepoPath(from), cleanRepoPath(to)];
  if (!isSafePath(source) || !isSafePath(target))
    throw new Error('invalid path');
  if (isCentralFolder(source) || isCentralFolder(target))
    throw new Error(
      'agent, template and skill folders are renamed from the dashboard',
    );
  if (!isGithubReady()) {
    const inside = listLocalTree().filter((entry) =>
      entry.path.startsWith(`${source}/`),
    );
    if (!inside.length) throw new Error('empty or unknown folder');
    const write = [];
    for (const entry of inside) {
      const file = readLocalFile(entry.path);
      if (file)
        write.push({
          path: target + entry.path.slice(source.length),
          bytes: file.bytes,
        });
    }
    writeLocalFiles(
      accountId,
      { write, remove: inside.map((entry) => entry.path) },
      `Renamed in Gemini Code: ${source} to ${target}`,
      authorOf(fetchAccount(accountId)),
    );
    repoChanged(accountId);
    remember(
      accountId,
      [],
      [...inside.map((entry) => entry.path), ...write.map((file) => file.path)],
    );
    return { path: target };
  }
  const name = repoNameOf(accountId);
  const inside = (await listTree(name)).filter((entry) =>
    entry.path.startsWith(`${source}/`),
  );
  if (!inside.length) throw new Error('empty or unknown folder');
  const write = [];
  for (const entry of inside)
    write.push({
      path: target + entry.path.slice(source.length),
      bytes: await readBlob(name, entry.sha),
    });
  await commitFiles(
    name,
    { write, remove: inside.map((entry) => entry.path) },
    `Renamed in Gemini Code: ${source} to ${target}`,
    authorOf(fetchAccount(accountId)),
  );
  repoChanged(accountId);
  // What the central remembers writing goes with the files, or saving the same text there again would be skipped.
  remember(
    accountId,
    [],
    [...inside.map((entry) => entry.path), ...write.map((file) => file.path)],
  );
  return { path: target };
}

/** A work file or a whole work folder deleted from the panel: one commit/revision in the person's name. */
export async function removePath(accountId, filePath) {
  if (!isDocumentsReady()) throw new Error('document storage is not set up');
  const where = cleanRepoPath(filePath);
  if (!isSafePath(where)) throw new Error('invalid path');
  if (isCentralFolder(where) || isOwned(where))
    throw new Error(
      'agents, templates and skills are deleted from the dashboard, not as files',
    );
  if (!isGithubReady()) {
    const remove = listLocalTree()
      .map((entry) => entry.path)
      .filter((entry) => entry === where || entry.startsWith(`${where}/`));
    if (!remove.length) throw new Error('unknown file or folder');
    writeLocalFiles(
      accountId,
      { remove },
      `Apagado no Gemini Code: ${where}`,
      authorOf(fetchAccount(accountId)),
    );
    repoChanged(accountId);
    remember(accountId, [], remove);
    return { path: where, removed: remove.length };
  }
  const name = repoNameOf(accountId);
  const remove = (await listTree(name))
    .map((entry) => entry.path)
    .filter((entry) => entry === where || entry.startsWith(`${where}/`));
  if (!remove.length) throw new Error('unknown file or folder');
  await commitFiles(
    name,
    { remove },
    `Apagado no Assistant: ${where}`,
    authorOf(fetchAccount(accountId)),
  );
  repoChanged(accountId);
  remember(accountId, [], remove);
  return { path: where, removed: remove.length };
}

// --- The agents' file tools (29/10/2026): files read and written in the
// repository by the central itself, so a file never wakes a computer. What
// the central owns (instructions, routines, decisions, skills, templates)
// changes only through its own ways, never as a file the agent writes.

const MAX_WRITE_BYTES = 1024 * 1024;
const agentAuthor = (bot) => ({
  name: `${bot.name} via Gemini Code`,
  email: 'agent@gemini-code.invalid',
});

const OWNED_HINT =
  'esse arquivo é da central: instruções mudam pelos ajustes do agente, rotinas com routine_create, decisões com memory_save e habilidades com skill_save';

/** The account's repository, made the first time an agent needs it. */
async function repoFor(accountId) {
  if (!isGithubReady())
    throw new Error('GitHub files are not set up on this server');
  if (!fetchAccount(accountId)?.repo) await syncAccount(accountId);
  return repoNameOf(accountId);
}

/** The repository's files, or those inside one folder, with their sizes. */
export async function listWorkFiles(accountId, folder = '') {
  const where = cleanRepoPath(folder);
  if (where && !isSafePath(where)) throw new Error('invalid folder');
  if (!isGithubReady()) {
    if (!syncedAtOf(accountId)) await syncAccount(accountId);
    const tree = listLocalTree();
    return tree
      .filter((entry) => !where || entry.path.startsWith(`${where}/`))
      .map((entry) => ({
        path: entry.path,
        size: entry.size ?? 0,
        updatedAt: entry.updatedAt,
      }));
  }
  const tree = await listTree(await repoFor(accountId));
  return tree
    .filter((entry) => !where || entry.path.startsWith(`${where}/`))
    .map((entry) => ({ path: entry.path, size: entry.size ?? 0 }));
}

export async function readWorkFile(accountId, filePath) {
  const where = cleanRepoPath(filePath);
  if (!isSafePath(where)) throw new Error('invalid path');
  if (!isGithubReady()) {
    if (!syncedAtOf(accountId)) await syncAccount(accountId);
    const file = readLocalFile(where);
    if (!file) return null;
    const isText = !file.bytes.includes(0);
    if (!isText)
      return { path: where, isText, size: file.bytes.length, content: '' };
    return {
      path: where,
      isText,
      size: file.bytes.length,
      content: file.content,
    };
  }
  const file = await readFile(await repoFor(accountId), where);
  if (!file) return null;
  const isText = !file.bytes.includes(0);
  if (!isText)
    return { path: where, isText, size: file.bytes.length, content: '' };
  // Whole: file_read shows it in parts (engine/file-view.js), so nothing past a cut is out of reach.
  return {
    path: where,
    isText,
    size: file.bytes.length,
    content: file.content,
  };
}

/** A file written by an agent: one commit/revision in its name; the central's own files are refused. */
export async function writeWorkFile(bot, filePath, content) {
  const where = cleanRepoPath(filePath);
  if (!isSafePath(where)) throw new Error('invalid path');
  if (isOwned(where)) throw new Error(OWNED_HINT);
  const text = String(content ?? '');
  if (Buffer.byteLength(text) > MAX_WRITE_BYTES)
    throw new Error(
      'file over 1 MB: make it on the computer, it comes back as a commit at the end of the turn',
    );
  if (!isGithubReady()) {
    if (!syncedAtOf(bot.accountId)) await syncAccount(bot.accountId);
    const current = readLocalFile(where);
    if (current?.content === text) return { path: where, isChanged: false };
    writeLocalFiles(
      bot.accountId,
      { write: [{ path: where, content: text }] },
      `${where} via Gemini Code`,
      { name: `${bot.name} (agent)`, email: 'agent@gemini-code.local' },
    );
    repoChanged(bot.accountId);
    return { path: where, isChanged: true, isNew: !current };
  }
  const name = await repoFor(bot.accountId);
  const current = await readFile(name, where);
  if (current?.content === text) return { path: where, isChanged: false };
  await commitFiles(
    name,
    { write: [{ path: where, content: text }] },
    `${where} via Gemini Code`,
    agentAuthor(bot),
  );
  repoChanged(bot.accountId);
  return { path: where, isChanged: true, isNew: !current };
}

export async function deleteWorkFile(bot, filePath) {
  const where = cleanRepoPath(filePath);
  if (!isSafePath(where)) throw new Error('invalid path');
  if (isOwned(where)) throw new Error(OWNED_HINT);
  if (!isGithubReady()) {
    if (!syncedAtOf(bot.accountId)) await syncAccount(bot.accountId);
    if (!readLocalFile(where)) return { path: where, isDeleted: false };
    writeLocalFiles(
      bot.accountId,
      { remove: [where] },
      `Apagado via Gemini Code: ${where}`,
      { name: `${bot.name} (agent)`, email: 'agent@gemini-code.local' },
    );
    repoChanged(bot.accountId);
    return { path: where, isDeleted: true };
  }
  const name = await repoFor(bot.accountId);
  if (!(await readFile(name, where))) return { path: where, isDeleted: false };
  await commitFiles(
    name,
    { remove: [where] },
    `Apagado via Gemini Code: ${where}`,
    agentAuthor(bot),
  );
  repoChanged(bot.accountId);
  return { path: where, isDeleted: true };
}

export const listFiles = (accountId) =>
  isGithubReady()
    ? listTree(repoNameOf(accountId))
    : Promise.resolve(listLocalTree());
export const openFile = (accountId, filePath) =>
  isGithubReady()
    ? readFile(repoNameOf(accountId), filePath).then(
        (file) =>
          file && { path: file.path, sha: file.sha, content: file.content },
      )
    : Promise.resolve(readLocalFile(filePath)).then(
        (file) =>
          file && { path: file.path, sha: file.sha, content: file.content },
      );
export const historyOf = (accountId, filePath) =>
  isGithubReady()
    ? fileHistory(repoNameOf(accountId), filePath)
    : Promise.resolve(localFileHistory(accountId, filePath));
export const diffOf = (accountId, sha, filePath) =>
  isGithubReady()
    ? fileDiff(repoNameOf(accountId), sha, filePath)
    : Promise.resolve(localFileDiff(accountId, sha, filePath));

/** GitHub's signature on a webhook: sha256 HMAC of the raw body with the shared secret. */
export function isSignedByGithub(rawBody, signature) {
  if (!config.githubWebhookSecret || !signature?.startsWith('sha256='))
    return false;
  const expected = Buffer.from(
    `sha256=${createHmac('sha256', config.githubWebhookSecret).update(rawBody).digest('hex')}`,
  );
  const given = Buffer.from(signature);
  return expected.length === given.length && timingSafeEqual(expected, given);
}

/**
 * A push on a person's repository that the central did not make (an edit on
 * github.com): every file it changed is read back into the central.
 */
export async function onPush(payload) {
  const accountId = payload.repository?.name?.match(/^assistant-(.+)$/)?.[1];
  if (
    !accountId ||
    payload.ref !== `refs/heads/${payload.repository.default_branch || 'main'}`
  )
    return 0;
  let applied = 0;
  const paths = new Set(
    payload.commits.flatMap((commit) => [
      ...(commit.added || []),
      ...(commit.modified || []),
    ]),
  );
  for (const path of paths) {
    const file = await readFile(repoNameOf(accountId), path);
    if (!file || written(accountId)[path] === file.content) continue;
    remember(accountId, [{ path, content: file.content }], []);
    if (applyEdit(accountId, path, file.content)) applied++;
  }
  repoChanged(accountId);
  return applied;
}

/** When the account's repository last matched the central, or null before its first sync. */
export const syncedAtOf = (accountId) =>
  db.query('SELECT repo_synced_at FROM accounts WHERE id = ?').get(accountId)
    ?.repo_synced_at ?? null;
