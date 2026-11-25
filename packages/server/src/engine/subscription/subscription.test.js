import { describe, expect, test } from 'bun:test';
import { EventEmitter } from 'node:events';

import {
  parseEvent,
  parseModels,
  resetInMs,
  runTurn,
  useSpawner,
} from './antigravity-cli.js';
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

// A fake `agy`: prints the given lines on stdout, then exits.
function fakeAgy(lines, { code = 0, stderr = '' } = {}) {
  const calls = [];
  useSpawner((bin, args, options) => {
    calls.push({ bin, args, cwd: options.cwd });
    const child = new EventEmitter();
    child.stdout = new EventEmitter();
    child.stderr = new EventEmitter();
    child.kill = () => child.emit('close', null);
    queueMicrotask(() => {
      child.stdout.emit(
        'data',
        lines.map((line) => JSON.stringify(line)).join('\n') + '\n',
      );
      if (stderr) child.stderr.emit('data', stderr);
      child.emit('close', code);
    });
    return child;
  });
  return calls;
}

describe('reading the Antigravity CLI', () => {
  test('a stream-json run becomes start, text, tool and done events', () => {
    expect(
      parseEvent(
        JSON.stringify({
          event: 'init',
          conversation_id: 'c1',
          init: { model: 'gemini-4-neon-low' },
        }),
      ),
    ).toEqual({
      type: 'start',
      conversationId: 'c1',
      model: 'gemini-4-neon-low',
    });
    expect(
      parseEvent(
        JSON.stringify({
          event: 'step_update',
          step_update: {
            conversation_id: 'c1',
            step_index: 6,
            step_type: 'agent_response',
            text_delta: 'oi',
          },
        }),
      ),
    ).toEqual({ type: 'text', text: 'oi' });
    expect(
      parseEvent(
        JSON.stringify({
          event: 'step_update',
          step_update: {
            conversation_id: 'c1',
            step_index: 4,
            state: 'ACTIVE',
            step_type: 'tool',
            tool_name: 'run_command',
            tool_info: { parameters: { CommandLine: 'ls' } },
          },
        }),
      ),
    ).toEqual({
      type: 'tool_start',
      id: 'agy-c1-4',
      name: 'run_command',
      args: { CommandLine: 'ls' },
    });
    expect(
      parseEvent(
        JSON.stringify({
          event: 'step_update',
          step_update: {
            conversation_id: 'c1',
            step_index: 4,
            state: 'DONE',
            step_type: 'tool',
            tool_name: 'run_command',
            tool_info: { output: 'a.txt' },
          },
        }),
      ),
    ).toEqual({
      type: 'tool_end',
      id: 'agy-c1-4',
      name: 'run_command',
      output: 'a.txt',
    });
    expect(
      parseEvent(
        JSON.stringify({
          event: 'result',
          result: {
            conversation_id: 'c1',
            status: 'SUCCESS',
            response: 'pronto',
          },
        }),
      ),
    ).toMatchObject({ type: 'done', status: 'SUCCESS', text: 'pronto' });
    expect(parseEvent('not json')).toBeNull();
  });

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

  test('a turn runs sandboxed in the given folder, streams, and continues the same conversation', async () => {
    const calls = fakeAgy([
      { event: 'init', conversation_id: 'c9' },
      {
        event: 'step_update',
        step_update: {
          conversation_id: 'c9',
          step_index: 1,
          step_type: 'agent_response',
          text_delta: 'de',
        },
      },
      {
        event: 'step_update',
        step_update: {
          conversation_id: 'c9',
          step_index: 1,
          step_type: 'agent_response',
          text_delta: 'mo',
        },
      },
      {
        event: 'result',
        result: { conversation_id: 'c9', status: 'SUCCESS', response: 'demo' },
      },
    ]);
    const seen = [];
    const answer = await runTurn({
      prompt: 'qual o nome?',
      model: 'gemini-4-neon-low',
      cwd: '/tmp/agent-a',
      conversationId: 'c8',
      onEvent: (event) => seen.push(event.type),
    });
    expect(answer).toMatchObject({
      status: 'SUCCESS',
      text: 'demo',
      conversationId: 'c9',
    });
    expect(seen).toEqual(['start', 'text', 'text', 'done']);
    expect(calls[0].cwd).toBe('/tmp/agent-a');
    expect(calls[0].args).toContain('--sandbox');
    expect(
      calls[0].args.slice(
        calls[0].args.indexOf('--model'),
        calls[0].args.indexOf('--model') + 2,
      ),
    ).toEqual(['--model', 'gemini-4-neon-low']);
    expect(
      calls[0].args.slice(
        calls[0].args.indexOf('--conversation'),
        calls[0].args.indexOf('--conversation') + 2,
      ),
    ).toEqual(['--conversation', 'c8']);
  });

  test('a run that ends on the quota says QUOTA and when it comes back', async () => {
    fakeAgy([], {
      code: 1,
      stderr:
        'transport error (ResourceExhausted, HTTP 429): Individual quota reached. Resets in 2h0m0s.',
    });
    const answer = await runTurn({ prompt: 'x', cwd: '/tmp' });
    expect(answer.status).toBe('QUOTA');
    expect(answer.resetInMs).toBe(2 * 3_600_000);
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
