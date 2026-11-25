import { afterEach, describe, expect, test } from 'bun:test';

process.env.SPRITES_TOKEN ||= 'test';
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');
const { complete } = await import('./model.js');

const realFetch = globalThis.fetch;
afterEach(() => {
  globalThis.fetch = realFetch;
});

describe('an agent on its own key', () => {
  test('talks straight to the provider, and asks again without effort when the model refuses it', async () => {
    const calls = [];
    globalThis.fetch = async (url, init) => {
      const body = JSON.parse(init.body);
      calls.push({ url, body, auth: init.headers.Authorization });
      if (body.reasoning_effort)
        return new Response(
          JSON.stringify({
            error: { message: 'Unsupported parameter: reasoning_effort' },
          }),
          { status: 400 },
        );
      return Response.json({
        choices: [{ message: { role: 'assistant', content: 'oi' } }],
        usage: { prompt_tokens: 10 },
      });
    };
    const reply = await complete({
      model: 'gpt-6',
      effort: 'high',
      account: { provider: 'openai', key: 'sk-x' },
      messages: [{ role: 'user', content: 'oi' }],
    });
    expect(reply).toMatchObject({
      message: { content: 'oi' },
      cost: 0,
      promptTokens: 10,
    });
    expect(calls.map((call) => call.url)).toEqual([
      'https://api.openai.com/v1/chat/completions',
      'https://api.openai.com/v1/chat/completions',
    ]);
    expect(calls[0]).toMatchObject({
      auth: 'Bearer sk-x',
      body: { reasoning_effort: 'high' },
    });
    expect(calls[1].body.reasoning_effort).toBeUndefined();
    expect(calls[0].body.provider).toBeUndefined();
  });
});
