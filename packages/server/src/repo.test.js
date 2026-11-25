import { describe, expect, test } from 'bun:test';
import { createHmac, generateKeyPairSync } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-repo-'));
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { config } = await import('./config.js');
const { db, now } = await import('./db.js');
const github = await import('./github.js');
const repo = await import('./repo.js');
const { saveMemory, listMemories } = await import('./engine/memory.js');
const { fetchBot } = await import('./bots.js');
const { fakeGithub } = await import('./fake-github.test-support.js');
const { subscribe } = await import('./events.js');

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
Object.assign(config, {
  githubAppId: '123',
  githubOrg: 'org-test',
  githubAppKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
  githubWebhookSecret: 'segredo',
});

const fake = fakeGithub();
github.useFetch(fake.fetch);
db.query(
  'INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)',
).run('acc-r', 'ana@exemplo.com', 'Ana', 'active', now(), now());
db.query(
  'INSERT INTO bots (id, name, sprite_name, status, model, instructions, created_at, updated_at, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
).run(
  'r-1',
  'Pauta do ep40',
  'sprite-r1',
  'idle',
  'deepseek/deepseek-v4.1-flash',
  'Confira as fontes.',
  now(),
  now(),
  'acc-r',
);
saveMemory({
  botId: 'r-1',
  kind: 'decision',
  content: 'Só com fonte oficial.',
});
const files = () => fake.repos.get('assistant-acc-r').files;

