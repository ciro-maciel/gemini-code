import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'assistant-earned-trust-'),
);
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const { hasEarnedTrust, resolveApproval } = await import('./engine/run.js');
const { fetchToolPolicy } = await import('./engine/policy.js');

// 10/11/2026: the person approved 54 cards in a week, mostly the same kinds again. A key approved
// three times in 30 days, never refused, runs by itself on that bot; money and accounts never do.

db.query(
  "INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('acc-trust', 'confianca@exemplo.com', 'Ana', 'active', ?, ?)",
).run(now(), now());
let count = 0;
function newBot() {
  const id = `bot-trust-${++count}`;
  db.query(
    "INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES (?, 'SEO', ?, 'idle', 'x', ?, ?, 'acc-trust')",
  ).run(id, `sprite-${id}`, now(), now());
  // The task is cancelled, so resolving an approval schedules nothing that runs a model.
  db.query(
    "INSERT INTO tasks (id, bot_id, prompt, status, created_at, updated_at) VALUES (?, ?, 'p', 'cancelled', ?, ?)",
  ).run(`task-${id}`, id, now(), now());
  return id;
}
function approval(
  botId,
  {
    status,
    key = 'blogs:write',
    kind = 'publish',
    at = now(),
    id = `ap-${++count}`,
  },
) {
  db.query(
    'INSERT INTO approvals (id, task_id, tool_call_id, tool_name, arguments, summary, reason, status, created_at, resolved_at, grant_key, kind) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    `task-${botId}`,
    `call-${id}`,
    'mcp__blogs__blogs_write',
    '{}',
    'Publicar o artigo',
    'r',
    status,
    at,
    status === 'pending' ? null : at,
    key,
    kind,
  );
  return id;
}

describe('trust is earned', () => {
  test('three approvals in 30 days, none refused, earn it; two do not', () => {
    const bot = newBot();
    approval(bot, { status: 'approved' });
    approval(bot, { status: 'approved' });
    expect(hasEarnedTrust(bot, 'blogs:write')).toBe(false);
    approval(bot, { status: 'approved' });
    expect(hasEarnedTrust(bot, 'blogs:write')).toBe(true);
  });

  test('one refusal in the window keeps it asking', () => {
    const bot = newBot();
    for (let i = 0; i < 4; i++) approval(bot, { status: 'approved' });
    approval(bot, { status: 'rejected' });
    expect(hasEarnedTrust(bot, 'blogs:write')).toBe(false);
  });

  test('approvals older than 30 days do not count', () => {
    const bot = newBot();
    const old = now() - 31 * 86400;
    for (let i = 0; i < 3; i++) approval(bot, { status: 'approved', at: old });
    expect(hasEarnedTrust(bot, 'blogs:write')).toBe(false);
  });

  test('the third approval for the task leaves a standing grant on that bot', async () => {
    const bot = newBot();
    approval(bot, { status: 'approved' });
    approval(bot, { status: 'approved' });
    const third = approval(bot, { status: 'pending' });
    await resolveApproval(`task-${bot}`, third, {
      isApproved: true,
      scope: 'task',
    });
    expect(fetchToolPolicy(bot, 'blogs:write')).toBe('free');
  });

  test('money never earns it, however often approved', async () => {
    const bot = newBot();
    approval(bot, { status: 'approved', key: 'payments:write', kind: 'pay' });
    approval(bot, { status: 'approved', key: 'payments:write', kind: 'pay' });
    const third = approval(bot, {
      status: 'pending',
      key: 'payments:write',
      kind: 'pay',
    });
    await resolveApproval(`task-${bot}`, third, {
      isApproved: true,
      scope: 'task',
    });
    expect(fetchToolPolicy(bot, 'payments:write')).toBe(null);
  });
});
