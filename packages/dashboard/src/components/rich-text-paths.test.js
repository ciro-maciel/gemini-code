import { describe, expect, test } from 'bun:test';

import { repoPathOf } from './RichText';

describe('a file path in an answer', () => {
  test('without a leading slash it is inside the agent folder', () => {
    expect(repoPathOf('seo/pautas/2026-10-29.md', 'acme')).toBe(
      'acme/seo/pautas/2026-10-29.md',
    );
    expect(repoPathOf('acme/seo/pautas/2026-10-29.md', 'acme')).toBe(
      'acme/seo/pautas/2026-10-29.md',
    );
  });
  test('with a leading slash, or as the computer sees it, it starts at the root', () => {
    expect(repoPathOf('/clinic/LEIA.md', 'acme')).toBe('clinic/LEIA.md');
    expect(
      repoPathOf('/home/sprite/workspace/relatorios/ep39.md', 'acme'),
    ).toBe('relatorios/ep39.md');
    expect(repoPathOf('notas.md', null)).toBe('notas.md');
  });
  test('code that is not a file stays code', () => {
    expect(repoPathOf('blog/', 'acme')).toBe(null);
    expect(repoPathOf('artigo-longo', 'acme')).toBe(null);
    expect(repoPathOf('npm run build', 'acme')).toBe(null);
  });
});
