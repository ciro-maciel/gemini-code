// Projects (25/11/2026): the folder on this machine that holds the person's
// repositories, and the one each agent works on. An agent that picks a
// repository works in its own git worktree of it, on its own branch, so
// several agents change the same project at once without overwriting each
// other or what the person is editing. The worktree lives in the workspace
// (worktrees/<repository>/<agent>), so every path an agent names stays
// relative to the workspace as before. GitHub is reached through the GitHub
// connector, never from here.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readdirSync, statSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { agentDirOf } from './bots.js';
import { config } from './config.js';
import { db } from './db.js';

const MAX_PROJECTS = 300;
const SKIPPED = new Set(['node_modules', '.git', 'dist', 'build', '.cache']);

// Git's own variables (GIT_DIR, GIT_WORK_TREE, GIT_INDEX_FILE...) point every
// command at one repository; inherited from a git hook they would aim these
// commands at the wrong one (25/11/2026, a pre-push run committed into the
// repository being pushed). Each call names its repository with -C instead.
export const gitEnv = () =>
  Object.fromEntries(
    Object.entries(process.env).filter(([key]) => !key.startsWith('GIT_')),
  );

const git = (cwd, ...args) =>
  execFileSync('git', ['-C', cwd, ...args], {
    encoding: 'utf8',
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 20_000,
    env: gitEnv(),
  }).trim();

const quietGit = (cwd, ...args) => {
  try {
    return git(cwd, ...args);
  } catch {
    return '';
  }
};

/** A path the person typed, with ~ for the home folder, made absolute. */
export function expandPath(value) {
  const raw = String(value ?? '').trim();
  if (!raw) return '';
  const home = raw === '~' || raw.startsWith('~/');
  return path.resolve(home ? path.join(os.homedir(), raw.slice(1)) : raw);
}

/** The folder of the person's repositories, or null before it is chosen. */
export function projectsRootOf(accountId) {
  const row = db
    .query('SELECT projects_dir FROM accounts WHERE id = ?')
    .get(accountId);
  const chosen = row?.projects_dir || process.env.PROJECTS_DIR || '';
  return chosen ? expandPath(chosen) : null;
}

/** Keeps the folder of repositories; refuses one that is not a folder here. */
export function setProjectsRoot(accountId, value) {
  const root = expandPath(value);
  if (!root) throw new Error('choose the folder that holds your repositories');
  if (!existsSync(root) || !statSync(root).isDirectory())
    throw new Error(`${root} is not a folder on this machine`);
  db.query('UPDATE accounts SET projects_dir = ? WHERE id = ?').run(
    root,
    accountId,
  );
  return root;
}

const isRepository = (dir) => existsSync(path.join(dir, '.git'));

/** Where a remote lives, without any credential written in its address. */
const cleanRemote = (url) =>
  url.replace(/\/\/[^@/]+@/, '//').replace(/\.git$/, '');

const githubOf = (remote) => {
  const match = remote.match(/github\.com[/:]([^/]+\/[^/]+?)(?:\.git)?$/);
  return match ? match[1] : null;
};

/**
 * The repositories in the root: the root itself when it is one, and the
 * folders up to two levels down that are. Each with its branch and remote.
 */
export function listProjects(root) {
  if (!root || !existsSync(root)) return [];
  const found = [];
  const visit = (dir, depth) => {
    if (found.length >= MAX_PROJECTS) return;
    if (isRepository(dir)) {
      found.push(dir);
      return;
    }
    if (depth === 0) return;
    let entries = [];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.')) continue;
      if (SKIPPED.has(entry.name)) continue;
      visit(path.join(dir, entry.name), depth - 1);
    }
  };
  visit(root, 2);
  return found
    .map((dir) => {
      const remote = cleanRemote(
        quietGit(dir, 'config', '--get', 'remote.origin.url'),
      );
      return {
        path: path.relative(root, dir) || '.',
        name: path.basename(dir),
        branch: quietGit(dir, 'rev-parse', '--abbrev-ref', 'HEAD') || null,
        remote: remote || null,
        github: githubOf(remote),
      };
    })
    .sort((a, b) => a.path.localeCompare(b.path));
}

/** Whether `project` names a repository in the root. */
export function isProjectOf(root, project) {
  if (!root || !project) return false;
  const dir = path.resolve(root, project);
  if (dir !== root && !dir.startsWith(root + path.sep)) return false;
  return isRepository(dir);
}

const slugOfBot = (bot) =>
  (agentDirOf(bot) || `agents/${bot.id}`).replace(/^agents\//, '');

/**
 * The one folder an agent works in, relative to the workspace: its worktree
 * when it picked a repository, otherwise its own folder.
 */
export function workFolderOf(bot) {
  const own = agentDirOf(bot) || `agents/${bot.id}`;
  if (!bot.project) return own;
  const repo = path.basename(path.resolve('/', bot.project)) || 'project';
  return `worktrees/${repo}/${slugOfBot(bot)}`;
}

/** The branch an agent's worktree is on. */
export const branchOf = (bot) => `gemini-code/${slugOfBot(bot)}`;

/**
 * Makes the agent's worktree when it does not exist yet: a new branch from
 * the repository's current commit, or the agent's branch when it is there
 * already. Returns the worktree's absolute path.
 */
export function ensureWorktree(bot, root = projectsRootOf(bot.accountId)) {
  const target = path.join(config.localWorkspaceDir, workFolderOf(bot));
  if (existsSync(path.join(target, '.git'))) return target;
  if (!isProjectOf(root, bot.project))
    throw new Error(
      `${bot.project} is not a repository in ${root || 'the projects folder'}`,
    );
  const repo = path.resolve(root, bot.project);
  mkdirSync(path.dirname(target), { recursive: true });
  const branch = branchOf(bot);
  const hasBranch = Boolean(
    quietGit(repo, 'rev-parse', '--verify', '--quiet', `refs/heads/${branch}`),
  );
  if (hasBranch) git(repo, 'worktree', 'add', target, branch);
  else git(repo, 'worktree', 'add', '-b', branch, target);
  return target;
}
