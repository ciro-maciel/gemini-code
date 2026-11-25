// A pull request says what it changed in CHANGELOG.md, so the project's
// history reads in time order without digging through commits. It adds a line
// under Unreleased, or, in a release, turns Unreleased into a new version.
// CI runs it on every pull request; Dependabot's updates carry their own notes.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

const sectionsOf = (changelog) =>
  changelog
    .split(/^## /m)
    .slice(1)
    .map((part) => ({
      heading: part.split('\n')[0].trim(),
      entries: part.split('\n').filter((line) => line.startsWith('- ')),
    }));

const unreleasedOf = (changelog) =>
  sectionsOf(changelog).find((section) =>
    section.heading.startsWith('[Unreleased]'),
  )?.entries ?? [];

const versionsOf = (changelog) =>
  sectionsOf(changelog)
    .map((section) => section.heading)
    .filter((heading) => /^\[\d+\.\d+\.\d+\]/.test(heading));

/**
 * Why a pull request's changes fail the changelog rule, or null when they
 * pass. `base` is CHANGELOG.md as it is on the target branch.
 */
export function changelogProblem(changedFiles, changelog, base = '') {
  const hint =
    'add a line to CHANGELOG.md under "## [Unreleased]" saying what this pull request changes';
  if (!changedFiles.includes('CHANGELOG.md')) return hint;
  const before = new Set(unreleasedOf(base));
  const isNewLine = unreleasedOf(changelog).some((entry) => !before.has(entry));
  const known = new Set(versionsOf(base));
  const isRelease = versionsOf(changelog).some(
    (heading) => !known.has(heading),
  );
  return isNewLine || isRelease ? null : hint;
}

if (import.meta.main) {
  const target = `origin/${process.env.GITHUB_BASE_REF || 'main'}`;
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' });
  const changed = git('diff', '--name-only', `${target}...HEAD`)
    .split('\n')
    .filter(Boolean);
  let base = '';
  try {
    base = git('show', `${target}:CHANGELOG.md`);
  } catch {
    base = '';
  }
  const problem = changelogProblem(
    changed,
    readFileSync('CHANGELOG.md', 'utf8'),
    base,
  );
  if (problem) {
    console.error(`changelog: ${problem}`);
    process.exit(1);
  }
  console.log('changelog: ok');
}
