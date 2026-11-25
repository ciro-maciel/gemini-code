import { afterAll, afterEach, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-compact-'));
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const { compactTask } = await import('./engine/run.js');
const { useClient } = await import('./engine/anthropic.js');

// A Claude that answers every call with the given summary and keeps what it read.
function claudeSays(text) {
  const read = [];
  const stream = (body) => {
    read.push(body);
    return {
      async *[Symbol.asyncIterator]() {},
      finalMessage: async () => ({
        content: [{ type: 'text', text }],
        stop_reason: 'end_turn',
        usage: { input_tokens: 10, output_tokens: 5 },
      }),
    };
  };
  useClient(() => ({ messages: { stream }, beta: { messages: { stream } } }));
  return read;
}
afterEach(() => useClient((apiKey) => ({ apiKey })));

// The price lookup stays off the network: a real catalog would be cached for the files that run after this one.
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = async () => new Response('', { status: 503 });
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

const account = { id: 'ai-compact', provider: 'anthropic', key: 'k' };
const bot = { id: 'bot-compact', model: 'claude-haiku-5-5' };
const long = (size) => 'palavra '.repeat(size);

function seed(taskId, messages) {
  db.query(
    'INSERT INTO accounts (id, email, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
  ).run('acc-compact', 'c@exemplo.com', 'active', now(), now());
  db.query(
    'INSERT OR IGNORE INTO ai_accounts (id, account_id, name, token, created_at) VALUES (?, ?, ?, ?, ?)',
  ).run(account.id, 'acc-compact', 'Anthropic', 'x', now());
  db.query(
    'INSERT OR IGNORE INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    bot.id,
    'Bot',
    'sprite-compact',
    'idle',
    bot.model,
    now(),
    now(),
    'acc-compact',
  );
  db.query(
    'INSERT INTO tasks (id, bot_id, prompt, status, context_tokens, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(taskId, bot.id, 'p', 'running', 800_000, now(), now());
  messages.forEach((message, seq) =>
    db
      .query(
        'INSERT INTO task_messages (task_id, seq, message) VALUES (?, ?, ?)',
      )
      .run(taskId, seq, JSON.stringify(message)),
  );
}

const conversation = [
  { role: 'user', content: `escreva a pauta ${long(400)}` },
  { role: 'assistant', content: long(400) },
  { role: 'user', content: long(100) },
  { role: 'assistant', content: long(50) },
];

test('a full conversation keeps every message and gains a summary of its beginning, said in the thread', async () => {
  const read = claudeSays('1. Pedidos: a pauta.');
  seed('t-compact-1', conversation);
  expect(await compactTask('t-compact-1', bot, account, conversation)).toBe(
    true,
  );
  const task = db
    .query(
      'SELECT compacted_summary, compacted_until, context_tokens FROM tasks WHERE id = ?',
    )
    .get('t-compact-1');
  expect(task).toEqual({
    compacted_summary: '1. Pedidos: a pauta.',
    compacted_until: 2,
    context_tokens: 0,
  });
  expect(
    db
      .query('SELECT COUNT(*) AS n FROM task_messages WHERE task_id = ?')
      .get('t-compact-1').n,
  ).toBe(4);
  expect(read[0].messages[0].content[0].text).toContain(
    'PESSOA:\nescreva a pauta',
  );
  expect(read[0].tools).toBeUndefined();
  const event = db
    .query(
      "SELECT data FROM task_events WHERE task_id = ? AND type = 'warning'",
    )
    .get('t-compact-1');
  expect(JSON.parse(event.data).message).toContain('Resumi o começo');
});

test('a second compaction folds the first summary in and moves the cut forward', async () => {
  const more = [
    ...conversation,
    { role: 'user', content: long(400) },
    { role: 'assistant', content: long(400) },
    { role: 'user', content: 'e agora?' },
  ];
  seed('t-compact-2', more);
  db.query(
    'UPDATE tasks SET compacted_summary = ?, compacted_until = ? WHERE id = ?',
  ).run('resumo um', 2, 't-compact-2');
  const read = claudeSays('resumo dois');
  expect(await compactTask('t-compact-2', bot, account, more)).toBe(true);
  expect(read[0].messages[0].content[0].text).toStartWith(
    'RESUMO ANTERIOR:\nresumo um',
  );
  expect(read[0].messages[0].content[0].text).not.toContain('escreva a pauta');
  const task = db
    .query('SELECT compacted_summary, compacted_until FROM tasks WHERE id = ?')
    .get('t-compact-2');
  expect(task.compacted_summary).toBe('resumo dois');
  expect(task.compacted_until).toBeGreaterThan(2);
});
