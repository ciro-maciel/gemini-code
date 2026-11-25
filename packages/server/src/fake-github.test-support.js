// A GitHub in memory for the tests of github.js and repo.js.

import { createHash } from 'node:crypto';

// Git's name for a file's bytes, as the real GitHub gives it.
const blobId = (content) => {
  const bytes = Buffer.from(content);
  return createHash('sha1')
    .update(`blob ${bytes.length}\0`)
    .update(bytes)
    .digest('hex');
};

/** A GitHub in memory: the routes the central uses, nothing else. */
export function fakeGithub() {
  const repos = new Map();
  let seq = 0;
  const sha = () => `sha${++seq}`;
  const reply = (status, data) =>
    new Response(data === undefined ? null : JSON.stringify(data), { status });
  return {
    repos,
    fetch: async (url, init = {}) => {
      const { pathname, searchParams } = new URL(url);
      const method = init.method || 'GET';
      const body = init.body ? JSON.parse(init.body) : null;
      if (pathname.endsWith('/installation')) return reply(200, { id: 7 });
      if (pathname.endsWith('/access_tokens'))
        return reply(201, {
          token: 'ghs_test',
          expires_at: new Date(Date.now() + 3600_000).toISOString(),
        });
      if (method === 'POST' && /^\/orgs\/[^/]+\/repos$/.test(pathname)) {
        repos.set(body.name, {
          private: body.private,
          files: {},
          commits: [],
          head: null,
        });
        return reply(201, { name: body.name });
      }
      const match = pathname.match(/^\/repos\/[^/]+\/([^/]+)(\/.*)?$/);
      const repo = match && repos.get(match[1]);
      if (!repo) return reply(404);
      const rest = match[2] || '';
      const commit = (files, message, author) => {
        const id = sha();
        repo.commits.unshift({
          sha: id,
          files: { ...files },
          message,
          author,
          parent: repo.head,
        });
        repo.head = id;
        repo.files = { ...files };
        return id;
      };
      if (!rest)
        return reply(200, { default_branch: 'main', private: repo.private });
      if (method === 'PUT' && rest.startsWith('/contents/'))
        return reply(201, {
          commit: {
            sha: commit(
              {
                ...repo.files,
                [decodeURIComponent(rest.slice(10))]: Buffer.from(
                  body.content,
                  'base64',
                ).toString(),
              },
              body.message,
            ),
          },
        });
      if (rest === '/git/ref/heads/main')
        return reply(200, { object: { sha: repo.head } });
      if (rest.startsWith('/git/commits/'))
        return reply(200, { tree: { sha: `tree-of-${rest.slice(13)}` } });
      if (method === 'GET' && rest.startsWith('/git/blobs/')) {
        const found = Object.values(repo.files).find(
          (content) => blobId(content) === rest.slice(11),
        );
        return found === undefined
          ? reply(404)
          : reply(200, {
              content: Buffer.from(found).toString('base64'),
              encoding: 'base64',
            });
      }
      if (method === 'POST' && rest === '/git/blobs') {
        const content = Buffer.from(
          body.content,
          body.encoding === 'base64' ? 'base64' : 'utf8',
        ).toString();
        const id = blobId(content);
        (repo.blobs ??= {})[id] = content;
        return reply(201, { sha: id });
      }
      if (method === 'POST' && rest === '/git/trees') {
        const files = { ...repo.files };
        for (const entry of body.tree)
          entry.sha === null
            ? delete files[entry.path]
            : (files[entry.path] = entry.sha
                ? repo.blobs[entry.sha]
                : entry.content);
        repo.pending = files;
        return reply(201, { sha: 'tree-new' });
      }
      if (method === 'POST' && rest === '/git/commits')
        return reply(201, {
          sha: commit(repo.pending, body.message, body.author),
        });
      if (method === 'PATCH' && rest === '/git/refs/heads/main')
        return reply(200, {});
      if (rest === '/git/trees/main')
        return reply(200, {
          tree: Object.entries(repo.files).map(([p, c]) => ({
            path: p,
            type: 'blob',
            sha: blobId(c),
            size: c.length,
          })),
        });
      if (rest.startsWith('/contents/')) {
        const p = decodeURIComponent(rest.slice(10));
        return p in repo.files
          ? reply(200, {
              sha: blobId(repo.files[p]),
              content: Buffer.from(repo.files[p]).toString('base64'),
            })
          : reply(404);
      }
      if (rest.startsWith('/commits/')) {
        const at = repo.commits.findIndex((c) => c.sha === rest.slice(9));
        if (at < 0) return reply(404);
        const before = repo.commits[at + 1]?.files ?? {};
        const after = repo.commits[at].files;
        const changed = Object.keys({ ...before, ...after }).filter(
          (p) => before[p] !== after[p],
        );
        return reply(200, {
          files: changed.map((p) => ({
            filename: p,
            patch: [
              ...(before[p] ?? '')
                .split('\n')
                .filter(Boolean)
                .map((l) => `-${l}`),
              ...(after[p] ?? '')
                .split('\n')
                .filter(Boolean)
                .map((l) => `+${l}`),
            ].join('\n'),
          })),
        });
      }
      // Like GitHub: only the commits that changed the file.
      if (rest === '/commits')
        return reply(
          200,
          repo.commits
            .filter(
              (c, at) =>
                c.files[searchParams.get('path')] !==
                (repo.commits[at + 1]?.files ?? {})[searchParams.get('path')],
            )
            .map((c) => ({
              sha: c.sha,
              commit: {
                message: c.message,
                author: {
                  name: c.author?.name || 'Assistant',
                  date: '2026-10-29T10:00:00Z',
                },
              },
            })),
        );
      return reply(404);
    },
  };
}
