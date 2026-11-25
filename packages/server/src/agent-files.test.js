import { afterAll, describe, expect, test } from 'bun:test';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  realpathSync,
  symlinkSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'gemini-code-files-data-'),
);
const workspace = mkdtempSync(path.join(tmpdir(), 'gemini-code-files-ws-'));
const { config } = await import('./config.js');
config.localWorkspaceDir = workspace;

const { confirmationCode, rootOf, runFileOperation, stopWatching } =
  await import('./agent-files.js');
const { answerFilesMcp, callFilesTool, filesGuide } = await import(
  './mcp-files.js'
);
const { decide } = await import('./engine/policy.js');

const bot = { id: 'files-bot-1', accountId: 'nobody' };
const other = { id: 'files-bot-2', accountId: 'nobody' };
afterAll(stopWatching);

describe('the agent folder: one root per agent, nothing outside it', () => {
  test('each agent gets its own root under the workspace', () => {
    expect(rootOf(bot)).not.toBe(rootOf(other));
    expect(rootOf(bot).startsWith(realpathSync(workspace) + path.sep)).toBe(
      true,
    );
  });

  test('"..", an absolute path elsewhere and a link that points out are refused', () => {
    writeFileSync(path.join(workspace, 'secret.txt'), 'no');
    expect(() =>
      runFileOperation(bot, 'read', { path: '../secret.txt' }),
    ).toThrow('sai da pasta');
    expect(() =>
      runFileOperation(bot, 'read', { path: '/etc/hosts' }),
    ).not.toThrow('sai da pasta');
    expect(() =>
      runFileOperation(bot, 'read', { path: '../../../../etc/hosts' }),
    ).toThrow('sai da pasta');
    symlinkSync(workspace, path.join(rootOf(bot), 'escape'));
    expect(() =>
      runFileOperation(bot, 'read', { path: 'escape/secret.txt' }),
    ).toThrow('aponta para fora');
    expect(() =>
      runFileOperation(bot, 'write', { path: 'escape/new.txt', content: 'x' }),
    ).toThrow('aponta para fora');
    expect(existsSync(path.join(workspace, 'new.txt'))).toBe(false);
  });

  test('one agent never sees another agent files', () => {
    runFileOperation(other, 'write', { path: 'mine.txt', content: 'b' });
    expect(() =>
      runFileOperation(bot, 'read', {
        path: `../${path.basename(rootOf(other))}/mine.txt`,
      }),
    ).toThrow();
  });
});

describe('the operations', () => {
  test('write refuses to replace without overwrite; edit needs one exact match', () => {
    runFileOperation(bot, 'write', {
      path: 'src/soma.js',
      content: 'export const soma = (a, b) => a + b\n',
    });
    expect(() =>
      runFileOperation(bot, 'write', { path: 'src/soma.js', content: 'x' }),
    ).toThrow('já existe');
    runFileOperation(bot, 'edit', {
      path: 'src/soma.js',
      find: 'a + b',
      replace: 'a + b + 0',
    });
    expect(
      readFileSync(path.join(rootOf(bot), 'src/soma.js'), 'utf8'),
    ).toContain('a + b + 0');
    expect(() =>
      runFileOperation(bot, 'edit', {
        path: 'src/soma.js',
        find: 'nao existe',
        replace: '',
      }),
    ).toThrow('não está');
    runFileOperation(bot, 'write', { path: 'twice.txt', content: 'a a' });
    expect(() =>
      runFileOperation(bot, 'edit', {
        path: 'twice.txt',
        find: 'a',
        replace: 'b',
      }),
    ).toThrow('2 vezes');
  });

  test('tree puts folders first, read takes a line range, grep and search find', () => {
    runFileOperation(bot, 'write', {
      path: 'notes.md',
      content: 'um\ndois\ntres',
    });
    const tree = runFileOperation(bot, 'tree', { path: '' });
    expect(tree.items[0].kind).toBe('folder');
    expect(
      runFileOperation(bot, 'read', { path: 'notes.md', offset: 2, limit: 1 })
        .content,
    ).toBe('dois');
    expect(
      runFileOperation(bot, 'grep', { query: 'a + b' }).items[0],
    ).toMatchObject({ path: 'src/soma.js', line: 1 });
    expect(
      runFileOperation(bot, 'search', { query: 'soma' }).items.map(
        (item) => item.path,
      ),
    ).toContain('src/soma.js');
    // The link out of the root is listed as a link and never searched through.
    expect(
      runFileOperation(bot, 'grep', { query: 'no' }).items.some((item) =>
        item.path.startsWith('escape'),
      ),
    ).toBe(false);
    expect(tree.items.find((item) => item.name === 'escape').kind).toBe('link');
  });

  test('move and copy refuse to replace; mkdir makes parents', () => {
    runFileOperation(bot, 'mkdir', { path: 'a/b/c' });
    expect(runFileOperation(bot, 'info', { path: 'a/b/c' }).kind).toBe(
      'folder',
    );
    runFileOperation(bot, 'copy', { from: 'notes.md', to: 'a/notes.md' });
    expect(() =>
      runFileOperation(bot, 'move', { from: 'notes.md', to: 'a/notes.md' }),
    ).toThrow('já existe');
    runFileOperation(bot, 'move', { from: 'notes.md', to: 'a/b/notes.md' });
    expect(existsSync(path.join(rootOf(bot), 'notes.md'))).toBe(false);
  });
});

