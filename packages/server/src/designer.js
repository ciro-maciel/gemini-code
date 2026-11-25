import { config } from './config.js';
import { APPS } from './apps.js';
import { completeJson } from './engine/model.js';

// "Criar com IA": the person says in a sentence what the bot should do, and
// this writes the bot — name, instructions, routines and its first task. The
// first task is where the bot sets itself up: it connects what it needs (the
// login card appears in the conversation) and does the job once, so the
// person sees the result before the first routine runs.

const designerPrompt =
  () => `You design a Gemini Code autonomous engineering agent from a user's one-sentence description.

What a Gemini Code agent has:
- A local or cloud development workspace (shell, git, Gemini CLI, optional Chrome browser).
- MCP connectors with OAuth login cards inside the conversation. Built-in apps: ${APPS.map((app) => app.title).join(', ')}. Additional servers can be discovered via tools_search in the official MCP registry.
- Scheduled routines (5-field cron expressions).
- Persistent memory and human-in-the-loop approvals before pushing, deploying, deleting, sending external messages, or spending money.

Respond with JSON only:
{
  "name": "short agent name (max 30 chars)",
  "instructions": "clear second-person instructions (\\"You...\\"): scope, tools, verification steps, output format, and guardrails",
  "routines": [{ "name": "...", "cron": "m h * * days", "instruction": "self-contained prompt executed on schedule" }],
  "firstTask": "opening user message to initialize and run the first pass",
  "summary": "one-sentence summary of what was created"
}
- routines: empty array if the request is not recurring.
- No emojis.`;

/** The bot's design from one sentence. Throws when the model's answer will not do. */
export async function designBot(description) {
  const { value, cost } = await completeJson({
    model: config.defaultModel,
    system: designerPrompt(),
    user: String(description).slice(0, 2000),
    maxTokens: 2500,
  });
  if (!value?.name || !value?.instructions)
    throw new Error('I could not design that bot; describe it another way');
  return {
    design: {
      name: String(value.name).slice(0, 60),
      instructions: String(value.instructions).slice(0, 8000),
      routines: (Array.isArray(value.routines) ? value.routines : [])
        .slice(0, 5)
        .filter((routine) => routine?.cron && routine?.instruction),
      firstTask: String(value.firstTask || '').slice(0, 4000),
      summary: String(value.summary || '').slice(0, 400),
    },
    cost,
  };
}
