import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

// A database of its own: config.js reads DATA_DIR when first imported (the
// test files share one process, so the first file's database wins).
process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'assistant-addresses-'),
);
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const { router } = await import('./server.js');
const { fail } = await import('./http.js');
const { emitTaskEvent, listBotEvents } = await import('./events.js');
const { openVault } = await import('./vault.js');

// House rule (25/10/2026): a record is addressed only by its UUID. Its old
// address (a section's name, an event's number, a secret's name) answers
// exactly like an id that never existed.

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

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
    'x/y',
    now(),
    now(),
    accountId,
  );
  return { id: accountId, isOwner: false };
}

/** One call through the real route, as the server answers it, without a port or a token. */
async function call(account, method, pathname, body) {
  const match = router.match(method, pathname);
  if (!match) throw new Error(`sem rota: ${method} ${pathname}`);
  const req = new Request(`http://x${pathname}`, {
    method,
    ...(body === undefined
      ? {}
      : {
          body: JSON.stringify(body),
          headers: { 'Content-Type': 'application/json' },
        }),
  });
  let response;
  try {
    response = await match.handler({
      req,
      url: new URL(req.url),
      params: match.params,
      account,
    });
  } catch (error) {
    response = fail(error);
  }
  return { status: response.status, body: await response.json() };
}

describe('a section is addressed by its UUID', () => {
  test('its name, or an unknown id, is the same 404; its id renames, orders and deletes it', async () => {
    const account = seedBot('sec-bot', 'acc-sec');
    const created = await call(account, 'POST', '/api/sections', {
      name: 'Vendas',
    });
    expect(created.status).toBe(201);
    expect(created.body.id).toMatch(UUID);
    expect(created.body.name).toBe('Vendas');
    const { id } = created.body;

    const unknown = await call(
      account,
      'PATCH',
      `/api/sections/${crypto.randomUUID()}`,
      { name: 'Outra' },
    );
    const byName = await call(account, 'PATCH', '/api/sections/Vendas', {
      name: 'Outra',
    });
    expect(unknown.status).toBe(404);
    expect(byName).toEqual(unknown);
    expect((await call(account, 'DELETE', '/api/sections/Vendas')).status).toBe(
      404,
    );
    expect(
      (
        await call(account, 'PUT', '/api/sections/order', {
          sectionId: 'Vendas',
          botIds: ['sec-bot'],
        })
      ).status,
    ).toBe(404);
    expect(
      (
        await call(account, 'PATCH', '/api/bots/sec-bot', {
          sectionId: 'Vendas',
        })
      ).status,
    ).toBe(400);

    // Another account's id is nobody's.
    const stranger = seedBot('sec-other', 'acc-sec-other');
    expect(
      (await call(stranger, 'PATCH', `/api/sections/${id}`, { name: 'Minha' }))
        .status,
    ).toBe(404);

    const placed = await call(account, 'PUT', '/api/sections/order', {
      sectionId: id,
      botIds: ['sec-bot'],
    });
    expect(placed.status).toBe(200);
    expect(
      (await call(account, 'GET', '/api/bots/sec-bot')).body.sectionId,
    ).toBe(id);
    const renamed = await call(account, 'PATCH', `/api/sections/${id}`, {
      name: 'Comercial',
    });
    expect(renamed).toEqual({ status: 200, body: { id, name: 'Comercial' } });
    expect((await call(account, 'GET', '/api/sections')).body.items).toEqual([
      { id, name: 'Comercial' },
    ]);
    expect((await call(account, 'DELETE', `/api/sections/${id}`)).status).toBe(
      200,
    );
    expect(
      (await call(account, 'GET', '/api/bots/sec-bot')).body.sectionId,
    ).toBeNull();
    expect((await call(account, 'DELETE', `/api/sections/${id}`)).status).toBe(
      404,
    );
  });
});

describe('an event is addressed by its UUID', () => {
  test('rewinding to its number, or to an unknown id, is the same 404; its id goes back', async () => {
    const account = seedBot('ev-bot', 'acc-ev');
    db.query(
      "INSERT INTO tasks (id, bot_id, prompt, status, created_at, updated_at) VALUES ('ev-task', 'ev-bot', 'oi', 'done', ?, ?)",
    ).run(now(), now());
    db.query(
      "INSERT INTO task_messages (task_id, seq, message) VALUES ('ev-task', 0, ?)",
    ).run(JSON.stringify({ role: 'user', content: 'primeira' }));
    const message = emitTaskEvent('ev-task', 'user_message', {
      text: 'primeira',
      messageSeq: 0,
    });
    emitTaskEvent('ev-task', 'assistant', { text: 'resposta' });
    expect(message.id).toMatch(UUID);
    expect(Number.isInteger(message.seq)).toBe(true);
    // The number is a place in the conversation, still how the panel asks for what came after.
    const listed = listBotEvents('ev-bot', { afterSeq: message.seq });
    expect(listed.map((event) => event.type)).toEqual(['assistant']);
    expect(listed[0].id).toMatch(UUID);

    const unknown = await call(account, 'POST', '/api/tasks/ev-task/rewind', {
      eventId: crypto.randomUUID(),
    });
    const byNumber = await call(account, 'POST', '/api/tasks/ev-task/rewind', {
      eventId: message.seq,
    });
    const byNumberText = await call(
      account,
      'POST',
      '/api/tasks/ev-task/rewind',
      { eventId: String(message.seq) },
    );
    expect(unknown.status).toBe(404);
    expect(byNumber).toEqual(unknown);
    expect(byNumberText).toEqual(unknown);
    expect(listBotEvents('ev-bot')).toHaveLength(2);

    const back = await call(account, 'POST', '/api/tasks/ev-task/rewind', {
      eventId: message.id,
    });
    expect(back.status).toBe(200);
    expect(back.body.text).toBe('primeira');
    expect(listBotEvents('ev-bot')).toHaveLength(0);
  });
});

