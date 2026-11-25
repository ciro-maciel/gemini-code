// The files MCP: an agent's folder in four tools (guide, read, write, delete)
// over the same handlers the dashboard's file tree uses (agent-files.js).
//
// Two ways in, one logic:
// - Gemini Code's own agents get the four tools in their tool list.
// - Any MCP client (Antigravity CLI, Gemini CLI, Claude Code) can mount
//   POST /mcp/files/<agentId> with the person's token: a stateless
//   Streamable HTTP endpoint that answers JSON.
//
// Deleting takes two calls: the first answers confirmRequired with what goes
// and a 10-minute code; only a second call with that code and confirm: true
// deletes. Inside Gemini Code the person's approval of files_delete is that
// confirmation.

import {
  OPERATIONS,
  FilesError,
  runFileOperation,
  toolOf,
} from './agent-files.js';

const TOOL_TEXT = {
  read: 'Reads the agent folder: list, tree, read, read_many, info, search, grep, changes.',
  write:
    'Creates and changes files and folders in the agent folder: write, edit, append, mkdir, move, copy, upload.',
  delete:
    'Deletes a file or folder in the agent folder. The first call returns confirmRequired and a code; show it to the person and call again with confirm: true and the code.',
};

/** The guide: every operation, the tool it belongs to and its arguments. */
export function filesGuide() {
  const lines = [
    'Files MCP: the agent folder. Call files_read, files_write or files_delete with { "op": "<operation>", ...arguments }. Paths are relative to the agent folder; anything outside is refused.',
    '',
  ];
  for (const row of OPERATIONS) {
    const args = Object.entries(row.args)
      .map(([name, about]) => `${name}: ${about}`)
      .join('; ');
    lines.push(
      `- files_${row.tool} op="${row.op}": ${row.does}${args ? ` Arguments: ${args}.` : ''}`,
    );
  }
  return lines.join('\n');
}

const opsOf = (tool) =>
  OPERATIONS.filter((row) => row.tool === tool).map((row) => row.op);

const schemaFor = (tool) => ({
  type: 'object',
  properties: {
    op: {
      type: 'string',
      enum: opsOf(tool),
      description: 'The operation; files_guide lists them.',
    },
    path: { type: 'string' },
    paths: { type: 'array', items: { type: 'string' } },
    from: { type: 'string' },
    to: { type: 'string' },
    content: { type: 'string' },
    find: { type: 'string' },
    replace: { type: 'string' },
    query: { type: 'string' },
    depth: { type: 'number' },
    offset: { type: 'number' },
    limit: { type: 'number' },
    base64: { type: 'string' },
    overwrite: { type: 'boolean' },
    confirm: { type: 'boolean' },
    code: { type: 'string' },
  },
  required: ['op'],
});

/** The four tools, in the OpenAI function format the agent loop uses. */
export const FILES_TOOLS = [
  {
    type: 'function',
    function: {
      name: 'files_guide',
      description:
        'Read this first: the operations of the agent folder and their arguments.',
      parameters: { type: 'object', properties: {} },
    },
  },
  ...['read', 'write', 'delete'].map((tool) => ({
    type: 'function',
    function: {
      name: `files_${tool}`,
      description: TOOL_TEXT[tool],
      parameters: schemaFor(tool),
    },
  })),
];

export const FILES_TOOL_NAMES = new Set(
  FILES_TOOLS.map((tool) => tool.function.name),
);

/**
 * Runs one files tool for an agent. Returns { result } or { error }.
 * `isConfirmedByPerson` lets Gemini Code's own approval stand in for the
 * second delete call.
 */
export function callFilesTool(
  bot,
  name,
  args = {},
  { isConfirmedByPerson = false } = {},
) {
  if (name === 'files_guide') return { result: filesGuide() };
  const tool = String(name).replace(/^files_/, '');
  const op = String(args.op || '');
  if (toolOf(op) !== tool)
    return { error: `files_${tool} não faz "${op}". Leia files_guide.` };
  try {
    if (op === 'delete' && isConfirmedByPerson) {
      const first = runFileOperation(bot, 'delete', { path: args.path });
      if (!first.confirmRequired) return { result: first };
      return {
        result: runFileOperation(bot, 'delete', {
          path: args.path,
          confirm: true,
          code: first.code,
        }),
      };
    }
    return { result: runFileOperation(bot, op, args) };
  } catch (error) {
    if (error instanceof FilesError)
      return { error: error.message, code: error.code };
    throw error;
  }
}

// --- The MCP endpoint (JSON-RPC 2.0 over HTTP, stateless) ------------------

const PROTOCOL_VERSION = '2025-06-18';
const rpc = (id, result) => ({ jsonrpc: '2.0', id, result });
const rpcError = (id, code, message) => ({
  jsonrpc: '2.0',
  id,
  error: { code, message },
});

const ANNOTATIONS = {
  files_guide: { readOnlyHint: true },
  files_read: { readOnlyHint: true },
  files_write: { readOnlyHint: false, destructiveHint: false },
  files_delete: { readOnlyHint: false, destructiveHint: true },
};

/** Answers one JSON-RPC message for an agent's files MCP; null for a notification. */
export function answerFilesMcp(bot, message) {
  const { id = null, method, params = {} } = message ?? {};
  if (method?.startsWith('notifications/')) return null;
  if (method === 'initialize')
    return rpc(id, {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: { tools: { listChanged: false } },
      serverInfo: { name: 'gemini-code-files', version: '0.1.0' },
      instructions: filesGuide(),
    });
  if (method === 'ping') return rpc(id, {});
  if (method === 'tools/list')
    return rpc(id, {
      tools: FILES_TOOLS.map(({ function: tool }) => ({
        name: tool.name,
        description: tool.description,
        inputSchema: tool.parameters,
        annotations: ANNOTATIONS[tool.name],
      })),
    });
  if (method === 'tools/call') {
    if (!FILES_TOOL_NAMES.has(params.name))
      return rpcError(id, -32602, `unknown tool: ${params.name}`);
    const answer = callFilesTool(bot, params.name, params.arguments ?? {});
    const text = answer.error
      ? answer.error
      : typeof answer.result === 'string'
        ? answer.result
        : JSON.stringify(answer.result, null, 2);
    return rpc(id, {
      content: [{ type: 'text', text }],
      isError: Boolean(answer.error),
    });
  }
  return rpcError(id, -32601, `method not found: ${method}`);
}
