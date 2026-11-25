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
  const name = providerOf(provider)?.name ?? 'O provedor de IA';
  const raw = String(error?.message ?? '');
  const status = statusOf(error);
  if (
    error?.name === 'TimeoutError' ||
    error?.name === 'AbortError' ||
    /timed? ?out|fetch failed|ECONNRESET/i.test(raw)
  )
    return `${name} demorou demais para responder. Mande a mensagem de novo.`;
  if (status === 401 || status === 403)
    return `${name} recusou a chave desta conta de IA. Confira a chave em Configurações, Contas de IA.`;
  if (
    status === 402 ||
    /credit balance|insufficient.{0,20}(?:credit|funds|balance)|billing|quota/i.test(
      raw,
    )
  )
    return `Acabou o crédito na conta ${name}. Recarregue a conta e mande a mensagem de novo.`;
  if (
    status === 404 ||
    /not_found|model.{0,20}(?:not found|does not exist)/i.test(raw)
  )
    return `O modelo ${model} não existe na conta ${name}. Escolha outro no chip de modelo e mande a mensagem de novo.`;
  if (status === 429)
    return `${name} chegou ao limite de chamadas por agora. Espere um minuto e mande a mensagem de novo.`;
  if (isContextOverflow(error))
    return `A conversa ficou longa demais para o modelo ${model}. Comece uma conversa nova ou escolha um modelo com mais contexto.`;
  if (status >= 500 || /overloaded/i.test(raw))
    return `${name} está sobrecarregado ou fora do ar agora. Mande a mensagem de novo em alguns minutos.`;
  return `${name} não conseguiu responder agora. Mande a mensagem de novo; se repetir, escolha outro modelo no chip de modelo.`;
}
