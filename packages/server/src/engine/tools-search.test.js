import { expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'assistant-tools-search-'),
);
process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db } = await import('../db.js');
const { runBaseTool } = await import('./tools.js');

test('a search puts first the tool that carries the most words, a word in its name counting twice', async () => {
  const tools = [
    ...Array.from({ length: 45 }, (_, i) => ({
      name: `feeds_tool_${i}`,
      description: 'Uma ferramenta do Feeds',
      inputSchema: {},
      annotations: {},
    })),
    {
      name: 'feeds_choose_cover',
      description: 'Usa uma das opções de capa de um vídeo.',
      inputSchema: {},
      annotations: {},
    },
  ];
  db.query(
    "INSERT INTO connections (id, account_id, server_name, title, url, transport, status, tools, created_at, updated_at) VALUES ('c-rank', 'acc-rank', 'feeds', 'Feeds', 'https://rank.test/mcp', 'streamable', 'connected', ?, 0, 0)",
  ).run(JSON.stringify(tools));
  const result = await runBaseTool({
    bot: { id: 'b', accountId: 'acc-rank' },
    task: { id: 't' },
    name: 'tools_search',
    args: { query: 'Feeds escolher capa cover' },
    setEnabledTools: () => {},
  });
  const found = JSON.parse(result.text).connectedTools.map((tool) => tool.name);
  expect(found[0]).toEndWith('feeds_choose_cover');
  expect(found).toHaveLength(40);
});
