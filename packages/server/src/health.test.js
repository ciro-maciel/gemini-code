import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-health-'));
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const { buildHealthReport, sendHealthReports } = await import('./health.js');

// The director hears every morning what failed, stopped or waits; on 10/11/2026 only someone
// reading the database knew that 101 tool calls had failed in a week.

const morning = new Date('2026-11-10T10:00:00Z'); // 7h in São Paulo
const at = Math.floor(morning.getTime() / 1000);

function account(id, { withDirector = true } = {}) {
  db.query(
    "INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES (?, ?, 'Ana', 'active', ?, ?)",
  ).run(id, `${id}@exemplo.com`, now(), now());
  const bot = (name, template = null) => {
    const botId = `${id}-${name}`;
    db.query(
      "INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id, template_id) VALUES (?, ?, ?, 'idle', 'x', ?, ?, ?, ?)",
    ).run(botId, name, `s-${botId}`, now(), now(), id, template);
    return botId;
  };
  return {
    seo: bot('SEO'),
    director: withDirector ? bot('Diretor', 'operations-director') : null,
  };
}
const fail = (botId, context, when = at - 3600) =>
  db
    .query(
      "INSERT INTO failures (bot_id, kind, context, created_at) VALUES (?, 'tool_error', ?, ?)",
    )
    .run(botId, context, when);

describe('the health report', () => {
  test('groups repeated errors by agent, tool and code, and flags an expired access even once', () => {
    const { seo } = account('acc-h1');
    for (let i = 0; i < 3; i++)
      fail(
        seo,
        'mcp__blogs__blogs_write: erro: {"error":{"code":"UNKNOWN_OP","message":"Operação desconhecida"}}',
      );
    fail(
      seo,
      'mcp__feeds__feeds_write: erro: Não sai ainda: O acesso a @marca venceu. Reconecte.',
    );
    fail(seo, 'mcp__analytics__analytics_read: erro: um erro só');
    const report = buildHealthReport('acc-h1', { at: morning });
    expect(report).toContain(
      'SEO · mcp__blogs__blogs_write · UNKNOWN_OP · 3 vezes',
    );
    expect(report).toContain('mcp__feeds__feeds_write · ACESSO · 1 vez');
    expect(report).not.toContain('um erro só');
    expect(report).toContain('pedidos-de-produto.md');
  });

  test('errors older than a day stay out, and a clean account has no report', () => {
    const { seo } = account('acc-h2');
    for (let i = 0; i < 3; i++)
      fail(seo, 'x: erro: {"error":{"code":"OLD"}}', at - 2 * 86400);
    expect(buildHealthReport('acc-h2', { at: morning })).toBe(null);
  });

  test('goes once a day to the director, never to an account without one', () => {
    const { seo, director } = account('acc-h3');
    for (let i = 0; i < 2; i++)
      fail(seo, 'y: erro: {"error":{"code":"NOT_FOUND"}}');
    const none = account('acc-h4', { withDirector: false });
    for (let i = 0; i < 2; i++)
      fail(none.seo, 'y: erro: {"error":{"code":"NOT_FOUND"}}');
    const sent = [];
    sendHealthReports((botId, text) => sent.push(botId), { at: morning });
    sendHealthReports((botId, text) => sent.push(botId), { at: morning });
    expect(sent.filter((id) => id === director)).toHaveLength(1);
    expect(sent.some((id) => id.startsWith('acc-h4'))).toBe(false);
  });

  test('nothing goes before 6h in São Paulo', () => {
    const { seo } = account('acc-h5');
    for (let i = 0; i < 2; i++) fail(seo, 'z: erro: {"error":{"code":"X"}}');
    const early = new Date('2026-11-10T08:00:00Z'); // 5h in São Paulo
    expect(sendHealthReports(() => {}, { at: early })).toBe(0);
  });
});

