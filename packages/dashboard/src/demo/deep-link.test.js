import { describe, expect, test } from 'bun:test';

import { previewRedirect, restoredPath } from './deep-link.js';

describe('deep links on GitHub Pages', () => {
  test('an address inside a preview goes to that preview with the rest carried', () => {
    expect(
      previewRedirect(
        '/gemini-code/preview/feat-tree/agents/abc',
        '?path=soma.js',
        '/gemini-code/',
      ),
    ).toBe(
      `/gemini-code/preview/feat-tree/?p=${encodeURIComponent('/agents/abc?path=soma.js')}`,
    );
  });

  test('the main demo and a preview root stay where they are', () => {
    expect(
      previewRedirect('/gemini-code/agents/abc', '', '/gemini-code/'),
    ).toBeNull();
    expect(
      previewRedirect('/gemini-code/preview/feat-tree/', '', '/gemini-code/'),
    ).toBeNull();
    expect(
      previewRedirect('/gemini-code/preview/', '', '/gemini-code/'),
    ).toBeNull();
  });

  test('the preview puts the carried address back, and refuses one that leaves the site', () => {
    expect(
      restoredPath(
        `?p=${encodeURIComponent('/agents/abc?path=a.js')}`,
        '/gemini-code/preview/feat-tree/',
      ),
    ).toBe('/gemini-code/preview/feat-tree/agents/abc?path=a.js');
    expect(restoredPath('', '/gemini-code/')).toBeNull();
    expect(
      restoredPath(
        `?p=${encodeURIComponent('//evil.example')}`,
        '/gemini-code/',
      ),
    ).toBeNull();
    expect(
      restoredPath(
        `?p=${encodeURIComponent('https://evil.example')}`,
        '/gemini-code/',
      ),
    ).toBeNull();
  });

  test('the function survives being copied into the 404 page as text', () => {
    const copied = new Function(`return (${previewRedirect.toString()})`)();
    expect(copied('/gemini-code/preview/x/agents/1', '', '/gemini-code/')).toBe(
      `/gemini-code/preview/x/?p=${encodeURIComponent('/agents/1')}`,
    );
  });
});
