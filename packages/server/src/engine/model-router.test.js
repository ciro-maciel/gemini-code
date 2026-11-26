import { beforeEach, describe, expect, test } from 'bun:test';
import {
  buildFailoverCandidates,
  clearModelHealth,
  isFailoverEligible,
  isHardModelBlock,
  isModelCoolingDown,
  markModelUnavailable,
} from './model-router.js';

beforeEach(() => clearModelHealth());

describe('intelligent model failover router', () => {
  test('detects Free Tier limit: 0 and quota errors as failover-eligible', () => {
    const freeTierZero = new Error(
      'Google Gemini 429: Quota exceeded for metric: generate_content_free_tier_input_token_count, limit: 0, model: gemini-4-neon',
    );
    expect(isFailoverEligible(freeTierZero)).toBe(true);
    expect(isHardModelBlock(freeTierZero)).toBe(true);

    const overloaded = new Error(
      'Google Gemini 503: Service temporarily overloaded',
    );
    expect(isFailoverEligible(overloaded)).toBe(true);
    expect(isHardModelBlock(overloaded)).toBe(false);

    const aborted = Object.assign(new Error('Aborted'), { name: 'AbortError' });
    expect(isFailoverEligible(aborted)).toBe(false);
  });

  test('falls over only to models the person turned on, the reliable ones first', () => {
    const google = {
      id: 'ai-g',
      provider: 'google',
      key: 'AIza-1',
      models: ['gemini-4-neon', 'gemini-3.8-flash', 'gemini-3.5-flash-lite'],
    };

    const list = buildFailoverCandidates({
      primaryAccount: google,
      primaryModel: 'gemini-4-neon',
      allChatAccounts: [google],
    });

    expect(list.map((c) => c.model)).toEqual([
      'gemini-3.5-flash-lite',
      'gemini-3.8-flash',
    ]);
    // 26/11/2026: models nobody chose appeared in Settings after a failover.
    const turnedOn = new Set(google.models);
    expect(list.every((c) => turnedOn.has(c.model))).toBe(true);
  });

  test('with nothing else turned on there is no model to fall over to', () => {
    const google = {
      id: 'ai-solo',
      provider: 'google',
      key: 'AIza-1',
      models: ['gemini-4-neon'],
    };
    expect(
      buildFailoverCandidates({
        primaryAccount: google,
        primaryModel: 'gemini-4-neon',
        allChatAccounts: [google],
      }),
    ).toEqual([]);
  });

  test('skips cooling-down models and falls over across accounts on auth errors', () => {
    const google = {
      id: 'ai-g',
      provider: 'google',
      key: 'AIza-bad',
      models: ['gemini-3.8-flash'],
    };
    const openai = {
      id: 'ai-oa',
      provider: 'openai',
      key: 'sk-good',
      models: ['gpt-5-mini'],
    };

    markModelUnavailable(
      google.id,
      'gemini-3.8-flash',
      new Error('Google Gemini 429: limit: 0'),
    );
    expect(isModelCoolingDown(google.id, 'gemini-3.8-flash')).toBe(true);

    const sameAccountSkip = buildFailoverCandidates({
      primaryAccount: google,
      primaryModel: 'gemini-4-neon',
      allChatAccounts: [google, openai],
    });
    // Its only turned-on Gemini model is cooling down: the healthy one elsewhere goes first.
    expect(sameAccountSkip[0]).toMatchObject({
      account: openai,
      model: 'gpt-5-mini',
    });
    expect(sameAccountSkip.some((c) => c.model === 'gemini-3.8-flash')).toBe(
      false,
    );

    const authSkip = buildFailoverCandidates({
      primaryAccount: google,
      primaryModel: 'gemini-2.5-flash',
      allChatAccounts: [google, openai],
      skipSameAccount: true,
    });
    expect(authSkip).toHaveLength(1);
    expect(authSkip[0]).toMatchObject({
      account: openai,
      model: 'gpt-5-mini',
      sameAccount: false,
    });
  });
});
