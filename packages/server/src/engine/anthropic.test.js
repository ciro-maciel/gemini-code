import { afterEach, describe, expect, test } from 'bun:test';

import {
  completeClaude,
  fromClaude,
  thinksAdaptively,
  toClaude,
  usageOf,
  useClient,
} from './anthropic.js';

// A Claude in memory: records the body and streams the given blocks back.
function fakeClaude(final, deltas = []) {
  const sent = [];
  const stream = (body, options) => {
    sent.push(body);
    fakeClaude.options = options;
    return {
      async *[Symbol.asyncIterator]() {
        for (const delta of deltas)
          yield { type: 'content_block_delta', index: 0, delta };
      },
      finalMessage: async () => final,
    };
  };
  useClient(() => ({ messages: { stream }, beta: { messages: { stream } } }));
  return sent;
}
afterEach(() => useClient((apiKey) => ({ apiKey })));

const conversation = [
  { role: 'system', content: 'Você é o SEO.' },
  { role: 'user', content: '[enviada 29/10 10:00] oi' },
  {
    role: 'assistant',
    content: 'Olá',
    native: [
      { type: 'thinking', thinking: 'velho', signature: 's0' },
      { type: 'text', text: 'Olá' },
    ],
  },
  { role: 'user', content: '[enviada 29/10 10:05] leia a pauta' },
  {
    role: 'assistant',
    content: '',
    tool_calls: [
      {
        id: 't1',
        type: 'function',
        function: { name: 'file_read', arguments: '{"path":"a.md"}' },
      },
      {
        id: 't2',
        type: 'function',
        function: { name: 'file_read', arguments: '{"path":"b.md"}' },
      },
    ],
    native: [
      { type: 'thinking', thinking: 'agora', signature: 's1' },
      {
        type: 'tool_use',
        id: 't1',
        name: 'file_read',
        input: { path: 'a.md' },
      },
      {
        type: 'tool_use',
        id: 't2',
        name: 'file_read',
        input: { path: 'b.md' },
      },
    ],
  },
  { role: 'tool', tool_call_id: 't1', content: '# a' },
  { role: 'tool', tool_call_id: 't2', content: '# b' },
];

describe('the central conversation as Claude reads it', () => {
  test('the system leaves the messages; parallel results become one user turn', () => {
    const { system, messages } = toClaude(conversation);
    expect(system).toBe('Você é o SEO.');
    expect(messages.map((message) => message.role)).toEqual([
      'user',
      'assistant',
      'user',
      'assistant',
      'user',
    ]);
    expect(messages[4].content).toEqual([
      { type: 'tool_result', tool_use_id: 't1', content: '# a' },
      { type: 'tool_result', tool_use_id: 't2', content: '# b' },
    ]);
  });

  test('thinking goes back only in the turn running now, unchanged; earlier turns keep text and tools', () => {
    const { messages } = toClaude(conversation);
    expect(messages[1].content).toEqual([{ type: 'text', text: 'Olá' }]);
    expect(messages[3].content[0]).toEqual({
      type: 'thinking',
      thinking: 'agora',
      signature: 's1',
    });
  });

  test('a reply stored before the native door is rebuilt from its text and calls; images keep their bytes', () => {
    const { messages } = toClaude([
      {
        role: 'user',
        content: [
          { type: 'text', text: 'veja' },
          {
            type: 'image_url',
            image_url: { url: 'data:image/png;base64,AAAA' },
          },
        ],
      },
      {
        role: 'assistant',
        content: 'vou ler',
        tool_calls: [
          {
            id: 'x',
            type: 'function',
            function: { name: 'file_read', arguments: 'quebrado' },
          },
        ],
      },
    ]);
    expect(messages[0].content[1]).toEqual({
      type: 'image',
      source: { type: 'base64', media_type: 'image/png', data: 'AAAA' },
    });
    expect(messages[1].content).toEqual([
      { type: 'text', text: 'vou ler' },
      { type: 'tool_use', id: 'x', name: 'file_read', input: {} },
    ]);
  });

  test('the answer comes back in the central shape, its blocks kept; a refusal says so', () => {
    const blocks = [
      { type: 'thinking', thinking: '', signature: 's' },
      { type: 'text', text: 'Lendo.' },
      {
        type: 'tool_use',
        id: 'u1',
        name: 'files_list',
        input: { folder: '/' },
      },
    ];
    expect(fromClaude({ content: blocks, stop_reason: 'tool_use' })).toEqual({
      role: 'assistant',
      content: 'Lendo.',
      tool_calls: [
        {
          id: 'u1',
          type: 'function',
          function: { name: 'files_list', arguments: '{"folder":"/"}' },
        },
      ],
      native: blocks,
    });
    expect(
      fromClaude({ content: [], stop_reason: 'refusal' }).content,
    ).toContain('recusou');
  });

  test('a cached read is priced at a tenth, a cache write a quarter more', () => {
    expect(
      usageOf({
        input_tokens: 100,
        cache_read_input_tokens: 7000,
        cache_creation_input_tokens: 400,
        output_tokens: 50,
      }),
    ).toEqual({
      prompt_tokens: 7500,
      priced_prompt_tokens: 100 + 700 + 500,
      completion_tokens: 50,
      cached_tokens: 7000,
    });
  });
});

