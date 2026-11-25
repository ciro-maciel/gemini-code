import { createHash, randomBytes } from 'node:crypto';
import { db, newId, now } from './db.js';
import { fetchAccount } from './accounts.js';

// Keys for what is not a person at the panel (10/11/2026): the house engineering in Claude Code,
// and any customer's script, read and act on their own account without borrowing a browser's
// login. A key is shown once; only its hash is kept. It acts as the account that made it.

const PREFIX = 'ak_';
const hashOf = (key) => createHash('sha256').update(key).digest('hex');
const shown = (row) => ({
  id: row.id,
  name: row.name,
  prefix: row.prefix,
  createdAt: row.created_at,
  lastUsedAt: row.last_used_at ?? null,
});

export const isApiKey = (token) =>
  typeof token === 'string' && token.startsWith(PREFIX);

/** A new key for the account; `key` is in the answer this once and never again. */
export function createApiKey(accountId, name) {
  const label = String(name ?? '')
    .trim()
    .slice(0, 80);
  if (!label) throw new Error('dê um nome à chave, como "Engenharia"');
  const key = `${PREFIX}${randomBytes(32).toString('base64url')}`;
  const id = newId();
  db.query(
    'INSERT INTO api_keys (id, account_id, name, prefix, hash, created_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, accountId, label, key.slice(0, 10), hashOf(key), now());
  return {
    ...shown(db.query('SELECT * FROM api_keys WHERE id = ?').get(id)),
    key,
  };
}

export function listApiKeys(accountId) {
  return db
    .query(
      'SELECT * FROM api_keys WHERE account_id = ? AND revoked_at IS NULL ORDER BY created_at',
    )
    .all(accountId)
    .map(shown);
}

export function revokeApiKey(accountId, id) {
  return (
    db
      .query(
        'UPDATE api_keys SET revoked_at = ? WHERE id = ? AND account_id = ? AND revoked_at IS NULL',
      )
      .run(now(), id, accountId).changes > 0
  );
}

/** The account a key belongs to, or null for an unknown or revoked key. */
export function accountForApiKey(key) {
  const row = db
    .query(
      'SELECT id, account_id FROM api_keys WHERE hash = ? AND revoked_at IS NULL',
    )
    .get(hashOf(key));
  if (!row) return null;
  db.query('UPDATE api_keys SET last_used_at = ? WHERE id = ?').run(
    now(),
    row.id,
  );
  return fetchAccount(row.account_id);
}
