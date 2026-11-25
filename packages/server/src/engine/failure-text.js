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

/** What a failed model call means to the person, in one or two sentences. */
export function modelFailureText(error, { model, provider }) {
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
