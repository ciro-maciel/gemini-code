import { describe, expect, test } from 'bun:test';

import {
  commitLines,
  previousTagOf,
  releaseNotes,
  sectionOf,
} from './release-notes.js';

const CHANGELOG = `# Changelog

## [Unreleased]

## [0.4.1] - 2026-11-26

### Added

- An app with the icon (2026-11-26).

## [0.4.0] - 2026-11-25

### Changed

- No sign-in.

[Unreleased]: https://github.com/x/y/compare/v0.4.1...HEAD
[0.4.1]: https://github.com/x/y/compare/v0.4.0...v0.4.1
`;

describe('release notes', () => {
  test('take the version section of the changelog, without the next one or the links', () => {
    const section = sectionOf(CHANGELOG, 'v0.4.1');
    expect(section).toContain('An app with the icon');
    expect(section).not.toContain('No sign-in');
    expect(section).not.toContain('compare/');
    expect(sectionOf(CHANGELOG, 'v0.4.0')).toContain('No sign-in');
    expect(sectionOf(CHANGELOG, 'v0.4.0')).not.toContain('compare/');
    expect(sectionOf(CHANGELOG, 'v9.9.9')).toBe('');
  });

  test('list every commit with a link to it', () => {
    expect(
      commitLines('abcdef1234567\tfeat: one\n1234567890abc\tfix: two\n'),
    ).toEqual([
      '- feat: one ([abcdef1](https://github.com/ciro-maciel/gemini-code/commit/abcdef1234567))',
      '- fix: two ([1234567](https://github.com/ciro-maciel/gemini-code/commit/1234567890abc))',
    ]);
  });

  test('find the previous tag by version, not by name', () => {
    const tags = ['v0.10.0', 'v0.2.0', 'v0.9.1', 'hook-probe', 'v0.2.1'];
    expect(previousTagOf('v0.10.0', tags)).toBe('v0.9.1');
    expect(previousTagOf('v0.2.1', tags)).toBe('v0.2.0');
    expect(previousTagOf('v0.2.0', tags)).toBeNull();
  });

  test('put what changed, the commits, the install and the comparison together', () => {
    const notes = releaseNotes({
      tag: 'v0.4.1',
      previousTag: 'v0.4.0',
      section: '- An app with the icon.',
      commits: ['- feat: one (x)'],
    });
    expect(notes).toContain('## What changed');
    expect(notes).toContain('## Commits since v0.4.0 (1)');
    expect(notes).toContain('install.sh | sh');
    expect(notes).toContain('compare/v0.4.0...v0.4.1');
  });
});
