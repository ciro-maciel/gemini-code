import { config } from './config.js';
import { db } from './db.js';

// The control server sleeps with its Sprite when nothing is happening, and a
// sleeping process keeps no time. The alarm — a Cloudflare Worker on a
// one-minute cron (packages/worker/worker.js) — keeps the next routine's time and calls
// /api/wake when it comes. Here the server tells the alarm what that time is,
// every time it may have changed. WAKE_URL is the worker's /alarm; without it (on the Mac) this is a no-op.

let pending = null;

export function nextWakeAt() {
  return (
    db
      .query(
        'SELECT MIN(next_run_at) AS at FROM routines WHERE is_enabled = 1 AND next_run_at IS NOT NULL',
      )
      .get()?.at ?? null
  );
}

async function tellAlarm() {
  const at = nextWakeAt();
  try {
    const response = await fetch(`${config.wakeUrl}/next`, {
      method: 'PUT',
      headers: {
        Authorization: `Bearer ${config.wakeSecret}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ at }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) throw new Error(`the alarm answered ${response.status}`);
  } catch (error) {
    // Logged, not thrown: the alarm also learns the time from /api/wake's answer.
    console.error('alarm', error.message);
  }
}

/** Debounced: several changes in a row send one update. */
export function onRoutinesChanged() {
  if (!config.wakeUrl) return;
  clearTimeout(pending);
  pending = setTimeout(tellAlarm, 500);
}
