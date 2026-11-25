import { db, newId, now, toApi } from './db.js';

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
