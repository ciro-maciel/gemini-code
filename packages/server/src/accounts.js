import { config } from './config.js';
import { db, now, toApi } from './db.js';
import { sharedWith } from './members.js';
import { DEFAULT_TIMEZONE } from './routines.js';

// An account is a person signed in through Auth. The control server never
// takes an account id from the request: it comes from the verified JWT.

const STATUSES = ['active', 'pending', 'blocked'];

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

function initialStatus(email, isOwner) {
  if (isOwner || config.accessMode === 'open') return 'active';
  if (config.testEmail && email === config.testEmail) return 'active';
  return 'pending';
}

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
    // The owner is not held to them; the Pessoas screen states them.
    limits: { ...config.limits },
    usageToday: { cost: costToday(account.id) },
    firstWish: account.firstWish ?? null,
    // Still waiting to be let in, but invited into someone's bot: sees only those.
    isGuest:
      account.status === 'pending' && sharedWith(account.email).length > 0,
    ...(account.status === 'pending' ? { queue: queuePlace(account) } : {}),
  };
}

/** Where a waiting account stands: accounts are let in by arrival. */
function queuePlace(account) {
  const ahead = db
    .query(
      "SELECT COUNT(*) AS count FROM accounts WHERE status = 'pending' AND created_at < ?",
    )
    .get(account.createdAt).count;
  const total = db
    .query("SELECT COUNT(*) AS count FROM accounts WHERE status = 'pending'")
    .get().count;
  return { position: ahead + 1, total };
}

export const FIRST_WISH_MAX = 1000;

/** The waiting account's first bot, in its own words. Empty clears it. */
export function setFirstWish(accountId, wish) {
  const clean =
    String(wish ?? '')
      .trim()
      .slice(0, FIRST_WISH_MAX) || null;
  db.query('UPDATE accounts SET first_wish = ? WHERE id = ?').run(
    clean,
    accountId,
  );
  return fetchAccount(accountId);
}

// --- The owner's Pessoas screen -------------------------------------------

export function listAccounts() {
  return db
    .query(
      `SELECT accounts.*,
                (SELECT COUNT(*) FROM bots WHERE bots.account_id = accounts.id) AS bot_count,
                (SELECT cost FROM usage WHERE usage.account_id = accounts.id AND usage.day = ?) AS cost_today,
                (SELECT COALESCE(SUM(cost), 0) FROM usage WHERE usage.account_id = accounts.id) AS cost_total
             FROM accounts ORDER BY (status = 'pending') DESC, last_seen_at DESC`,
    )
    .all(today())
    .map((row) => ({ ...present(row), costToday: row.cost_today ?? 0 }));
}

export function setAccountStatus(accountId, status) {
  if (!STATUSES.includes(status)) throw new Error('situação inválida');
  const account = fetchAccount(accountId);
  if (!account) return null;
  if (account.isOwner) throw new Error('o dono não pode ser bloqueado');
  db.query('UPDATE accounts SET status = ? WHERE id = ?').run(
    status,
    accountId,
  );
  return fetchAccount(accountId);
}
