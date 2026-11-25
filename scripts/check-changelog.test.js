import { describe, expect, test } from 'bun:test';

import { changelogProblem } from './check-changelog.js';

const WITH_ENTRY =
  '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- A thing (#9).\n\n## [0.1.0] - 2026-11-25\n\n- First.\n';

describe('the changelog rule', () => {
  test('a pull request that does not touch CHANGELOG.md fails', () => {
    expect(
      changelogProblem(['packages/server/src/x.js'], WITH_ENTRY),
    ).toContain('add a line');
  });

  test('touching it without an Unreleased entry fails', () => {
    const empty =
      '# Changelog\n\n## [Unreleased]\n\n## [0.1.0] - 2026-11-25\n\n- First.\n';
    expect(changelogProblem(['CHANGELOG.md'], empty)).toContain('no entry');
  });

  test('an entry under Unreleased passes', () => {
    expect(
      changelogProblem(
        ['CHANGELOG.md', 'packages/server/src/x.js'],
        WITH_ENTRY,
      ),
    ).toBeNull();
  });
});
