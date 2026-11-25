// A step whose answer has no words and no call. On 31/10/2026 an agent read
// three files, searched its tools, and its fifth step came back empty after
// 41 s (the 8000-token output limit spent before a word): the task closed
// "done" with an empty result and the person was told nothing. Now the step is
// asked once more, with a bigger limit and a note on why; a second empty
// answer ends the task with the reason, said to the person.

/** How many empty answers in a row are asked again before the task stops. */
export const EMPTY_RETRIES = 1;

/** The output limit of the step asked again, when the first one ran out of it. */
export const RETRY_MAX_TOKENS = 16_000;

const isCut = (finishReason) => finishReason === 'length';

/** What the agent reads before the step asked again. */
export function emptyReplyNudge(finishReason) {
  const why = isCut(finishReason)
    ? 'A sua última resposta acabou no limite de saída antes de você escrever qualquer coisa ou chamar uma ferramenta'
    : 'A sua última resposta veio vazia: sem texto e sem chamar nenhuma ferramenta';
  return `[sistema] ${why}, e o usuário não viu nada. Siga agora em passos pequenos: uma ferramenta por vez, ou um texto curto. Se o trabalho é grande (várias peças, um arquivo longo), faça a primeira parte e diga o que falta. Se já terminou, escreva o resumo para o usuário.`;
}

/** What the person reads when the agent stopped without an answer. */
export function emptyReplyStop({ finishReason, model }) {
  const who = model ? `o modelo (${model})` : 'o modelo';
  const why = isCut(finishReason)
    ? `${who} gastou todo o limite de resposta antes de escrever qualquer coisa`
    : `${who} respondeu vazio, sem texto e sem nenhuma ação`;
  return `Parei sem conseguir responder: duas vezes seguidas ${why}. O que fiz até aqui está na conversa acima. Peça para eu continuar em partes menores, ou escolha outro modelo no chip de modelo.`;
}
