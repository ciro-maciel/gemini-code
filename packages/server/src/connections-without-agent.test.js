import { expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'assistant-connections-'),
);
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const { router } = await import('./server.js');
const { fail } = await import('./http.js');

// 26/11/2026: a fresh install has no agent yet, and signing in to GitHub
// answered "create a bot before connecting apps". A connection is the
// account's; it is made with no agent at all.
test('a service connects on an account with no agent yet', async () => {
  db.query(
    "INSERT INTO accounts (id, email, status, created_at, last_seen_at) VALUES ('acc-fresh', 'fresh@exemplo.com', 'active', ?, ?)",
  ).run(now(), now());
  const account = { id: 'acc-fresh', isOwner: true };
  const match = router.match('POST', '/api/connections');
  const req = new Request('http://x/api/connections', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      serverName: 'io.github.github/github-mcp-server',
      title: 'GitHub',
      // Nothing answers here: the connection is made and its first try fails.
      url: 'http://127.0.0.1:9/mcp',
    }),
  });
  let response;
  try {
    response = await match.handler({
      req,
      url: new URL(req.url),
      params: {},
      account,
    });
  } catch (error) {
    response = fail(error);
  }
  const body = await response.json();
  expect(response.status).toBe(201);
  expect(body.title).toBe('GitHub');
  const row = db
    .query('SELECT account_id, bot_id FROM connections WHERE id = ?')
    .get(body.id);
  expect(row).toEqual({ account_id: 'acc-fresh', bot_id: null });
});
