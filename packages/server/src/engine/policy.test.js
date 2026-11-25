import { afterAll, beforeEach, describe, expect, test } from 'bun:test';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// A database of its own: config.js reads DATA_DIR when first imported.
const dataDir = mkdtempSync(path.join(tmpdir(), 'assistant-policy-'));
process.env.DATA_DIR = dataDir;
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');
// No house key: the judge must run on the agent's own account.
delete process.env.OPENROUTER_API_KEY;
delete process.env.OPENROUTER_CONNECTOR_ID;

const { db, now } = await import('../db.js');
const {
  BATCH_LIMIT,
  coverageOf,
  decide,
  openBatch,
  serviceGrantKey,
  setToolPolicy,
} = await import('./policy.js');

const realFetch = globalThis.fetch;
let judgeAnswer = {};
let judgeCalls = [];
// The provider answers as an OpenAI-compatible chat call would.
globalThis.fetch = async (url, init) => {
  judgeCalls.push({ url: String(url), body: JSON.parse(init.body) });
  return new Response(
    JSON.stringify({
      choices: [
        {
          message: { role: 'assistant', content: JSON.stringify(judgeAnswer) },
          finish_reason: 'stop',
        },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 10, cost: 0 },
    }),
    { status: 200 },
  );
};
afterAll(() => {
  globalThis.fetch = realFetch;
  rmSync(dataDir, { recursive: true, force: true });
});

const account = { id: 'acc-ai', provider: 'openrouter', key: 'sk-test' };
const bot = { id: 'bot-1', accountId: 'acc-1', model: 'qwen/qwen3.8-flash' };