describe('the person repository', () => {
  test('the first sync makes it private and writes every file', async () => {
    await repo.syncAccount('acc-r');
    expect(fake.repos.get('assistant-acc-r').private).toBe(true);
    expect(Object.keys(files()).sort()).toEqual([
      'README.md',
      'agents/pauta-do-ep40/INSTRUCTIONS.md',
      'agents/pauta-do-ep40/memory/decisions.md',
    ]);
    expect(repo.syncedAtOf('acc-r')).toBeGreaterThan(now() - 5);
  });

  test('only what changed travels, as one commit; nothing changed is no commit', async () => {
    const before = fake.repos.get('assistant-acc-r').commits.length;
    db.query(
      "UPDATE bots SET instructions = 'Confira as fontes duas vezes.' WHERE id = 'r-1'",
    ).run();
    await repo.syncAccount('acc-r');
    await repo.syncAccount('acc-r');
    expect(fake.repos.get('assistant-acc-r').commits.length).toBe(before + 1);
    expect(files()['agents/pauta-do-ep40/INSTRUCTIONS.md']).toContain(
      'duas vezes',
    );
  });

  test('a file saved in the panel is a commit in the person name and comes back into the agent', async () => {
    const text = files()['agents/pauta-do-ep40/INSTRUCTIONS.md'].replace(
      'duas vezes',
      'três vezes',
    );
    await repo.saveFile('acc-r', 'agents/pauta-do-ep40/INSTRUCTIONS.md', text);
    expect(fetchBot('r-1').instructions).toBe('Confira as fontes três vezes.');
    expect(fake.repos.get('assistant-acc-r').commits[0].author.name).toBe(
      'Ana',
    );
    const count = fake.repos.get('assistant-acc-r').commits.length;
    await repo.saveFile('acc-r', 'agents/pauta-do-ep40/INSTRUCTIONS.md', text);
    expect(fake.repos.get('assistant-acc-r').commits.length).toBe(count);
  });

  test('an edit on GitHub comes back through a signed push; an unsigned one does not', async () => {
    const repoFiles = fake.repos.get('assistant-acc-r');
    repoFiles.files['agents/pauta-do-ep40/memory/decisions.md'] =
      '# O que lembra\n\n## Decisões\n\n- Só com fonte oficial.\n\n## Preferências\n\n- Bloco 1 com a maior notícia.\n';
    const payload = {
      ref: 'refs/heads/main',
      repository: { name: 'assistant-acc-r', default_branch: 'main' },
      commits: [{ modified: ['agents/pauta-do-ep40/memory/decisions.md'] }],
    };
    const raw = JSON.stringify(payload);
    expect(repo.isSignedByGithub(raw, 'sha256=errado')).toBe(false);
    expect(
      repo.isSignedByGithub(
        raw,
        `sha256=${createHmac('sha256', 'segredo').update(raw).digest('hex')}`,
      ),
    ).toBe(true);
    expect(await repo.onPush(payload)).toBe(1);
    expect(
      listMemories('r-1')
        .map((m) => `${m.kind}:${m.content}`)
        .sort(),
    ).toEqual([
      'decision:Só com fonte oficial.',
      'preference:Bloco 1 com a maior notícia.',
    ]);
  });

  test('a file the person keeps (work, not the central) is never removed', async () => {
    fake.repos.get('assistant-acc-r').files['relatorios/ep39.html'] = '<html>';
    db.query("UPDATE bots SET name = 'Pauta do ep41' WHERE id = 'r-1'").run();
    await repo.syncAccount('acc-r');
    expect(files()['relatorios/ep39.html']).toBe('<html>');
    expect(
      Object.keys(files()).some((p) => p.startsWith('agents/pauta-do-ep40/')),
    ).toBe(false);
    expect(files()['agents/pauta-do-ep41/INSTRUCTIONS.md']).toBeDefined();
  });

  test('files sent to a work folder are one commit; renaming the folder moves all of it', async () => {
    await repo.uploadFiles('acc-r', 'videos/ep40', [
      { name: 'roteiro.md', bytes: Buffer.from('# roteiro') },
      { name: 'capa.txt', bytes: Buffer.from('capa') },
    ]);
    expect(files()['videos/ep40/roteiro.md']).toBe('# roteiro');
    expect(fake.repos.get('assistant-acc-r').commits[0].author.name).toBe(
      'Ana',
    );
    await repo.renameFolder('acc-r', 'videos/ep40', 'videos/episodio-40');
    expect(files()['videos/episodio-40/capa.txt']).toBe('capa');
    expect(Object.keys(files()).some((p) => p.startsWith('videos/ep40/'))).toBe(
      false,
    );
  });

  test('a file or a whole folder is deleted in one commit', async () => {
    await repo.uploadFiles('acc-r', 'apagar/sub', [
      { name: 'a.md', bytes: Buffer.from('a') },
      { name: 'b.md', bytes: Buffer.from('b') },
    ]);
    await repo.uploadFiles('acc-r', 'apagar-nao', [
      { name: 'c.md', bytes: Buffer.from('c') },
    ]);
    expect((await repo.removePath('acc-r', 'apagar/sub/a.md')).removed).toBe(1);
    expect(files()['apagar/sub/b.md']).toBe('b');
    expect((await repo.removePath('acc-r', '/apagar/')).removed).toBe(1);
    expect(Object.keys(files()).some((p) => p.startsWith('apagar/'))).toBe(
      false,
    );
    expect(files()['apagar-nao/c.md']).toBe('c');
    await expect(repo.removePath('acc-r', 'agents')).rejects.toThrow(
      'from the dashboard',
    );
    await expect(repo.removePath('acc-r', 'a/../b')).rejects.toThrow('invalid');
    await expect(repo.removePath('acc-r', 'apagar')).rejects.toThrow('unknown');
  });

  test('every commit tells the account panels at once, and only that account', async () => {
    const heard = [];
    const offMine = subscribe('account:acc-r', (event) =>
      heard.push(['mine', event.type]),
    );
    const offOther = subscribe('account:acc-other', (event) =>
      heard.push(['other', event.type]),
    );
    await repo.saveFile('acc-r', 'aviso/LEIA.md', '# aviso\n');
    await repo.removePath('acc-r', 'aviso');
    offMine();
    offOther();
    expect(heard.length).toBeGreaterThanOrEqual(2);
    expect(
      heard.every(([who, type]) => who === 'mine' && type === 'repo'),
    ).toBe(true);
  });

  test('a folder deleted and made again is written again', async () => {
    await repo.saveFile('acc-r', 'de-novo/LEIA.md', '# de-novo\n');
    await repo.removePath('acc-r', 'de-novo');
    expect(files()['de-novo/LEIA.md']).toBeUndefined();
    await repo.saveFile('acc-r', 'de-novo/LEIA.md', '# de-novo\n');
    expect(files()['de-novo/LEIA.md']).toBe('# de-novo\n');
  });

  test('the central folders and odd paths are refused', async () => {
    await expect(
      repo.uploadFiles('acc-r', 'agents/x', [
        { name: 'a.md', bytes: Buffer.from('a') },
      ]),
    ).rejects.toThrow('work folder');
    await expect(
      repo.uploadFiles('acc-r', 'videos', [
        { name: '../a.md', bytes: Buffer.from('a') },
      ]),
    ).rejects.toThrow('invalid');
    await expect(
      repo.renameFolder('acc-r', 'skills', 'habilidades'),
    ).rejects.toThrow('from the dashboard');
    await expect(repo.renameFolder('acc-r', 'nada', 'outra')).rejects.toThrow(
      'unknown',
    );
  });
});
