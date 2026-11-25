import { describe, expect, test } from 'bun:test';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'assistant-file-tools-'),
);
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { config } = await import('./config.js');
const { db, now } = await import('./db.js');
const github = await import('./github.js');
const { runBaseTool } = await import('./engine/tools.js');
const { decide } = await import('./engine/policy.js');
const { fakeGithub } = await import('./fake-github.test-support.js');
const { compactForModel } = await import('./engine/run.js');

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
Object.assign(config, {
  githubAppId: '123',
  githubOrg: 'org-test',
  githubAppKey: privateKey.export({ type: 'pkcs8', format: 'pem' }),
});
const fake = fakeGithub();
github.useFetch(fake.fetch);

db.query(
  "INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('acc-ft', 'ft@exemplo.com', 'Ana', 'active', ?, ?)",
).run(now(), now());
db.query(
  "INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES ('ft-1', 'Métricas', 'sprite-ft1', 'idle', 'm', 1, 1, 'acc-ft')",
).run();
const bot = {
  id: 'ft-1',
  name: 'Métricas',
  accountId: 'acc-ft',
  spriteName: 'sprite-ft1',
};
const tool = (name, args) =>
  runBaseTool({
    bot,
    task: { id: 't' },
    name,
    args,
    setEnabledTools: () => {},
  });
const repo = () => fake.repos.get('assistant-acc-ft');

