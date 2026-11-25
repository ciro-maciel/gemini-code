import { config } from './config.js';
import { db, newId, now } from './db.js';
import { upsertAccount } from './accounts.js';
import { encrypt } from './secrets.js';

// Gemini Code runs for the person at this machine's keyboard (the server
// answers only on 127.0.0.1): every request is theirs, with no sign-in.
const LOCAL_ACCOUNT_ID = 'local-developer';

let hasSeededLocalGemini = false;

/** Ensures the local account exists and auto-links GEMINI_API_KEY if present in env. */
async function ensureLocalAccount() {
  const name = process.env.GEMINI_CODE_USER || process.env.USER || 'Developer';
  const email = config.ownerEmail || 'developer@local.gemini-code';
  const existing = db
    .query('SELECT * FROM accounts WHERE id = ?')
    .get(LOCAL_ACCOUNT_ID);
  if (!existing) {
    db.query(
      'INSERT INTO accounts (id, email, name, status, is_owner, created_at, last_seen_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    ).run(LOCAL_ACCOUNT_ID, email, name, 'active', now(), now());
    db.query('UPDATE bots SET account_id = ? WHERE account_id IS NULL').run(
      LOCAL_ACCOUNT_ID,
    );
    db.query(
      'UPDATE connections SET account_id = ? WHERE account_id IS NULL',
    ).run(LOCAL_ACCOUNT_ID);
  }
  if (!hasSeededLocalGemini && config.geminiApiKey) {
    hasSeededLocalGemini = true;
    const count = db
      .query('SELECT COUNT(*) AS count FROM ai_accounts WHERE account_id = ?')
      .get(LOCAL_ACCOUNT_ID).count;
    if (count === 0) {
      const models = config.models.map((model) => model.id);
      db.query(
        'INSERT INTO ai_accounts (id, account_id, name, token, provider, models, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        newId(),
        LOCAL_ACCOUNT_ID,
        'Google Gemini (env)',
        await encrypt(config.geminiApiKey),
        'google',
        JSON.stringify(models),
        now(),
      );
    }
  }
  return upsertAccount({ id: LOCAL_ACCOUNT_ID, email, name });
}

/** The account behind every request: the person at this machine. */
export const authenticate = () => ensureLocalAccount();
