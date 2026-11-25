// A pull request says what it changed in CHANGELOG.md, under Unreleased, so
// the project's history reads in time order without digging through commits.
// CI runs it on every pull request; Dependabot's updates carry their own notes.

import { execFileSync } from 'node:child_process';
import { readFileSync } from 'node:fs';

/** Why a pull request's changes fail the changelog rule, or null when they pass. */
export function changelogProblem(changedFiles, changelog) {
  if (!changedFiles.includes('CHANGELOG.md'))
    return 'add a line to CHANGELOG.md under "## [Unreleased]" saying what this pull request changes';
  const unreleased = changelog
    .split(/^## /m)
    .find((part) => part.startsWith('[Unreleased]'));
  if (!unreleased || !/^- /m.test(unreleased))
    return 'CHANGELOG.md has no entry under "## [Unreleased]"';
  return null;
}

if (import.meta.main) {
  const base = process.env.GITHUB_BASE_REF || 'main';
  const changed = execFileSync(
    'git',
    ['diff', '--name-only', `origin/${base}...HEAD`],
    { encoding: 'utf8' },
  )
    .split('\n')
    .filter(Boolean);
  const problem = changelogProblem(
    changed,
    readFileSync('CHANGELOG.md', 'utf8'),
  );
  if (problem) {
    console.error(`changelog: ${problem}`);
    process.exit(1);
  }
  console.log('changelog: ok');
}
