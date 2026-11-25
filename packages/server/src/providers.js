// The AI providers an account can connect (29/10/2026). Each speaks the
// OpenAI chat format at its base address and lists its models at /models, so
// one engine serves them all; only the headers and the noise in each model
// list differ. "claude-code" is not a chat provider: its token goes to the
// Claude Code the agents run on their computers.

// Models that are not for chat: embeddings, speech, images, video, music, moderation, Interactions-only.
const NOT_CHAT =
  /embed|tts|whisper|dall-e|image|imagen|veo|lyria|nano-banana|antigravity|robotics|deep-research|audio|realtime|moderation|transcribe|speech|guard|aqa|sora|babbage|davinci|computer-use|search/i;

export const PROVIDERS = [
  {
    id: 'google',
    name: 'Google Gemini',
    base: 'https://generativelanguage.googleapis.com/v1beta/openai',
    keyHint: 'AIza…',
    keyUrl: 'https://aistudio.google.com/apikey',
  },
  // A Google AI Pro or Ultra subscription, used through Google's own client (engine/subscription/).
  {
    id: 'google-subscription',
    name: 'Google subscription (AI Pro and Ultra)',
    base: null,
    isSubscription: true,
    keyHint: 'sign in once to the Antigravity CLI (agy)',
    keyUrl: 'https://antigravity.google/product/antigravity-cli',
  },
  {
    id: 'gemini-cli',
    name: 'Gemini CLI',
    base: null,
    keyHint: 'GEMINI_API_KEY (AIza…)',
    keyUrl: 'https://github.com/google-gemini/gemini-cli',
  },
  {
    id: 'openrouter',
    name: 'OpenRouter',
    base: 'https://openrouter.ai/api/v1',
    keyHint: 'sk-or-…',
    keyUrl: 'https://openrouter.ai/settings/keys',
  },
  {
    id: 'anthropic',
    name: 'Anthropic',
    base: 'https://api.anthropic.com/v1',
    keyHint: 'sk-ant-…',
    keyUrl: 'https://console.anthropic.com/settings/keys',
  },
  {
    id: 'openai',
    name: 'OpenAI',
    base: 'https://api.openai.com/v1',
    keyHint: 'sk-…',
    keyUrl: 'https://platform.openai.com/api-keys',
  },
  {
    id: 'deepseek',
    name: 'DeepSeek',
    base: 'https://api.deepseek.com/v1',
    keyHint: 'sk-…',
    keyUrl: 'https://platform.deepseek.com/api_keys',
  },
  {
    id: 'xai',
    name: 'xAI',
    base: 'https://api.x.ai/v1',
    keyHint: 'xai-…',
    keyUrl: 'https://console.x.ai',
  },
  {
    id: 'mistral',
    name: 'Mistral',
    base: 'https://api.mistral.ai/v1',
    keyHint: 'Mistral API key',
    keyUrl: 'https://console.mistral.ai/api-keys',
  },
  {
    id: 'groq',
    name: 'Groq',
    base: 'https://api.groq.com/openai/v1',
    keyHint: 'gsk_…',
    keyUrl: 'https://console.groq.com/keys',
  },
  {
    id: 'claude-code',
    name: 'Claude Code',
    base: null,
    keyHint: 'claude setup-token',
    keyUrl: 'https://docs.claude.com/en/docs/claude-code/setup',
  },
];

export const providerOf = (id) =>
  PROVIDERS.find((provider) => provider.id === id) || null;
export const isChatProvider = (id) => Boolean(providerOf(id)?.base);
/** A provider an agent talks in without an API key: the person's subscription. */
export const isSubscriptionProvider = (id) =>
  Boolean(providerOf(id)?.isSubscription);
/** Whether an agent can hold a conversation on this provider: an API, or a subscription. */
export const talksInChat = (id) =>
  isChatProvider(id) || isSubscriptionProvider(id);

