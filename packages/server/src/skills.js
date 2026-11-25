import { db, newId, now, toApi } from './db.js';
import { completeJson } from './engine/model.js';
import { fetchSpriteHttp } from './sprites.js';

// Skills: what a person taught a bot by doing it once on its computer
// ("Ensinar uma tarefa", as in Grok Bot), or what a bot wrote after doing a
// task well. They are the account's library: each agent marks the ones it uses
// (bot_skills), and a skill outlives the agent that wrote it. The prompt lists
// only each skill's name and when to use it; the steps come in through
// skill_read when a task needs them, so twenty skills do not weigh on every step.

const present = (row) => toApi(row);

/** The skills an agent uses. */
export function listSkills(botId) {
  return db
    .query(
      'SELECT skills.* FROM skills JOIN bot_skills ON bot_skills.skill_id = skills.id WHERE bot_skills.bot_id = ? ORDER BY skills.created_at',
    )
    .all(botId)
    .map(present);
}

/** The account's whole library, each skill with how many agents use it. */
export function listAccountSkills(accountId) {
  return db
    .query(
      'SELECT skills.*, (SELECT COUNT(*) FROM bot_skills WHERE bot_skills.skill_id = skills.id) AS agents FROM skills WHERE account_id = ? ORDER BY name',
    )
    .all(accountId)
    .map(present);
}

/** An agent marks or unmarks a skill of its account's library. */
export function setSkillUse(botId, skillId, isUsed) {
  const skill = db
    .query(
      'SELECT skills.id FROM skills JOIN bots ON bots.account_id = skills.account_id WHERE skills.id = ? AND bots.id = ?',
    )
    .get(skillId, botId);
  if (!skill) throw new Error('unknown skill in this account');
  if (isUsed)
    db.query(
      'INSERT OR IGNORE INTO bot_skills (bot_id, skill_id) VALUES (?, ?)',
    ).run(botId, skillId);
  else
    db.query('DELETE FROM bot_skills WHERE bot_id = ? AND skill_id = ?').run(
      botId,
      skillId,
    );
}

// A skill a template brings has no steps yet: the agent writes them the first time it does it well.
const NO_STEPS_YET =
  'Ainda sem passos guardados. Faça pelo caminho mais curto e confiável; quando der certo, guarde os passos com skill_save.';

/** The library's skill with this name, made from the template's description when the account has none. */
export function ensureAccountSkill(accountId, { name, whenToUse }) {
  const existing = db
    .query(
      'SELECT id FROM skills WHERE account_id = ? AND lower(name) = lower(?)',
    )
    .get(accountId, cleanName(name));
  if (existing) return existing.id;
  const id = newId();
  db.query(
    'INSERT INTO skills (id, account_id, bot_id, name, when_to_use, steps, created_at, updated_at) VALUES (?, ?, NULL, ?, ?, ?, ?, ?)',
  ).run(
    id,
    accountId,
    cleanName(name),
    String(whenToUse || '').slice(0, 600),
    NO_STEPS_YET,
    now(),
    now(),
  );
  return id;
}

export function fetchSkill(skillId) {
  return present(db.query('SELECT * FROM skills WHERE id = ?').get(skillId));
}

/** A skill of this bot by its id (the name is only the label): a name, or another bot's id, finds nothing. */
export function fetchBotSkill(botId, skillId) {
  if (typeof skillId !== 'string') return null;
  const skill = fetchSkill(skillId.trim());
  return skill && skill.botId === botId ? skill : null;
}

export function createSkill({ botId, name, whenToUse, steps }) {
  const id = newId();
  const accountId =
    db.query('SELECT account_id FROM bots WHERE id = ?').get(botId)
      ?.account_id ?? null;
  db.query(
    'INSERT INTO skills (id, account_id, bot_id, name, when_to_use, steps, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    accountId,
    botId,
    cleanName(name),
    String(whenToUse || '').slice(0, 600),
    String(steps || '').slice(0, 20_000),
    now(),
    now(),
  );
  db.query(
    'INSERT OR IGNORE INTO bot_skills (bot_id, skill_id) VALUES (?, ?)',
  ).run(botId, id);
  return fetchSkill(id);
}

const cleanName = (name) =>
  String(name || '')
    .trim()
    .slice(0, 80) || 'Taught task';

export function updateSkill(skillId, { name, whenToUse, steps }) {
  const fields = {};
  if (typeof name === 'string' && name.trim()) fields.name = cleanName(name);
  if (typeof whenToUse === 'string')
    fields.when_to_use = whenToUse.slice(0, 600);
  if (typeof steps === 'string' && steps.trim())
    fields.steps = steps.slice(0, 20_000);
  const columns = Object.keys(fields);
  if (columns.length)
    db.query(
      `UPDATE skills SET ${columns.map((column) => `${column} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
    ).run(...columns.map((column) => fields[column]), now(), skillId);
  return fetchSkill(skillId);
}

