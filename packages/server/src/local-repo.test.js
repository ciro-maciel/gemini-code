import { afterAll, beforeAll, describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'gemini-local-repo-data-'),
);
process.env.WORKSPACE_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'gemini-local-repo-ws-'),
);
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { config } = await import('./config.js');
const { db, now } = await import('./db.js');
const repo = await import('./repo.js');
const { fetchBot } = await import('./bots.js');
const { listMemories, saveMemory } = await import('./engine/memory.js');
const { runBaseTool } = await import('./engine/tools.js');

const wsDir = mkdtempSync(path.join(tmpdir(), 'gemini-local-repo-run-'));
let savedConfig;

beforeAll(() => {
  savedConfig = {
    localWorkspaceDir: config.localWorkspaceDir,
    githubAppId: config.githubAppId,
    githubOrg: config.githubOrg,
    githubAppKey: config.githubAppKey,
  };
  Object.assign(config, {
    localWorkspaceDir: wsDir,
    githubAppId: '',
    githubOrg: '',
    githubAppKey: '',
  });
});

afterAll(() => {
  Object.assign(config, savedConfig);
});

db.query(
  'INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
).run('acc-local', 'dev@gemini.local', 'Dev', 'active', now(), now());
db.query(
  'INSERT INTO bots (id, name, sprite_name, status, model, instructions, folder, created_at, updated_at, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
).run(
  'b-local',
  'Arquiteto',
  'sprite-local-1',
  'idle',
  'gemini-2.5-flash',
  'Escreva specs claras.',
  'agents/arquiteto/docs',
  now(),
  now(),
  'acc-local',
);
saveMemory({
  botId: 'b-local',
  kind: 'decision',
  content: 'Sempre usar TypeScript estrito.',
});

describe('local document store (zero GitHub config)', () => {
  test('syncAccount materializes README, INSTRUCTIONS and decisions locally and exposes local repoInfo', async () => {
    expect(repo.isDocumentsReady()).toBe(true);
    await repo.syncAccount('acc-local');
    const info = repo.repoInfoOf('acc-local');
    expect(info.mode).toBe('local');
    expect(info.syncedAt).toBeGreaterThan(now() - 5);

    const files = (await repo.listFiles('acc-local')).map((file) => file.path);
    expect(files).toContain('README.md');
    expect(files).toContain('agents/arquiteto/INSTRUCTIONS.md');
    expect(files).toContain('agents/arquiteto/memory/decisions.md');
  });

  test('saving INSTRUCTIONS.md and decisions.md locally records SQLite revisions with unified diffs and syncs back to DB', async () => {
    const current = await repo.openFile(
      'acc-local',
      'agents/arquiteto/INSTRUCTIONS.md',
    );
    expect(current.content).toContain('Escreva specs claras.');

    const updated = current.content.replace(
      'Escreva specs claras.',
      'Escreva specs claras e objetivas.',
    );
    await repo.saveFile(
      'acc-local',
      'agents/arquiteto/INSTRUCTIONS.md',
      updated,
    );
    expect(fetchBot('b-local').instructions).toBe(
      'Escreva specs claras e objetivas.',
    );

    const history = await repo.historyOf(
      'acc-local',
      'agents/arquiteto/INSTRUCTIONS.md',
    );
    expect(history.length).toBeGreaterThanOrEqual(2);
    const patch = await repo.diffOf(
      'acc-local',
      history[0].sha,
      'agents/arquiteto/INSTRUCTIONS.md',
    );
    expect(patch).toContain('-Escreva specs claras.');
    expect(patch).toContain('+Escreva specs claras e objetivas.');

    const memPath = 'agents/arquiteto/memory/decisions.md';
    const memText =
      '# O que Arquiteto lembra\n\n## Decisões\n\n- Sempre usar TypeScript estrito.\n\n## Preferências\n\n- Documentar contratos em Markdown.\n';
    await repo.saveFile('acc-local', memPath, memText);
    expect(
      listMemories('b-local')
        .map((m) => `${m.kind}:${m.content}`)
        .sort(),
    ).toEqual([
      'decision:Sempre usar TypeScript estrito.',
      'preference:Documentar contratos em Markdown.',
    ]);
  });

  test('agents/<slug>/docs allows uploads and deletes while central folders and path traversal are blocked', async () => {
    await repo.uploadFiles('acc-local', 'agents/arquiteto/docs', [
      { name: 'rfc.md', bytes: Buffer.from('# RFC 01\n') },
    ]);
    expect(
      (await repo.openFile('acc-local', 'agents/arquiteto/docs/rfc.md'))
        ?.content,
    ).toBe('# RFC 01\n');

    await expect(
      repo.uploadFiles('acc-local', 'agents/arquiteto', [
        { name: 'a.md', bytes: Buffer.from('x') },
      ]),
    ).rejects.toThrow('work folder');
    await expect(
      repo.saveFile('acc-local', '../escape.txt', 'nope'),
    ).rejects.toThrow('invalid');
    await expect(
      repo.removePath('acc-local', 'agents/arquiteto/INSTRUCTIONS.md'),
    ).rejects.toThrow('from the dashboard');

    const removed = await repo.removePath(
      'acc-local',
      'agents/arquiteto/docs/rfc.md',
    );
    expect(removed.removed).toBe(1);
    expect(
      await repo.openFile('acc-local', 'agents/arquiteto/docs/rfc.md'),
    ).toBeNull();
  });

  test('agent file tools work natively in local mode inside bot.folder', async () => {
    const bot = fetchBot('b-local');
    const run = (name, args) =>
      runBaseTool({
        bot,
        task: { id: 't-local' },
        name,
        args,
        setEnabledTools: () => {},
      });

    const wrote = await run('file_write', {
      path: 'plano.md',
      content: '# Plano Local\n',
    });
    expect(wrote.text).toContain('criado: /agents/arquiteto/docs/plano.md');

    const listed = await run('files_list', {});
    expect(listed.text).toContain('/agents/arquiteto/docs/plano.md');

    const read = await run('file_read', { path: 'plano.md' });
    expect(read.text).toBe('# Plano Local\n');

    const deleted = await run('file_delete', { path: 'plano.md' });
    expect(deleted.text).toBe(
      'apagado do repositório: /agents/arquiteto/docs/plano.md',
    );
  });
});
