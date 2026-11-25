import { afterAll, describe, expect, test } from 'bun:test';
import { execFileSync } from 'node:child_process';
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  realpathSync,
  writeFileSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

const base = realpathSync(mkdtempSync(path.join(tmpdir(), 'gc-projects-')));
process.env.DATA_DIR ||= path.join(base, 'data');
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { config } = await import('./config.js');
const { db, now } = await import('./db.js');
const projects = await import('./projects.js');
const { rootOf } = await import('./agent-files.js');
const { pathFor } = await import('./engine/tools.js');

const workspaceBefore = config.localWorkspaceDir;
config.localWorkspaceDir = path.join(base, 'workspace');
afterAll(() => {
  config.localWorkspaceDir = workspaceBefore;
});
const root = path.join(base, 'code');

const git = (cwd, ...args) =>
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    env: projects.gitEnv(),
  }).trim();

/** A repository with one commit, and an optional origin. */
function makeRepo(dir, origin = null) {
  mkdirSync(dir, { recursive: true });
  git(dir, 'init', '-q', '-b', 'main');
  writeFileSync(path.join(dir, 'README.md'), '# hi\n');
  git(dir, 'add', '.');
  git(
    dir,
    '-c',
    'user.name=Test',
    '-c',
    'user.email=test@example.com',
    'commit',
    '-q',
    '-m',
    'first',
  );
  if (origin) git(dir, 'remote', 'add', 'origin', origin);
}

makeRepo(
  path.join(root, 'app'),
  'https://token123@github.com/ciro-maciel/app.git',
);
makeRepo(path.join(root, 'clients', 'site'));
makeRepo(path.join(root, 'deep', 'one', 'too-far'));

db.query(
  "INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('acc-pj', 'pj@example.com', 'Ana', 'active', ?, ?)",
).run(now(), now());
db.query(
  "INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id, project) VALUES ('pj-1', 'Test Engineer', 'sprite-pj1', 'idle', 'm', 1, 1, 'acc-pj', 'app')",
).run();
const bot = {
  id: 'pj-1',
  name: 'Test Engineer',
  accountId: 'acc-pj',
  project: 'app',
};

describe('projects: the folder of repositories and a worktree per agent', () => {
  test('the root is chosen once; a path that is not a folder is refused', () => {
    expect(() => projects.setProjectsRoot('acc-pj', '/no/such/dir')).toThrow(
      'is not a folder',
    );
    expect(projects.setProjectsRoot('acc-pj', root)).toBe(root);
    expect(projects.projectsRootOf('acc-pj')).toBe(root);
  });

  test('repositories up to two levels down are listed, with branch and GitHub, and no credential', () => {
    const items = projects.listProjects(root);
    expect(items.map((item) => item.path)).toEqual(['app', 'clients/site']);
    expect(items[0]).toMatchObject({
      name: 'app',
      branch: 'main',
      remote: 'https://github.com/ciro-maciel/app',
      github: 'ciro-maciel/app',
    });
    expect(JSON.stringify(items)).not.toContain('token123');
    expect(items[1].github).toBeNull();
  });

  test('a project must be a repository inside the root', () => {
    expect(projects.isProjectOf(root, 'app')).toBe(true);
    expect(projects.isProjectOf(root, 'clients')).toBe(false);
    expect(projects.isProjectOf(root, '../code/app')).toBe(true);
    expect(projects.isProjectOf(root, '../../')).toBe(false);
  });

  test('the agent works in its own worktree, on its own branch, and every tool lands there', () => {
    const folder = rootOf(bot);
    const expected = path.join(
      config.localWorkspaceDir,
      'worktrees',
      'app',
      'test-engineer',
    );
    expect(folder).toBe(expected);
    expect(existsSync(path.join(folder, 'README.md'))).toBe(true);
    expect(git(folder, 'rev-parse', '--abbrev-ref', 'HEAD')).toBe(
      'gemini-code/test-engineer',
    );
    // The person's own checkout stays on its branch, untouched.
    expect(
      git(path.join(root, 'app'), 'rev-parse', '--abbrev-ref', 'HEAD'),
    ).toBe('main');
    // A second turn reuses the same worktree.
    expect(rootOf(bot)).toBe(expected);
    // A relative path from an API agent lands in the same folder.
    expect(pathFor(bot, 'src/index.js')).toBe(
      'worktrees/app/test-engineer/src/index.js',
    );
  });
});
