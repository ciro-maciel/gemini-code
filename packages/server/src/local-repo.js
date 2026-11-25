import { createHash } from 'node:crypto';
import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  rmSync,
  rmdirSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';

import { config } from './config.js';
import { db, newId, now } from './db.js';

// Local document store rooted at config.localWorkspaceDir.
// Mirrors the interface of github.js so Gemini Code works 100% locally with
// zero GitHub setup, while keeping revision history and diffs via SQLite
// (plus git log/show fallback when the workspace is a Git repository).

const IGNORED_DIRS = new Set([
  '.git',
  'node_modules',
  'dist',
  '.next',
  '.turbo',
  '.cache',
]);
const IGNORED_FILES = new Set(['.DS_Store', '.encryption-key']);

export function localRootDir() {
  return path.resolve(config.localWorkspaceDir);
}

export function ensureLocalWorkspace() {
  const root = localRootDir();
  mkdirSync(root, { recursive: true });
  return root;
}

export function cleanLocalPath(value) {
  return String(value || '')
    .trim()
    .replace(/\\/g, '/')
    .replace(/^\/+|\/+$/g, '');
}

export function isSafeLocalPath(value) {
  const clean = cleanLocalPath(value);
  return (
    Boolean(clean) &&
    !clean.split('/').some((part) => !part || part === '.' || part === '..')
  );
}

export function resolveLocalPath(relPath) {
  const clean = cleanLocalPath(relPath);
  if (!isSafeLocalPath(clean)) throw new Error('caminho inválido');
  const root = localRootDir();
  const full = path.resolve(root, clean);
  if (full !== root && !full.startsWith(root + path.sep))
    throw new Error('caminho inválido');
  return { clean, full, root };
}

export function ensureLocalFolder(relFolder) {
  const clean = cleanLocalPath(relFolder);
  if (!clean) return ensureLocalWorkspace();
  const { full } = resolveLocalPath(clean);
  mkdirSync(full, { recursive: true });
  return full;
}

const shaOf = (bytes) => createHash('sha1').update(bytes).digest('hex');

/** Every file in the local workspace, recursively, with path, sha, size and updatedAt. */
export function listLocalTree() {
  const root = localRootDir();
  if (!existsSync(root)) return [];
  const entries = [];
  const walk = (dir, prefix) => {
    let items;
    try {
      items = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of items) {
      if (item.isSymbolicLink()) continue;
      if (item.isDirectory()) {
        if (IGNORED_DIRS.has(item.name)) continue;
        walk(
          path.join(dir, item.name),
          prefix ? `${prefix}/${item.name}` : item.name,
        );
        continue;
      }
      if (!item.isFile()) continue;
      if (IGNORED_FILES.has(item.name)) continue;
      const rel = prefix ? `${prefix}/${item.name}` : item.name;
      const full = path.join(dir, item.name);
      try {
        const stat = statSync(full);
        const bytes = readFileSync(full);
        entries.push({
          path: rel,
          sha: shaOf(bytes),
          size: stat.size,
          updatedAt: Math.floor(stat.mtimeMs / 1000),
        });
      } catch {
        // Skip transient or unreadable files.
      }
    }
  };
  walk(root, '');
  entries.sort((a, b) => a.path.localeCompare(b.path));
  return entries;
}

/** Reads one file from the local workspace, or returns null if missing. */
export function readLocalFile(relPath) {
  const clean = cleanLocalPath(relPath);
  if (!isSafeLocalPath(clean)) return null;
  const { full } = resolveLocalPath(clean);
  if (!existsSync(full)) return null;
  let stat;
  try {
    stat = statSync(full);
  } catch {
    return null;
  }
  if (!stat.isFile()) return null;
  const bytes = readFileSync(full);
  return {
    path: clean,
    sha: shaOf(bytes),
    content: bytes.toString('utf8'),
    bytes,
    size: stat.size,
    updatedAt: Math.floor(stat.mtimeMs / 1000),
  };
}

function pruneEmptyParents(dir, root) {
  let current = dir;
  while (current.startsWith(root + path.sep) && current !== root) {
    try {
      const left = readdirSync(current);
      if (left.length > 0) break;
      rmdirSync(current);
      current = path.dirname(current);
    } catch {
      break;
    }
  }
}