/** A skill leaves the library, and every agent that used it. */
export function deleteSkill(skillId) {
  db.query('DELETE FROM bot_skills WHERE skill_id = ?').run(skillId);
  db.query('DELETE FROM skills WHERE id = ?').run(skillId);
}

export function formatSkillsForPrompt(botId) {
  const skills = listSkills(botId);
  if (skills.length === 0) return '';
  return skills
    .map(
      (skill) =>
        `- ${skill.name} (id ${skill.id}): ${skill.whenToUse || 'quando o usuário pedir esta tarefa'}`,
    )
    .join('\n');
}

// --- Teaching: the recording on the bot's computer --------------------------

const sessions = new Map();

export const teachingSession = (botId) => sessions.get(botId) ?? null;

export async function startTeaching(bot, name) {
  const response = await fetchSpriteHttp(bot.spriteUrl, '/teach/start', {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(
      `the computer did not start recording (${response.status})`,
    );
  const session = { name: cleanName(name), startedAt: Date.now() };
  sessions.set(bot.id, session);
  return session;
}

async function stopRecording(bot) {
  sessions.delete(bot.id);
  const response = await fetchSpriteHttp(bot.spriteUrl, '/teach/stop', {
    method: 'POST',
    signal: AbortSignal.timeout(60_000),
  });
  if (!response.ok)
    throw new Error(
      `the computer did not return the recording (${response.status})`,
    );
  return response.json();
}

export async function cancelTeaching(bot) {
  if (!sessions.has(bot.id)) return;
  await stopRecording(bot).catch(() => {});
}

const WRITER = `Você transforma a demonstração de uma tarefa num procedimento que um assistente com computador (Chrome e shell) vai repetir sozinho depois.
Você recebe: o nome que o usuário deu, os passos gravados no navegador (cliques, campos, teclas, páginas abertas, em ordem), algumas capturas de tela e, às vezes, a narração do usuário.
Responda só JSON: {"name":"...","whenToUse":"...","steps":"..."}
- name: curto, no infinitivo ("Publicar o changelog").
- whenToUse: uma frase dizendo quando usar ("Quando o usuário pedir para publicar o changelog da semana").
- steps: Markdown em português. Comece por "O que muda a cada vez" (os parâmetros: datas, nomes, textos que o usuário vai informar), depois os passos numerados, cada um com onde (site, página) e o que fazer, pelo nome do botão ou campo como aparece na tela. Termine com "Como saber que deu certo".
- Campos marcados como secretos (••••) são login ou código: escreva "o usuário faz o login" nesse ponto, nunca peça a senha.
- Não invente passos que não aparecem na gravação nem na narração. Junte cliques repetidos ou acidentais.`;

function describeSteps(steps) {
  return steps
    .map((step, index) => {
      const at = `${Math.round(step.at / 1000)}s`;
      if (step.type === 'navigate')
        return `${index + 1}. [${at}] abriu ${step.url}${step.title ? ` (${step.title})` : ''}`;
      if (step.type === 'click')
        return `${index + 1}. [${at}] clicou em ${step.role || step.tag} "${step.name || ''}"${step.href ? ` → ${step.href}` : ''} em ${step.url}`;
      if (step.type === 'fill')
        return `${index + 1}. [${at}] preencheu "${step.field || 'campo'}" com ${step.isSecret ? '•••• (secreto)' : `"${step.value}"`}`;
      if (step.type === 'press')
        return `${index + 1}. [${at}] apertou ${step.key}`;
      return `${index + 1}. [${at}] ${step.type}`;
    })
    .join('\n');
}

/** Ends the recording and writes the skill from it. Returns { skill, cost }. */
export async function finishTeaching(bot, { narration = '' } = {}) {
  const session = sessions.get(bot.id);
  if (!session)
    throw new Error('there is no recording in progress on this bot');
  const recording = await stopRecording(bot);
  if (!recording.steps?.length && !narration.trim())
    throw new Error(
      'the recording is empty: no browser steps and no narration',
    );
  const content = [
    {
      type: 'text',
      text: `Nome dado pelo usuário: ${session.name}\nDuração: ${Math.round((recording.durationMs || 0) / 1000)} s\n\nPassos gravados:\n${describeSteps(recording.steps || []) || '(nenhum)'}\n\nNarração do usuário:\n${narration.trim() || '(sem narração)'}`,
    },
    ...(recording.shots || []).slice(-8).map((shot) => ({
      type: 'image_url',
      image_url: { url: `data:image/jpeg;base64,${shot.data}` },
    })),
  ];
  const { value, cost } = await completeJson({
    model: bot.model,
    system: WRITER,
    user: content,
    maxTokens: 3000,
  });
  const skill = createSkill({
    botId: bot.id,
    name: value.name || session.name,
    whenToUse: value.whenToUse,
    steps: value.steps,
  });
  return { skill, cost, stepCount: recording.steps?.length ?? 0 };
}
