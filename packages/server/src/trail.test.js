import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// A database of its own: config.js reads DATA_DIR when first imported.
const dataDir = mkdtempSync(path.join(tmpdir(), 'assistant-trail-'));
process.env.DATA_DIR = dataDir;
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const trail = await import('./trail.js');
const { cancelTask } = await import('./engine/run.js');

function seedBot(id, accountId) {
  db.query(
    'INSERT INTO accounts (id, email, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
  ).run(accountId, `${accountId}@exemplo.com`, 'active', now(), now());
  db.query(
    'INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    `Bot ${id}`,
    `sprite-${id}`,
    'idle',
    'deepseek/deepseek-v4.1-flash',
    now(),
    now(),
    accountId,
  );
}

function seedTask(id, botId, status = 'waiting_approval') {
  db.query(
    'INSERT INTO tasks (id, bot_id, prompt, title, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, botId, 'pedido', 'Tarefa', status, now(), now());
}

function seedApproval(
  id,
  taskId,
  {
    createdAt = now(),
    toolName = 'mcp__gmail__send',
    summary = 'Enviar e-mail',
  } = {},
) {
  db.query(
    "INSERT INTO approvals (id, task_id, tool_call_id, tool_name, arguments, summary, reason, status, created_at) VALUES (?, ?, ?, ?, '{}', ?, 'sai para fora', 'pending', ?)",
  ).run(id, taskId, `call-${id}`, toolName, summary, createdAt);
}

beforeAll(() => {
  seedBot('a1', 'account-a');
  seedBot('b1', 'account-b');
});

afterAll(() => rmSync(dataDir, { recursive: true, force: true }));

describe('redact', () => {
  test('cuts what a typing tool typed out of the context', () => {
    const text = trail.redact('Digitar "minha-senha-123" no campo Senha', {
      toolName: 'browser_type',
      args: { ref: 'e12', text: 'minha-senha-123' },
    });
    expect(text).not.toContain('minha-senha-123');
    expect(text).toContain('[texto digitado]');
  });

  test('hides credentials and long tokens', () => {
    const text = trail.redact(
      'erro: Authorization: Bearer abc.def password=hunter2 chave sk-live_1234567890abcdef e AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
    );
    expect(text).not.toContain('hunter2');
    expect(text).not.toContain('sk-live_1234567890abcdef');
    expect(text).not.toContain('AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA');
    expect(text).not.toContain('abc.def');
  });

  test('keeps the context short', () => {
    expect(trail.redact('palavra '.repeat(200)).length).toBeLessThanOrEqual(
      300,
    );
  });
});

describe('judgments and the audit trail', () => {
  test('records judgments, skips rules that judged nothing, and joins the approval', () => {
    seedTask('t1', 'a1');
    seedApproval('ap1', 't1');
    trail.recordJudgment({
      botId: 'a1',
      taskId: 't1',
      toolName: 'browser_snapshot',
      summary: 'ler',
      rule: 'always_free',
      verdict: 'run',
    });
    trail.recordJudgment({
      botId: 'a1',
      taskId: 't1',
      toolName: 'browser_click',
      summary: 'Clicar em Buscar',
      rule: 'judged',
      verdict: 'run',
    });
    trail.recordJudgment({
      botId: 'a1',
      taskId: 't1',
      toolName: 'mcp__gmail__send',
      summary: 'Enviar e-mail',
      rule: 'service',
      verdict: 'ask',
      reason: 'altera dados',
      approvalId: 'ap1',
    });
    db.query(
      "UPDATE approvals SET status = 'approved', outcome = 'approved_task', resolved_at = ?, resolved_by = 'account-a', checkpoint_id = 'v7' WHERE id = 'ap1'",
    ).run(now());

    const { items, total } = trail.listAudit('a1');
    expect(total).toBe(2);
    expect(items[0]).toMatchObject({
      action: 'Enviar e-mail',
      rule: 'service',
      outcome: 'approved_task',
      resolvedBy: 'account-a@exemplo.com',
      checkpointId: 'v7',
    });
    expect(items[1]).toMatchObject({
      action: 'Clicar em Buscar',
      risk: 'low',
      outcome: 'ran',
    });
  });

  test('a bot never sees another bot of another account', () => {
    expect(trail.listAudit('b1').items).toHaveLength(0);
  });

  test('exports CSV with a header, neutralized formulas and the same rows as JSON', () => {
    trail.recordJudgment({
      botId: 'a1',
      taskId: 't1',
      toolName: 'browser_type',
      summary: '=HYPERLINK("x")',
      rule: 'judged',
      verdict: 'ask',
    });
    const csv = trail.auditCsv('a1');
    const lines = csv
      .replace(/^\uFEFF/, '')
      .trim()
      .split('\r\n');
    expect(lines[0]).toStartWith('date_time,task,action');
    expect(lines).toHaveLength(1 + trail.auditJson('a1').length);
    expect(csv).toContain(`"'=HYPERLINK(""x"")"`);
  });
});

describe('outcomes and failures', () => {
  test('an approval left unanswered past the timeout counts once as timed out and stays pending', () => {
    seedTask('t2', 'a1');
    seedApproval('ap2', 't2', {
      createdAt: now() - trail.APPROVAL_TIMEOUT_SECONDS - 10,
    });
    expect(trail.sweepTimedOutApprovals()).toBe(1);
    expect(trail.sweepTimedOutApprovals()).toBe(0);
    expect(
      db.query("SELECT status FROM approvals WHERE id = 'ap2'").get().status,
    ).toBe('pending');
    expect(trail.outcomeMetrics().outcomes.timed_out).toBe(1);
  });

  test('cancelling a waiting task cancels its approval and logs the abort', () => {
    cancelTask('t2');
    expect(
      db.query("SELECT outcome FROM approvals WHERE id = 'ap2'").get().outcome,
    ).toBe('cancelled');
    const metrics = trail.outcomeMetrics();
    expect(metrics.outcomes.cancelled).toBe(1);
    expect(metrics.failures.task_cancelled).toBe(1);
  });

  test('a failure context is redacted when written', () => {
    trail.recordFailure({
      botId: 'a1',
      taskId: 't1',
      kind: 'approval_rejected',
      context: 'Digitar "segredo-do-banco" no login',
      toolName: 'browser_type',
      args: { text: 'segredo-do-banco' },
    });
    const { context } = db
      .query("SELECT context FROM failures WHERE kind = 'approval_rejected'")
      .get();
    expect(context).not.toContain('segredo-do-banco');
  });

  test('deleting a bot takes its trail and failures, and keeps the counts', () => {
    const before = trail.outcomeMetrics().outcomes.takeover;
    db.query("DELETE FROM bots WHERE id = 'b1'").run();
    expect(
      db
        .query("SELECT COUNT(*) AS count FROM failures WHERE bot_id = 'b1'")
        .get().count,
    ).toBe(0);
    expect(trail.outcomeMetrics().outcomes.takeover).toBe(before);
  });
});

describe('approvalRate', () => {
  test('counts the yes and the no the person gave, per 7-day window back from now', () => {
    seedBot('c1', 'account-c');
    seedTask('tc', 'c1', 'done');
    const day = 86400;
    const decide = (id, outcome, daysAgo) => {
      seedApproval(id, 'tc');
      db.query(
        'UPDATE approvals SET status = ?, outcome = ?, resolved_at = ? WHERE id = ?',
      ).run(
        outcome === 'rejected' ? 'rejected' : 'approved',
        outcome,
        now() - daysAgo * day,
        id,
      );
    };
    decide('rc1', 'approved', 1);
    decide('rc2', 'approved_always', 2);
    decide('rc3', 'rejected', 3);
    decide('rc4', 'cancelled', 4);
    decide('rc5', 'approved_task', 9);
    decide('rc6', 'rejected', 60);
    const { weeks } = trail.approvalRate('c1');
    expect(weeks).toHaveLength(8);
    expect(weeks[0]).toEqual({ approved: 2, decided: 3 });
    expect(weeks[1]).toEqual({ approved: 1, decided: 1 });
    expect(weeks.slice(2).every((week) => week.decided === 0)).toBe(true);
    seedBot('c2', 'account-c');
    expect(
      trail.approvalRate('c2').weeks.every((week) => week.decided === 0),
    ).toBe(true);
  });
});
