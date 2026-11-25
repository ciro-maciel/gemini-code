import {
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

// Hybrid local runtime: lets Gemini Code run directly on the user's machine
// (like Claude Code) with zero Sprites or cloud setup. When SPRITES_TOKEN is
// configured and COMPUTER_MODE=sprites, cloud Sprites take over instead.

export const isLocalMode = () =>
  !config.spritesToken || config.computerMode === 'local';

export function ensureLocalWorkspace() {
  mkdirSync(config.localWorkspaceDir, { recursive: true });
  return config.localWorkspaceDir;
}

/** Resolves a path inside the local workspace (maps /home/sprite/workspace -> localWorkspaceDir). */
export function resolveLocalPath(filePath) {
  const workspace = ensureLocalWorkspace();
  const raw = String(filePath || '').trim();
  if (!raw) return workspace;
  if (
    raw === '/home/sprite/workspace' ||
    raw.startsWith('/home/sprite/workspace/')
  ) {
    const rel = raw.slice('/home/sprite/workspace'.length).replace(/^\/+/, '');
    return path.resolve(workspace, rel);
  }
  if (raw.startsWith('/home/sprite/.assistant/')) {
    const rel = raw.slice('/home/sprite/.assistant/'.length);
    return path.resolve(config.dataDir, 'assistant-local', rel);
  }
  return path.isAbsolute(raw)
    ? path.resolve(raw)
    : path.resolve(workspace, raw);
}

/** Runs a bash command locally inside the workspace with optional vault secrets in env. */
export async function runLocalCommand(
  command,
  { timeoutSeconds = 120, cwd, maxBytes = 60_000, secrets = null } = {},
) {
  const workdir = cwd ? resolveLocalPath(cwd) : ensureLocalWorkspace();
  mkdirSync(workdir, { recursive: true });
  const env = { ...process.env };
  if (secrets && typeof secrets === 'object') {
    for (const [key, value] of Object.entries(secrets)) {
      if (/^[A-Z][A-Z0-9_]*$/.test(key) && typeof value === 'string')
        env[key] = value;
    }
  }
  const shell =
    process.platform === 'win32'
      ? ['cmd', '/c', command]
      : ['bash', '-lc', command];
  const proc = Bun.spawn(shell, {
    cwd: workdir,
    env,
    stdout: 'pipe',
    stderr: 'pipe',
  });
  let isTimedOut = false;
  const timer = setTimeout(() => {
    isTimedOut = true;
    try {
      proc.kill('SIGKILL');
    } catch {}
  }, timeoutSeconds * 1000);

  try {
    const [stdout, stderr, exitCode] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
      proc.exited,
    ]);
    const combined = [stdout, stderr]
      .filter(Boolean)
      .join(stdout && stderr && !stdout.endsWith('\n') ? '\n' : '');
    const output = Buffer.from(combined, 'utf8')
      .subarray(0, maxBytes)
      .toString('utf8');
    return { exitCode: isTimedOut ? 124 : exitCode, output, isTimedOut };
  } finally {
    clearTimeout(timer);
  }
}

export async function readLocalFile(filePath) {
  return readFileSync(resolveLocalPath(filePath));
}

export async function writeLocalFile(filePath, content) {
  const target = resolveLocalPath(filePath);
  mkdirSync(path.dirname(target), { recursive: true });
  writeFileSync(target, content);
}

const SKIP_DIRS = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  '.cache',
  '__pycache__',
]);

/** Cross-platform recursive file listing inside the local workspace. */
export function listLocalFiles({ sinceSeconds = null, limit = 200 } = {}) {
  const root = ensureLocalWorkspace();
  const found = [];
  const walk = (dir, depth) => {
    if (depth > 4 || !existsSync(dir)) return;
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (entry.name.startsWith('.') || SKIP_DIRS.has(entry.name)) continue;
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (existsSync(path.join(full, '.git'))) continue;
        walk(full, depth + 1);
      } else if (entry.isFile()) {
        try {
          const stats = statSync(full);
          const modifiedAt = Math.floor(stats.mtimeMs / 1000);
          if (sinceSeconds && modifiedAt < Math.floor(sinceSeconds)) continue;
          found.push({
            path: full,
            name: entry.name,
            size: stats.size,
            modifiedAt,
          });
        } catch {}
      }
    }
  };
  walk(root, 0);
  return found.sort((a, b) => b.modifiedAt - a.modifiedAt).slice(0, limit);
}
