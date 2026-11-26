import { describe, expect, test } from 'bun:test';

import { attemptKind, modelFailureText } from './failure-text.js';

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

describe('a stop after several models, as the person reads it', () => {
  const quota = new Error(
    'Google Gemini 429: {"error":{"code":429,"message":"Quota exceeded for metric: generate_content_free_tier_requests, limit: 20, model: gemini-3.6-flash, description: Generate content requests per day limit exceeded on Free Tier."}}',
  );
  const zero = new Error(
    'Google Gemini 429: {"error":{"code":429,"message":"Quota exceeded for metric: generate_content_free_tier_input_token_count, limit: 0, model: gemini-4-neon"}}',
  );
  const busy = new Error(
    'Google Gemini 503: {"error":{"code":503,"message":"This model is currently experiencing high demand.","status":"UNAVAILABLE"}}',
  );

  test('the 26/11 case: demand on one, the free daily quota on others, every model named with its reason', () => {
    const text = modelFailureText(busy, {
      model: 'gemini-3.5-flash-lite',
      provider: 'google',
      attempts: [
        { model: 'gemini-3.5-flash-lite', error: busy },
        { model: 'gemini-3.6-flash', error: quota },
        { model: 'gemini-4-neon', error: zero },
      ],
    });
    const lines = text.split('\n');
    expect(lines[0]).toContain('free plan');
    expect(lines[0]).toContain('Google AI Studio');
    expect(lines).toContain(
      'The other models are under high demand at Google right now.',
    );
    expect(lines).toContain('Models tried (3):');
    expect(lines).toContain(
      'gemini-3.5-flash-lite: high demand right now (503)',
    );
    expect(lines).toContain(
      "gemini-3.6-flash: today's free plan quota is used up",
    );
    expect(lines).toContain(
      "gemini-4-neon: not included in this key's free plan",
    );
    expect(text).not.toContain('{');
  });

  test('demand on every model says so and that the agent already waited', () => {
    const text = modelFailureText(busy, {
      model: 'a',
      provider: 'google',
      attempts: [
        { model: 'a', error: busy },
        { model: 'b', error: busy },
      ],
    });
    expect(text.split('\n')[0]).toContain('high demand on every model tried');
  });

  test('each refusal kind has its own line', () => {
    expect(attemptKind(busy)).toBe('overloaded');
    expect(attemptKind(quota)).toBe('dailyQuota');
    expect(attemptKind(zero)).toBe('freeZero');
    expect(attemptKind(new Error('Google Gemini 429: per minute'))).toBe(
      'rate',
    );
    expect(attemptKind(new Error('Google Gemini 403: no'))).toBe('auth');
  });
});
