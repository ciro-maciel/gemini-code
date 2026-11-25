import { db, newId, now } from './db.js';
import {
  AI_TOKEN_NAME,
  aiTokenFor,
  GEMINI_TOKEN_NAME,
  geminiTokenFor,
} from './ai-accounts.js';
import { decrypt, encrypt } from './secrets.js';

// A bot's vault (23/10/2026): the keys a person gives a bot for its terminal
// (GITHUB_TOKEN, CLAUDE_CODE_OAUTH_TOKEN...). They live encrypted here, in the
// control server, never on the bot's computer: each command gets them as
// environment variables for as long as it runs, and whatever a command prints
// is cleaned of their values before the model or the conversation sees it.
// The panel and the model only ever see the names.
//
// A secret is a record addressed by its UUID (house rule, 25/10/2026): the
// API reads, changes and removes it by id. Its name is configuration, not an
// address: it is the environment variable a command reads ($GITHUB_TOKEN), so
// the bot and its commands keep using the name, one per bot.

export const SECRET_NAME = /^[A-Z][A-Z0-9_]{1,63}$/;
const MAX_SECRETS = 30;
const MAX_VALUE = 16_000;
// Shorter values are too likely to appear by chance in ordinary output.
const MIN_REDACTED = 6;

const present = (row) => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

/** What the panel sees of the vault: ids, names and dates, never a value. */
export function listSecrets(botId) {
  return db
    .query(
      'SELECT id, name, created_at, updated_at FROM bot_secrets WHERE bot_id = ? ORDER BY name',
    )
    .all(botId)
    .map(present);
}

/** One secret of this bot by its id (never its value), or null: another bot's id finds nothing. */
export function fetchSecret(botId, secretId) {
  if (typeof secretId !== 'string') return null;
  const row = db
    .query(
      'SELECT id, name, created_at, updated_at FROM bot_secrets WHERE bot_id = ? AND id = ?',
    )
    .get(botId, secretId);
  return row ? present(row) : null;
}

class VaultError extends Error {}
export const isVaultError = (error) => error instanceof VaultError;
/** A name the bot already has: the value is changed in that secret, by its id. */
export class SecretNameTaken extends VaultError {}

function checkValue(value) {
  const text = String(value ?? '');
  if (!text.trim()) throw new VaultError('falta o valor');
  if (text.length > MAX_VALUE)
    throw new VaultError(`o valor passa de ${MAX_VALUE} caracteres`);
  return text;
}

/** Puts a new secret in the vault. Throws with a message a person can read. */
export async function createSecret(botId, name, value) {
  if (!SECRET_NAME.test(String(name)))
    throw new VaultError(
      'o nome é em maiúsculas, com letras, números e _, como GITHUB_TOKEN',
    );
  const text = checkValue(value);
  if (
    db
      .query('SELECT 1 FROM bot_secrets WHERE bot_id = ? AND name = ?')
      .get(botId, name)
  )
    throw new SecretNameTaken(`já há ${name} no cofre; troque o valor nela`);
  if (
    db
      .query('SELECT COUNT(*) AS count FROM bot_secrets WHERE bot_id = ?')
      .get(botId).count >= MAX_SECRETS
  )
    throw new VaultError(`este bot já tem ${MAX_SECRETS} chaves no cofre`);
  const id = newId();
  db.query(
    'INSERT INTO bot_secrets (id, bot_id, name, value, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
  ).run(id, botId, name, await encrypt(text), now(), now());
  return fetchSecret(botId, id);
}

/** Replaces the value of one secret, by its id; null when the bot has no such id. */
export async function updateSecret(botId, secretId, value) {
  if (!fetchSecret(botId, secretId)) return null;
  const sealed = await encrypt(checkValue(value));
  db.query(
    'UPDATE bot_secrets SET value = ?, updated_at = ? WHERE bot_id = ? AND id = ?',
  ).run(sealed, now(), botId, secretId);
  return fetchSecret(botId, secretId);
}

/** Takes one secret out of the vault, by its id; false when the bot has no such id. */
export function deleteSecret(botId, secretId) {
  if (typeof secretId !== 'string') return false;
  return (
    db
      .query('DELETE FROM bot_secrets WHERE bot_id = ? AND id = ?')
      .run(botId, secretId).changes > 0
  );
}

/** The vault, opened, for one command: { NAME: value }. */
export async function openVault(botId) {
  const rows = db
    .query('SELECT name, value FROM bot_secrets WHERE bot_id = ?')
    .all(botId);
  const opened = {};
  for (const row of rows) opened[row.name] = await decrypt(row.value);
  // The AI accounts inject their CLI tokens into the command environment (never written to disk).
  const geminiToken = await geminiTokenFor(botId);
  if (geminiToken && !opened[GEMINI_TOKEN_NAME])
    opened[GEMINI_TOKEN_NAME] = geminiToken;
  const aiToken = await aiTokenFor(botId);
  if (aiToken && !opened[AI_TOKEN_NAME]) opened[AI_TOKEN_NAME] = aiToken;
  return opened;
}

/** Every value of the vault taken out of a text, its name left in its place. */
export function redact(text, vault) {
  let clean = String(text ?? '');
  const entries = Object.entries(vault)
    .filter(
      ([, value]) => typeof value === 'string' && value.length >= MIN_REDACTED,
    )
    .sort((a, b) => b[1].length - a[1].length);
  for (const [name, value] of entries)
    clean = clean.split(value).join(`[cofre: ${name}]`);
  return clean;
}
