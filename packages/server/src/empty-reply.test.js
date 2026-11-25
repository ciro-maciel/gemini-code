import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'assistant-empty-reply-'),
);
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const { encrypt } = await import('./secrets.js');
const { createTask, fetchTask } = await import('./engine/run.js');

// The agent of 31/10/2026 talked through OpenRouter: a provider in memory
// answers each step from a script, as the stream OpenRouter sends, and keeps
// every body it was sent. Anything else (the price list, the title) fails at
// once, off the network.
const sent = [];
let script = [];
const sse = (chunks) =>
  new Response(
    chunks.map((chunk) => `data: ${JSON.stringify(chunk)}\n\n`).join('') +
      'data: [DONE]\n\n',
    { headers: { 'Content-Type': 'text/event-stream' } },
  );
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = async (url, init = {}) => {
    if (String(url) !== 'https://openrouter.ai/api/v1/chat/completions')
      return new Response('fora do teste', { status: 400 });
    const body = JSON.parse(init.body);
    if (!body.tools) return new Response('fora do teste', { status: 400 });
    sent.push(body);
    const step = script.shift() ?? { text: 'fim do roteiro' };
    if (step.empty)
      return sse([
        {
          choices: [{ delta: {}, finish_reason: step.empty }],
          usage: { prompt_tokens: 124_874, completion_tokens: 8000, cost: 0 },
        },
      ]);
    return sse([
      { choices: [{ delta: { content: step.text } }] },
      {
        choices: [{ delta: {}, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 },
      },
    ]);
  };
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

db.query(
  "INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('acc-empty', 'vazio@exemplo.com', 'Ana', 'active', ?, ?)",
).run(now(), now());
db.query(
  "INSERT INTO ai_accounts (id, account_id, name, token, provider, models, created_at) VALUES ('ai-empty', 'acc-empty', 'OpenRouter', ?, 'openrouter', '[\"anthropic/claude-haiku-5.5\"]', ?)",
).run(await encrypt('sk-or-teste'), now());

let bots = 0;
function newBot() {
  const id = `bot-empty-${++bots}`;
  db.query(
    "INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id, ai_account) VALUES (?, 'Orgânico', ?, 'idle', 'anthropic/claude-haiku-5.5', ?, ?, 'acc-empty', 'ai-empty')",
  ).run(id, `sprite-${id}`, now(), now());
  return id;
}

async function settled(taskId) {
  for (let tries = 0; tries < 200; tries++) {
    const task = fetchTask(taskId);
    if (['done', 'failed', 'waiting_user', 'cancelled'].includes(task.status))
      return task;
    await Bun.sleep(10);
  }
  throw new Error('a tarefa não terminou');
}

const finalEvents = (taskId) =>
  db
    .query(
      "SELECT data FROM task_events WHERE task_id = ? AND type = 'assistant'",
    )
    .all(taskId)
    .map((row) => JSON.parse(row.data))
    .filter((data) => data.isFinal);

describe('a task never ends mute', () => {
  test('two empty answers in a row end the task with the reason, said to the person and counted', async () => {
    script = [{ empty: 'length' }, { empty: 'length' }];
    sent.length = 0;
    const task = await settled(
      createTask(newBot(), 'escreva a semana 2 e envie as 13 peças').id,
    );
    expect(task.status).toBe('done');
    expect(task.result).toContain('Parei sem conseguir responder');
    expect(task.result).toContain('limite de resposta');
    expect(finalEvents(task.id).map((event) => event.text)).toEqual([
      task.result,
    ]);
    // The step ran out of its output limit: it was asked again once, with more room and a note on why.
    expect(sent).toHaveLength(2);
    expect(sent[0].max_tokens).toBe(8000);
    expect(sent[1].max_tokens).toBe(16_000);
    expect(JSON.stringify(sent[1].messages.at(-1))).toContain(
      'acabou no limite de saída',
    );
    const failures = db
      .query(
        "SELECT kind FROM failures WHERE task_id = ? AND kind = 'empty_reply'",
      )
      .all(task.id);
    expect(failures).toHaveLength(2);
  });

  test('an empty answer asked again that comes back with words ends the task with those words', async () => {
    script = [{ empty: 'stop' }, { text: 'Ficaram prontas as 13 peças.' }];
    sent.length = 0;
    // A prompt no other test uses: a late step of an earlier test's task can land in `sent`.
    const prompt = 'revise o roteiro do episódio 7';
    const task = await settled(createTask(newBot(), prompt).id);
    const mine = sent.filter((body) =>
      JSON.stringify(body.messages).includes(prompt),
    );
    expect(task.status).toBe('done');
    expect(task.result).toBe('Ficaram prontas as 13 peças.');
    expect(mine).toHaveLength(2);
    // Not cut by the limit: same room, and the note says the answer was empty.
    expect(mine[1].max_tokens).toBe(8000);
    expect(JSON.stringify(mine[1].messages.at(-1))).toContain('veio vazia');
  });

  test('an answer with words ends at once, as before', async () => {
    script = [{ text: 'Pronto.' }];
    sent.length = 0;
    const task = await settled(createTask(newBot(), 'oi').id);
    expect(task).toMatchObject({ status: 'done', result: 'Pronto.' });
    expect(sent).toHaveLength(1);
  });
});
