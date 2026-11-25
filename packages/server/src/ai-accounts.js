import { config } from './config.js';
import { db, newId, now } from './db.js';
import {
  isChatProvider,
  listProviderModels,
  providerOf,
  talksInChat,
  isSubscriptionProvider,
} from './providers.js';
import { decrypt, encrypt } from './secrets.js';

// The account's AI accounts, one per provider key (29/10/2026). An API key's
// account (Anthropic, OpenAI…) brings the models the person turned on, and an
// agent on it talks through that key. A Claude Code account is the token the
// agents' long jobs on their computers run on (CLAUDE_CODE_OAUTH_TOKEN). The
// panel and the model only ever see the names; the keys stay encrypted here.

export const AI_TOKEN_NAME = 'CLAUDE_CODE_OAUTH_TOKEN';
export const GEMINI_TOKEN_NAME = 'GEMINI_API_KEY';

const dayOf = (date) => date.toISOString().slice(0, 10);
const usageOf = (id) => ({
  today:
    db
      .query(
        'SELECT cost FROM ai_account_usage WHERE ai_account_id = ? AND day = ?',
      )
      .get(id, dayOf(new Date()))?.cost ?? 0,
  last30Days: db
    .query(
      'SELECT COALESCE(SUM(cost), 0) AS cost FROM ai_account_usage WHERE ai_account_id = ? AND day >= ?',
    )
    .get(id, dayOf(new Date(Date.now() - 29 * 86_400_000))).cost,
});

/** A model call paid by one of the account's keys. */
export function addAccountUsage(aiAccountId, cost) {
  db.query(
    'INSERT INTO ai_account_usage (ai_account_id, day, cost, steps) VALUES (?, ?, ?, 1) ON CONFLICT (ai_account_id, day) DO UPDATE SET cost = cost + excluded.cost, steps = steps + 1',
  ).run(aiAccountId, dayOf(new Date()), cost || 0);
}

const present = (row) => ({
  id: row.id,
  name: row.name,
  provider: row.provider,
  providerName: providerOf(row.provider)?.name ?? row.provider,
  models: row.models ? JSON.parse(row.models) : [],
  createdAt: row.created_at,
  usage: usageOf(row.id),
  agents: db
    .query('SELECT COUNT(*) AS n FROM bots WHERE ai_account = ?')
    .get(row.id).n,
});

export function listAiAccounts(accountId) {
  return db
    .query('SELECT * FROM ai_accounts WHERE account_id = ? ORDER BY created_at')
    .all(accountId)
    .map(present);
}

const rowOf = (accountId, id) =>
  db
    .query('SELECT * FROM ai_accounts WHERE id = ? AND account_id = ?')
    .get(id, accountId);

const DEFAULT_GOOGLE_MODELS = [
  'gemini-3.5-flash-lite',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
];

/** A key is checked before it is kept: an API key must open its provider's model list. */
export async function createAiAccount(
  accountId,
  { provider = 'claude-code', name, token },
  fetcher = fetch,
) {
  if (!providerOf(provider)) throw new Error('provedor desconhecido');
  const cleanToken = String(token || '').trim();
  if (!cleanToken) throw new Error('cole a chave da conta');
  const cleanName =
    String(name || '')
      .trim()
      .slice(0, 60) || providerOf(provider).name;
  const listed = isChatProvider(provider)
    ? await listProviderModels(provider, cleanToken, fetcher)
    : [];
  // For Google Gemini keys, pre-enable the stable Gemini lineup when available so new agents work immediately.
  const initialModels =
    provider === 'google'
      ? DEFAULT_GOOGLE_MODELS.filter((id) =>
          listed.some((item) => item.id === id),
        )
      : [];
  const id = newId();
  db.query(
    'INSERT INTO ai_accounts (id, account_id, name, token, provider, models, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    accountId,
    cleanName,
    await encrypt(cleanToken),
    provider,
    JSON.stringify(initialModels),
    now(),
  );
  return present(rowOf(accountId, id));
}

