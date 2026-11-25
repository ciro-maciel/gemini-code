import { describe, expect, test } from 'bun:test';

import { modelFailureText } from './failure-text.js';

const on = (error, provider = 'anthropic') =>
  modelFailureText(error, { model: 'qwen/qwen3.8-omni-flash', provider });

describe('a failed model call, as the person reads it', () => {
  test('the 30/10 case: a model the key does not have names the model and the chip, never the JSON', () => {
    const text = on(
      new Error(
        '404 {"type":"error","error":{"type":"not_found_error","message":"model: qwen/qwen3.8-omni-flash"},"request_id":"req_011"}',
      ),
    );
    expect(text).toBe(
      'The model qwen/qwen3.8-omni-flash does not exist on the Anthropic account. Pick another in the model chip and send the message again.',
    );
    expect(text).not.toContain('{');
  });

  test('the status comes from the SDK error or from "Provider 401:" in the message', () => {
    expect(on(Object.assign(new Error('x'), { status: 401 }))).toContain(
      'refused this AI account',
    );
    expect(
      on(new Error('OpenRouter 401: {"error":"no auth"}'), 'openrouter'),
    ).toBe(
      "OpenRouter refused this AI account's key. Check the key in Settings, AI Accounts.",
    );
  });

  test('credit, limit, size, outage and timeout each say what to do', () => {
    expect(
      on(new Error('400 {"message":"Your credit balance is too low"}')),
    ).toContain('out of credit');
    expect(on(new Error('OpenRouter 402: {}'), 'openrouter')).toContain(
      'out of credit',
    );
    expect(on(new Error('429 rate limited'))).toContain('call limit');
    expect(on(new Error('400 prompt is too long: 250000 tokens'))).toContain(
      'too long for the model',
    );
    expect(on(new Error('529 {"type":"overloaded_error"}'))).toContain(
      'overloaded',
    );
    expect(
      on(
        Object.assign(new Error('The operation timed out.'), {
          name: 'TimeoutError',
        }),
      ),
    ).toContain('took too long');
  });

  test('anything else is still a sentence, without the raw answer', () => {
    expect(on(new Error('400 {"weird":true}'))).toBe(
      'Anthropic could not answer right now. Send the message again; if it happens again, pick another model in the model chip.',
    );
  });
});
