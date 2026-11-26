// The description of a GitHub release: what changed (the version's section
// of CHANGELOG.md), every commit since the previous tag, how to install, and
// the full comparison. Trunk-based work has almost no pull requests, so
// GitHub's generated notes come out empty; these come from the repository.
//
//   bun scripts/release-notes.js v0.4.2 > notes.md
//
// The release workflow runs it; scripts/backfill can run it for old tags.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const REPO = 'ciro-maciel/gemini-code';

/** The body of one version's section in CHANGELOG.md, without its heading; '' when absent. */
export function sectionOf(changelog, version) {
  const parts = changelog.split(/^## /m);
  const part = parts.find((item) =>
    item.startsWith(`[${version.replace(/^v/, '')}]`),
  );
  if (!part) return '';
  return part
    .split('\n')
    .slice(1)
    .join('\n')
    .split(/^\[[^\]]+\]: /m)[0]
    .trim();
}

/** `git log --format=%H%x09%s` lines -> markdown items with a link to each commit. */
export function commitLines(log) {
  return String(log)
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => {
      const [sha, ...rest] = line.split('\t');
      const subject = rest.join('\t').trim();
      return `- ${subject} ([${sha.slice(0, 7)}](https://github.com/${REPO}/commit/${sha}))`;
    });
}

/** The whole release description. */
export function releaseNotes({ tag, previousTag, section, commits }) {
  const lines = [];
  lines.push('## What changed', '');
  lines.push(section || '_No changelog entry for this version._', '');
  lines.push(
    `## Commits${previousTag ? ` since ${previousTag}` : ''} (${commits.length})`,
    '',
  );
  lines.push(...(commits.length ? commits : ['_No commits._']), '');
  lines.push(
    '## Install',
    '',
    '```bash',
    '# macOS and Linux',
    `curl -fsSL https://raw.githubusercontent.com/${REPO}/main/install.sh | sh`,
    '```',
    '',
    '```powershell',
    '# Windows (PowerShell)',
    `powershell -c "irm https://raw.githubusercontent.com/${REPO}/main/install.ps1 | iex"`,
    '```',
    '',
    'The installer checks every download against `SHA256SUMS`. The macOS builds are signed and notarized by Apple.',
    '',
  );
  if (previousTag)
    lines.push(
      `**Full comparison:** [${previousTag}...${tag}](https://github.com/${REPO}/compare/${previousTag}...${tag})`,
    );
  return `${lines.join('\n').trim()}\n`;
}

/** The tag before this one, by version order; null for the first. */
export function previousTagOf(tag, tags) {
  const key = (name) =>
    name
      .replace(/^v/, '')
      .split('.')
      .map((part) => Number(part) || 0);
  const sorted = tags
    .filter((name) => /^v\d+\.\d+\.\d+$/.test(name))
    .sort((a, b) => {
      const [x, y] = [key(a), key(b)];
      return x[0] - y[0] || x[1] - y[1] || x[2] - y[2];
    });
  const at = sorted.indexOf(tag);
  return at > 0 ? sorted[at - 1] : null;
}

if (import.meta.main) {
  const tag = process.argv[2];
  if (!tag) {
    console.error('usage: bun scripts/release-notes.js <tag>');
    process.exit(1);
  }
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
  const previousTag = previousTagOf(tag, git('tag', '--list').split('\n'));
  const range = previousTag ? `${previousTag}..${tag}` : tag;
  const log = git('log', '--no-merges', '--format=%H%x09%s', range);
  process.stdout.write(
    releaseNotes({
      tag,
      previousTag,
      section: sectionOf(readFileSync('CHANGELOG.md', 'utf8'), tag),
      commits: commitLines(log),
    }),
  );
}
