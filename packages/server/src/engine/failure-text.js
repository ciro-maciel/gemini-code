import { providerOf } from '../providers.js';

// A provider's refusal is JSON meant for a developer: "404 {"type":"error",…}"
// reached the screen on 30/10/2026. The person reads what happened and what to
// do; the raw answer stays in the log.

const statusOf = (error) =>
  error?.status ??
  (Number(/(?:^|\s)(\d{3})(?=[\s:{]|$)/.exec(error?.message ?? '')?.[1]) ||
    null);

const OVERFLOW =
  /prompt is too long|maximum context length|context.{0,20}(?:length|window)|too many tokens/i;

/** Whether the provider refused the call for being bigger than the model's window. */
export const isContextOverflow = (error) =>
  statusOf(error) === 413 || OVERFLOW.test(String(error?.message ?? ''));

// What one model's refusal was, read from the provider's own answer, so the
// screen says what Google said instead of guessing (26/11/2026: five Gemini
// models refused in a row, some for demand and some for the free plan's daily
// quota, and the screen only said "overloaded or down").
const DAILY = /per ?day|PerDay|daily/i;
const ZERO = /limit:\s*0\b/i;

/** The kind of one model's refusal: overloaded, freeZero, dailyQuota, rate, auth, missing, timeout or other. */
export function attemptKind(error) {
  const raw = String(error?.message ?? '');
  const status = statusOf(error);
  if (
    error?.name === 'TimeoutError' ||
    /timed? ?out|fetch failed|ECONNRESET/i.test(raw)
  )
    return 'timeout';
  if (status === 401 || status === 403) return 'auth';
  if (status === 404 || /not_found|does not exist/i.test(raw)) return 'missing';
  if (ZERO.test(raw)) return 'freeZero';
  if (status === 429 && DAILY.test(raw)) return 'dailyQuota';
  if (status === 429 || /resource_exhausted|rate.?limit/i.test(raw))
    return 'rate';
  if (status >= 500 || /overloaded|high demand|unavailable/i.test(raw))
    return 'overloaded';
  return 'other';
}

/** One line per model tried: the model and why it did not answer. */
export function attemptLine({ model, error }) {
  const status = statusOf(error);
  switch (attemptKind(error)) {
    case 'overloaded':
      return `${model}: high demand right now (${status ?? 503})`;
    case 'freeZero':
      return `${model}: not included in this key's free plan`;
    case 'dailyQuota':
      return `${model}: today's free plan quota is used up`;
    case 'rate':
      return `${model}: too many calls this minute`;
    case 'auth':
      return `${model}: the key was refused`;
    case 'missing':
      return `${model}: does not exist on this key`;
    case 'timeout':
      return `${model}: took too long to answer`;
    default:
      return status
        ? `${model}: refused with code ${status}`
        : `${model}: could not answer`;
  }
}

/**
 * What a failed model call means to the person. With the models the engine
 * tried in turn (`attempts`, each { model, error }), it says why none
 * answered, one line per model, so the reason is never a guess.
 */
export function modelFailureText(error, { model, provider, attempts = [] }) {
  if (attempts.length < 2) return singleFailureText(error, { model, provider });
  const name = providerOf(provider)?.name ?? 'The AI provider';
  const kinds = attempts.map((attempt) => attemptKind(attempt.error));
  const isQuota = kinds.some(
    (kind) => kind === 'dailyQuota' || kind === 'freeZero',
  );
  const isBusy = kinds.some((kind) => kind === 'overloaded');
  const lines = [];
  if (isQuota && provider === 'google') {
    lines.push(
      "This Google Gemini key is on the free plan, and today's quota ran out on the models it includes. Turn on billing for the key in Google AI Studio, or wait for the quota to come back at midnight Pacific time.",
    );
    if (isBusy)
      lines.push('The other models are under high demand at Google right now.');
  } else if (
    kinds.every((kind) => kind === 'overloaded' || kind === 'timeout')
  ) {
    lines.push(
      `${name} is under high demand on every model tried. The agent waited and tried again; send the message again in a minute.`,
    );
  } else {
    lines.push(singleFailureText(error, { model, provider }));
  }
  lines.push(`Models tried (${attempts.length}):`);
  lines.push(...attempts.map(attemptLine));
  return lines.join('\n');
}

/** What one failed model call means to the person, in one or two sentences. */
function singleFailureText(error, { model, provider }) {
  const name = providerOf(provider)?.name ?? 'The AI provider';
  const raw = String(error?.message ?? '');
  const status = statusOf(error);
  if (
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    /timed? ?out|fetch failed|ECONNRESET/i.test(raw)
  )
    return `${name} took too long to answer. Send the message again.`;
  if (status === 401 || status === 403)
    return `${name} refused this AI account's key. Check the key in Settings, AI Accounts.`;
  if (
    status === 402 ||
    /credit balance|insufficient.{0,20}(?:credit|funds|balance)|billing|quota/i.test(
      raw,
    )
  )
    return `The ${name} account is out of credit. Top it up and send the message again.`;
  if (
    status === 404 ||
    /not_found|model.{0,20}(?:not found|does not exist)/i.test(raw)
  )
    return `The model ${model} does not exist on the ${name} account. Pick another in the model chip and send the message again.`;
  if (status === 429)
    return `${name} reached its call limit for now. Wait a minute and send the message again.`;
  if (isContextOverflow(error))
    return `The conversation got too long for the model ${model}. Start a new conversation or pick a model with more context.`;
  if (status >= 500 || /overloaded/i.test(raw))
    return `${name} is overloaded or down right now. Send the message again in a few minutes.`;
  return `${name} could not answer right now. Send the message again; if it happens again, pick another model in the model chip.`;
}
