// Transport: Google's Antigravity CLI (`agy`), signed in with the person's own
// Google AI Pro or Ultra subscription.
//
// This is the documented, supported way to use a subscription from a terminal
// today: `agy -p` runs one prompt non-interactively with the cached sign-in,
// and `--output-format stream-json` streams every step. Gemini Code starts it
// as a child process in the agent's own folder and turns its events into the
// agent's conversation.
//
// Limits to know:
// - `agy` is an agent with its own tools (write_file, run_command, ...). In
//   print mode it runs them without asking, so Gemini Code's risk judge does
//   not see them. It is therefore always started with `--sandbox` (terminal
//   restrictions) and with its working directory set to the agent's folder.
// - The subscription has a quota that resets in hours ("Individual quota
//   reached ... Resets in 4h58m"); that is read into the state tree.
// - Sign-in happens once, in `agy` itself (run `agy` and follow the browser
//   step). Gemini Code never sees or stores the Google credentials.

import { spawn } from 'node:child_process';

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

/**
 * One line of `agy --output-format stream-json` -> a normalized event, or null.
 * Events: start, text, tool_start, tool_end, done.
 */
export function parseEvent(line) {
  let data;
  try {
    data = JSON.parse(line);
  } catch {
    return null;
  }
  if (data.event === 'init')
    return {
      type: 'start',
      conversationId: data.conversation_id ?? null,
      model: data.init?.model ?? null,
    };
  if (data.event === 'result') {
    const result = data.result ?? {};
    return {
      type: 'done',
      conversationId: result.conversation_id ?? null,
      status: result.status ?? null,
      text: result.response ?? '',
      usage: result.usage ?? null,
    };
  }
  const step = data.step_update;
  if (data.event !== 'step_update' || !step) return null;
  const stepId = `agy-${step.conversation_id ?? 'c'}-${step.step_index ?? 0}`;
  if (step.step_type === 'agent_response' && step.text_delta)
    return { type: 'text', text: step.text_delta };
  if (step.step_type === 'tool' && step.state === 'ACTIVE')
    return {
      type: 'tool_start',
      id: stepId,
      name: step.tool_name,
      args: step.tool_info?.parameters ?? {},
    };
  if (step.step_type === 'tool' && step.state === 'DONE')
    return {
      type: 'tool_end',
      id: stepId,
      name: step.tool_name,
      output: String(step.tool_info?.output ?? ''),
    };
  return null;
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
 * Runs one turn of an agent through `agy` in `cwd`. Streams events to
 * `onEvent` and resolves with { conversationId, text, status, usage, error }.
 */
export function runTurn({
  prompt,
  model,
  cwd,
  conversationId = null,
  onEvent = () => {},
  signal = null,
}) {
  const args = ['-p', prompt, '--output-format', 'stream-json', '--sandbox'];
  if (model) args.push('--model', model);
  if (conversationId) args.push('--conversation', conversationId);
  return new Promise((resolve) => {
    let child;
    try {
      child = spawner(BIN, args, { cwd, env: process.env });
    } catch (error) {
      resolve({
        conversationId,
        text: '',
        status: 'ERROR',
        error: error.message,
      });
      return;
    }
    const stopChild = () => child.kill('SIGTERM');
    signal?.addEventListener('abort', stopChild, { once: true });
    let buffer = '';
    let err = '';
    let finished = null;
    let text = '';
    let seenConversation = conversationId;
    child.stdout.on('data', (chunk) => {
      buffer += chunk;
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        const event = parseEvent(line.trim());
        if (!event) continue;
        if (event.conversationId) seenConversation = event.conversationId;
        if (event.type === 'text') text += event.text;
        if (event.type === 'done') finished = event;
        onEvent(event);
      }
    });
    child.stderr.on('data', (chunk) => (err += chunk));
    child.on('error', (error) =>
      resolve({
        conversationId: seenConversation,
        text,
        status: 'ERROR',
        error: error.message,
      }),
    );
    child.on('close', (code) => {
      signal?.removeEventListener('abort', stopChild);
      if (signal?.aborted)
        return resolve({
          conversationId: seenConversation,
          text,
          status: 'CANCELLED',
          error: null,
        });
      if (finished && finished.status === 'SUCCESS')
        return resolve({
          conversationId: seenConversation,
          text: finished.text || text,
          status: 'SUCCESS',
          usage: finished.usage,
          error: null,
        });
      const said = `${err}\n${finished?.text ?? ''}`.trim();
      resolve({
        conversationId: seenConversation,
        text,
        status: isQuotaText(said) ? 'QUOTA' : 'ERROR',
        resetInMs: resetInMs(said),
        error: said.slice(0, 400) || `agy exited ${code}`,
      });
    });
  });
}
