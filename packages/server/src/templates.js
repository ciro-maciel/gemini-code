import { brainsFor } from './ai-accounts.js';
import { config } from './config.js';
import { db, newId, now, toApi } from './db.js';
import {
  HOUSE_TEMPLATES,
  TEMPLATE_AREAS,
  WAY_OF_WORKING,
} from './template-catalog.js';

// Templates: where a Gemini Code agent starts. Built-in engineering templates
// (template-catalog.js) plus any custom templates saved by the user.

const PRO_MODELS = ['Gemini 2.5 Pro', 'Fable 5.1', 'Opus 5.5'];
const EFFORT = {
  Low: 'low',
  Medium: 'medium',
  High: 'high',
  Baixo: 'low',
  Médio: 'medium',
  Alto: 'high',
  Máximo: 'high',
};
const modelOf = (label) => {
  if (PRO_MODELS.includes(label))
    return (
      config.models.find((model) => model.id.includes('pro'))?.id ||
      config.models[0].id
    );
  return (
    config.models.find((model) => model.id.includes('flash'))?.id ||
    config.models[0].id
  );
};

function fromHouse(template) {
  return {
    id: template.id,
    name: template.name,
    icon: template.icon,
    area: template.area,
    owns: template.owns,
    measure: template.measure,
    when: template.when,
    asks: template.asks,
    model: modelOf(template.model),
    effort: EFFORT[template.effort] || 'medium',
    instructions: `${template.instructions}\n\nWhen you work: ${template.when}.\n\n${WAY_OF_WORKING}`,
    uses: template.conns.map(([service, reach]) => ({ service, reach })),
    skills: template.skills.map(([name, whenToUse]) => ({ name, whenToUse })),
    from: template.from,
    to: template.to,
    isHouse: true,
  };
}

const JSON_FIELDS = ['uses', 'skills', 'from_ids', 'to_ids'];
function fromRow(row) {
  const template = toApi(row, JSON_FIELDS);
  return {
    ...template,
    from: template.fromIds,
    to: template.toIds,
    fromIds: undefined,
    toIds: undefined,
    isHouse: false,
  };
}

export { TEMPLATE_AREAS };

/** Every template the account can start from: its own first, then the built-in ones it did not replace. */
export function listTemplates(accountId) {
  const own = db
    .query('SELECT * FROM templates WHERE account_id = ? ORDER BY created_at')
    .all(accountId)
    .map(fromRow);
  const replaced = new Set(own.map((template) => template.id));
  return [
    ...own,
    ...HOUSE_TEMPLATES.filter((template) => !replaced.has(template.id)).map(
      fromHouse,
    ),
  ];
}

export const fetchTemplate = (accountId, id) =>
  listTemplates(accountId).find((template) => template.id === id) || null;

/** The account's connections a template names, matched by title: an agent starts with these, not with all. */
export const templateConnectionIds = (template, connections) => {
  const wanted = new Set(
    (template?.uses ?? []).map((use) => use.service.toLowerCase()),
  );
  return connections
    .filter((connection) =>
      wanted.has(String(connection.title || '').toLowerCase()),
    )
    .map((connection) => connection.id);
};

const clean = (value, max) =>
  String(value ?? '')
    .trim()
    .slice(0, max);
const slug = (text) =>
  clean(text, 60)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '') || 'template';

/**
 * Saves the account's own template: a new one, or its copy of a built-in one it edited.
 */
export function saveTemplate(accountId, fields) {
  const base = fields.id ? fetchTemplate(accountId, fields.id) : null;
  const id = base?.id || `${slug(fields.name)}-${newId().slice(0, 6)}`;
  const merged = {
    ...base,
    ...Object.fromEntries(
      Object.entries(fields).filter(([, value]) => value !== undefined),
    ),
  };
  if (!clean(merged.name, 60)) throw new Error('give the template a name');
  if (
    fields.model !== undefined &&
    fields.model !== base?.model &&
    !brainsFor(accountId).some((brain) =>
      brain.models.some((model) => model.id === fields.model),
    )
  )
    throw new Error(`model not in the list: ${fields.model}`);
  const row = [
    clean(merged.name, 60),
    clean(merged.icon || 'ti-sparkles', 40),
    clean(merged.area || 'Engineering', 40),
    clean(merged.owns, 300),
    clean(merged.measure, 200),
    clean(merged.when, 200),
    clean(merged.asks, 300),
    merged.model || config.models[0].id,
    ['low', 'medium', 'high'].includes(merged.effort)
      ? merged.effort
      : 'medium',
    String(merged.instructions || '').slice(0, 8000),
    JSON.stringify(merged.uses || []),
    JSON.stringify(merged.skills || []),
    JSON.stringify(merged.from || []),
    JSON.stringify(merged.to || []),
  ];
  db.query(
    `INSERT INTO templates (id, account_id, name, icon, area, owns, measure, run_when, asks, model, effort, instructions, uses, skills, from_ids, to_ids, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (account_id, id) DO UPDATE SET name = excluded.name, icon = excluded.icon, area = excluded.area, owns = excluded.owns, measure = excluded.measure,
           run_when = excluded.run_when, asks = excluded.asks, model = excluded.model, effort = excluded.effort, instructions = excluded.instructions,
           uses = excluded.uses, skills = excluded.skills, from_ids = excluded.from_ids, to_ids = excluded.to_ids, updated_at = excluded.updated_at`,
  ).run(id, accountId, ...row, now(), now());
  return fetchTemplate(accountId, id);
}

/** An account's own template goes; a built-in one it had edited comes back as it was. */
export function deleteTemplate(accountId, id) {
  return (
    db
      .query('DELETE FROM templates WHERE account_id = ? AND id = ?')
      .run(accountId, id).changes > 0
  );
}