describe('one step on Claude', () => {
  const tools = [
    {
      type: 'function',
      function: {
        name: 'file_read',
        description: 'Lê',
        parameters: {
          type: 'object',
          properties: { path: { type: 'string' } },
        },
      },
    },
    {
      type: 'function',
      function: {
        name: 'files_list',
        description: 'Lista',
        parameters: { type: 'object', properties: {} },
      },
    },
  ];

  test('tools, system and conversation are cached; thinking is adaptive and summarized at the agent effort', async () => {
    const sent = fakeClaude({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      usage: { input_tokens: 10, output_tokens: 2 },
    });
    await completeClaude({
      apiKey: 'k',
      model: 'claude-haiku-5-5',
      effort: 'low',
      messages: conversation,
      tools,
    });
    const body = sent[0];
    expect(body.tools.at(-1).cache_control).toEqual({ type: 'ephemeral' });
    expect(body.tools[0].cache_control).toBeUndefined();
    expect(body.system[0].cache_control).toEqual({ type: 'ephemeral' });
    expect(body.cache_control).toEqual({ type: 'ephemeral' });
    expect(body.thinking).toEqual({
      type: 'adaptive',
      display: 'summarized',
      block_binding: { prefix_mismatch_behavior: 'drop_block' },
    });
    expect(body.betas).toEqual(['thinking-binding-controls-2026-08-01']);
    expect(body.output_config).toEqual({ effort: 'low' });
    expect(body.temperature).toBeUndefined();
  });

  test('words and the thinking summary stream as they come', async () => {
    fakeClaude(
      {
        content: [{ type: 'text', text: 'Oi' }],
        stop_reason: 'end_turn',
        usage: {},
      },
      [
        { type: 'thinking_delta', thinking: 'Pensando na pauta' },
        { type: 'text_delta', text: 'Oi' },
      ],
    );
    const words = [];
    const thoughts = [];
    const answer = await completeClaude({
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
      messages: conversation,
      onText: (text) => words.push(text),
      onThinking: (text) => thoughts.push(text),
    });
    expect(words).toEqual(['Oi']);
    expect(thoughts).toEqual(['Pensando na pauta']);
    expect(answer.firstMs).toBeGreaterThanOrEqual(0);
  });

  test('a step can be cut: the signal reaches the stream', async () => {
    fakeClaude({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      usage: {},
    });
    const controller = new AbortController();
    await completeClaude({
      apiKey: 'k',
      model: 'claude-sonnet-5-5',
      messages: conversation,
      signal: controller.signal,
    });
    expect(fakeClaude.options.signal).toBe(controller.signal);
  });

  test('an older model gets neither thinking nor effort', async () => {
    const sent = fakeClaude({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      usage: {},
    });
    await completeClaude({
      apiKey: 'k',
      model: 'claude-haiku-4-5',
      effort: 'high',
      messages: conversation,
    });
    expect(sent[0].thinking).toBeUndefined();
    expect(sent[0].output_config).toBeUndefined();
    expect(thinksAdaptively('claude-opus-5-5')).toBe(true);
    expect(thinksAdaptively('claude-opus-4-6')).toBe(true);
    expect(thinksAdaptively('claude-sonnet-4-5')).toBe(false);
  });

  test('an answer that ran out of its output limit says so, the way the loop reads every provider', async () => {
    fakeClaude({
      content: [{ type: 'thinking', thinking: 'longo', signature: 's' }],
      stop_reason: 'max_tokens',
      usage: {},
    });
    const cut = await completeClaude({
      apiKey: 'k',
      model: 'claude-haiku-5-5',
      messages: conversation,
    });
    expect(cut.finishReason).toBe('length');
    expect(cut.message.content).toBe('');
    fakeClaude({
      content: [{ type: 'text', text: 'ok' }],
      stop_reason: 'end_turn',
      usage: {},
    });
    expect(
      (
        await completeClaude({
          apiKey: 'k',
          model: 'claude-haiku-5-5',
          messages: conversation,
        })
      ).finishReason,
    ).toBe('end_turn');
  });
});
