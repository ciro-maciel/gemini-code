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
  const who = model ? `the model (${model})` : 'the model';
  const why = isCut(finishReason)
    ? `${who} spent the whole answer limit before writing anything`
    : `${who} answered empty, with no text and no action`;
  return `I stopped without an answer: twice in a row ${why}. What I did so far is in the conversation above. Ask me to continue in smaller parts, or pick another model in the model chip.`;
}
