// Transport: Google's Antigravity CLI (`agy`), signed in with the person's own
// Google AI Pro or Ultra subscription.
//
// Gemini Code drives `agy acp`, its Agent Client Protocol server, over stdio:
// one session per agent task, run in the agent's own folder, with every text
// piece and tool step streamed into the agent's conversation.
//
// The agent asks before acting. Every tool call `agy` wants to run arrives
// as `session/request_permission` and is answered by permission.js: nothing
// outside the agent's folder, and deleting waits for the person. This is what
// the earlier print mode (`agy -p`) could not do: it ran its tools without
// asking.
//
// Limits to know:
// - The subscription has a quota that resets in hours ("Individual quota
//   reached ... Resets in 4h58m"); that is read into the state tree.
// - Sign-in happens once, in `agy` itself (run `agy` and follow the browser
//   step). Gemini Code never sees or stores the Google credentials.
// - Gemini CLI no longer serves Google AI Pro or Ultra to third-party
//   clients: on 25/11/2026 its sign-in answered "This client is no longer
//   supported for Gemini Code Assist for individuals ... migrate to the
//   Antigravity suite". Antigravity is the path Google points to.

import { spawn } from 'node:child_process';
import { realpathSync } from 'node:fs';

import { createAcpClient } from './acp-client.js';
import { decidePermission, outcomeFor } from './permission.js';

export const id = 'antigravity-cli';

const BIN = process.env.AGY_BIN || 'agy';
let spawner = spawn;

/** For tests: replace the process launcher. */
export function useSpawner(fake) {
  spawner = fake;
}

function runOnce(args, { cwd, timeoutMs = 30_000 } = {}) {
  return new Promise((resolve) => {
    let out = '';
    let err = '';
    let child;
    try {
      child = spawner(BIN, args, { cwd, env: process.env });
    } catch (error) {
      resolve({ code: -1, out, err: error.message, isMissing: true });
      return;
    }
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);
    child.stdout.on('data', (chunk) => (out += chunk));
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', (error) => {
      clearTimeout(timer);
      resolve({
        code: -1,
        out,
        err: error.message,
        isMissing: error.code === 'ENOENT',
      });
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ code, out, err });
    });
  });
}