describe('several companies in one account', () => {
  test('each director hears only its company; an agent of a company without a director goes to the largest one', () => {
    db.query(
      "INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('acc-co', 'co@exemplo.com', 'Ana', 'active', ?, ?)",
    ).run(now(), now());
    const bot = (id, name, folder, template = null) =>
      db
        .query(
          "INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id, template_id, folder) VALUES (?, ?, ?, 'idle', 'x', ?, ?, 'acc-co', ?, ?)",
        )
        .run(id, name, `s-${id}`, now(), now(), template, folder);
    bot(
      'co-dir-a',
      'Virada - Diretor',
      'virada/diretor',
      'operations-director',
    );
    bot('co-seo-a', 'Virada - SEO', 'virada/seo');
    bot('co-dir-b', 'Casa - Diretor', 'casa/diretor', 'operations-director');
    bot('co-seo-b', 'Casa - SEO', 'casa/seo');
    bot('co-blog-b', 'Casa - Blog', 'casa/blog');
    bot('co-orphan', 'salon - SEO', 'salon');
    for (let i = 0; i < 2; i++) {
      fail('co-seo-a', 'virada_tool: erro: {"error":{"code":"A"}}');
      fail('co-seo-b', 'casa_tool: erro: {"error":{"code":"B"}}');
      fail('co-orphan', 'salon_tool: erro: {"error":{"code":"C"}}');
    }
    const sent = new Map();
    sendHealthReports((botId, text) => sent.set(botId, text), { at: morning });
    expect(sent.get('co-dir-a')).toContain('virada_tool');
    expect(sent.get('co-dir-a')).not.toContain('casa_tool');
    expect(sent.get('co-dir-b')).toContain('casa_tool');
    expect(sent.get('co-dir-b')).toContain('salon_tool');
    expect(sent.get('co-dir-b')).not.toContain('virada_tool');
  });
});

describe('an agent waiting for a person', () => {
  // 17/11/2026: one unanswered question held the operations director from 15/11 07:20 to 17/11 17:00, and nothing said so
  const waitingTask = (
    id,
    botId,
    since,
    {
      reason = 'question',
      question = 'Publico agora ou espero?',
      createdAt = since,
    } = {},
  ) => {
    db.query(
      "INSERT INTO tasks (id, bot_id, prompt, status, waiting_reason, waiting_detail, created_at, updated_at) VALUES (?, ?, 'x', 'waiting_user', ?, ?, ?, ?)",
    ).run(
      id,
      botId,
      reason,
      JSON.stringify({ question, toolCallId: 'c' }),
      createdAt,
      at,
    );
    db.query(
      'INSERT INTO task_events (uuid, task_id, type, data, created_at) VALUES (?, ?, \'status\', \'{"status":"waiting_user"}\', ?)',
    ).run(`ev-${id}`, id, since);
  };

  test('more than 6 hours waiting is in the report, with the question; less is not', () => {
    const { seo, director } = account('acc-h6');
    waitingTask('t-h6-long', director, at - 50 * 3600);
    waitingTask('t-h6-short', seo, at - 2 * 3600, {
      question: 'Pergunta recente',
    });
    const report = buildHealthReport('acc-h6', { at: morning });
    expect(report).toContain(
      'Agentes parados esperando resposta há mais de 6 horas:',
    );
    expect(report).toContain(
      '- Diretor: uma resposta à pergunta, há 50 horas: "Publico agora ou espero?"',
    );
    expect(report).not.toContain('Pergunta recente');
  });

  test('an old waiting task that is no longer the conversation stays out', () => {
    const { director } = account('acc-h7');
    waitingTask('t-h7-old', director, at - 50 * 3600);
    db.query(
      "INSERT INTO tasks (id, bot_id, prompt, status, created_at, updated_at) VALUES ('t-h7-new', ?, 'y', 'done', ?, ?)",
    ).run(director, at - 3600, at);
    expect(buildHealthReport('acc-h7', { at: morning })).toBe(null);
  });
});
