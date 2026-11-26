import { expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'gc-github-move-'));
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now, MIGRATIONS } = await import('./db.js');

// 26/11/2026: a GitHub connection made before the Gemini Code app kept asking
// for a pasted token, so the new "Sign in with GitHub" never showed.
test('a GitHub connection waiting for a token now offers the app sign-in', () => {
  const insert = db.query(
    "INSERT INTO connections (id, account_id, server_name, title, url, transport, status, status_detail, tools, created_at, updated_at) VALUES (?, 'acc', ?, ?, ?, 'streamable', 'needs_secret', 'paste a token', '[]', ?, ?)",
  );
  insert.run(
    'gh',
    'github',
    'GitHub',
    'https://api.githubcopilot.com/mcp/',
    now(),
    now(),
  );
  insert.run('acme', 'acme', 'Acme', 'https://mcp.acme.dev/mcp', now(), now());
  db.exec(MIGRATIONS.find((sql) => sql.includes("'needs_device'")));
  const status = (id) =>
    db
      .query('SELECT status, status_detail FROM connections WHERE id = ?')
      .get(id);
  expect(status('gh')).toEqual({ status: 'needs_device', status_detail: null });
  // Any other service still takes its pasted token.
  expect(status('acme')).toEqual({
    status: 'needs_secret',
    status_detail: 'paste a token',
  });
});
