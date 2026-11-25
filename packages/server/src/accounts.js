import { config } from './config.js';
import { db, now, toApi } from './db.js';
import { DEFAULT_TIMEZONE } from './routines.js';

// An account is a person signed in through Auth. The control server never
// takes an account id from the request: it comes from the verified JWT.

function present(row) {
  const account = toApi(row);
  if (!account) return null;
  account.isOwner = Boolean(account.isOwner);
  return account;
}

export function fetchAccount(accountId) {
  return present(
    db.query('SELECT * FROM accounts WHERE id = ?').get(accountId),
  );
}

// One person runs Gemini Code: every account is let in.
const initialStatus = (_email, _isOwner) => 'active';

/** The account of a verified token, created on its first request. */
export function upsertAccount({ id, email, name }) {
  const cleanEmail = email ? String(email).toLowerCase() : null;
  const isOwner = Boolean(
    config.ownerEmail && cleanEmail === config.ownerEmail,
  );
  const existing = fetchAccount(id);
  if (existing) {
    // last_seen_at moves at most once a minute: every request reads this row.
    if (now() - existing.lastSeenAt > 60 || existing.email !== cleanEmail) {
      db.query(
        'UPDATE accounts SET email = ?, name = COALESCE(?, name), last_seen_at = ? WHERE id = ?',
      ).run(cleanEmail, name || null, now(), id);
    }
    return { ...existing, email: cleanEmail };
  }
  db.query(
    'INSERT INTO accounts (id, email, name, status, is_owner, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    cleanEmail,
    name || null,
    initialStatus(cleanEmail, isOwner),
    isOwner ? 1 : 0,
    now(),
    now(),
  );
  if (isOwner) claimUnowned(id);
  return fetchAccount(id);
}

// Bots and connections made before accounts existed belong to the owner.
function claimUnowned(accountId) {
  db.transaction(() => {
    db.query('UPDATE bots SET account_id = ? WHERE account_id IS NULL').run(
      accountId,
    );
    db.query(
      'UPDATE connections SET account_id = ? WHERE account_id IS NULL',
    ).run(accountId);
  })();
}

/** Today in São Paulo, the day the daily limit counts. */
export function today() {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: DEFAULT_TIMEZONE,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(new Date());
}

export function addUsage(accountId, cost) {
  if (!accountId) return;
  db.query(
    'INSERT INTO usage (account_id, day, cost, steps) VALUES (?, ?, ?, 1) ON CONFLICT (account_id, day) DO UPDATE SET cost = cost + excluded.cost, steps = steps + 1',
  ).run(accountId, today(), cost || 0);
}

export function costToday(accountId) {
  return (
    db
      .query('SELECT cost FROM usage WHERE account_id = ? AND day = ?')
      .get(accountId, today())?.cost ?? 0
  );
}

/** What the panel needs to know about whoever is signed in. */
export function describeAccount(account) {
  return {
    id: account.id,
    email: account.email,
    name: account.name,
    status: account.status,
    isOwner: account.isOwner,
    limits: { ...config.limits },
    usageToday: { cost: costToday(account.id) },
  };
}