function taskWith(mandate) {
  const id = crypto.randomUUID();
  db.query(
    'INSERT INTO tasks (id, bot_id, prompt, status, created_at, updated_at, mandate) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, bot.id, 'primeira mensagem', 'running', now(), now(), mandate);
  return { id, prompt: 'primeira mensagem' };
}

db.query(
  'INSERT INTO accounts (id, email, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?)',
).run(bot.accountId, 'pessoa@exemplo.com', 'active', now(), now());
db.query(
  'INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
).run(
  bot.id,
  'Blog',
  'sprite-blog',
  'idle',
  bot.model,
  now(),
  now(),
  bot.accountId,
);

const publish = {
  url: 'https://blog.exemplo.com/admin/publicar',
  title: 'Publicar',
};

beforeEach(() => {
  judgeCalls = [];
});

describe("the person's order is the approval", () => {
  test('an action the order names runs, and says whose words allowed it', async () => {
    judgeAnswer = {
      risk: 'high',
      kind: 'publish',
      ordered: true,
      summary: 'Publicar o artigo favicon generator',
      reason: 'publica',
    };
    const verdict = await decide({
      bot,
      task: taskWith('publique o artigo de favicon generator'),
      toolName: 'chrome_click',
      args: publish,
      account,
    });
    expect(verdict.decision).toBe('run');
    expect(verdict.rule).toBe('ordered');
    expect(verdict.reason).toContain('publique o artigo');
    // The judge read the person's order and ran on the agent's own key and model.
    expect(judgeCalls[0].url).toContain('openrouter.ai');
    expect(judgeCalls[0].body.model).toBe('qwen/qwen3.8-flash');
    expect(judgeCalls[0].body.messages[1].content).toContain(
      'Ordem da pessoa (as palavras dela): publique o artigo',
    );
  });

  test('without an order the same action still asks', async () => {
    judgeAnswer = {
      risk: 'high',
      kind: 'publish',
      ordered: true,
      summary: 'Publicar',
      reason: 'publica',
    };
    const verdict = await decide({
      bot,
      task: taskWith(null),
      toolName: 'chrome_click',
      args: publish,
      account,
    });
    expect(verdict.decision).toBe('ask');
  });

  test('an action beyond the order asks', async () => {
    judgeAnswer = {
      risk: 'high',
      kind: 'send',
      ordered: false,
      summary: 'Enviar a newsletter',
      reason: 'envia',
    };
    const verdict = await decide({
      bot,
      task: taskWith('publique o artigo'),
      toolName: 'chrome_click',
      args: publish,
      account,
    });
    expect(verdict.decision).toBe('ask');
  });

  test('money and logins ask even when ordered', async () => {
    judgeAnswer = {
      risk: 'high',
      kind: 'pay',
      ordered: true,
      summary: 'Pagar o plano',
      reason: 'paga',
    };
    const verdict = await decide({
      bot,
      task: taskWith('assine o plano pro'),
      toolName: 'chrome_click',
      args: publish,
      account,
    });
    expect(verdict.decision).toBe('ask');
  });
});

describe('one approval covers a batch, and the "always" of the person covers the task', () => {
  const key = serviceGrantKey('conn-messages', 'external');
  const runs = (grants, times) =>
    Array.from({ length: times }, () => coverageOf(bot.id, grants, key));

  test('a standing permission asks again after the batch, with the count', () => {
    setToolPolicy(bot.id, key, 'free', { summary: 'Apagar a conversa' });
    const grants = new Map();
    expect(
      runs(grants, BATCH_LIMIT).every((cover) => cover?.by === 'always'),
    ).toBe(true);
    expect(coverageOf(bot.id, grants, key).exhausted.uses).toBe(BATCH_LIMIT);
  });

  test('"Sempre permitir" at the limit covers every action left in the task', () => {
    setToolPolicy(bot.id, key, 'free', { summary: 'Apagar a conversa' });
    const grants = new Map();
    runs(grants, BATCH_LIMIT + 1);
    openBatch(grants, key, 'always');
    expect(
      runs(grants, BATCH_LIMIT * 3).every((cover) => cover?.by === 'always'),
    ).toBe(true);
  });

  test('"Sempre permitir" given in the task is not asked again in it, and the next task has its batch', () => {
    setToolPolicy(bot.id, key, 'free', { summary: 'Apagar a conversa' });
    const grants = new Map();
    openBatch(grants, key, 'always');
    expect(
      runs(grants, BATCH_LIMIT + 5).every((cover) => cover?.by === 'always'),
    ).toBe(true);
    const nextTask = new Map();
    runs(nextTask, BATCH_LIMIT);
    expect(coverageOf(bot.id, nextTask, key).exhausted).toBeTruthy();
  });

  test('"Permitir" at the limit opens one more batch, no more', () => {
    setToolPolicy(bot.id, key, 'free', { summary: 'Apagar a conversa' });
    const grants = new Map();
    runs(grants, BATCH_LIMIT + 1);
    openBatch(grants, key, 'task', {
      approvalId: 'a1',
      summary: 'Apagar a conversa',
    });
    expect(
      runs(grants, BATCH_LIMIT).every((cover) => cover?.by === 'task'),
    ).toBe(true);
    expect(coverageOf(bot.id, grants, key).exhausted).toBeTruthy();
  });
});

describe('a service already allowed does not wait for the judge', () => {
  const connectedTool = {
    connectionId: 'conn-feeds',
    serviceTitle: 'Feeds',
    name: 'feeds_delete',
    description: 'Apagar no Feeds',
    annotations: { destructiveHint: true },
  };

  test('with "Sempre permitir" on the service, a delete runs at once and the judge is not called', async () => {
    setToolPolicy(bot.id, serviceGrantKey('conn-feeds', 'external'), 'free', {
      summary: 'Apagar peças no Feeds',
    });
    judgeAnswer = { kind: 'delete', reach: 'external', summary: 'x' };
    const verdict = await decide({
      bot,
      task: taskWith(null),
      toolName: 'mcp__feeds__feeds_delete',
      args: { op: 'feeds_delete_pieces', args: { pieceIds: ['a'] } },
      connectedTool,
      grants: new Map(),
      account,
    });
    expect(verdict.decision).toBe('run');
    expect(judgeCalls.length).toBe(0);
  });

  test('a call that looks like money still goes through the judge, and asks', async () => {
    setToolPolicy(bot.id, serviceGrantKey('conn-pay', 'external'), 'free', {
      summary: 'Payments',
    });
    judgeAnswer = {
      kind: 'pay',
      reach: 'external',
      summary: 'Cobrar o cliente',
    };
    const tool = {
      ...connectedTool,
      connectionId: 'conn-pay',
      serviceTitle: 'Payments',
      name: 'payments_write',
    };
    const verdict = await decide({
      bot,
      task: taskWith(null),
      toolName: 'mcp__payments__payments_write',
      args: { op: 'payments_create_charge' },
      connectedTool: tool,
      grants: new Map(),
      account,
    });
    expect(judgeCalls.length).toBeGreaterThan(0);
    expect(verdict.decision).toBe('ask');
  });
});

describe('a file in the agent own folder', () => {
  const own = { ...bot, folder: 'acme/diretor' };
  test('deleting a file inside its folder runs; outside it, or climbing out, asks', async () => {
    for (const path of [
      'funil/2026-11-10-gargalo.md',
      '/acme/diretor/funil/x.md',
      'home/sprite/workspace/acme/diretor/a.md',
    ]) {
      expect(
        (
          await decide({
            bot: own,
            task: taskWith(null),
            toolName: 'file_delete',
            args: { path },
            account,
          })
        ).decision,
      ).toBe('run');
    }
    for (const path of [
      '/README.md',
      '/acme/outro/a.md',
      '../outro/a.md',
      '/',
    ]) {
      expect(
        (
          await decide({
            bot: own,
            task: taskWith(null),
            toolName: 'file_delete',
            args: { path },
            account,
          })
        ).decision,
      ).toBe('ask');
    }
    expect(
      (
        await decide({
          bot,
          task: taskWith(null),
          toolName: 'file_delete',
          args: { path: 'a.md' },
          account,
        })
      ).decision,
    ).toBe('ask');
  });
});
