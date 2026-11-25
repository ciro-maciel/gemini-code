import { db, now } from './db.js';

// The people a bot is shared with. The bot still runs as its owner, with the
// owner's access and plan; a member follows it ('read') or also writes to it
// ('enter'), and only the owner changes it or answers its approvals.

export const ACCESS = ['read', 'enter'];
const RANK = { read: 1, enter: 2, owner: 3 };
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export const cleanEmail = (email) =>
  String(email || '')
    .trim()
    .toLowerCase();

/** What an account may do in a bot: 'owner', 'enter', 'read' or null. */
export function accessOf(bot, account) {
  if (!bot || !account) return null;
  if (bot.accountId === account.id) return 'owner';
  if (!account.email) return null;
  return (
    db
      .query('SELECT access FROM bot_members WHERE bot_id = ? AND email = ?')
      .get(bot.id, account.email)?.access ?? null
  );
}

export const allows = (access, need) =>
  Boolean(access) && RANK[access] >= RANK[need];

export function listMembers(botId) {
  return db
    .query(
      `SELECT email, access,
                (SELECT id FROM accounts WHERE accounts.email = m.email ORDER BY created_at LIMIT 1) AS account_id,
                (SELECT name FROM accounts WHERE accounts.email = m.email ORDER BY created_at LIMIT 1) AS name
             FROM bot_members m WHERE bot_id = ? ORDER BY created_at`,
    )
    .all(botId)
    .map((row) => ({
      email: row.email,
      access: row.access,
      accountId: row.account_id ?? null,
      name: row.name || row.email.split('@')[0],
    }));
}

export function shareBot(bot, email, access) {
  const address = cleanEmail(email);
  if (!EMAIL.test(address)) return 'invalid e-mail';
  if (!ACCESS.includes(access)) return 'invalid access';
  const owner = db
    .query('SELECT email FROM accounts WHERE id = ?')
    .get(bot.accountId);
  if (owner?.email === address) return 'that e-mail is yours';
  db.query(
    'INSERT INTO bot_members (bot_id, email, access, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (bot_id, email) DO UPDATE SET access = excluded.access',
  ).run(bot.id, address, access, now());
  return null;
}

export const unshareBot = (botId, email) =>
  db
    .query('DELETE FROM bot_members WHERE bot_id = ? AND email = ?')
    .run(botId, cleanEmail(email)).changes > 0;

/** The bots shared with an account, with how far it may go in each. */
export const sharedWith = (email) =>
  email
    ? db
        .query('SELECT bot_id, access FROM bot_members WHERE email = ?')
        .all(email)
    : [];

/** Everyone an account already shared with, for the "Com quem" list. */
export function knownPeople(accountId) {
  return db
    .query(
      `SELECT DISTINCT m.email, (SELECT name FROM accounts WHERE accounts.email = m.email ORDER BY created_at LIMIT 1) AS name
             FROM bot_members m JOIN bots b ON b.id = m.bot_id WHERE b.account_id = ? ORDER BY m.email`,
    )
    .all(accountId)
    .map((row) => ({
      email: row.email,
      name: row.name || row.email.split('@')[0],
    }));
}
