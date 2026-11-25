import { describe, expect, test } from 'bun:test';

import { matchParts } from './SearchPalette.jsx';

describe('the matching part of a result', () => {
  test('is marked case- and accent-blind, keeping the original text', () => {
    expect(matchParts('Neon Engineer', 'eng')).toEqual([
      { text: 'Neon ', isMatch: false },
      { text: 'Eng', isMatch: true },
      { text: 'ineer', isMatch: false },
    ]);
    expect(matchParts('Memória do agente', 'memoria')).toEqual([
      { text: 'Memória', isMatch: true },
      { text: ' do agente', isMatch: false },
    ]);
  });

  test('without a query or a match the text stays whole', () => {
    expect(matchParts('Software Engineer', '')).toEqual([
      { text: 'Software Engineer', isMatch: false },
    ]);
    expect(matchParts('Software Engineer', 'zzz')).toEqual([
      { text: 'Software Engineer', isMatch: false },
    ]);
  });
});
