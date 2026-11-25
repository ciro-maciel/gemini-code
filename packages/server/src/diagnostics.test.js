import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'diagnostics-'));
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { runDiagnostics } = await import('./diagnostics.js');

const ACCOUNT = { id: 'acc-diag', email: 'diag@example.com' };
const base = {
  bots: () => [],
  connections: () => [],
  subscription: () => ({ status: 'off' }),
  browser: () => ({ isLinked: false }),
};
const find = (result, id) => result.items.find((item) => item.id === id);

describe('diagnostics', () => {
  test('a Gemini key Google refuses fails, with Google’s words', async () => {
    const result = await runDiagnostics(ACCOUNT, {
      ...base,
      chatAccounts: async () => [{ provider: 'google', key: 'AIza-bad' }],
      listModels: async () => {
        throw new Error('API key not valid');
      },
    });
    expect(find(result, 'gemini-key')).toMatchObject({
      status: 'fail',
      detail: expect.stringContaining('API key not valid'),
    });
  });

  test('no Gemini key fails and says where to add one', async () => {
    const result = await runDiagnostics(ACCOUNT, {
      ...base,
      chatAccounts: async () => [{ provider: 'openrouter', key: 'sk-or' }],
    });
    expect(find(result, 'gemini-key').status).toBe('fail');
    expect(find(result, 'gemini-key').detail).toContain('AI accounts');
  });

  test('a working key is ok; a failed connector fails with its reason; the summary counts every check', async () => {
    const result = await runDiagnostics(ACCOUNT, {
      ...base,
      chatAccounts: async () => [{ provider: 'google', key: 'AIza-ok' }],
      listModels: async () => [
        { id: 'gemini-3.6-flash' },
        { id: 'gemini-3.5-flash' },
      ],
      connections: () => [
        { id: 'c1', title: 'Figma', status: 'failed', statusDetail: 'refused' },
        { id: 'c2', title: 'Linear', status: 'connected', tools: [{}, {}, {}] },
      ],
    });
    expect(find(result, 'gemini-key')).toMatchObject({ status: 'ok' });
    expect(find(result, 'gemini-key').detail).toContain('2 chat models');
    expect(find(result, 'connection:c1')).toMatchObject({
      status: 'fail',
      detail: 'refused',
    });
    expect(find(result, 'connection:c2').detail).toBe('Connected, 3 tools');
    const total = Object.values(result.summary).reduce((a, b) => a + b, 0);
    expect(total).toBe(result.items.length);
    expect(result.items.every((item) => typeof item.ms === 'number')).toBe(
      true,
    );
  });
});