/** Every chat model the account's key opens, live from the provider. */
export async function availableModels(accountId, id, fetcher = fetch) {
  const row = rowOf(accountId, id);
  if (!row) return null;
  return listProviderModels(row.provider, await decrypt(row.token), fetcher);
}

/** The models turned on for the account's agents. */
export function setAccountModels(accountId, id, models) {
  const row = rowOf(accountId, id);
  if (!row) return null;
  if (!isChatProvider(row.provider))
    throw new Error('essa conta não tem modelos de conversa');
  if (!Array.isArray(models)) throw new Error('models é uma lista');
  const clean = [
    ...new Set(
      models
        .filter((model) => typeof model === 'string' && model.trim())
        .map((model) => model.trim()),
    ),
  ].slice(0, 200);
  db.query('UPDATE ai_accounts SET models = ? WHERE id = ?').run(
    JSON.stringify(clean),
    id,
  );
  return present(rowOf(accountId, id));
}

export function deleteAiAccount(accountId, id) {
  if (!rowOf(accountId, id)) return false;
  db.query('DELETE FROM ai_account_usage WHERE ai_account_id = ?').run(id);
  const isDeleted =
    db
      .query('DELETE FROM ai_accounts WHERE id = ? AND account_id = ?')
      .run(id, accountId).changes > 0;
  // An agent that talked through the account stops until another key is picked for it.
  if (isDeleted)
    db.query('UPDATE bots SET ai_account = NULL WHERE ai_account = ?').run(id);
  return isDeleted;
}

export const hasAiAccount = (accountId, id) => Boolean(rowOf(accountId, id));

/**
 * What an agent can talk with: each key's account with the models turned on
 * in it. Every person brings their own key (29/10/2026); the Assistant has no
 * models of its own for the agents.
 */
export function brainsFor(accountId) {
  // The house's default model (Claude) comes first, with its key: a new agent starts on it
  // instead of on whatever key was added first (13/11/2026: a refused OpenRouter key was first).
  const isDefault = (id) => sameModel(id, config.defaultModel);
  return listAiAccounts(accountId)
    .filter((item) => talksInChat(item.provider) && item.models.length)
    .map((item) => ({
      account: {
        id: item.id,
        name: item.name,
        provider: item.provider,
        providerName: item.providerName,
      },
      models: [...item.models]
        .sort((a, b) => isDefault(b) - isDefault(a))
        .map((id) => ({ id, label: id })),
    }))
    .sort((a, b) => isDefault(b.models[0].id) - isDefault(a.models[0].id));
}

/** "anthropic/claude-haiku-5.5" and "claude-haiku-5-5" are the same model on different keys. */
const bareModel = (id) => String(id).split('/').pop().replace(/\./g, '-');
const sameModel = (id, other) =>
  Boolean(id && other) && bareModel(id) === bareModel(other);

/** Whether a model is turned on in one of the account's keys. */
export function isModelOf(accountId, aiAccountId, model) {
  const row = aiAccountId ? rowOf(accountId, aiAccountId) : null;
  return Boolean(
    row &&
      talksInChat(row.provider) &&
      JSON.parse(row.models || '[]').includes(model),
  );
}

/** Where a new agent talks: the key with the suggested model turned on, else the first key's first model. */
export function brainForNewAgent(accountId, suggested) {
  const brains = brainsFor(accountId);
  const match = brains.find((brain) =>
    brain.models.some((model) => sameModel(model.id, suggested)),
  );
  if (match)
    return {
      aiAccount: match.account.id,
      model: match.models.find((model) => sameModel(model.id, suggested)).id,
    };
  return brains[0]
    ? { aiAccount: brains[0].account.id, model: brains[0].models[0].id }
    : null;
}

/** The key an agent talks through, or null when none was picked for it. */
export async function chatAccountFor(botId) {
  const row = db
    .query(
      'SELECT a.id, a.provider, a.token FROM bots b JOIN ai_accounts a ON a.id = b.ai_account WHERE b.id = ?',
    )
    .get(botId);
  if (!row || !talksInChat(row.provider)) return null;
  // A subscription has no key: Google's own client holds the sign-in.
  if (isSubscriptionProvider(row.provider))
    return { id: row.id, provider: row.provider, key: null };
  return { id: row.id, provider: row.provider, key: await decrypt(row.token) };
}

