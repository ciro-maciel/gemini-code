// A conversation that fills the model's window (30/10/2026): its beginning is
// rewritten as a summary by the model itself, and from then on the model reads
// the summary and the end of the conversation. Nothing is deleted: the
// messages stay as they were, the person sees all of them, and the summary
// lives beside them on the task. A later compaction folds the earlier summary in.

/** Past this share of the window, the next step starts with a summary. */
export const COMPACT_AT = 0.7;
// A working budget, whatever the window (10/11/2026): a conversation of 10 days sent 260k to 360k
// tokens at every step, cached, and each step still took 5 to 20 s with 3 to 9 s before the first
// word. Past this many tokens the beginning becomes a summary; the system and the tools are ~35k.
export const WORKING_BUDGET = 80_000;
// What stays word for word after the cut: a share of the conversation, never more than this many
// characters (about 15k tokens), so one compaction brings the next steps back under the budget.
const TAIL_SHARE = 0.3;
const TAIL_MAX_CHARS = 60_000;
const RESULT_CHARS = 2000;

const SUMMARY_HEAD =
  '[Resumo do começo desta conversa, escrito quando o contexto encheu. As mensagens que seguem continuam de onde ele para.]';

const SUMMARY_PROMPT = `Você resume uma conversa de trabalho entre pessoas e um agente, para que o agente continue o trabalho lendo só o resumo e as mensagens mais recentes. Escreva em português, nestas seções:

1. Pedidos: tudo o que as pessoas pediram, o mais perto possível das palavras delas.
2. Decisões e preferências: o que as pessoas decidiram, aprovaram, recusaram ou corrigiram.
3. Feito: arquivos criados ou mudados (com o caminho), conexões e ferramentas usadas, resultados com os números exatos e de onde vieram.
4. Erros: o que deu errado e como foi resolvido, ou se ficou aberto.
5. Pendente: o que falta e qual é o próximo passo.

Guarde nomes, caminhos, números, links e datas exatamente como aparecem. Não invente nada que não esteja na conversa. Sem emoji. Se já houver um resumo anterior, incorpore-o: o novo resumo substitui os dois.`;

const sizeOf = (message) =>
  (typeof message.content === 'string'
    ? message.content.length
    : JSON.stringify(message.content ?? '').length) +
  JSON.stringify(message.tool_calls ?? '').length;

/** Whether the last step read enough of the window to compact before the next. */
export const shouldCompact = (tokens, window) =>
  Boolean(
    tokens &&
      tokens >
        Math.min(window ? window * COMPACT_AT : Infinity, WORKING_BUDGET),
  );

/**
 * Where the kept tail begins: the earliest message, after `from`, from which
 * at most TAIL_SHARE of the conversation remains. Never a tool result, so a
 * call and its answer are never split. Null when there is nothing to fold.
 */
export function cutPoint(messages, from = 0) {
  const total = messages
    .slice(from)
    .reduce((sum, message) => sum + sizeOf(message), 0);
  let tail = 0;
  let cut = null;
  for (let index = messages.length - 1; index > from; index--) {
    tail += sizeOf(messages[index]);
    if (messages[index].role === 'tool') continue;
    if ((tail > total * TAIL_SHARE || tail > TAIL_MAX_CHARS) && cut !== null)
      break;
    cut = index;
  }
  return cut;
}

const textOf = (content) =>
  typeof content === 'string'
    ? content
    : (content ?? [])
        .map((part) => (part.type === 'text' ? part.text : '[imagem]'))
        .join('\n');
const clip = (text, size) =>
  text.length > size ? `${text.slice(0, size)}\n[…cortado]` : text;

/** The conversation as plain text for the summary: who said what, which tool was called, what it gave. */
export function transcriptOf(messages, previous = null) {
  const lines = previous ? [`RESUMO ANTERIOR:\n${previous}`] : [];
  for (const message of messages) {
    if (message.role === 'user' || message.role === 'system')
      lines.push(`PESSOA:\n${textOf(message.content)}`);
    else if (message.role === 'tool')
      lines.push(`RESULTADO:\n${clip(textOf(message.content), RESULT_CHARS)}`);
    else if (message.role === 'assistant') {
      if (message.content) lines.push(`AGENTE:\n${textOf(message.content)}`);
      for (const call of message.tool_calls ?? [])
        lines.push(
          `AGENTE CHAMOU ${call.function.name} ${clip(call.function.arguments ?? '', RESULT_CHARS)}`,
        );
    }
  }
  return lines.join('\n\n');
}

/** Summarizes `messages` (and the earlier summary) with the agent's own model. */
export async function summarize({
  complete,
  model,
  account,
  previous,
  messages,
}) {
  const { message, cost } = await complete({
    model,
    account,
    maxTokens: 8000,
    messages: [
      { role: 'system', content: SUMMARY_PROMPT },
      { role: 'user', content: transcriptOf(messages, previous) },
    ],
  });
  const summary = String(message?.content ?? '').trim();
  if (!summary) throw new Error('o resumo da conversa veio vazio');
  return { summary, cost: cost ?? 0 };
}

/** What the model reads: the summary, then the messages after the cut; or everything, before any compaction. */
export function visibleMessages(messages, { summary, until }) {
  if (!summary || !until || until > messages.length) return messages;
  return [
    { role: 'user', content: `${SUMMARY_HEAD}\n\n${summary}` },
    ...messages.slice(until),
  ];
}
