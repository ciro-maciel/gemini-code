import { expect, test } from 'bun:test';

import { plainSummary } from './policy.js';

test('an action waiting without a judge is named as a person would say it, never as raw JSON', () => {
  expect(
    plainSummary('computer_shell', {
      command: 'cd ../../.. && git status && git branch -a',
    }),
  ).toBe('Run a command: cd ../../.. && git status && git branch -a');
  expect(plainSummary('mcp__github__create_pull_request', {})).toBe(
    'create pull request in github',
  );
  expect(plainSummary('file_write', { path: 'src/a.js' })).toBe(
    'file write: src/a.js',
  );
  expect(plainSummary('computer_shell', { command: 'x' })).not.toContain('{');
});
