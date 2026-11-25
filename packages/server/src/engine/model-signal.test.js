import { afterAll, beforeAll, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-signal-'));
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { complete } = await import('./model.js');

// A provider that never answers until the call is cut.
const realFetch = globalThis.fetch;
beforeAll(() => {
  globalThis.fetch = (url, { signal }) =>
    new Promise((_, reject) => {
      if (String(url).startsWith('https://openrouter.ai/api/v1/models'))
        return reject(new Error('sem catálogo'));
      signal.addEventListener('abort', () => reject(signal.reason));
    });
});
afterAll(() => {
  globalThis.fetch = realFetch;
});

test('a model that does not answer is cut at once when the step is interrupted, not after its timeout', async () => {
  const controller = new AbortController();
  const startedAt = performance.now();
  const call = complete({
    model: 'qwen/qwen3.8-flash',
    account: { id: 'a', provider: 'openrouter', key: 'k' },
    messages: [{ role: 'user', content: 'oi' }],
    signal: controller.signal,
  });
  setTimeout(() => controller.abort(), 30);
  await expect(call).rejects.toThrow();
  expect(controller.signal.aborted).toBe(true);
  expect(performance.now() - startedAt).toBeLessThan(2000);
}, 3000);
