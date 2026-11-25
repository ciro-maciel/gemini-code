import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';
import { mkdirSync, mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

import {
  eventOfUpdate,
  parseModels,
  resetInMs,
  runTurn,
  useSpawner,
} from './antigravity-cli.js';
import { decidePermission, outcomeFor } from './permission.js';
import {
  createSubscriptionStore,
  initialState,
  isUsable,
  OFFICIAL_API,
} from './state.js';
import {
  refreshSubscription,
  runSubscriptionTurn,
  store,
  useTransport,
} from './index.js';

const OPTIONS = [
  { optionId: 'allow', name: 'Allow', kind: 'allow_once' },
  { optionId: 'reject', name: 'Reject', kind: 'reject_once' },
];

// A fake `agy acp`: answers the handshake, and on a prompt streams text and
// tool steps and asks permission for each tool call in `asks`, recording what
// the client answered. `failPrompt` makes the prompt fail with that message.
function fakeAcpAgent({ asks = [], failPrompt = null } = {}) {
  const seen = { methods: [], answers: [], cwd: null, args: null };
  useSpawner((bin, args, options) => {
    seen.args = args;
    seen.cwd = options.cwd;
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => queueMicrotask(() => child.emit('close', 0));
    const out = (message) =>
      child.stdout.emit(
        'data',
        JSON.stringify({ jsonrpc: '2.0', ...message }) + '\n',
      );
    const waiting = new Map();
    const update = (sessionId, body) =>
      out({ method: 'session/update', params: { sessionId, update: body } });
    child.stdin = {
      write(line) {
        const message = JSON.parse(line);
        if (message.id !== undefined && !message.method) {
          waiting.get(message.id)?.(message.result);
          return true;
        }
        seen.methods.push(message.method);
        const reply = (result) => out({ id: message.id, result });
        if (message.method === 'initialize') reply({ protocolVersion: 1 });
        else if (message.method === 'session/new')
          reply({ sessionId: 's-new' });
        else if (message.method === 'session/load') reply({});
        else if (message.method === 'session/set_model') reply({});
        else if (message.method === 'session/prompt') {
          const sessionId = message.params.sessionId;
          (async () => {
            if (failPrompt)
              return out({
                id: message.id,
                error: { code: -32000, message: failPrompt },
              });
            update(sessionId, {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: 'Do' },
            });
            let n = 0;
            for (const toolCall of asks) {
              n += 1;
              const toolCallId = `call-${n}`;
              update(sessionId, {
                sessionUpdate: 'tool_call',
                toolCallId,
                name: toolCall.name,
                status: 'pending',
                args: toolCall.args,
              });
              const askId = `ask-${n}`;
              const answer = await new Promise((resolve) => {
                waiting.set(askId, resolve);
                out({
                  id: askId,
                  method: 'session/request_permission',
                  params: {
                    sessionId,
                    toolCall: { toolCallId, ...toolCall },
                    options: OPTIONS,
                  },
                });
              });
              seen.answers.push(
                answer.outcome.optionId ?? answer.outcome.outcome,
              );
              update(sessionId, {
                sessionUpdate: 'tool_call_update',
                toolCallId,
                name: toolCall.name,
                status: 'completed',
                content: [
                  { type: 'content', content: { type: 'text', text: 'ok' } },
                ],
              });
            }
            update(sessionId, {
              sessionUpdate: 'agent_message_chunk',
              content: { type: 'text', text: 'ne' },
            });
            reply({ stopReason: 'end_turn', usage: { totalTokens: 10 } });
          })();
        }
        return true;
      },
    };
    return child;
  });
  return seen;
}

const agentFolder = () => {
  const root = mkdtempSync(path.join(tmpdir(), 'acp-agent-'));
  mkdirSync(path.join(root, 'src'));
  return root;
};

