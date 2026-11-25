import { createRemoteJWKSet, jwtVerify } from 'jose';
import { config } from './config.js';
import { db, newId, now } from './db.js';
import { upsertAccount } from './accounts.js';
import { encrypt } from './secrets.js';
import { HttpError } from './http.js';
import { accountForApiKey, isApiKey } from './api-keys.js';

// Authentication supports two modes:
//   - 'local' (default open-source mode): automatically signs in as the local developer
//     account with zero login friction, while still honoring API keys if provided.
//   - 'jwt' (when AUTH_API_URL is set): verifies RS256 JWTs against remote JWKS.

const LOCAL_ACCOUNT_ID = 'local-developer';
let jwks = null;
function getJwks() {
  if (!config.authUrl) return null;
  jwks ??= createRemoteJWKSet(
    new URL(`${config.authUrl}/.well-known/jwks.json`),
  );
  return jwks;
}

const verified = new Map();
const CACHE_MS = 5 * 60 * 1000;

const bearer = (value) => value?.match(/^Bearer\s+(.+)$/i)?.[1]?.trim() || null;

function candidates(req, url) {
  return [
    bearer(req.headers.get('x-assistant-authorization')),
    url.searchParams.get('token'),
    bearer(req.headers.get('authorization')),
  ].filter((token) => token && token.split('.').length === 3);
}

async function verify(token) {
  const keySet = getJwks();
  if (!keySet) throw new Error('JWT auth is not configured');
  const cached = verified.get(token);
  if (cached && cached.until > Date.now()) return cached.claims;
  const options = {
    algorithms: ['RS256'],
    ...(config.authIssuer ? { issuer: config.authIssuer } : {}),
  };
  const { payload } = await jwtVerify(token, keySet, options);
  if (!payload.sub) throw new Error('token sem sub');
  const claims = {
    id: String(payload.sub),
    email: payload.email || null,
    name: payload.name || null,
  };
  verified.set(token, {
    claims,
    until: Math.min(Date.now() + CACHE_MS, (payload.exp ?? 0) * 1000),
  });
  if (verified.size > 5000) verified.delete(verified.keys().next().value);
  return claims;
}

let hasSeededLocalGemini = false;

/** Ensures the local developer account exists and auto-links GEMINI_API_KEY if present in env. */
async function ensureLocalAccount() {
  const name = process.env.GEMINI_CODE_USER || process.env.USER || 'Developer';
  const email = config.ownerEmail || 'developer@local.gemini-code';
  const existing = db
    .query('SELECT * FROM accounts WHERE id = ?')
    .get(LOCAL_ACCOUNT_ID);
  if (!existing) {
    db.query(
      'INSERT INTO accounts (id, email, name, status, is_owner, created_at, last_seen_at) VALUES (?, ?, ?, ?, 1, ?, ?)',
    ).run(LOCAL_ACCOUNT_ID, email, name, 'active', now(), now());
    db.query('UPDATE bots SET account_id = ? WHERE account_id IS NULL').run(
      LOCAL_ACCOUNT_ID,
    );
    db.query(
      'UPDATE connections SET account_id = ? WHERE account_id IS NULL',
    ).run(LOCAL_ACCOUNT_ID);
  }
  if (!hasSeededLocalGemini && config.geminiApiKey) {
    hasSeededLocalGemini = true;
    const count = db
      .query('SELECT COUNT(*) AS count FROM ai_accounts WHERE account_id = ?')
      .get(LOCAL_ACCOUNT_ID).count;
    if (count === 0) {
      const models = config.models.map((model) => model.id);
      db.query(
        'INSERT INTO ai_accounts (id, account_id, name, token, provider, models, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)',
      ).run(
        newId(),
        LOCAL_ACCOUNT_ID,
        'Google Gemini (env)',
        await encrypt(config.geminiApiKey),
        'google',
        JSON.stringify(models),
        now(),
      );
    }
  }
  return upsertAccount({ id: LOCAL_ACCOUNT_ID, email, name });
}

export async function authenticate(req, url, { allowPending = false } = {}) {
  // An API key rides only in a header, never in the URL, where logs would keep it.
  if (isApiKey(url.searchParams.get('token')))
    throw new HttpError(
      401,
      'UNAUTHORIZED',
      'API keys must be sent in the Authorization header, never in the URL.',
    );
  const key = [
    bearer(req.headers.get('x-assistant-authorization')),
    bearer(req.headers.get('authorization')),
  ].find(isApiKey);
  if (key) {
    const owner = accountForApiKey(key);
    if (!owner)
      throw new HttpError(
        401,
        'UNAUTHORIZED',
        'Chave de API desconhecida ou revogada.',
      );
    if (owner.status !== 'active')
      throw new HttpError(
        403,
        'ACCESS_BLOCKED',
        'This account does not have access.',
      );
    return owner;
  }
  if (config.authMode === 'local') {
    return ensureLocalAccount();
  }
  const tokens = candidates(req, url);
  if (tokens.length === 0)
    throw new HttpError(401, 'UNAUTHORIZED', 'Sign in to continue.');
  let claims = null;
  for (const token of tokens) {
    try {
      claims = await verify(token);
      break;
    } catch {}
  }
  if (!claims)
    throw new HttpError(
      401,
      'UNAUTHORIZED',
      'Session expired. Please sign in again.',
    );
  const account = upsertAccount(claims);
  if (account.status === 'blocked')
    throw new HttpError(
      403,
      'ACCESS_BLOCKED',
      'This account does not have access.',
    );
  if (account.status === 'pending' && !allowPending)
    throw new HttpError(
      403,
      'ACCESS_PENDING',
      'Your access is still pending approval.',
    );
  return account;
}
