import { expect, test } from 'bun:test';

import { config } from './config.js';
import { isOffered, offeredProviders } from './providers.js';

test('the dashboard offers only Google Gemini; the subscription only as the experiment', () => {
  const before = config.isSubscriptionOn;
  try {
    config.isSubscriptionOn = false;
    expect(offeredProviders().map((provider) => provider.id)).toEqual([
      'google',
    ]);
    for (const id of [
      'openrouter',
      'anthropic',
      'openai',
      'gemini-cli',
      'claude-code',
    ])
      expect(isOffered(id)).toBe(false);
    config.isSubscriptionOn = true;
    expect(offeredProviders().map((provider) => provider.id)).toEqual([
      'google',
      'google-subscription',
    ]);
  } finally {
    config.isSubscriptionOn = before;
  }
});
