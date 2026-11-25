import webpush from 'web-push';

import { config } from './config.js';
import { db, now } from './db.js';
import { subscribe } from './events.js';
import { listSeeing } from './presence.js';

// The notice on the phone (29/10/2026): when an agent needs the person (an
// approval, a question) or delivers something, each of their phones that
// asked for it gets a notification that opens straight on the agent. Nobody
// is told about what they are looking at right now.

let send = (subscription, payload) =>
  webpush.sendNotification(subscription, payload, { TTL: 3600 });

/** For tests: a fake push service instead of the network. */
export function useSender(fake) {
  send = fake;
}

export const isPushReady = () =>
  Boolean(config.vapidPublicKey && config.vapidPrivateKey);

export function savePushSubscription(accountId, subscription) {
  const endpoint = String(subscription?.endpoint || '');
  if (
    !/^https:\/\//.test(endpoint) ||
    !subscription.keys?.p256dh ||
    !subscription.keys?.auth
  )
    return false;
  db.query(
    'INSERT INTO push_subscriptions (endpoint, account_id, keys, created_at) VALUES (?, ?, ?, ?) ON CONFLICT (endpoint) DO UPDATE SET account_id = excluded.account_id, keys = excluded.keys',
  ).run(
    endpoint,
    accountId,
    JSON.stringify({
      p256dh: subscription.keys.p256dh,
      auth: subscription.keys.auth,
    }),
    now(),
  );
  return true;
}

export const removePushSubscription = (accountId, endpoint) =>
  db
    .query(
      'DELETE FROM push_subscriptions WHERE account_id = ? AND endpoint = ?',
    )
    .run(accountId, String(endpoint || '')).changes > 0;
export const countPushSubscriptions = (accountId) =>
  db
    .query('SELECT COUNT(*) AS n FROM push_subscriptions WHERE account_id = ?')
    .get(accountId).n;

/** What an event says on the phone, and who hears it: approvals only the owner answers. */
export function noticeOf(event, bot) {
  const url = `/agents/${bot.id}`;
  if (event.type === 'approval_requested')
    return {
      isOwnerOnly: true,
      title: `${bot.name} needs you`,
      body: event.data.summary || 'An action is waiting for your approval.',
      url,
    };
  if (event.type === 'tool_call' && event.data.name === 'ask_user')
    return {
      isOwnerOnly: false,
      title: `${bot.name} has a question`,
      body: String(event.data.arguments?.question || '').slice(0, 180),
      url,
    };
  if (event.type === 'artifact')
    return {
      isOwnerOnly: false,
      title: `${bot.name} entregou`,
      body: event.data.title,
      url,
    };
  return null;
}

function recipientsOf(bot, isOwnerOnly) {
  const ids = [bot.account_id];
  if (!isOwnerOnly)
    ids.push(
      ...db
        .query(
          'SELECT a.id FROM bot_members m JOIN accounts a ON a.email = m.email WHERE m.bot_id = ?',
        )
        .all(bot.id)
        .map((row) => row.id),
    );
  const seeing = new Set(listSeeing(bot.id).map((person) => person.accountId));
  return [...new Set(ids)].filter((id) => id && !seeing.has(id));
}

export async function notifyEvent(event) {
  if (!event?.botId || event.isLive) return 0;
  const bot = db
    .query('SELECT id, name, account_id FROM bots WHERE id = ?')
    .get(event.botId);
  const notice = bot && noticeOf(event, bot);
  if (!notice) return 0;
  const payload = JSON.stringify({
    title: notice.title,
    body: notice.body,
    url: notice.url,
    tag: `bot-${bot.id}`,
  });
  let sent = 0;
  for (const accountId of recipientsOf(bot, notice.isOwnerOnly)) {
    for (const row of db
      .query(
        'SELECT endpoint, keys FROM push_subscriptions WHERE account_id = ?',
      )
      .all(accountId)) {
      try {
        await send(
          { endpoint: row.endpoint, keys: JSON.parse(row.keys) },
          payload,
        );
        sent++;
      } catch (error) {
        // The phone said no more (uninstalled, permission taken back): forget it.
        if (error.statusCode === 404 || error.statusCode === 410)
          db.query('DELETE FROM push_subscriptions WHERE endpoint = ?').run(
            row.endpoint,
          );
        else console.error(`[push] ${error.message}`);
      }
    }
  }
  return sent;
}

export function startPush() {
  if (!isPushReady()) return;
  webpush.setVapidDetails(
    config.vapidSubject,
    config.vapidPublicKey,
    config.vapidPrivateKey,
  );
  subscribe('*', (event) => void notifyEvent(event));
}
