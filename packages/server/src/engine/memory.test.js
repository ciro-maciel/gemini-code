import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-memory-'));
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('../db.js');
const memory = await import('./memory.js');

function seedBot(id) {
  db.query(
    'INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(id, id, `sprite-${id}`, 'idle', 'x/y', now(), now());
}

describe('memory in three kinds', () => {
  test('an unknown kind is an observation; the three kinds are kept as they are', () => {
    seedBot('mem-a');
    memory.saveMemory({
      botId: 'mem-a',
      kind: 'decision',
      content: 'Sem número de inscrito',
    });
    memory.saveMemory({
      botId: 'mem-a',
      kind: 'whatever',
      content: 'O pico foi na quarta',
    });
    expect(
      memory
        .listMemories('mem-a')
        .map((m) => m.kind)
        .sort(),
    ).toEqual(['decision', 'observation']);
  });

  test('an observation expires after thirty days; a decision never does', () => {
    seedBot('mem-b');
    memory.saveMemory({
      botId: 'mem-b',
      kind: 'observation',
      content: 'velha',
    });
    memory.saveMemory({
      botId: 'mem-b',
      kind: 'preference',
      content: 'proposta em uma página',
    });
    const later = now() + 31 * 86400;
    expect(memory.listMemories('mem-b', later).map((m) => m.content)).toEqual([
      'proposta em uma página',
    ]);
    expect(
      memory.listMemories('mem-b').find((m) => m.kind === 'observation')
        .daysLeft,
    ).toBe(30);
  });

  test('a person fixes the text in place, and the prompt follows decisions before observations', () => {
    seedBot('mem-c');
    const id = memory.saveMemory({
      botId: 'mem-c',
      kind: 'observation',
      content: 'erro',
    });
    memory.saveMemory({
      botId: 'mem-c',
      kind: 'decision',
      content: 'Bloco 1 com a maior notícia',
    });
    expect(memory.updateMemory('mem-c', id, 'certo')).toBe(true);
    expect(memory.updateMemory('mem-c', 'nope', 'x')).toBe(false);
    const prompt = memory.formatMemoriesForPrompt('mem-c');
    expect(prompt.indexOf('Bloco 1')).toBeLessThan(prompt.indexOf('certo'));
    expect(prompt).toContain('siga sempre');
  });

  test('⌘K finds the memories of the account agents by their words, never another account', () => {
    db.query(
      "INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES ('mem-s', 'Métricas', 'sprite-mem-s', 'idle', 'm', 1, 1, 'acc-mem'), ('mem-o', 'Outro', 'sprite-mem-o', 'idle', 'm', 1, 1, 'acc-other')",
    ).run();
    memory.saveMemory({
      botId: 'mem-s',
      kind: 'preference',
      content: 'Relatório sempre às segundas',
    });
    memory.saveMemory({
      botId: 'mem-o',
      kind: 'preference',
      content: 'Relatório de outra conta',
    });
    expect(memory.searchMemories('acc-mem', 'relatório')).toEqual([
      expect.objectContaining({
        botId: 'mem-s',
        botName: 'Métricas',
        content: 'Relatório sempre às segundas',
      }),
    ]);
    expect(memory.searchMemories('acc-mem', '  ')).toEqual([]);
    expect(memory.memoriesInPrompt('mem-s')).toEqual([
      'Relatório sempre às segundas',
    ]);
  });
});
