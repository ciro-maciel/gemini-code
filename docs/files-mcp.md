# The files MCP

Every agent works in its own folder, `<WORKSPACE_DIR>/agents/<agent>/`. One MCP server reaches it, with four tools over the same handlers the dashboard's file tree uses (`packages/server/src/agent-files.js`), so what the screen can do the agent can do, and nothing more.

| Tool | Operations |
|---|---|
| `files_guide` | The table of operations and their arguments. Read it first. |
| `files_read` | `list`, `tree`, `read` (whole or a line range), `read_many`, `info`, `search` (by name), `grep` (by content), `changes` |
| `files_write` | `write` (refuses to replace without `overwrite`), `edit` (one exact match), `append`, `mkdir`, `move`, `copy`, `upload` (base64) |
| `files_delete` | `delete`: the first call answers `confirmRequired` with what goes and a 10-minute code; only a second call with `confirm: true` and that code deletes |

Call a tool with `{ "op": "<operation>", ...arguments }`. A new operation is a new row in `OPERATIONS`, never a new tool.

## Locked in the folder

Every path is resolved inside the agent's root and refused when it leaves it: `..`, a path that resolves elsewhere, or a symbolic link that points out. Links are listed as links and never followed, not even by `search` or `grep`. The root itself cannot be deleted or moved.

## Inside Gemini Code

The agent gets the four tools in its tool list. Reading and writing in its own folder run at once; `files_delete` always waits for the person's approval, which stands for the second call. The agent's terminal (`computer_shell`, `computer_job_start`) starts in the same folder in local mode.

The dashboard shows the folder next to the conversation and reads itself again when the disk changes: a watcher on the folder publishes `files_changed` on the account stream, at most every 300 ms per agent. What was added since the server started watching is marked `A`, what was modified `M`.

## From any MCP client

`POST /api/bots/<agent id>/mcp/files` is a stateless Streamable HTTP endpoint (JSON-RPC 2.0, JSON answers): `initialize`, `tools/list`, `tools/call`. Send the person's token in `Authorization` when sign-in is on; local mode needs none.

```json
{ "jsonrpc": "2.0", "id": 1, "method": "tools/call", "params": { "name": "files_read", "arguments": { "op": "tree", "depth": 2 } } }
```

Routes behind it: `GET /api/bots/:id/fs/:op` (read), `POST /api/bots/:id/fs/:op` (write), `DELETE /api/bots/:id/fs` (delete).