describe('a secret is addressed by its UUID', () => {
  test('its name, or an unknown id, is the same 404; its id changes and removes it; commands still read it by name', async () => {
    const account = seedBot('vault-bot', 'acc-vault');
    const created = await call(account, 'POST', '/api/bots/vault-bot/secrets', {
      name: 'GITHUB_TOKEN',
      value: 'ghp_primeiro_123456',
    });
    expect(created.status).toBe(201);
    expect(created.body.id).toMatch(UUID);
    expect(created.body.name).toBe('GITHUB_TOKEN');
    expect(JSON.stringify(created.body)).not.toContain('ghp_');
    const { id } = created.body;
    expect(
      (
        await call(account, 'POST', '/api/bots/vault-bot/secrets', {
          name: 'GITHUB_TOKEN',
          value: 'outro_valor_99',
        })
      ).status,
    ).toBe(409);

    const unknown = await call(
      account,
      'PATCH',
      `/api/bots/vault-bot/secrets/${crypto.randomUUID()}`,
      { value: 'ghp_trocado_654321' },
    );
    const byName = await call(
      account,
      'PATCH',
      '/api/bots/vault-bot/secrets/GITHUB_TOKEN',
      { value: 'ghp_trocado_654321' },
    );
    expect(unknown.status).toBe(404);
    expect(byName).toEqual(unknown);
    expect(
      await call(account, 'DELETE', '/api/bots/vault-bot/secrets/GITHUB_TOKEN'),
    ).toEqual(
      await call(
        account,
        'DELETE',
        `/api/bots/vault-bot/secrets/${crypto.randomUUID()}`,
      ),
    );
    expect(
      (
        await call(
          account,
          'DELETE',
          '/api/bots/vault-bot/secrets/GITHUB_TOKEN',
        )
      ).status,
    ).toBe(404);

    const changed = await call(
      account,
      'PATCH',
      `/api/bots/vault-bot/secrets/${id}`,
      { value: 'ghp_trocado_654321' },
    );
    expect(changed.status).toBe(200);
    expect(changed.body).toMatchObject({ id, name: 'GITHUB_TOKEN' });
    expect(await openVault('vault-bot')).toEqual({
      GITHUB_TOKEN: 'ghp_trocado_654321',
    });

    // Another bot's secret does not open through this one.
    const stranger = seedBot('vault-other', 'acc-vault');
    expect(
      (await call(stranger, 'DELETE', `/api/bots/vault-other/secrets/${id}`))
        .status,
    ).toBe(404);

    expect(
      (await call(account, 'DELETE', `/api/bots/vault-bot/secrets/${id}`))
        .status,
    ).toBe(200);
    expect(await openVault('vault-bot')).toEqual({});
  });
});

describe('a skill is read by its UUID', () => {
  test('skill_read by its name, or by an unknown id, finds nothing; by its id it reads', async () => {
    seedBot('skill-bot', 'acc-skill');
    const { createSkill } = await import('./skills.js');
    const { runBaseTool } = await import('./engine/tools.js');
    const skill = createSkill({
      botId: 'skill-bot',
      name: 'Relatório',
      whenToUse: 'toda manhã',
      steps: '1. abrir',
    });
    const bot = { id: 'skill-bot', accountId: 'acc-skill' };
    const read = (args) =>
      runBaseTool({ bot, task: { id: 'no-task' }, name: 'skill_read', args });
    expect((await read({ id: 'Relatório' })).text).toStartWith(
      'não achei a habilidade',
    );
    expect((await read({ id: crypto.randomUUID() })).text).toStartWith(
      'não achei a habilidade',
    );
    expect((await read({ id: skill.id })).text).toStartWith('# Relatório');
    seedBot('skill-other', 'acc-skill');
    expect(
      (
        await runBaseTool({
          bot: { id: 'skill-other', accountId: 'acc-skill' },
          task: { id: 'no-task' },
          name: 'skill_read',
          args: { id: skill.id },
        })
      ).text,
    ).toStartWith('não achei a habilidade');
  });
});