describe('the agents file tools, on the repository and never on the computer', () => {
  test('writing makes the repository the first time and commits in the agent name', async () => {
    expect(
      (
        await tool('file_write', {
          path: 'relatorios/ep39.md',
          content: '# ep39',
        })
      ).text,
    ).toBe(
      'criado: /relatorios/ep39.md, num commit em nome de Métricas (o agente, não o usuário)',
    );
    expect(repo().files['relatorios/ep39.md']).toBe('# ep39');
    expect(repo().commits[0].author.name).toBe('Métricas via Gemini Code');
    const count = repo().commits.length;
    expect(
      (
        await tool('file_write', {
          path: '/home/sprite/workspace/relatorios/ep39.md',
          content: '# ep39',
        })
      ).text,
    ).toContain('nada mudou');
    expect(repo().commits.length).toBe(count);
  });

  test('reading and listing, with the path as the computer would write it', async () => {
    expect(
      (
        await tool('file_read', {
          path: '/home/sprite/workspace/relatorios/ep39.md',
        })
      ).text,
    ).toBe('# ep39');
    expect((await tool('file_read', { path: 'nada.md' })).text).toBe(
      'não existe no repositório: /nada.md',
    );
    expect((await tool('files_list', { folder: 'relatorios' })).text).toBe(
      '/relatorios/ep39.md (6 B)',
    );
    expect((await tool('files_list', { folder: 'videos' })).text).toBe(
      'nenhum arquivo em /videos',
    );
  });

  test('the central files and paths out of the repository are refused', async () => {
    await expect(
      tool('file_write', {
        path: 'agents/metricas/INSTRUCTIONS.md',
        content: 'x',
      }),
    ).rejects.toThrow('arquivo é da central');
    await expect(
      tool('file_write', { path: 'skills/x/SKILL.md', content: 'x' }),
    ).rejects.toThrow('arquivo é da central');
    await expect(
      tool('file_write', { path: '../fora.md', content: 'x' }),
    ).rejects.toThrow('invalid path');
    await expect(tool('file_delete', { path: 'README.md' })).rejects.toThrow(
      'arquivo é da central',
    );
  });

  test('deleting asks the person first, and then removes the file', async () => {
    const verdict = await decide({
      bot,
      task: { id: 't' },
      toolName: 'file_delete',
      args: { path: 'relatorios/ep39.md' },
    });
    expect(verdict).toMatchObject({
      decision: 'ask',
      summary: 'Delete relatorios/ep39.md from the repository',
    });
    expect(
      (
        await decide({
          bot,
          task: { id: 't' },
          toolName: 'file_write',
          args: {},
        })
      ).decision,
    ).toBe('run');
    expect(
      (await tool('file_delete', { path: 'relatorios/ep39.md' })).text,
    ).toBe('apagado do repositório: /relatorios/ep39.md');
    expect(repo().files['relatorios/ep39.md']).toBeUndefined();
  });

  test('an agent with a folder writes inside it; a leading slash starts at the root', async () => {
    const seo = { ...bot, name: 'Acme - SEO', folder: 'acme' };
    const run = (name, args) =>
      runBaseTool({
        bot: seo,
        task: { id: 't' },
        name,
        args,
        setEnabledTools: () => {},
      });
    expect(
      (
        await run('file_write', {
          path: 'seo/pautas/2026-10-29.md',
          content: '# pauta',
        })
      ).text,
    ).toContain('criado: /acme/seo/pautas/2026-10-29.md');
    expect(repo().files['acme/seo/pautas/2026-10-29.md']).toBe('# pauta');
    expect(repo().files['seo/pautas/2026-10-29.md']).toBeUndefined();
    // The same file, however a colleague was told about it.
    expect(
      (await run('file_read', { path: '/acme/seo/pautas/2026-10-29.md' })).text,
    ).toBe('# pauta');
    expect(
      (await run('file_read', { path: 'acme/seo/pautas/2026-10-29.md' })).text,
    ).toBe('# pauta');
    expect(
      (
        await run('file_read', {
          path: '/home/sprite/workspace/acme/seo/pautas/2026-10-29.md',
        })
      ).text,
    ).toBe('# pauta');
    expect((await run('files_list', {})).text).toBe(
      '/acme/seo/pautas/2026-10-29.md (7 B)',
    );
    expect((await run('file_read', { path: '/relatorios/nada.md' })).text).toBe(
      'não existe no repositório: /relatorios/nada.md',
    );
    await expect(
      run('file_write', { path: '../fora.md', content: 'x' }),
    ).rejects.toThrow('invalid path');
  });

  test('a big file comes in parts with the way to the rest, past what the central used to keep, and a JSON by its path', async () => {
    const weeks = Array.from({ length: 52 }, (_, index) => ({
      number: index + 1,
      microcommitments: Array.from(
        { length: 12 },
        (_, item) =>
          `Semana ${index + 1}, microcompromisso ${item + 1}: ${'um passo. '.repeat(40)}`,
      ),
    }));
    const program = JSON.stringify({ takenAt: '2026-10-31', weeks }, null, 1);
    // Past the 200 000 characters the central cut at before: the end is still within reach.
    expect(program.length).toBeGreaterThan(250_000);
    await tool('file_write', {
      path: 'conteudo/programa-forja-52.json',
      content: program,
    });
    const first = (
      await tool('file_read', { path: 'conteudo/programa-forja-52.json' })
    ).text;
    expect(first.length).toBeLessThan(25_000);
    expect(first).toContain('[cortado: mostrei as linhas 1 a ');
    expect(first).toContain(
      '- weeks: lista de 52; cada item tem number, microcommitments',
    );
    const total = program.split('\n').length;
    const last = (
      await tool('file_read', {
        path: 'conteudo/programa-forja-52.json',
        startLine: total - 2,
      })
    ).text;
    expect(last).toContain(
      `[fim do arquivo: mostrei as linhas ${total - 2} a ${total} de ${total}`,
    );
    expect(last).toStartWith(program.split('\n').slice(-3).join('\n'));
    const week = (
      await tool('file_read', {
        path: '/conteudo/programa-forja-52.json',
        jsonPath: 'weeks[number=2]',
      })
    ).text;
    expect(
      JSON.parse(week.slice(week.indexOf('\n') + 1)).microcommitments,
    ).toHaveLength(12);
  });

  test('an old result cut to fit the context says so and how to read it again', () => {
    const messages = [{ role: 'user', content: 'leia' }];
    for (let index = 0; index < 9; index++) {
      messages.push({
        role: 'assistant',
        content: '',
        tool_calls: [
          {
            id: `c${index}`,
            type: 'function',
            function: { name: 'file_read', arguments: '{}' },
          },
        ],
      });
      messages.push({
        role: 'tool',
        tool_call_id: `c${index}`,
        content: 'x'.repeat(5000),
      });
    }
    const sent = compactForModel(messages);
    expect(sent[2].content).toStartWith(
      'x'.repeat(700) +
        '\n[saída antiga cortada para caber no contexto: ficaram os primeiros 700 de 5.000 caracteres.',
    );
    expect(sent[2].content).toContain('startLine, jsonPath ou search');
    expect(sent.at(-1).content).toBe('x'.repeat(5000));
  });
});
