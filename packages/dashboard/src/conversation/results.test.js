import { describe, expect, test } from 'bun:test';

import { deliveredAt, describeUrl, resultsOf } from './results';

describe('what the agent delivered, under the conversation', () => {
  test('a pull request, a link, an artifact and a file, newest first, each once', () => {
    const rows = [
      {
        kind: 'user',
        id: 'u1',
        text: 'veja https://pessoa.exemplo.com/pedido',
      },
      {
        kind: 'bot',
        id: 'b1',
        text: 'Abri o PR: https://github.com/acme/blog/pull/12.',
      },
      {
        kind: 'files',
        id: 'f1',
        botId: 'bot',
        files: [
          { path: '/home/sprite/workspace/artigo.md', name: 'artigo.md' },
        ],
      },
      {
        kind: 'artifact',
        id: 'a1',
        data: { artifactId: 'art-1', title: 'Relatório da semana' },
      },
      {
        kind: 'bot',
        id: 'b2',
        text: 'Publicado em https://blog.exemplo.com/favicon-generator/, e o PR segue em https://github.com/acme/blog/pull/12',
      },
    ];
    expect(
      resultsOf(rows).map((item) => [item.kind, item.label, item.detail]),
    ).toEqual([
      ['pull', 'PR #12', 'acme/blog'],
      ['link', 'favicon-generator', 'blog.exemplo.com/favicon-generator'],
      ['artifact', 'Relatório da semana', 'Material na conversa'],
      ['file', 'artigo.md', 'workspace/'],
    ]);
  });

  test("the person's own links and a reply still being written are not results", () => {
    expect(
      resultsOf([
        { kind: 'user', id: 'u', text: 'https://exemplo.com' },
        {
          kind: 'bot',
          id: 'p',
          isPending: true,
          text: 'https://exemplo.com/x',
        },
      ]),
    ).toEqual([]);
  });

  test('at most eight, newest first', () => {
    const rows = [
      {
        kind: 'bot',
        id: 'b',
        text: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]
          .map((n) => `https://exemplo.com/${n}`)
          .join(' '),
      },
    ];
    expect(resultsOf(rows).map((item) => item.url)).toEqual(
      [10, 9, 8, 7, 6, 5, 4, 3].map((n) => `https://exemplo.com/${n}`),
    );
  });

  test('the same address written another way is one result', () => {
    const rows = [
      {
        kind: 'bot',
        id: 'b',
        text: 'Veja https://drmaisvida.com.br, https://www.drmaisvida.com.br/ e http://drmaisvida.com.br e https://blog.drmaisvida.com.br',
      },
    ];
    expect(resultsOf(rows).map((item) => item.label)).toEqual([
      'blog.drmaisvida.com.br',
      'drmaisvida.com.br',
    ]);
  });

  test('an id in the address is shortened and never the whole name', () => {
    expect(
      describeUrl(
        'https://feeds.dashboard.example.com/posts/82760b85-63e4-48a9-934e-13a91fd1',
      ),
    ).toEqual({
      label: 'posts 82760b85',
      detail: 'feeds.dashboard.example.com/posts/82760b85…',
    });
    expect(
      describeUrl(
        'https://feeds.dashboard.example.com/5b6295eb-3e96-452e-a684-a2ae5196',
      ),
    ).toEqual({
      label: 'feeds.dashboard.example.com 5b6295eb',
      detail: 'feeds.dashboard.example.com/5b6295eb…',
    });
  });

  test('the hour today, the day and the hour before', () => {
    const now = new Date(2026, 10, 4, 15, 0).getTime() / 1000;
    expect(deliveredAt(new Date(2026, 10, 4, 9, 5).getTime() / 1000, now)).toBe(
      '09:05',
    );
    expect(
      deliveredAt(new Date(2026, 10, 3, 22, 41).getTime() / 1000, now),
    ).toBe('03/11 22:41');
    expect(deliveredAt(null, now)).toBe('');
  });

  test('each result carries when it was delivered', () => {
    const rows = [
      {
        kind: 'artifact',
        id: 'a',
        createdAt: 100,
        data: { artifactId: 'x', title: 'Placar' },
      },
    ];
    expect(resultsOf(rows)[0].at).toBe(100);
  });

  test('a bare host reads as the host', () => {
    expect(describeUrl('https://www.exemplo.com/')).toEqual({
      label: 'exemplo.com',
      detail: '',
    });
  });
});