/** Writes and/or removes files in the local workspace and records revisions in SQLite. */
export function writeLocalFiles(
  accountId,
  { write = [], remove = [] } = {},
  message = 'Atualizado no Gemini Code',
  author = null,
) {
  if (!write.length && !remove.length) return null;
  const root = ensureLocalWorkspace();
  const authorName = author?.name || author?.email || 'Local';
  const at = now();
  let lastId = null;

  for (const file of write) {
    const { clean, full } = resolveLocalPath(file.path);
    mkdirSync(path.dirname(full), { recursive: true });
    const bytes = file.bytes
      ? Buffer.from(file.bytes)
      : Buffer.from(String(file.content ?? ''), 'utf8');
    writeFileSync(full, bytes);
    const isText = !bytes.includes(0);
    const id = newId();
    lastId = id;
    if (accountId) {
      db.query(
        'INSERT INTO document_revisions (id, account_id, path, content, is_deleted, message, author, created_at) VALUES (?, ?, ?, ?, 0, ?, ?, ?)',
      ).run(
        id,
        accountId,
        clean,
        isText ? bytes.toString('utf8') : null,
        message,
        authorName,
        at,
      );
    }
  }

  for (const rel of remove) {
    const { clean, full } = resolveLocalPath(rel);
    if (existsSync(full)) {
      rmSync(full, { force: true });
      pruneEmptyParents(path.dirname(full), root);
    }
    const id = newId();
    lastId = id;
    if (accountId) {
      db.query(
        'INSERT INTO document_revisions (id, account_id, path, content, is_deleted, message, author, created_at) VALUES (?, ?, ?, NULL, 1, ?, ?, ?)',
      ).run(id, accountId, clean, message, authorName, at);
    }
  }

  return lastId;
}

function hasGitRepo() {
  return existsSync(path.join(localRootDir(), '.git'));
}

function runGit(args) {
  try {
    const proc = Bun.spawnSync(['git', ...args], {
      cwd: localRootDir(),
      stdout: 'pipe',
      stderr: 'pipe',
    });
    if (proc.exitCode !== 0) return null;
    return new TextDecoder().decode(proc.stdout);
  } catch {
    return null;
  }
}

/** Revision history of one file (newest first), from SQLite revisions and optional git log fallback. */
export function localFileHistory(accountId, relPath, limit = 20) {
  const clean = cleanLocalPath(relPath);
  if (!isSafeLocalPath(clean)) return [];
  const rows = accountId
    ? db
        .query(
          'SELECT id, message, author, created_at FROM document_revisions WHERE account_id = ? AND path = ? ORDER BY created_at DESC, rowid DESC LIMIT ?',
        )
        .all(accountId, clean, limit)
    : [];
  const history = rows.map((row) => ({
    sha: row.id,
    message: row.message,
    author: row.author,
    at: new Date(row.created_at * 1000).toISOString(),
  }));

  if (history.length < limit && hasGitRepo()) {
    const out = runGit([
      'log',
      `-n`,
      String(limit - history.length),
      '--format=%H%x1f%an%x1f%aI%x1f%s',
      '--',
      clean,
    ]);
    if (out) {
      const seen = new Set(history.map((item) => item.sha));
      for (const line of out.trim().split('\n')) {
        if (!line) continue;
        const [sha, author, at, message] = line.split('\x1f');
        if (sha && !seen.has(sha)) {
          seen.add(sha);
          history.push({
            sha,
            message: message || '',
            author: author || 'Git',
            at: at || '',
          });
        }
      }
    }
  }
  return history;
}