describe('deleting asks the person', () => {
  test('the first call only describes; a wrong or expired code deletes nothing; the right one deletes', () => {
    mkdirSync(path.join(rootOf(bot), 'old'), { recursive: true });
    writeFileSync(path.join(rootOf(bot), 'old/x.txt'), 'x');
    const first = runFileOperation(bot, 'delete', { path: 'old' });
    expect(first).toMatchObject({
      confirmRequired: true,
      kind: 'folder',
      inside: 1,
    });
    expect(existsSync(path.join(rootOf(bot), 'old'))).toBe(true);
    expect(
      runFileOperation(bot, 'delete', {
        path: 'old',
        confirm: true,
        code: 'bad.code',
      }).confirmRequired,
    ).toBe(true);
    expect(
      runFileOperation(bot, 'delete', {
        path: 'old',
        confirm: true,
        code: confirmationCode(bot.id, 'old', Date.now() - 11 * 60_000),
      }).confirmRequired,
    ).toBe(true);
    expect(
      runFileOperation(bot, 'delete', {
        path: 'old',
        confirm: true,
        code: confirmationCode(other.id, 'old'),
      }).confirmRequired,
    ).toBe(true);
    expect(
      runFileOperation(bot, 'delete', {
        path: 'old',
        confirm: true,
        code: first.code,
      }),
    ).toEqual({ deleted: true, path: 'old' });
    expect(existsSync(path.join(rootOf(bot), 'old'))).toBe(false);
  });

  test('the agent root itself cannot be deleted', () => {
    expect(() => runFileOperation(bot, 'delete', { path: '' })).toThrow(
      'não pode ser apagada',
    );
  });

  test('inside Gemini Code, files_delete always waits for an approval; reading and writing do not', async () => {
    expect(
      (
        await decide({
          bot,
          task: null,
          toolName: 'files_delete',
          args: { path: 'x' },
        })
      ).decision,
    ).toBe('ask');
    expect(
      (
        await decide({
          bot,
          task: null,
          toolName: 'files_write',
          args: { op: 'write' },
        })
      ).decision,
    ).toBe('run');
    expect(
      (
        await decide({
          bot,
          task: null,
          toolName: 'files_read',
          args: { op: 'tree' },
        })
      ).decision,
    ).toBe('run');
  });
});

describe('the files MCP', () => {
  test('four tools, and an operation called on the wrong tool is refused', () => {
    const list = answerFilesMcp(bot, {
      jsonrpc: '2.0',
      id: 1,
      method: 'tools/list',
    });
    expect(list.result.tools.map((tool) => tool.name)).toEqual([
      'files_guide',
      'files_read',
      'files_write',
      'files_delete',
    ]);
    expect(
      list.result.tools.find((tool) => tool.name === 'files_delete').annotations
        .destructiveHint,
    ).toBe(true);
    expect(
      callFilesTool(bot, 'files_read', { op: 'delete', path: 'x' }).error,
    ).toContain('não faz');
    expect(filesGuide()).toContain('op="grep"');
  });

  test('a call through the MCP writes a file the dashboard tree then shows', () => {
    const stamp = `mcp-${Date.now()}.txt`;
    const answer = answerFilesMcp(bot, {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'files_write',
        arguments: { op: 'write', path: stamp, content: 'ok' },
      },
    });
    expect(answer.result.isError).toBe(false);
    expect(
      runFileOperation(bot, 'tree', { path: '' }).items.map(
        (item) => item.name,
      ),
    ).toContain(stamp);
    expect(
      answerFilesMcp(bot, {
        jsonrpc: '2.0',
        method: 'notifications/initialized',
      }),
    ).toBeNull();
  });
});
