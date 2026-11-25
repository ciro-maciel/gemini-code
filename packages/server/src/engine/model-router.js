// Intelligent model failover and self-healing router.
// When a model hits a zero-quota Free Tier limit (e.g. `gemini-4-neon` with limit: 0),
// rate limits (429), temporary overload (503), or unavailability (404), the engine
// automatically routes to the best healthy fallback model instead of surfacing a
// dead-end error to the user.

export const GEMINI_FALLBACK_ORDER = [
  'gemini-3.5-flash-lite',
  'gemini-flash-lite-latest',
  'gemini-3.6-flash',
  'gemini-3.5-flash',
  'gemini-3.8-flash',
];

const HARD_FAILURE =
  /limit:\s*0|free[_ ]?tier|not[_ ]found|no longer available|does not exist|not supported|only supports interactions api|model.{0,20}unavailable/i;
const RATE_OR_QUOTA =
  /quota|resource_exhausted|rate[_ ]?limit|too many requests|credit|billing/i;
const OVERLOADED =
  /overloaded|high demand|temporarily unavailable|service unavailable|bad gateway|internal error/i;
const AUTH_ERROR =
  /invalid api key|unauthorized|permission denied|api key not valid/i;

const COOLDOWN_MS = {
  hard: 30 * 60_000, // 30 min (e.g., Free Tier limit: 0 or model not found)
  quota: 2 * 60_000, // 2 min (transient rate limit / quota spike)
  overloaded: 60_000, // 1 min (5xx / overloaded)
};

// Map<"accountId:model", { until: number, reason: 'hard'|'quota'|'overloaded', failedAt: number }>
const health = new Map();

const keyOf = (accountId, model) =>
  `${accountId}:${String(model || '').trim()}`;

function statusOf(error) {
  return (
    error?.status ??
    (Number(
      /(?:^|\s)(\d{3})(?=[\s:{]|$)/.exec(String(error?.message ?? ''))?.[1],
    ) ||
      null)
  );
}

/** Classifies whether an error is a permanent/plan block for that specific model (`limit: 0`, `404`, unsupported). */
export function isHardModelBlock(error) {
  const status = statusOf(error);
  const msg = String(error?.message ?? '');
  return status === 404 || HARD_FAILURE.test(msg);
}

/** Classifies whether an error means the provider key itself is rejected (401/403). */
export function isAuthFailure(error) {
  const status = statusOf(error);
  const msg = String(error?.message ?? '');
  return status === 401 || status === 403 || AUTH_ERROR.test(msg);
}

/** Whether switching to another model (or another connected account) can recover from this error. */
export function isFailoverEligible(error) {
  if (!error || error.name === 'AbortError') return false;
  const status = statusOf(error);
  const msg = String(error?.message ?? '');
  if (
    status === 429 ||
    status === 402 ||
    status === 404 ||
    (status !== null && status >= 500)
  )
    return true;
  if (HARD_FAILURE.test(msg) || RATE_OR_QUOTA.test(msg) || OVERLOADED.test(msg))
    return true;
  // On auth failure, failover is still eligible if the user has a different AI account connected.
  if (isAuthFailure(error)) return true;
  return false;
}

/** Records a model failure in memory so subsequent steps skip straight to a healthy model. */
export function markModelUnavailable(
  accountId,
  model,
  error,
  nowMs = Date.now(),
) {
  if (!accountId || !model) return;
  const status = statusOf(error);
  const msg = String(error?.message ?? '');
  let reason = 'overloaded';
  if (isHardModelBlock(error)) reason = 'hard';
  else if (status === 429 || status === 402 || RATE_OR_QUOTA.test(msg))
    reason = 'quota';
  health.set(keyOf(accountId, model), {
    until: nowMs + COOLDOWN_MS[reason],
    reason,
    failedAt: nowMs,
  });
}

export function isModelCoolingDown(accountId, model, nowMs = Date.now()) {
  const entry = health.get(keyOf(accountId, model));
  if (!entry) return false;
  if (nowMs >= entry.until) {
    health.delete(keyOf(accountId, model));
    return false;
  }
  return true;
}

export function clearModelHealth() {
  health.clear();
}

/**
 * Builds an ordered list of fallback { account, model, sameAccount } candidates to try
 * automatically when `primaryModel` on `primaryAccount` fails.
 */
export function buildFailoverCandidates({
  primaryAccount,
  primaryModel,
  allChatAccounts = [],
  excludeKeys = new Set(),
  skipSameAccount = false,
  maxCandidates = 8,
  nowMs = Date.now(),
}) {
  const seen = new Set([
    keyOf(primaryAccount?.id, primaryModel),
    ...excludeKeys,
  ]);
  const candidates = [];

  const push = (account, model, sameAccount) => {
    if (!account?.id || !model) return;
    const k = keyOf(account.id, model);
    if (seen.has(k)) return;
    seen.add(k);
    candidates.push({
      account,
      model,
      sameAccount,
      coolingDown: isModelCoolingDown(account.id, model, nowMs),
    });
  };

  const accounts = allChatAccounts.length
    ? allChatAccounts
    : primaryAccount
      ? [primaryAccount]
      : [];
  const primaryFull =
    accounts.find((acc) => acc.id === primaryAccount?.id) || primaryAccount;

  // 1. Same account fallbacks (unless the key itself failed 401/403).
  if (primaryFull && !skipSameAccount) {
    if (primaryFull.provider === 'google') {
      // Reliable production Gemini models first (even if the user only enabled a preview model).
      for (const geminiModel of GEMINI_FALLBACK_ORDER) {
        push(primaryFull, geminiModel, true);
      }
    }
    for (const enabledModel of primaryFull.models ?? []) {
      push(primaryFull, enabledModel, true);
    }
  }

  // 2. Other connected chat accounts of the same user.
  for (const acc of accounts) {
    if (acc.id === primaryAccount?.id) continue;
    if (acc.provider === 'google') {
      for (const geminiModel of GEMINI_FALLBACK_ORDER) {
        push(acc, geminiModel, false);
      }
    }
    for (const enabledModel of acc.models ?? []) {
      push(acc, enabledModel, false);
    }
  }

  // Prefer healthy candidates first; only use cooling-down models if nothing healthy remains.
  const healthy = candidates.filter((c) => !c.coolingDown);
  const ordered = healthy.length ? healthy : candidates;
  return ordered.slice(0, maxCandidates);
}
