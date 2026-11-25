import { describe, expect, test } from 'bun:test';

import { changelogProblem } from './check-changelog.js';

const BASE =
  '# Changelog\n\n## [Unreleased]\n\n### Fixed\n\n- An old thing (#8).\n\n## [0.1.0] - 2026-11-25\n\n- First.\n';
const WITH_LINE = BASE.replace(
  '- An old thing (#8).',
  '- A new thing (#9).\n- An old thing (#8).',
);
const RELEASE =
  '# Changelog\n\n## [Unreleased]\n\n## [0.2.0] - 2026-12-02\n\n### Fixed\n\n- An old thing (#8).\n\n## [0.1.0] - 2026-11-25\n\n- First.\n';

describe('the changelog rule', () => {
  test('a pull request that does not touch CHANGELOG.md fails', () => {
    expect(changelogProblem(['packages/x.js'], WITH_LINE, BASE)).toContain(
      'add a line',
    );
  });

  test('touching it without a new line under Unreleased fails', () => {
    const reworded = BASE.replace('# Changelog', '# The changelog');
    expect(changelogProblem(['CHANGELOG.md'], reworded, BASE)).toContain(
      'add a line',
    );
  });

  test('a new line under Unreleased passes', () => {
    expect(
      changelogProblem(['CHANGELOG.md', 'packages/x.js'], WITH_LINE, BASE),
    ).toBeNull();
  });

  test('a release that turns Unreleased into a new version passes', () => {
    expect(changelogProblem(['CHANGELOG.md'], RELEASE, BASE)).toBeNull();
  });
});
