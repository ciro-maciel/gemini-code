import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'assistant-api-keys-'),
);
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const { createApiKey, listApiKeys, revokeApiKey } = await import(
  './api-keys.js'
);
const { authenticate } = await import('./auth.js');

// 10/11/2026: the house engineering read the Assistant by borrowing the token of a Chrome tab.
// A key acts as the account that made it, rides only in a header, and is kept only as a hash.

db.query(
  "INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('acc-key', 'chave@exemplo.com', 'Ana', 'active', ?, ?)",
).run(now(), now());
const call = (headers, query = '') =>
  authenticate(
    new Request(`https://x/api/bots${query}`, { headers }),
    new URL(`https://x/api/bots${query}`),
  );

describe('API keys', () => {
  test('a key opens its own account, through the worker header or straight', async () => {
    const { key } = createApiKey('acc-key', 'Engenharia');
    expect(
      (await call({ 'x-assistant-authorization': `Bearer ${key}` })).id,
    ).toBe('acc-key');
    expect((await call({ authorization: `Bearer ${key}` })).id).toBe('acc-key');
  });

  test('only the hash is kept, and the listing never shows the key', () => {
    const { key, id } = createApiKey('acc-key', 'Script');
    const row = db.query('SELECT * FROM api_keys WHERE id = ?').get(id);
    expect(JSON.stringify(row)).not.toContain(key);
    expect(JSON.stringify(listApiKeys('acc-key'))).not.toContain(key);
  });

  test('a revoked or unknown key is refused', async () => {
    const { key, id } = createApiKey('acc-key', 'Velha');
    revokeApiKey('acc-key', id);
    await expect(
      call({ 'x-assistant-authorization': `Bearer ${key}` }),
    ).rejects.toThrow('revogada');
    await expect(
      call({ 'x-assistant-authorization': 'Bearer ak_inventada' }),
    ).rejects.toThrow('revogada');
  });

  test('a key in the address is not accepted', async () => {
    const { key } = createApiKey('acc-key', 'Na URL');
    await expect(call({}, `?token=${key}`)).rejects.toThrow();
  });

  test('a nameless key is refused', () => {
    expect(() => createApiKey('acc-key', ' ')).toThrow('nome');
  });
});
