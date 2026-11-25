import { expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'assistant-mentions-'),
);
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const { emitTaskEvent } = await import('./events.js');
const mentions = await import('./mentions.js');
const { handoffsOf } = await import('./handoff.js');

const bot = (id, name, account = 'mn-acc') =>
  db
    .query(
      'INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
    )
    .run(id, name, `s-${id}`, 'idle', 'x/y', now(), now(), account);
const task = (id, botId) =>
  db
    .query(
      'INSERT INTO tasks (id, bot_id, prompt, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    .run(id, botId, 'p', 'done', now(), now());
bot('mn-a', 'Roteiro');
bot('mn-b', 'Métricas');
bot('mn-c', 'Diretor');
bot('mn-d', 'Diretor de operações');
bot('mn-x', 'Métricas', 'other-acc');
const roteiro = { id: 'mn-a', name: 'Roteiro', accountId: 'mn-acc' };
const events = (taskId) =>
  db
    .query('SELECT type, data FROM task_events WHERE task_id = ? ORDER BY id')
    .all(taskId)
    .map((row) => ({ type: row.type, ...JSON.parse(row.data) }));

test('the colleague named with @, the longest name first, only of the same account', () => {
  expect(mentions.findMention(roteiro, 'sem menção')).toBeNull();
  expect(mentions.findMention(roteiro, '@métricas quanto deu?').id).toBe(
    'mn-b',
  );
  expect(
    mentions.findMention(roteiro, 'pergunta ao @Diretor de operações').id,
  ).toBe('mn-d');
  expect(mentions.findMention(roteiro, '@Roteiro, você mesmo')).toBeNull();
});

test('the call shows where it was written and goes to the colleague; its answer comes back', () => {
  expect(
    mentions.callColleague(
      roteiro,
      { id: 'mn-b', name: 'Métricas' },
      '@Métricas e o ep39?',
      'Ana',
      { deliver: () => {} },
    ),
  ).toBeNull();
  task('mn-ta', 'mn-a');
  const delivered = [];
  mentions.callColleague(
    roteiro,
    { id: 'mn-b', name: 'Métricas' },
    '@Métricas e o ep39?',
    'Ana',
    { deliver: (...args) => delivered.push(args) },
  );
  expect(events('mn-ta').at(-1)).toMatchObject({
    type: 'user_message',
    author: 'Ana',
    mention: { botId: 'mn-b', name: 'Métricas' },
  });
  expect(delivered[0][0]).toBe('mn-b');
  expect(delivered[0][2]).toMatchObject({
    replyTo: 'mn-a',
    handoff: { from: 'Ana em Roteiro', fromBotId: 'mn-a' },
  });

  task('mn-tb', 'mn-b');
  emitTaskEvent('mn-tb', 'user_message', {
    text: '@Métricas e o ep39?',
    replyTo: 'mn-a',
  });
  expect(mentions.relayReply('mn-tb')).toBe(false);
  emitTaskEvent('mn-tb', 'assistant', { text: 'lendo…', isFinal: false });
  emitTaskEvent('mn-tb', 'assistant', { text: '12 mil views', isFinal: true });
  expect(mentions.relayReply('mn-tb')).toBe(true);
  expect(events('mn-ta').at(-1)).toMatchObject({
    type: 'colleague',
    botId: 'mn-b',
    name: 'Métricas',
    text: '12 mil views',
  });
  expect(mentions.relayReply('mn-tb')).toBe(false);
});

test('who passed work to an agent and who it passed to, from what happened', () => {
  task('mn-td', 'mn-d');
  emitTaskEvent('mn-td', 'user_message', {
    text: 'lead',
    handoff: { from: 'Roteiro', fromBotId: 'mn-a' },
  });
  expect(handoffsOf('mn-d')).toEqual({
    from: [{ id: 'mn-a', name: 'Roteiro' }],
    to: [],
  });
  expect(handoffsOf('mn-a').to.map((bot) => bot.id)).toEqual(['mn-d']);
});
