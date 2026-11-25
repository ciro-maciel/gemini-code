import { describe, expect, test } from 'bun:test';

import { fromRegistry, lineOf, sectionsOf, usedBy } from './catalog.js';

const apps = [
  {
    id: 'gmail',
    title: 'Gmail',
    description: 'E-mails',
    category: 'mail',
    isRecommended: true,
    connection: { id: 'c1', status: 'connected', tools: [1, 2] },
  },
  {
    id: 'notion',
    title: 'Notion',
    description: 'Páginas e bancos',
    category: 'productivity',
    connection: null,
  },
  {
    id: 'blogs',
    title: 'Blogs',
    description: 'Publicar no blog',
    category: 'productivity',
    connection: { id: 'c2', status: 'pending_auth', tools: [] },
  },
];
const categories = [
  { id: 'mail', label: 'E-mail' },
  { id: 'productivity', label: 'Produtividade' },
];

describe('the connectors page', () => {
  test('sections: recommended and each category; a filter; the search; the connected', () => {
    expect(
      sectionsOf(apps, categories, 'all', '').map((s) => [
        s.label,
        s.apps.length,
      ]),
    ).toEqual([
      ['Recomendados', 1],
      ['E-mail', 1],
      ['Produtividade', 2],
    ]);
    expect(sectionsOf(apps, categories, 'productivity', '')[0]).toMatchObject({
      label: 'Produtividade',
    });
    expect(
      sectionsOf(apps, categories, 'all', 'paginas')[0].apps.map((a) => a.id),
    ).toEqual(['notion']);
    expect(
      sectionsOf(apps, categories, 'connected', 'x')[0].apps.map((a) => a.id),
    ).toEqual(['gmail', 'blogs']);
  });

  test('the line under each app says its state', () => {
    expect(lineOf(apps[0])).toBe('2 tools · E-mails');
    expect(lineOf(apps[1])).toBe('Páginas e bancos');
    expect(lineOf(apps[2])).toBe('Needs to sign in again');
    expect(
      lineOf({
        description: 'x',
        connection: { status: 'failed', statusDetail: 'token vencido' },
      }),
    ).toBe('token vencido');
    expect(
      lineOf({ description: 'x', connection: { status: 'needs_secret' } }),
    ).toBe('Paste the service token to finish');
  });

  test('who uses a connection: every own agent unless it picked a list; shared agents are not counted', () => {
    const bots = [
      { id: 'a', connectionIds: null },
      { id: 'b', connectionIds: ['c2'] },
      { id: 'c', connectionIds: null, access: 'read' },
    ];
    expect(usedBy({ id: 'c1' }, bots).map((b) => b.id)).toEqual(['a']);
    expect(usedBy({ id: 'c2' }, bots).map((b) => b.id)).toEqual(['a', 'b']);
    expect(usedBy(null, bots)).toEqual([]);
  });

  test('a registry server becomes a row', () => {
    expect(
      fromRegistry({
        serverName: 'io.x/mcp',
        title: 'X',
        remotes: [{ url: 'https://x', transport: 'http' }],
      }),
    ).toMatchObject({
      id: 'registry:io.x/mcp',
      url: 'https://x',
      description: 'io.x/mcp',
    });
  });
});
