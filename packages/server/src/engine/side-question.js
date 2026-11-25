import { db } from '../db.js';
import { addAccountUsage, chatAccountFor } from '../ai-accounts.js';
import { complete } from './model.js';

// "Perguntar sem parar" (04/11/2026): a question about the work, answered from
// what the conversation shows, while the agent goes on. The answer is the
// person's alone: it never enters the conversation, and the agent never reads it.

const RECENT_EVENTS = 60;
const STEP_CHARS = 300;

function lineOf(event) {
  const data = JSON.parse(event.data);
  if (event.type === 'user_message')
    return `Pessoa: ${String(data.text || '').slice(0, 1200)}`;
  if (event.type === 'assistant')
    return `Agente: ${String(data.text || '').slice(0, 1500)}`;
  if (event.type === 'tool_call')
    return `Passo: ${data.name} ${JSON.stringify(data.arguments ?? {}).slice(0, STEP_CHARS)}`;
  if (event.type === 'tool_result')
    return `Resultado: ${String(data.preview ?? '').slice(0, STEP_CHARS)}`;
  return null;
}

/** What the conversation shows, newest last, for the side answer to read. */
export function recentWork(botId) {
  return db
    .query(
      `SELECT e.type, e.data FROM task_events e JOIN tasks t ON t.id = e.task_id
             WHERE t.bot_id = ? AND e.type IN ('user_message', 'assistant', 'tool_call', 'tool_result')
             ORDER BY e.id DESC LIMIT ?`,
    )
    .all(botId, RECENT_EVENTS)
    .reverse()
    .map(lineOf)
    .filter(Boolean)
    .join('\n');
}

export async function askSideQuestion(bot, question) {
  const status =
    db
      .query(
        'SELECT status FROM tasks WHERE bot_id = ? ORDER BY rowid DESC LIMIT 1',
      )
      .get(bot.id)?.status ?? 'sem tarefa';
  const account = await chatAccountFor(bot.id);
  const { message, cost } = await complete({
    model: bot.model,
    account,
    maxTokens: 1200,
    messages: [
      {
        role: 'system',
        content: `Você responde, em português e em poucas frases, uma pergunta da pessoa sobre o trabalho do agente "${bot.name}", enquanto ele segue trabalhando. Use só o que o registro abaixo mostra; se ele não mostra, diga que ainda não dá para saber e o que falta. Você não age, não promete ação e não fala em nome do agente. Estado da tarefa: ${status}.`,
      },
      {
        role: 'user',
        content: `Registro recente da conversa:\n${recentWork(bot.id) || '(vazio)'}\n\nPergunta: ${question}`,
      },
    ],
  });
  // Paid by the agent's own account, like every call it makes.
  if (account) addAccountUsage(account.id, cost);
  return { answer: String(message.content || '').trim(), cost };
}