/** "Resets in 4h58m31s" -> milliseconds; null when the text has no reset. */
export function resetInMs(text) {
  const match = /Resets in (?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/i.exec(
    String(text || ''),
  );
  if (!match || !match[0].replace(/Resets in/i, '').trim()) return null;
  const [, h = 0, m = 0, s = 0] = match;
  return ((Number(h) * 60 + Number(m)) * 60 + Number(s)) * 1000;
}

export const isQuotaText = (text) =>
  /quota reached|RESOURCE_EXHAUSTED|\b429\b/i.test(String(text || ''));
export const isSignedOutText = (text) =>
  /sign in|not (?:signed|logged) in|unauthenticated|login required|oauth/i.test(
    String(text || ''),
  );

/** `agy models` output ("id<TAB>label" per line) -> [{ id, label }]. */
export function parseModels(text) {
  return String(text || '')
    .split('\n')
    .map((line) => line.split('\t'))
    .filter(
      ([modelId, label]) =>
        /^gemini-[\w.-]+$/.test(modelId?.trim() || '') && label,
    )
    .map(([modelId, label]) => ({ id: modelId.trim(), label: label.trim() }));
}

/** Is `agy` installed and signed in, and which models does the subscription open? Fills the state tree. */
export async function probe() {
  const version = await runOnce(['--version'], { timeoutMs: 10_000 });
  if (version.isMissing || version.code !== 0)
    return {
      status: 'not_installed',
      transport: id,
      error:
        'Antigravity CLI (agy) is not installed. On macOS: brew install --cask antigravity-cli',
    };
  const listed = await runOnce(['models'], { timeoutMs: 40_000 });
  const said = `${listed.out}\n${listed.err}`;
  const models = parseModels(listed.out);
  if (models.length)
    return {
      status: 'ready',
      transport: id,
      transportVersion: version.out.trim(),
      models,
      error: null,
    };
  if (isQuotaText(said)) {
    const wait = resetInMs(said);
    return {
      status: 'quota_exhausted',
      transport: id,
      transportVersion: version.out.trim(),
      quota: {
        isExhausted: true,
        resetsAt: wait === null ? null : Date.now() + wait,
      },
      error: said.trim().slice(0, 300),
    };
  }
  if (isSignedOutText(said))
    return {
      status: 'signed_out',
      transport: id,
      transportVersion: version.out.trim(),
      error:
        'Run `agy` once in a terminal and sign in with the Google account that has the subscription.',
    };
  return {
    status: 'error',
    transport: id,
    transportVersion: version.out.trim(),
    error: said.trim().slice(0, 300) || `agy models exited ${listed.code}`,
  };
}

/**
 * The agent links files by their absolute file:// address, which shows the
 * machine's folders and opens nothing in the dashboard. Inside the agent's
 * folder they become the relative path, as code.
 */
export function withFolderLinks(text, folder) {
  const roots = [folder];
  try {
    roots.push(realpathSync(folder));
  } catch {
    // A folder that is gone keeps only the name it was given.
  }
  let out = text;
  for (const root of new Set(roots)) {
    const base = `file://${root.replace(/\/$/, '')}/`;
    const escaped = base.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    out = out
      .replace(
        new RegExp(`\\[([^\\]]*)\\]\\(${escaped}([^)\\s]*)\\)`, 'g'),
        (_, label, rel) => `\`${decodeURI(rel) || label}\``,
      )
      .replace(new RegExp(`${escaped}([^\\s)\\]]*)`, 'g'), (_, rel) =>
        decodeURI(rel),
      );
  }
  return out;
}

/**
 * What an ACP update means to the conversation: text, a tool starting, or a
 * tool ending. `started` holds the calls already started; an ended call is
 * marked in it too, since the agent can repeat the final status.
 */
export function eventOfUpdate(update, started) {
  if (
    update.sessionUpdate === 'agent_message_chunk' &&
    update.content?.type === 'text'
  )
    return { type: 'text', text: update.content.text ?? '' };
  if (
    update.sessionUpdate === 'tool_call' ||
    update.sessionUpdate === 'tool_call_update'
  ) {
    const id = update.toolCallId;
    const name = update.name ?? update.title ?? update.kind ?? 'tool';
    const isEnd = update.status === 'completed' || update.status === 'failed';
    if (started.has(`end:${id}`)) return null;
    if (!started.has(id)) {
      started.add(id);
      if (!isEnd)
        return {
          type: 'tool_start',
          id,
          name,
          args: update.args ?? update.rawInput ?? {},
        };
    }
    if (isEnd) {
      started.add(`end:${id}`);
      return {
        type: 'tool_end',
        id,
        name,
        output: outputOf(update),
      };
    }
  }
  return null;
}

const outputOf = (update) => {
  const parts = (update.content ?? [])
    .map((item) => item?.content?.text ?? item?.text ?? '')
    .filter(Boolean);
  if (parts.length) return parts.join('\n');
  if (update.rawOutput !== undefined)
    return typeof update.rawOutput === 'string'
      ? update.rawOutput
      : JSON.stringify(update.rawOutput);
  return update.status === 'failed' ? 'failed' : 'done';
};

/**
 * Runs one turn of an agent through `agy acp` in `cwd`. Streams events to
 * `onEvent` (text, tool_start, tool_end, permission) and resolves with
 * { conversationId, text, status, usage, error }.
 */
export async function runTurn({
  prompt,
  model,
  cwd,
  conversationId = null,
  onEvent = () => {},
  signal = null,
  mcpServers = [],
  decide = decidePermission,
}) {
  let child;
  try {
    child = spawner(BIN, ['acp'], { cwd, env: process.env });
  } catch (error) {
    return { conversationId, text: '', status: 'ERROR', error: error.message };
  }
  let err = '';
  child.stderr?.on('data', (chunk) => (err += chunk));
  const client = createAcpClient(child);
  const started = new Set();
  let text = '';
  let sessionId = conversationId;
  // session/load replays the whole history as updates before it answers; only
  // what comes after the prompt belongs to this turn.
  let isPrompting = false;

  client.onNotification('session/update', ({ update } = {}) => {
    if (!update || !isPrompting) return;
    const event = eventOfUpdate(update, started);
    if (!event) return;
    if (event.type === 'text') text += event.text;
    onEvent(event);
  });
  client.onRequest(
    'session/request_permission',
    ({ toolCall = {}, options = [] } = {}) => {
      const decision = decide(toolCall, cwd, {
        mcpServers: mcpServers.map((server) => server.name),
      });
      onEvent({
        type: 'permission',
        id: toolCall.toolCallId,
        name: toolCall.name ?? toolCall.title ?? toolCall.kind ?? 'tool',
        kind: toolCall.kind ?? 'other',
        isAllowed: decision.isAllowed,
        reason: decision.reason,
      });
      return outcomeFor(decision, options);
    },
  );

  const cancel = () => {
    if (sessionId) client.notify('session/cancel', { sessionId });
    setTimeout(() => client.close(), 500);
  };
  signal?.addEventListener('abort', cancel, { once: true });

  try {
    await client.request('initialize', {
      protocolVersion: 1,
      clientCapabilities: { fs: { readTextFile: false, writeTextFile: false } },
    });
    if (sessionId) {
      try {
        await client.request('session/load', {
          sessionId,
          cwd,
          mcpServers,
        });
      } catch {
        sessionId = null;
      }
    }
    if (!sessionId) {
      const created = await client.request('session/new', {
        cwd,
        mcpServers,
      });
      sessionId = created.sessionId;
    }
    if (model) {
      try {
        await client.request('session/set_model', {
          sessionId,
          modelId: model,
        });
      } catch {
        // An agent without model switching keeps its own default.
      }
    }
    isPrompting = true;
    const result = await client.request('session/prompt', {
      sessionId,
      prompt: [{ type: 'text', text: prompt }],
    });
    if (signal?.aborted)
      return {
        conversationId: sessionId,
        text,
        status: 'CANCELLED',
        error: null,
      };
    return {
      conversationId: sessionId,
      text: withFolderLinks(text, cwd),
      status: 'SUCCESS',
      stopReason: result?.stopReason ?? null,
      usage: result?.usage ?? null,
      error: null,
    };
  } catch (error) {
    if (signal?.aborted)
      return {
        conversationId: sessionId,
        text,
        status: 'CANCELLED',
        error: null,
      };
    const said = `${error.message}\n${err}`.trim();
    return {
      conversationId: sessionId,
      text,
      status: isQuotaText(said) ? 'QUOTA' : 'ERROR',
      resetInMs: resetInMs(said),
      error: said.slice(0, 400),
    };
  } finally {
    signal?.removeEventListener('abort', cancel);
    client.close();
  }
}