/** Simple unified line diff between two strings (for SQLite revisions). */
export function unifiedDiff(beforeText, afterText) {
  const a = beforeText === '' ? [] : String(beforeText).split('\n');
  const b = afterText === '' ? [] : String(afterText).split('\n');
  if (beforeText === afterText) return '';

  // Fast fallback for very large files so diffing never stalls the event loop.
  if (a.length * b.length > 400_000) {
    let start = 0;
    while (start < a.length && start < b.length && a[start] === b[start])
      start++;
    let endA = a.length - 1;
    let endB = b.length - 1;
    while (endA >= start && endB >= start && a[endA] === b[endB]) {
      endA--;
      endB--;
    }
    const out = [
      `@@ -${start + 1},${Math.max(0, endA - start + 1)} +${start + 1},${Math.max(0, endB - start + 1)} @@`,
    ];
    for (let i = start; i <= endA; i++) out.push(`-${a[i]}`);
    for (let i = start; i <= endB; i++) out.push(`+${b[i]}`);
    return out.join('\n');
  }

  const m = a.length;
  const n = b.length;
  const dp = Array.from({ length: m + 1 }, () => new Uint32Array(n + 1));
  for (let i = m - 1; i >= 0; i--) {
    for (let j = n - 1; j >= 0; j--) {
      dp[i][j] =
        a[i] === b[j]
          ? dp[i + 1][j + 1] + 1
          : Math.max(dp[i + 1][j], dp[i][j + 1]);
    }
  }

  const ops = [];
  let i = 0;
  let j = 0;
  while (i < m && j < n) {
    if (a[i] === b[j]) {
      ops.push({ type: ' ', text: a[i], oldLine: i + 1, newLine: j + 1 });
      i++;
      j++;
    } else if (dp[i + 1][j] >= dp[i][j + 1]) {
      ops.push({ type: '-', text: a[i], oldLine: i + 1, newLine: j + 1 });
      i++;
    } else {
      ops.push({ type: '+', text: b[j], oldLine: i + 1, newLine: j + 1 });
      j++;
    }
  }
  while (i < m) {
    ops.push({ type: '-', text: a[i], oldLine: i + 1, newLine: j + 1 });
    i++;
  }
  while (j < n) {
    ops.push({ type: '+', text: b[j], oldLine: i + 1, newLine: j + 1 });
    j++;
  }

  const CONTEXT = 3;
  const changed = ops
    .map((op, index) => (op.type !== ' ' ? index : -1))
    .filter((index) => index >= 0);
  if (!changed.length) return '';

  const hunks = [];
  let rangeStart = Math.max(0, changed[0] - CONTEXT);
  let rangeEnd = Math.min(ops.length - 1, changed[0] + CONTEXT);
  for (let k = 1; k < changed.length; k++) {
    const nextStart = Math.max(0, changed[k] - CONTEXT);
    const nextEnd = Math.min(ops.length - 1, changed[k] + CONTEXT);
    if (nextStart <= rangeEnd + 1) {
      rangeEnd = Math.max(rangeEnd, nextEnd);
    } else {
      hunks.push([rangeStart, rangeEnd]);
      rangeStart = nextStart;
      rangeEnd = nextEnd;
    }
  }
  hunks.push([rangeStart, rangeEnd]);

  const lines = [];
  for (const [start, end] of hunks) {
    const slice = ops.slice(start, end + 1);
    const oldStart = slice[0].oldLine;
    const newStart = slice[0].newLine;
    const oldCount = slice.filter((op) => op.type !== '+').length;
    const newCount = slice.filter((op) => op.type !== '-').length;
    lines.push(`@@ -${oldStart},${oldCount} +${newStart},${newCount} @@`);
    for (const op of slice) lines.push(`${op.type}${op.text}`);
  }
  return lines.join('\n');
}

/** Unified diff for one revision id (SQLite revision or git commit sha). */
export function localFileDiff(accountId, sha, relPath) {
  const clean = cleanLocalPath(relPath);
  if (!isSafeLocalPath(clean) || !sha) return '';
  if (accountId) {
    const current = db
      .query(
        'SELECT rowid, content, is_deleted FROM document_revisions WHERE id = ? AND account_id = ? AND path = ?',
      )
      .get(sha, accountId, clean);
    if (current) {
      const prev = db
        .query(
          'SELECT content, is_deleted FROM document_revisions WHERE account_id = ? AND path = ? AND rowid < ? ORDER BY rowid DESC LIMIT 1',
        )
        .get(accountId, clean, current.rowid);
      const before =
        prev && !prev.is_deleted && prev.content != null ? prev.content : '';
      const after =
        !current.is_deleted && current.content != null ? current.content : '';
      return unifiedDiff(before, after);
    }
  }
  if (hasGitRepo() && /^[0-9a-f]{7,40}$/i.test(sha)) {
    const out = runGit(['show', '--format=', '--unified=3', sha, '--', clean]);
    if (!out) return '';
    const at = out.indexOf('@@');
    return at >= 0 ? out.slice(at).trimEnd() : '';
  }
  return '';
}
