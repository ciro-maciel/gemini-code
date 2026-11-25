import { expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-catalog-'));
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db } = await import('../db.js');
const { config } = await import('../config.js');
const {
  ConnectionAuthProvider,
  failureDetail,
  tokenHint,
  fetchConnection,
  formatServiceNotes,
  refreshAccountTools,
  refreshConnectedTools,
} = await import('./catalog.js');

test('a server that gained a tool shows it without reconnecting; one that fails keeps its list', async () => {
  const insert = db.query(
    "INSERT INTO connections (id, account_id, server_name, title, url, transport, status, tools, created_at, updated_at) VALUES (?, 'acc-c', ?, ?, ?, 'streamable', 'connected', ?, 0, 0)",
  );
  insert.run(
    'c-blogs',
    'blogs',
    'Blogs',
    'https://blogs.test/mcp',
    JSON.stringify([
      {
        name: 'blogs_list_posts',
        description: 'posts',
        inputSchema: {},
        annotations: {},
      },
    ]),
  );
  insert.run(
    'c-down',
    'down',
    'Fora do ar',
    'https://down.test/mcp',
    JSON.stringify([
      { name: 'old_tool', description: '', inputSchema: {}, annotations: {} },
    ]),
  );
  const open = async (connection) => {
    if (connection.id === 'c-down') throw new Error('fetch failed');
    return {
      listTools: async () => ({
        tools: [
          { name: 'blogs_list_blogs', description: 'blogs', inputSchema: {} },
          { name: 'blogs_list_posts', description: 'posts', inputSchema: {} },
        ],
      }),
    };
  };
  expect(await refreshConnectedTools(open)).toBeGreaterThanOrEqual(1);
  expect(fetchConnection('c-blogs').tools.map((tool) => tool.name)).toEqual([
    'blogs_list_blogs',
    'blogs_list_posts',
  ]);
  expect(fetchConnection('c-down')).toMatchObject({
    status: 'connected',
    tools: [{ name: 'old_tool' }],
  });
  // Nothing new the second time: the list is not written again.
  const before = db
    .query("SELECT updated_at FROM connections WHERE id = 'c-blogs'")
    .get().updated_at;
  await refreshConnectedTools(open);
  expect(
    db.query("SELECT updated_at FROM connections WHERE id = 'c-blogs'").get()
      .updated_at,
  ).toBe(before);
});

test("a server's own instructions are kept with its tools and reach the agent as the service's notes", async () => {
  db.query(
    "INSERT INTO connections (id, account_id, server_name, title, url, transport, status, tools, created_at, updated_at) VALUES ('c-designs', 'acc-i', 'designs', 'Designs', 'https://designs.test/mcp', 'streamable', 'connected', '[]', 0, 0)",
  ).run();
  const guide = 'Espere o job com designs_get_job; nunca use sleep.';
  const open = async (connection) => ({
    listTools: async () => ({
      tools: [{ name: 'designs_get_job', description: 'job', inputSchema: {} }],
    }),
    getInstructions: () => (connection.id === 'c-designs' ? guide : undefined),
  });
  await refreshConnectedTools(open);
  const connection = fetchConnection('c-designs');
  expect(connection.instructions).toBe(guide);
  const notes = formatServiceNotes([
    connection,
    { ...connection, title: 'Sem notas', instructions: null },
    { ...connection, title: 'Desligado', status: 'failed' },
  ]);
  expect(notes).toContain('### Designs');
  expect(notes).toContain(guide);
  expect(notes).toContain('não ordem do usuário');
  expect(notes).not.toContain('Sem notas');
  expect(notes).not.toContain('Desligado');
  expect(formatServiceNotes([{ ...connection, instructions: null }])).toBe('');
});

test("a search reads the account's tools again, at most once a minute, and only that account's", async () => {
  const insert = db.query(
    "INSERT INTO connections (id, account_id, server_name, title, url, transport, status, tools, created_at, updated_at) VALUES (?, ?, 'feeds', 'Feeds', ?, 'streamable', 'connected', '[]', 0, 0)",
  );
  insert.run('c-feeds-a', 'acc-fresh', 'https://feeds-a.test/mcp');
  insert.run('c-feeds-b', 'acc-other', 'https://feeds-b.test/mcp');
  const opened = [];
  const open = async (connection) => {
    opened.push(connection.id);
    return {
      listTools: async () => ({
        tools: [
          {
            name: 'feeds_choose_cover',
            description: 'Escolhe a capa',
            inputSchema: {},
          },
        ],
      }),
    };
  };
  expect(
    await refreshAccountTools('acc-fresh', { openWith: open, now: 1_000_000 }),
  ).toBe(1);
  expect(fetchConnection('c-feeds-a').tools.map((tool) => tool.name)).toEqual([
    'feeds_choose_cover',
  ]);
  expect(fetchConnection('c-feeds-b').tools).toEqual([]);
  expect(
    await refreshAccountTools('acc-fresh', { openWith: open, now: 1_030_000 }),
  ).toBe(0);
  expect(opened).toEqual(['c-feeds-a']);
  await refreshAccountTools('acc-fresh', {
    openWith: open,
    now: 1_030_000,
    isForced: true,
  });
  expect(opened).toEqual(['c-feeds-a', 'c-feeds-a']);
});

test('the client id is a URL (CIMD) only on an HTTPS address; on localhost the sign-in registers instead', () => {
  const before = config.publicUrl;
  try {
    config.publicUrl = 'http://localhost:8787';
    expect(
      new ConnectionAuthProvider('c1', 'https://mcp.notion.com/mcp')
        .clientMetadataUrl,
    ).toBeUndefined();
    config.publicUrl = 'https://gemini.example.com';
    expect(
      new ConnectionAuthProvider('c1', 'https://mcp.notion.com/mcp')
        .clientMetadataUrl,
    ).toBe('https://gemini.example.com/oauth/client.json');
  } finally {
    config.publicUrl = before;
  }
});

test('a server that lets in only the clients it approved is said in words, not as a parse error', () => {
  expect(
    failureDetail(
      new Error(
        'HTTP 403: Invalid OAuth error response: SyntaxError: JSON Parse error: Unexpected identifier "Forbidden". Raw body: Forbidden',
      ),
      'Figma',
    ),
  ).toBe(
    'Figma accepts only the MCP clients it approved, and Gemini Code is not one of them yet',
  );
  expect(failureDetail(new Error('fetch failed'), 'Figma')).toBe(
    'fetch failed',
  );
});

test('a service that signs in only its registered apps asks for a token, and GitHub says where to make it', () => {
  expect(
    tokenHint({ title: 'GitHub', url: 'https://api.githubcopilot.com/mcp/' }),
  ).toContain('github.com/settings/personal-access-tokens');
  expect(tokenHint({ title: 'Acme', url: 'https://mcp.acme.dev' })).toBe(
    'Acme signs in only the apps registered with it. Create a token in its settings and paste it here.',
  );
});