describe('the Antigravity CLI over ACP', () => {
  test('the quota reset and the model list are read from what agy prints', () => {
    expect(resetInMs('Individual quota reached. Resets in 4h58m31s.')).toBe(
      ((4 * 60 + 58) * 60 + 31) * 1000,
    );
    expect(resetInMs('Resets in 12m')).toBe(12 * 60 * 1000);
    expect(resetInMs('no reset here')).toBeNull();
    expect(
      parseModels(
        'Fetching available models...\ngemini-4-neon-high\tGemini 4 Neon (High)\ngemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)\n',
      ),
    ).toEqual([
      { id: 'gemini-4-neon-high', label: 'Gemini 4 Neon (High)' },
      { id: 'gemini-3.8-flash-medium', label: 'Gemini 3.8 Flash (Medium)' },
    ]);
  });

  test('a turn runs in the agent folder, streams text and tools, and picks the model', async () => {
    const root = agentFolder();
    const seen = fakeAcpAgent({
      asks: [
        {
          name: 'write_file',
          kind: 'edit',
          args: { Path: path.join(root, 'src/a.js') },
        },
      ],
    });
    const events = [];
    const answer = await runTurn({
      prompt: 'make a.js',
      model: 'gemini-4-neon-low',
      cwd: root,
      onEvent: (event) => events.push(event.type),
    });
    expect(answer).toMatchObject({
      status: 'SUCCESS',
      text: 'Done',
      conversationId: 's-new',
    });
    expect(seen.args).toEqual(['acp']);
    expect(seen.cwd).toBe(root);
    expect(seen.methods).toEqual([
      'initialize',
      'session/new',
      'session/set_model',
      'session/prompt',
    ]);
    expect(events).toEqual([
      'text',
      'tool_start',
      'permission',
      'tool_end',
      'text',
    ]);
    expect(seen.answers).toEqual(['allow']);
  });

  test('a follow-up loads the same session instead of starting a new one', async () => {
    const seen = fakeAcpAgent();
    const answer = await runTurn({
      prompt: 'and now?',
      cwd: agentFolder(),
      conversationId: 's-old',
    });
    expect(answer.conversationId).toBe('s-old');
    expect(seen.methods).toEqual([
      'initialize',
      'session/load',
      'session/prompt',
    ]);
  });

  test('every tool call asks first: outside the folder and deleting are refused, inside is allowed', async () => {
    const root = agentFolder();
    const seen = fakeAcpAgent({
      asks: [
        {
          name: 'write_file',
          kind: 'edit',
          args: { Path: path.join(root, 'src/ok.js') },
        },
        { name: 'write_file', kind: 'edit', args: { Path: '/etc/hosts' } },
        {
          name: 'run_command',
          kind: 'execute',
          args: { CommandLine: 'rm -rf src' },
        },
        {
          name: 'run_command',
          kind: 'execute',
          args: { CommandLine: 'cat ~/.ssh/id_ed25519' },
        },
        {
          name: 'run_command',
          kind: 'execute',
          args: { CommandLine: 'bun test' },
        },
      ],
    });
    const refused = [];
    await runTurn({
      prompt: 'x',
      cwd: root,
      onEvent: (event) =>
        event.type === 'permission' &&
        !event.isAllowed &&
        refused.push(event.reason),
    });
    expect(seen.answers).toEqual([
      'allow',
      'reject',
      'reject',
      'reject',
      'allow',
    ]);
    expect(refused[0]).toContain('outside the agent folder');
    expect(refused[1]).toContain('deleting waits for the person');
  });

  test('a prompt that ends on the quota says QUOTA and when it comes back', async () => {
    fakeAcpAgent({ failPrompt: 'Individual quota reached. Resets in 2h0m0s.' });
    const answer = await runTurn({ prompt: 'x', cwd: agentFolder() });
    expect(answer.status).toBe('QUOTA');
    expect(answer.resetInMs).toBe(2 * 3_600_000);
  });

  test('updates become one start and one end per tool, whatever order the agent repeats them in', () => {
    const started = new Set();
    expect(
      eventOfUpdate(
        {
          sessionUpdate: 'tool_call',
          toolCallId: 't',
          name: 'read_file',
          status: 'pending',
        },
        started,
      ),
    ).toMatchObject({ type: 'tool_start' });
    expect(
      eventOfUpdate(
        {
          sessionUpdate: 'tool_call_update',
          toolCallId: 't',
          status: 'in_progress',
        },
        started,
      ),
    ).toBeNull();
    expect(
      eventOfUpdate(
        {
          sessionUpdate: 'tool_call_update',
          toolCallId: 't',
          status: 'completed',
          rawOutput: 'x',
        },
        started,
      ),
    ).toMatchObject({ type: 'tool_end', output: 'x' });
    expect(
      eventOfUpdate({ sessionUpdate: 'usage_update' }, started),
    ).toBeNull();
  });

  test('an outcome is picked from the options the agent offered, or cancelled when none fits', () => {
    expect(outcomeFor({ isAllowed: true }, OPTIONS)).toEqual({
      outcome: { outcome: 'selected', optionId: 'allow' },
    });
    expect(outcomeFor({ isAllowed: false }, OPTIONS)).toEqual({
      outcome: { outcome: 'selected', optionId: 'reject' },
    });
    expect(outcomeFor({ isAllowed: true }, [])).toEqual({
      outcome: { outcome: 'cancelled' },
    });
    expect(
      decidePermission(
        { kind: 'read', locations: [{ path: '../x' }] },
        agentFolder(),
      ).isAllowed,
    ).toBe(false);
  });
});

