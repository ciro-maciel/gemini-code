import { locale } from './lib/language';

// Words a person reads, in one place, so a status is named the same on every screen.

export const BOT_STATUS = {
  idle: 'Computer off',
  provisioning: 'Preparing the computer',
  ready: 'Pronto',
  failed: 'Failed to prepare',
};

export const POLICY_LABEL = {
  free: 'Livre',
  confirm: 'Confirma',
  human: 'Human only',
};

// What a bot can be, in one sentence: "Criar com IA" and the waiting screen offer these.
export const AI_EXAMPLES = [
  'An agent that reads Google Search Console every day and sends me a report',
  "Every Monday, summarizes this week's emails that still need a reply",
  "Track a product's price across three stores and let me know when it drops",
];

export const isActive = (status) => status === 'running' || status === 'queued';

// A bot without a computer yet ('idle') works like a ready one: it talks now
// and gets its computer the first time it needs a screen or a shell.
export const canWork = (status) => status === 'ready' || status === 'idle';

const MONTHS = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];
const clockOf = (date) =>
  `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;

/**
 * When a message was sent (30/10): "just now", "12 min ago" within the hour,
 * then the day and the hour, "today, 14:32", "yesterday, 09:05", "28 Oct,
 * 14:32", with the year when it is another one.
 */
export function messageWhen(seconds, nowSeconds = Date.now() / 1000) {
  if (!seconds) return '';
  const minutes = Math.floor((nowSeconds - seconds) / 60);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const date = new Date(seconds * 1000);
  const today = new Date(nowSeconds * 1000);
  const yesterday = new Date(
    today.getFullYear(),
    today.getMonth(),
    today.getDate() - 1,
  );
  const isSameDay = (first, second) =>
    first.getFullYear() === second.getFullYear() &&
    first.getMonth() === second.getMonth() &&
    first.getDate() === second.getDate();
  if (isSameDay(date, today)) return `today, ${clockOf(date)}`;
  if (isSameDay(date, yesterday)) return `yesterday, ${clockOf(date)}`;
  const year =
    date.getFullYear() === today.getFullYear() ? '' : ` ${date.getFullYear()}`;
  return `${date.getDate()} ${MONTHS[date.getMonth()]}${year}, ${clockOf(date)}`;
}

export function formatWhen(seconds) {
  if (!seconds) return '—';
  const diff = Date.now() / 1000 - seconds;
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return new Date(seconds * 1000).toLocaleDateString(locale(), {
    day: '2-digit',
    month: 'short',
  });
}
