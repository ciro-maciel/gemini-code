import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'assistant-presence-'),
);
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { subscribe } = await import('./events.js');
const { enterBot, listSeeing } = await import('./presence.js');

describe('who is looking at a bot right now', () => {
  test('two windows of one person are one person counted twice; the last one closed takes them out', () => {
    const heard = [];
    const off = subscribe('bot:p-1', (event) =>
      heard.push(event.data.people.map((person) => person.name)),
    );
    const ana = { id: 'a', name: 'Ana' };
    const first = enterBot('p-1', ana);
    const second = enterBot('p-1', ana);
    const leo = enterBot('p-1', { id: 'l', email: 'leo@exemplo.com' });
    expect(listSeeing('p-1').map((person) => person.name)).toEqual([
      'Ana',
      'leo@exemplo.com',
    ]);
    expect(listSeeing('p-1').map((person) => person.windows)).toEqual([2, 1]);
    first();
    first();
    expect(listSeeing('p-1')).toHaveLength(2);
    second();
    leo();
    expect(listSeeing('p-1')).toEqual([]);
    expect(heard).toEqual([
      ['Ana'],
      ['Ana'],
      ['Ana', 'leo@exemplo.com'],
      ['Ana', 'leo@exemplo.com'],
      ['leo@exemplo.com'],
      [],
    ]);
    off();
  });
});