/**
 * The account's subscription entry, made once the subscription answers
 * (engine/subscription/). Its models are the ones the subscription opens,
 * the strongest Neon first. It holds no key.
 */
export async function ensureSubscriptionAccount(accountId, models) {
  const ids = models.map((model) => model.id);
  if (!ids.length) return null;
  const preferred = [
    'gemini-4-neon-low',
    'gemini-4-neon-medium',
    'gemini-4-neon-high',
    'gemini-3.8-flash-medium',
  ].filter((id) => ids.includes(id));
  const enabled = preferred.length ? preferred : ids.slice(0, 4);
  const existing = db
    .query(
      "SELECT id FROM ai_accounts WHERE account_id = ? AND provider = 'google-subscription'",
    )
    .get(accountId);
  if (existing) return existing.id;
  const id = newId();
  db.query(
    'INSERT INTO ai_accounts (id, account_id, name, token, provider, models, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    accountId,
    'Google subscription',
    await encrypt('subscription'),
    'google-subscription',
    JSON.stringify(enabled),
    now(),
  );
  return id;
}

/** All connected chat AI accounts of a user, decrypted, for automatic failover routing. */
export async function listChatAccounts(accountId) {
  const rows = db
    .query(
      'SELECT id, provider, token, models FROM ai_accounts WHERE account_id = ? ORDER BY created_at',
    )
    .all(accountId);
  const out = [];
  for (const row of rows) {
    if (!isChatProvider(row.provider)) continue;
    try {
      out.push({
        id: row.id,
        provider: row.provider,
        key: await decrypt(row.token),
        models: row.models ? JSON.parse(row.models) : [],
      });
    } catch {}
  }
  return out;
}

/** Ensures a working fallback model is enabled on the AI account so the agent's chip stays valid. */
export function ensureAccountModel(accountId, aiAccountId, modelId) {
  const row = rowOf(accountId, aiAccountId);
  if (!row || !isChatProvider(row.provider) || !modelId) return;
  const current = row.models ? JSON.parse(row.models) : [];
  if (current.includes(modelId)) return;
  db.query('UPDATE ai_accounts SET models = ? WHERE id = ?').run(
    JSON.stringify([modelId, ...current].slice(0, 200)),
    aiAccountId,
  );
}

/** The Gemini API key for Gemini CLI jobs: its own account's key, else the first Gemini account, else env. */
export async function geminiTokenFor(botId) {
  const own = db
    .query(
      "SELECT a.token FROM bots b JOIN ai_accounts a ON a.id = b.ai_account WHERE b.id = ? AND a.provider IN ('gemini-cli', 'google')",
    )
    .get(botId);
  const row =
    own ||
    db
      .query(
        "SELECT a.token FROM bots b JOIN ai_accounts a ON a.account_id = b.account_id WHERE b.id = ? AND a.provider IN ('gemini-cli', 'google') ORDER BY a.created_at LIMIT 1",
      )
      .get(botId);
  if (row) return decrypt(row.token);
  return config.geminiApiKey || null;
}

/** The Claude Code token an agent's long jobs run on: its own account's, else the first one of the account. */
export async function aiTokenFor(botId) {
  const own = db
    .query(
      "SELECT a.token FROM bots b JOIN ai_accounts a ON a.id = b.ai_account WHERE b.id = ? AND a.provider = 'claude-code'",
    )
    .get(botId);
  const row =
    own ||
    db
      .query(
        "SELECT a.token FROM bots b JOIN ai_accounts a ON a.account_id = b.account_id WHERE b.id = ? AND a.provider = 'claude-code' ORDER BY a.created_at LIMIT 1",
      )
      .get(botId);
  return row ? decrypt(row.token) : null;
}