/** The headers a provider wants with its key. */
export function headersFor(providerId, key) {
  if (providerId === 'anthropic')
    return {
      'x-api-key': key,
      'anthropic-version': '2023-06-01',
      Authorization: `Bearer ${key}`,
    };
  return { Authorization: `Bearer ${key}` };
}

// Prices per million tokens (input and output) and release dates come from
// OpenRouter's public catalog when the provider's own list has none: its ids
// are "<maker>/<model>", matched by the model part with dots and dashes alike.
const sameModel = (id) =>
  String(id)
    .toLowerCase()
    .replace(/^[^/]*\//, '')
    .replace(/^~/, '')
    .replace(/[.:_]/g, '-');
let catalog = null;
let catalogAt = 0;
async function openRouterCatalog(fetcher) {
  if (catalog && Date.now() - catalogAt < 3_600_000) return catalog;
  try {
    const response = await fetcher('https://openrouter.ai/api/v1/models', {
      signal: AbortSignal.timeout(20_000),
    });
    if (!response.ok) return catalog ?? new Map();
    const data = await response.json();
    catalog = new Map();
    for (const model of data.data ?? [])
      if (!catalog.has(sameModel(model.id)))
        catalog.set(sameModel(model.id), model);
    catalogAt = Date.now();
  } catch {
    return catalog ?? new Map();
  }
  return catalog;
}

const perMillion = (value) =>
  value === undefined || value === null || value === '' || Number(value) < 0
    ? null
    : Math.round(Number(value) * 1e6 * 1000) / 1000;
const priceOf = (model) =>
  model?.pricing
    ? {
        input: perMillion(model.pricing.prompt),
        output: perMillion(model.pricing.completion),
      }
    : null;
const createdOf = (model) =>
  typeof model?.created === 'number'
    ? model.created
    : model?.created_at
      ? Math.floor(Date.parse(model.created_at) / 1000) || null
      : null;

/**
 * The chat models a key opens, newest first: [{ id, label, createdAt, price }],
 * createdAt in seconds and price in dollars per million tokens. Throws when
 * the key does not open the list.
 */
export async function listProviderModels(providerId, key, fetcher = fetch) {
  const provider = providerOf(providerId);
  if (!provider?.base)
    throw new Error('esse provedor não tem modelos de conversa');
  const response = await fetcher(
    `${provider.base}/models${providerId === 'anthropic' ? '?limit=1000' : ''}`,
    {
      headers: headersFor(providerId, key),
      signal: AbortSignal.timeout(20_000),
    },
  );
  if (response.status === 401 || response.status === 403)
    throw new Error(
      `a chave não abriu a ${provider.name}: confira se ela está certa e ativa`,
    );
  if (!response.ok)
    throw new Error(
      `a ${provider.name} respondeu ${response.status} ao pedir os modelos`,
    );
  const data = await response.json();
  const known =
    providerId === 'openrouter' ? new Map() : await openRouterCatalog(fetcher);
  return (data.data ?? data.models ?? [])
    .map((model) => {
      const id = String(model.id).replace(/^models\//, '');
      const twin = known.get(sameModel(id));
      return {
        id,
        label: model.display_name || model.name || twin?.name || id,
        createdAt: createdOf(model) ?? createdOf(twin),
        price: priceOf(model) ?? priceOf(twin),
      };
    })
    .filter((model) => model.id && !NOT_CHAT.test(model.id))
    .sort(
      (first, second) =>
        (second.createdAt ?? 0) - (first.createdAt ?? 0) ||
        first.label.localeCompare(second.label, 'pt-BR'),
    );
}

/** Dollars a call cost, from the tokens it used and the model's price; 0 when the price is unknown. */
export async function estimateCost(model, usage, fetcher = fetch) {
  if (!usage) return 0;
  const price = priceOf(
    (await openRouterCatalog(fetcher)).get(sameModel(model)),
  );
  if (!price || price.input === null || price.output === null) return 0;
  return (
    ((usage.prompt_tokens ?? 0) * price.input +
      (usage.completion_tokens ?? 0) * price.output) /
    1e6
  );
}