describe('the subscription state tree', () => {
  test('starts unknown, carries the unconfirmed 02/12 report, and refuses a made-up status', () => {
    const local = createSubscriptionStore();
    expect(local.get().status).toBe('unknown');
    expect(local.get().officialApi).toMatchObject({
      expectedOn: '2026-12-02',
      isConfirmed: false,
      source: OFFICIAL_API.source,
    });
    expect(() => local.set({ status: 'maybe' })).toThrow();
  });

  test('a patch keeps the rest of the tree and tells every listener', () => {
    const local = createSubscriptionStore();
    const heard = [];
    local.subscribe((state) => heard.push(state.status));
    local.set({
      status: 'quota_exhausted',
      quota: { isExhausted: true, resetsAt: 5 },
    });
    expect(local.get().quota).toEqual({ isExhausted: true, resetsAt: 5 });
    expect(local.get().version).toBe(initialState().version);
    expect(heard).toEqual(['quota_exhausted']);
  });

  test('only ready talks, or a quota whose reset has passed', () => {
    expect(isUsable({ ...initialState(), status: 'ready' })).toBe(true);
    expect(isUsable({ ...initialState(), status: 'signed_out' })).toBe(false);
    expect(
      isUsable(
        {
          ...initialState(),
          status: 'quota_exhausted',
          quota: { isExhausted: true, resetsAt: 1000 },
        },
        999,
      ),
    ).toBe(false);
    expect(
      isUsable(
        {
          ...initialState(),
          status: 'quota_exhausted',
          quota: { isExhausted: true, resetsAt: 1000 },
        },
        1000,
      ),
    ).toBe(true);
  });

  test('any transport fills the same tree: a quota answer marks it exhausted, the next success marks it ready', async () => {
    let next = { status: 'QUOTA', resetInMs: 60_000, error: 'quota reached' };
    const fake = {
      id: 'fake',
      probe: async () => ({
        status: 'ready',
        transport: 'fake',
        models: [{ id: 'gemini-4-neon-low', label: 'Neon' }],
      }),
      runTurn: async () => ({ conversationId: 'k1', text: 'ok', ...next }),
    };
    useTransport(fake);
    await refreshSubscription();
    expect(store.get()).toMatchObject({ status: 'ready', transport: 'fake' });
    await runSubscriptionTurn({ taskId: 't1', prompt: 'x', cwd: '/tmp' });
    expect(store.get().status).toBe('quota_exhausted');
    expect(store.get().quota.resetsAt).toBeGreaterThan(Date.now());
    next = { status: 'SUCCESS' };
    store.set({ quota: { resetsAt: Date.now() - 1 } });
    await runSubscriptionTurn({ taskId: 't1', prompt: 'y', cwd: '/tmp' });
    expect(store.get().status).toBe('ready');
  });
});
