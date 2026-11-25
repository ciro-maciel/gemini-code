import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'assistant-approve-change-'),
);
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const { encrypt } = await import('./secrets.js');
const { createTask, fetchTask, resolveApproval } =
  await import('./engine/run.js');

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
    if (step.call)
      return sse([
        {
          choices: [
            {
              delta: {
                tool_calls: [
                  {
                    index: 0,
                    id: step.call.id,
                    function: {
                      name: step.call.name,
                      arguments: JSON.stringify(step.call.args),
                    },
                  },
                ],
              },
            },
          ],
        },
        {
          choices: [{ delta: {}, finish_reason: 'tool_calls' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, cost: 0 },
        },
      ]);
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
  "INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('acc-change', 'mudanca@exemplo.com', 'Ana', 'active', ?, ?)",
).run(now(), now());
db.query(
  "INSERT INTO ai_accounts (id, account_id, name, token, provider, models, created_at) VALUES ('ai-change', 'acc-change', 'OpenRouter', ?, 'openrouter', '[\"anthropic/claude-haiku-5.5\"]', ?)",
).run(await encrypt('sk-or-teste'), now());

let bots = 0;
function newBot() {
  const id = `bot-change-${++bots}`;
  db.query(
    "INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id, ai_account) VALUES (?, 'Orgânico', ?, 'idle', 'anthropic/claude-haiku-5.5', ?, ?, 'acc-change', 'ai-change')",
  ).run(id, `sprite-${id}`, now(), now());
  return id;
}

async function settled(taskId) {
  for (let tries = 0; tries < 200; tries++) {
    const task = fetchTask(taskId);
    if (
      [
        'done',
        'failed',
        'waiting_user',
        'cancelled',
        'waiting_approval',
      ].includes(task.status)
    )
      return task;
    await Bun.sleep(10);
  }
  throw new Error('a tarefa não terminou');
}

describe('permitir com a mudança', () => {
  test('the action does not run as asked; the agent hears the change and calls again under the same permission', async () => {
    script = [
      {
        call: {
          id: 'call-1',
          name: 'computer_shell',
          args: {
            command:
              'curl -X POST https://blog.exemplo.com/api/publicar -d @artigo.json',
          },
        },
      },
      { text: 'Certo, publico como rascunho.' },
    ];
    sent.length = 0;
    const asked = await settled(createTask(newBot(), 'prepare o artigo').id);
    expect(asked.status).toBe('waiting_approval');
    const approval = db
      .query(
        "SELECT id FROM approvals WHERE task_id = ? AND status = 'pending'",
      )
      .get(asked.id);
    await resolveApproval(asked.id, approval.id, {
      isApproved: true,
      note: 'publique como rascunho, não no ar',
      scope: 'task',
    });
    const task = await settled(asked.id);
    expect(task.status).toBe('done');
    const toolMessage = sent
      .at(-1)
      .messages.find(
        (message) =>
          message.role === 'tool' && message.tool_call_id === 'call-1',
      );
    expect(toolMessage.content).toContain(
      'aprovou esta ação com uma mudança: publique como rascunho, não no ar',
    );
    expect(toolMessage.content).toContain('Ela não foi feita como estava');
  });
});
