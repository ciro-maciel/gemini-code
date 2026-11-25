import { createPrivateKey } from 'node:crypto';
import { importPKCS8, SignJWT } from 'jose';

import { config } from './config.js';

// GitHub, as the central's GitHub App installed on the organization that keeps
// one repository per person (assistant-<account id>). Only the central talks
// to GitHub; no agent's computer ever holds a token for it.

let request = (url, init) => fetch(url, init);
let cachedToken = null;

/** For tests: a fake GitHub instead of the network. */
export function useFetch(fake) {
  request = fake;
  cachedToken = null;
}

export const isGithubReady = () =>
  Boolean(config.githubAppId && config.githubAppKey && config.githubOrg);
export const repoNameOf = (accountId) => `assistant-${accountId}`;

class GithubError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

async function appJwt() {
  // GitHub hands the key as PKCS#1 ("BEGIN RSA PRIVATE KEY"); jose reads PKCS#8.
  const pkcs8 = createPrivateKey(
    config.githubAppKey.replace(/\\n/g, '\n'),
  ).export({ type: 'pkcs8', format: 'pem' });
  const key = await importPKCS8(pkcs8, 'RS256');
  const at = Math.floor(Date.now() / 1000);
  return new SignJWT({})
    .setProtectedHeader({ alg: 'RS256' })
    .setIssuedAt(at - 60)
    .setExpirationTime(at + 540)
    .setIssuer(String(config.githubAppId))
    .sign(key);
}

// The installation token lasts an hour; it is renewed five minutes before.
async function installationToken() {
  if (cachedToken && cachedToken.expiresAt - Date.now() > 5 * 60_000)
    return cachedToken.token;
  const jwt = await appJwt();
  const headers = {
    Authorization: `Bearer ${jwt}`,
    Accept: 'application/vnd.github+json',
  };
  const installation = await (
    await request(`${config.githubApi}/orgs/${config.githubOrg}/installation`, {
      headers,
    })
  ).json();
  if (!installation?.id)
    throw new GithubError(
      500,
      'o app do GitHub não está instalado na organização',
    );
  const created = await (
    await request(
      `${config.githubApi}/app/installations/${installation.id}/access_tokens`,
      { method: 'POST', headers },
    )
  ).json();
  cachedToken = {
    token: created.token,
    expiresAt: new Date(created.expires_at).getTime(),
  };
  return cachedToken.token;
}

async function call(method, path, body) {
  const response = await request(`${config.githubApi}${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${await installationToken()}`,
      Accept: 'application/vnd.github+json',
      'Content-Type': 'application/json',
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  if (response.status === 404) return null;
  const data = await response.json().catch(() => null);
  if (!response.ok)
    throw new GithubError(
      response.status,
      data?.message || `o GitHub respondeu ${response.status}`,
    );
  return data;
}

const repoPath = (name) => `/repos/${config.githubOrg}/${name}`;

/** The person's repository, made private in the organization the first time, with its README. */
export async function ensureRepo(name, readme) {
  const existing = await call('GET', repoPath(name));
  if (existing) return existing;
  await call('POST', `/orgs/${config.githubOrg}/repos`, {
    name,
    private: true,
    auto_init: false,
    description:
      'Os agentes, os modelos e as habilidades desta conta do Assistant.',
  });
  await call('PUT', `${repoPath(name)}/contents/README.md`, {
    message: 'O repositório do Assistant',
    content: Buffer.from(readme).toString('base64'),
  });
  return call('GET', repoPath(name));
}

/**
 * One commit with every change: files written and files removed, on the
 * default branch, in the name of who made the change.
 */
export async function commitFiles(
  name,
  { write = [], remove = [] },
  message,
  author,
) {
  if (!write.length && !remove.length) return null;
  const repo = await call('GET', repoPath(name));
  const branch = repo.default_branch || 'main';
  const ref = await call('GET', `${repoPath(name)}/git/ref/heads/${branch}`);
  const parent = await call(
    'GET',
    `${repoPath(name)}/git/commits/${ref.object.sha}`,
  );
  // Text goes in the tree as is; bytes (a picture, a video) become a blob first.
  const entries = [];
  for (const file of write) {
    if (file.bytes)
      entries.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        sha: (
          await call('POST', `${repoPath(name)}/git/blobs`, {
            content: file.bytes.toString('base64'),
            encoding: 'base64',
          })
        ).sha,
      });
    else
      entries.push({
        path: file.path,
        mode: '100644',
        type: 'blob',
        content: file.content,
      });
  }
  const tree = await call('POST', `${repoPath(name)}/git/trees`, {
    base_tree: parent.tree.sha,
    tree: [
      ...entries,
      ...remove.map((path) => ({
        path,
        mode: '100644',
        type: 'blob',
        sha: null,
      })),
    ],
  });
  const commit = await call('POST', `${repoPath(name)}/git/commits`, {
    message,
    tree: tree.sha,
    parents: [ref.object.sha],
    ...(author
      ? {
          author: {
            name: author.name,
            email: author.email,
            date: new Date().toISOString(),
          },
        }
      : {}),
  });
  await call('PATCH', `${repoPath(name)}/git/refs/heads/${branch}`, {
    sha: commit.sha,
  });
  return commit.sha;
}

/** Every file of the repository: path and blob sha. */
export async function listTree(name) {
  const repo = await call('GET', repoPath(name));
  if (!repo) return [];
  const tree = await call(
    'GET',
    `${repoPath(name)}/git/trees/${repo.default_branch || 'main'}?recursive=1`,
  );
  return (tree?.tree ?? [])
    .filter((entry) => entry.type === 'blob')
    .map((entry) => ({ path: entry.path, sha: entry.sha, size: entry.size }));
}

export async function readFile(name, path) {
  const file = await call(
    'GET',
    `${repoPath(name)}/contents/${path.split('/').map(encodeURIComponent).join('/')}`,
  );
  if (!file) return null;
  const bytes = Buffer.from(file.content, 'base64');
  return { path, sha: file.sha, content: bytes.toString('utf8'), bytes };
}

/** The commits that touched a file, newest first: who, when, what. */
export async function fileHistory(name, path, limit = 20) {
  const commits =
    (await call(
      'GET',
      `${repoPath(name)}/commits?path=${encodeURIComponent(path)}&per_page=${limit}`,
    )) ?? [];
  return commits.map((commit) => ({
    sha: commit.sha,
    message: commit.commit.message,
    author: commit.commit.author?.name,
    at: commit.commit.author?.date,
  }));
}

/** What one commit changed in one file, as the unified diff GitHub keeps. */
export async function fileDiff(name, sha, path) {
  const commit = await call('GET', `${repoPath(name)}/commits/${sha}`);
  return commit?.files?.find((file) => file.filename === path)?.patch ?? '';
}

/** A file's bytes by its blob sha: the contents route stops at 1 MB, this one does not. */
export async function readBlob(name, sha) {
  const blob = await call('GET', `${repoPath(name)}/git/blobs/${sha}`);
  return blob ? Buffer.from(blob.content, 'base64') : null;
}
