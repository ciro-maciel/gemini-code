import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'assistant-settings-'),
);
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const bots = await import('./bots.js');
const ai = await import('./ai-accounts.js');
const { openVault } = await import('./vault.js');

function seed(id, account = 'acc-s') {
  db.query(
    'INSERT INTO accounts (id, email, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
  ).run(account, `${account}@exemplo.com`, 'active', now(), now());
  db.query(
    'INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    id,
    `sprite-${id}`,
    'idle',
    'deepseek/deepseek-v4.1-flash',
    now(),
    now(),
    account,
  );
}

describe('what each agent chooses', () => {
  test('effort, folder and template are kept; a folder never leaves the workspace', () => {
    seed('s-1');
    const bot = bots.updateBotSettings('s-1', {
      effort: 'high',
      folder: '/relatorios/semana/',
      templateId: 'sdr',
    });
    expect(bot).toMatchObject({
      effort: 'high',
      folder: 'relatorios/semana',
      templateId: 'sdr',
    });
    expect(() => bots.updateBotSettings('s-1', { effort: 'extreme' })).toThrow(
      'esforço',
    );
    expect(() =>
      bots.updateBotSettings('s-1', { folder: '../../etc' }),
    ).toThrow('workspace');
    expect(
      bots.updateBotSettings('s-1', { folder: '', effort: null }),
    ).toMatchObject({ folder: null, effort: null });
  });

  test('connections: only the account ones are kept, and null means all of them', () => {
    seed('s-2');
    db.query(
      "INSERT INTO connections (id, account_id, server_name, title, url, transport, status, created_at, updated_at) VALUES ('c-1', 'acc-s', 'gmail', 'Gmail', 'https://g', 'http', 'connected', 0, 0)",
    ).run();
    expect(
      bots.updateBotSettings('s-2', {
        connectionIds: ['c-1', 'c-other', 'c-1'],
      }).connectionIds,
    ).toEqual(['c-1']);
    expect(
      bots.updateBotSettings('s-2', { connectionIds: null }).connectionIds,
    ).toBeNull();
    expect(bots.listBots('acc-s').find((b) => b.id === 's-2')).toMatchObject({
      connectionIds: null,
      spendToday: 0,
    });
    expect(bots.usesConnection({ connectionIds: null }, 'c-9')).toBe(true);
    expect(bots.usesConnection({ connectionIds: ['c-1'] }, 'c-9')).toBe(false);
    expect(bots.usesConnection({ connectionIds: [] }, 'c-1')).toBe(false);
  });

  test('an AI account belongs to its account, reaches the vault of the agent that picks it, and leaves when deleted', async () => {
    seed('s-3');
    seed('s-4', 'acc-other');
    const account = await ai.createAiAccount('acc-s', {
      provider: 'claude-code',
      name: 'Empresa',
      token: 'sk-ant-oat-secret-token',
    });
    expect(() =>
      bots.updateBotSettings('s-4', { aiAccount: account.id }),
    ).toThrow('conta de IA');
    bots.updateBotSettings('s-3', { aiAccount: account.id });
    expect((await openVault('s-3')).CLAUDE_CODE_OAUTH_TOKEN).toBe(
      'sk-ant-oat-secret-token',
    );
    expect(ai.listAiAccounts('acc-s')).toEqual([
      expect.objectContaining({ name: 'Empresa', agents: 1 }),
    ]);
    ai.deleteAiAccount('acc-s', account.id);
    expect(bots.fetchBot('s-3').aiAccount).toBeNull();
    expect((await openVault('s-3')).CLAUDE_CODE_OAUTH_TOKEN).toBeUndefined();
  });

  test('an API key opens its models; an agent talks on the ones turned on, and the Claude Code token serves every agent', async () => {
    seed('s-5');
    seed('s-6');
    const fakeOpenAi = async (url, { headers = {} } = {}) => {
      if (url.startsWith('https://openrouter.ai/'))
        return Response.json({
          data: [
            {
              id: 'openai/gpt-6-mini',
              name: 'OpenAI: GPT-6 Mini',
              created: 1790000000,
              pricing: { prompt: '0.0000004', completion: '0.0000016' },
            },
          ],
        });
      return headers.Authorization === 'Bearer sk-good'
        ? Response.json({
            data: [
              { id: 'gpt-6', created: 1780000000 },
              { id: 'gpt-6-mini' },
              { id: 'text-embedding-4' },
              { id: 'whisper-2' },
            ],
          })
        : new Response('no', { status: 401 });
    };
    await expect(
      ai.createAiAccount(
        'acc-s',
        { provider: 'openai', token: 'sk-bad' },
        fakeOpenAi,
      ),
    ).rejects.toThrow('a chave não abriu');
    const openai = await ai.createAiAccount(
      'acc-s',
      { provider: 'openai', token: 'sk-good' },
      fakeOpenAi,
    );
    expect(openai).toMatchObject({
      name: 'OpenAI',
      provider: 'openai',
      models: [],
    });
    // Newest first; the price and the date missing from the provider come from OpenRouter's catalog.
    expect(await ai.availableModels('acc-s', openai.id, fakeOpenAi)).toEqual([
      {
        id: 'gpt-6-mini',
        label: 'OpenAI: GPT-6 Mini',
        createdAt: 1790000000,
        price: { input: 0.4, output: 1.6 },
      },
      { id: 'gpt-6', label: 'gpt-6', createdAt: 1780000000, price: null },
    ]);
    expect(() =>
      bots.updateBotSettings('s-5', { aiAccount: openai.id, model: 'gpt-6' }),
    ).toThrow('fora da lista');
    ai.setAccountModels('acc-s', openai.id, ['gpt-6']);
    expect(ai.brainsFor('acc-s').at(-1)).toMatchObject({
      account: { id: openai.id, provider: 'openai' },
      models: [{ id: 'gpt-6' }],
    });
    expect(ai.brainForNewAgent('acc-s', 'openai/gpt-6')).toEqual({
      aiAccount: openai.id,
      model: 'gpt-6',
    });
    expect(ai.brainForNewAgent('acc-s', 'anthropic/claude-haiku-5.5')).toEqual({
      aiAccount: openai.id,
      model: 'gpt-6',
    });
    bots.updateBotSettings('s-5', { aiAccount: openai.id, model: 'gpt-6' });
    ai.addAccountUsage(openai.id, 0.5);
    ai.addAccountUsage(openai.id, 0.25);
    expect(
      ai.listAiAccounts('acc-s').find((item) => item.id === openai.id).usage,
    ).toEqual({ today: 0.75, last30Days: 0.75 });
    expect(await ai.chatAccountFor('s-5')).toEqual({
      id: openai.id,
      provider: 'openai',
      key: 'sk-good',
    });
    expect(await ai.chatAccountFor('s-6')).toBeNull();
    const code = await ai.createAiAccount('acc-s', {
      provider: 'claude-code',
      token: 'oat-shared',
    });
    expect((await openVault('s-5')).CLAUDE_CODE_OAUTH_TOKEN).toBe('oat-shared');
    ai.deleteAiAccount('acc-s', openai.id);
    expect(bots.fetchBot('s-5')).toMatchObject({ aiAccount: null });
    expect(ai.brainsFor('acc-s')).toEqual([]);
    ai.deleteAiAccount('acc-s', code.id);
  });
});
