import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'assistant-instructions-'),
);
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const { decide } = await import('./engine/policy.js');
const { runBaseTool } = await import('./engine/tools.js');
const { fetchBot } = await import('./bots.js');

// 10/11/2026: an agent that learned from a measured result proposes the change to its own
// instructions; the person approves it on the card, and the next message already follows it.

db.query(
  "INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('acc-ins', 'ins@exemplo.com', 'Ana', 'active', ?, ?)",
).run(now(), now());
db.query(
  "INSERT INTO bots (id, name, sprite_name, status, model, instructions, created_at, updated_at, account_id) VALUES ('bot-ins', 'SEO', 's-ins', 'idle', 'x', 'Publique às segundas.\nNunca use emoji.', ?, ?, 'acc-ins')",
).run(now(), now());

describe('an agent changes its own instructions', () => {
  test('it always asks, with the lesson and the exact change on the card', async () => {
    const verdict = await decide({
      bot: fetchBot('bot-ins'),
      task: null,
      toolName: 'instructions_update',
      args: {
        find: 'Publique às segundas.',
        replace: 'Publique às terças.',
        reason: 'terça teve 2x os cliques em 6 semanas',
      },
    });
    expect(verdict.decision).toBe('ask');
    expect(verdict.summary).toContain('terça teve 2x os cliques');
    expect(verdict.reason).toContain('Publique às terças.');
  });

  test('approved, it swaps the exact passage and keeps the rest', async () => {
    const result = await runBaseTool({
      bot: fetchBot('bot-ins'),
      task: { id: 't' },
      name: 'instructions_update',
      args: {
        find: 'Publique às segundas.',
        replace: 'Publique às terças.',
        reason: 'lição',
      },
      setEnabledTools: () => {},
    });
    expect(result.text).toContain('instruções mudadas');
    expect(fetchBot('bot-ins').instructions).toBe(
      'Publique às terças.\nNunca use emoji.',
    );
  });

  test('a passage that is not there changes nothing', async () => {
    const result = await runBaseTool({
      bot: fetchBot('bot-ins'),
      task: { id: 't' },
      name: 'instructions_update',
      args: { find: 'Publique aos domingos.', replace: 'x', reason: 'lição' },
      setEnabledTools: () => {},
    });
    expect(result.text).toStartWith('erro');
    expect(fetchBot('bot-ins').instructions).toBe(
      'Publique às terças.\nNunca use emoji.',
    );
  });

  test('without find, the new rule goes at the end', async () => {
    await runBaseTool({
      bot: fetchBot('bot-ins'),
      task: { id: 't' },
      name: 'instructions_update',
      args: { replace: 'Confira o placar antes de publicar.', reason: 'lição' },
      setEnabledTools: () => {},
    });
    expect(
      fetchBot('bot-ins').instructions.endsWith(
        'Confira o placar antes de publicar.',
      ),
    ).toBe(true);
  });
});
