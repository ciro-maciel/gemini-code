// Which plan an account has in Payments, and how many of the product's main resource it may create.
//
// The house rule (04/11/2026): free 1, Starter 3, Pro 9, Scale 99. Each plan in Payments carries one
// feature slug, `<product>-plan-starter|pro|scale`; the largest slug present wins (an upgrade mid-cycle
// leaves both). Free is not a plan in Payments: it is an account with none of these slugs.
//
// Optional external plan gate: when PAYMENTS_SECRET_KEY and PAYMENTS_API_URL
// are configured, checks subscription tiers with fail-open caching; otherwise
// open-source mode runs without plan enforcement.
//
// Here `env` is process.env: the central runs on Bun in the Sprite, and scripts/deploy.js writes the three
// variables (PAYMENTS_SECRET_KEY, PAYMENTS_API_URL, PLAN_LIMITS) into its .env.
//
// THE SWITCH: PLAN_LIMITS = "off" enforces nothing, whatever Payments says; the plan is
// still read and the usage still counted, so the panel shows both. The coordinator turns it on after the
// house accounts have a plan.

const TIERS = [
  { tier: 'scale', name: 'Scale', limit: 99 },
  { tier: 'pro', name: 'Pro', limit: 9 },
  { tier: 'starter', name: 'Starter', limit: 3 },
];
export const FREE = { tier: 'free', name: 'Free', limit: 1 };

const DEFAULT_PAYMENTS_URL = '';
const TIMEOUT_MS = 3000;
const CACHE_TTL_MS = 60_000;
const CACHE_MAX = 1000;

export const areLimitsOff = (env) =>
  String(env?.PLAN_LIMITS ?? '')
    .trim()
    .toLowerCase() === 'off';

/** The tier a set of feature slugs reaches for this product: the largest one present, else free. */
export function tierFromSlugs(product, slugs) {
  return TIERS.find((t) => slugs.has(`${product}-plan-${t.tier}`)) ?? FREE;
}

export function createPlan({ product }) {
  const cache = new Map();

  async function ask(env, userId) {
    const key = env?.PAYMENTS_SECRET_KEY;
    const base = String(env?.PAYMENTS_API_URL || DEFAULT_PAYMENTS_URL).replace(
      /\/+$/,
      '',
    );
    if (!key || !userId || !base) return null;
    const hit = cache.get(userId);
    if (hit && hit.expiresAt > Date.now()) return hit.tier;
    try {
      const res = await fetch(
        `${base}/sdk/v1/permissions?userId=${encodeURIComponent(userId)}`,
        {
          headers: { Authorization: `Bearer ${key}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        },
      );
      if (!res.ok) {
        console.error(
          `[plan] billing API answered ${res.status} for ${userId}: allowing`,
        );
        return null;
      }
      const data = (await res.json()) ?? {};
      const slugs = new Set(
        data.hasActiveSubscription
          ? (data.features || []).map((f) => f?.slug).filter(Boolean)
          : [],
      );
      const tier = tierFromSlugs(product, slugs);
      if (cache.size >= CACHE_MAX) cache.clear();
      cache.set(userId, { tier, expiresAt: Date.now() + CACHE_TTL_MS });
      return tier;
    } catch (error) {
      console.error(
        `[plan] could not reach billing API for ${userId}: allowing:`,
        error?.message,
      );
      return null;
    }
  }

  /**
   * The account's plan: `{ tier, name, limit, isKnown, isEnforced }`.
   * In open-source mode (no external billing configured), limits are not enforced.
   */
  async function planFor(env, userId) {
    const known = await ask(env, userId);
    const plan = known ?? FREE;
    return {
      tier: plan.tier,
      name: plan.name,
      limit: plan.limit,
      isKnown: Boolean(known),
      isEnforced: Boolean(known) && !areLimitsOff(env),
    };
  }

  /** Whether one more may be created; the refusal carries the contract code and a sentence that says how to upgrade. */
  async function canCreate(env, userId, used, noun) {
    const plan = await planFor(env, userId);
    if (!plan.isEnforced || used < plan.limit) return { allowed: true, plan };
    const next =
      plan.tier === 'scale'
        ? 'Contact your instance administrator to raise this limit.'
        : 'Open Billing in account settings to upgrade your plan.';
    return {
      allowed: false,
      plan,
      body: {
        error: 'PLAN_LIMIT',
        code: 'PLAN_LIMIT',
        message: `The ${plan.name} plan includes up to ${plan.limit} ${plan.limit === 1 ? noun.one : noun.many}, and this account already has ${used}. ${next}`,
        limit: plan.limit,
        used,
        tier: plan.tier,
      },
    };
  }

  return {
    planFor,
    canCreate,
    invalidate: (userId) => (userId ? cache.delete(userId) : cache.clear()),
  };
}
