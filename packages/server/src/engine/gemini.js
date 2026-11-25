// Native Google Gemini API adapter (v1beta generateContent / streamGenerateContent).
// Talks directly to generativelanguage.googleapis.com using x-goog-api-key so keys
// never appear in URLs, supporting streaming text, thinking summaries, multimodal
// images, function calling, and cached token reporting.

const GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta';
const THINKING_BUDGETS = {
  low: 2048,
  medium: 8192,
  high: 24576,
  xhigh: 24576,
  max: 32768,
};

let fetcher = (...args) => fetch(...args);

/** For tests: inject a fetch implementation without hitting the network. */
export function useGeminiFetch(fake) {
  fetcher = fake;
}

/** Normalizes "google/gemini-2.5-pro" or "gemini-2.5-pro" -> "gemini-2.5-pro"; null otherwise. */
export function geminiIdOf(model) {
  const id = String(model || '')
    .replace(/^google\//, '')
    .replace(/^models\//, '');
  return /^gemini-[\w.-]+$/i.test(id) ? id : null;
}

/** Gemini 2.5+ and 3+ models support native thinkingConfig. */
export const geminiThinks = (model) =>
  /^gemini-(?:2\.5|3|4)/i.test(String(model || '').replace(/^google\//, ''));

/** Strips JSON Schema keywords that Gemini's functionDeclarations schema rejects. */
export function cleanGeminiSchema(schema) {
  if (!schema || typeof schema !== 'object' || Array.isArray(schema))
    return { type: 'object' };
  const out = {};

  if (typeof schema.type === 'string') {
    out.type = schema.type;
  } else if (Array.isArray(schema.type)) {
    out.type = schema.type.find((t) => t !== 'null') || 'string';
    if (schema.type.includes('null')) out.nullable = true;
  }

  if (typeof schema.description === 'string' && schema.description) {
    out.description = schema.description;
  }
  if (typeof schema.nullable === 'boolean') {
    out.nullable = schema.nullable;
  }
  if (Array.isArray(schema.enum) && schema.enum.length) {
    out.enum = schema.enum.map((item) => String(item));
  }
  if (
    schema.properties &&
    typeof schema.properties === 'object' &&
    !Array.isArray(schema.properties)
  ) {
    const entries = Object.entries(schema.properties).map(([k, v]) => [
      k,
      cleanGeminiSchema(v),
    ]);
    if (entries.length) {
      out.type ||= 'object';
      out.properties = Object.fromEntries(entries);
    }
  }
  if (Array.isArray(schema.required) && schema.required.length) {
    const keys = schema.required.filter(
      (item) =>
        typeof item === 'string' && (!out.properties || item in out.properties),
    );
    if (keys.length) out.required = keys;
  }
  if (schema.items && typeof schema.items === 'object') {
    out.items = cleanGeminiSchema(
      Array.isArray(schema.items) ? schema.items[0] : schema.items,
    );
  }

  if (!out.type) out.type = out.properties ? 'object' : 'string';
  return out;
}

function toGeminiFunctionDeclaration(tool) {
  const decl = {
    name: tool.function.name,
    description: String(tool.function.description ?? '').slice(0, 1024),
  };
  const params = cleanGeminiSchema(tool.function.parameters);
  if (params.properties && Object.keys(params.properties).length > 0) {
    decl.parameters = params;
  }
  return decl;
}

const parseArgs = (text) => {
  try {
    const parsed = JSON.parse(text || '{}');
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch {
    return {};
  }
};

const imagePart = (url) => {
  const match = /^data:([^;]+);base64,(.+)$/.exec(String(url || ''));
  if (match) return { inlineData: { mimeType: match[1], data: match[2] } };
  return { text: `[image: ${url}]` };
};

const userParts = (content) =>
  typeof content === 'string'
    ? [{ text: content || ' ' }]
    : (content ?? []).map((part) =>
        part.type === 'image_url'
          ? imagePart(part.image_url?.url ?? part.image_url)
          : { text: part.text ?? String(part) },
      );

/** Converts the engine's OpenAI-shaped conversation to Gemini's { systemInstruction, contents }. */
export function toGemini(messages) {
  const [first, ...rest] = messages;
  const systemText =
    first?.role === 'system' ? String(first.content || '') : '';
  const history = first?.role === 'system' ? rest : messages;

  // Map tool_call_id -> function name so tool responses carry the exact function name Gemini requires.
  const toolNames = new Map();
  for (const message of history) {
    for (const call of message.tool_calls ?? []) {
      if (call.id && call.function?.name)
        toolNames.set(call.id, call.function.name);
    }
  }

  const contents = [];
  const push = (role, parts) => {
    if (!parts.length) return;
    const last = contents.at(-1);
    if (last?.role === role) last.parts.push(...parts);
    else contents.push({ role, parts: [...parts] });
  };

  for (const message of history) {
    if (message.role === 'tool') {
      const name = toolNames.get(message.tool_call_id) || 'tool';
      push('user', [
        {
          functionResponse: {
            name,
            response: { output: String(message.content ?? '') },
          },
        },
      ]);
    } else if (message.role === 'user' || message.role === 'system') {
      push('user', userParts(message.content));
    } else if (message.role === 'assistant') {
      const parts = [];
      if (message.content) parts.push({ text: message.content });
      for (const call of message.tool_calls ?? []) {
        parts.push({
          functionCall: {
            name: call.function.name,
            args: parseArgs(call.function.arguments),
          },
          ...(call.thought_signature
            ? { thoughtSignature: call.thought_signature }
            : {}),
        });
      }
      push('model', parts);
    }
  }

  return {
    ...(systemText
      ? { systemInstruction: { parts: [{ text: systemText }] } }
      : {}),
    contents,
  };
}

export function usageOfGemini(meta) {
  const prompt = meta?.promptTokenCount ?? 0;
  const cached = meta?.cachedContentTokenCount ?? 0;
  const completion =
    (meta?.candidatesTokenCount ?? 0) + (meta?.thoughtsTokenCount ?? 0);
  return {
    prompt_tokens: prompt,
    priced_prompt_tokens: Math.max(0, prompt - cached) + cached * 0.25,
    completion_tokens: completion,
    cached_tokens: cached,
  };
}

function mapFinishReason(reason) {
  if (reason === 'MAX_TOKENS') return 'length';
  if (reason === 'STOP') return 'stop';
  return reason ? String(reason).toLowerCase() : null;
}

/** One step of an agent on Google Gemini (streaming SSE or JSON). */
export async function completeGemini({
  apiKey,
  model,
  effort = null,
  messages,
  tools = [],
  responseFormat = null,
  maxTokens = 8192,
  onText = null,
  onThinking = null,
  signal = null,
  isQuick = false,
}) {
  const modelId = geminiIdOf(model) || model;
  const { systemInstruction, contents } = toGemini(messages);
  const buildBody = (withThinking) => {
    const generationConfig = { maxOutputTokens: maxTokens };
    if (responseFormat?.type === 'json_object')
      generationConfig.responseMimeType = 'application/json';
    if (withThinking && geminiThinks(modelId)) {
      if (isQuick) {
        generationConfig.thinkingConfig = { thinkingBudget: 0 };
      } else if (effort && THINKING_BUDGETS[effort]) {
        generationConfig.thinkingConfig = {
          includeThoughts: Boolean(onThinking),
          thinkingBudget: THINKING_BUDGETS[effort],
        };
      } else if (onThinking) {
        generationConfig.thinkingConfig = { includeThoughts: true };
      }
    }
    return {
      ...(systemInstruction ? { systemInstruction } : {}),
      contents,
      generationConfig,
      ...(tools?.length
        ? {
            tools: [
              {
                functionDeclarations: tools.map(toGeminiFunctionDeclaration),
              },
            ],
          }
        : {}),
    };
  };

  const streaming = Boolean(onText || onThinking);
  const endpoint = `${GEMINI_BASE}/models/${encodeURIComponent(modelId)}:${streaming ? 'streamGenerateContent?alt=sse' : 'generateContent'}`;
  const startedAt = performance.now();
  const sendRequest = (body) =>
    fetcher(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
      signal: signal
        ? AbortSignal.any([AbortSignal.timeout(180_000), signal])
        : AbortSignal.timeout(180_000),
    });

  const initialBody = buildBody(true);
  let response = await sendRequest(initialBody);

  if (!response.ok) {
    const text = (await response.text()).slice(0, 600);
    // Some Gemini preview/experimental models reject thinkingBudget or thinkingConfig: retry once without it.
    if (
      response.status === 400 &&
      initialBody.generationConfig.thinkingConfig &&
      /thinking/i.test(text)
    ) {
      response = await sendRequest(buildBody(false));
      if (!response.ok) {
        const retryText = (await response.text()).slice(0, 600);
        throw new Error(`Google Gemini ${response.status}: ${retryText}`);
      }
    } else {
      throw new Error(`Google Gemini ${response.status}: ${text}`);
    }
  }

  let firstAt = null;
  let content = '';
  const toolCalls = [];
  let usageMeta = null;
  let finishReason = null;

  const consumeChunk = (data) => {
    if (data?.usageMetadata) usageMeta = data.usageMetadata;
    const candidate = data?.candidates?.[0];
    if (!candidate) return;
    if (candidate.finishReason)
      finishReason = mapFinishReason(candidate.finishReason);
    for (const part of candidate.content?.parts ?? []) {
      if (part.thought && part.text) {
        firstAt ??= performance.now();
        if (onThinking) onThinking(part.text);
      } else if (typeof part.text === 'string' && part.text.length > 0) {
        firstAt ??= performance.now();
        content += part.text;
        if (onText) onText(part.text);
      } else if (part.functionCall) {
        firstAt ??= performance.now();
        toolCalls.push({
          id: `call_${crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`,
          type: 'function',
          ...(part.thoughtSignature
            ? { thought_signature: part.thoughtSignature }
            : {}),
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args ?? {}),
          },
        });
      }
    }
  };

  if (streaming) {
    const decoder = new TextDecoder();
    let buffer = '';
    for await (const chunk of response.body) {
      buffer += decoder.decode(chunk, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();
      for (const line of lines) {
        if (!line.startsWith('data: ')) continue;
        const payload = line.slice(6).trim();
        if (!payload || payload === '[DONE]') continue;
        try {
          consumeChunk(JSON.parse(payload));
        } catch {}
      }
    }
  } else {
    consumeChunk(await response.json());
  }

  const message = {
    role: 'assistant',
    content,
    ...(toolCalls.length ? { tool_calls: toolCalls } : {}),
  };
  return {
    message,
    usage: usageOfGemini(usageMeta),
    finishReason,
    firstMs: firstAt === null ? null : Math.round(firstAt - startedAt),
    totalMs: Math.round(performance.now() - startedAt),
  };
}
