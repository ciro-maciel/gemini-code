// The person's repository as files: what the central writes from its database
// and reads back when someone edits a file. Pure functions, no GitHub here.
//
//   README.md
//   agents/<slug>/INSTRUCTIONS.md        template, model, effort, folder, uses, skills
//   agents/<slug>/routines/<name>.md     when, timezone, on
//   agents/<slug>/memory/decisions.md    decisions and preferences (observations stay in the central)
//   templates/<id>/TEMPLATE.md           the account's own templates
//   skills/<name>/SKILL.md               the library
//
// Frontmatter keys are English; what a person reads is Portuguese. Vault keys,
// permissions, spend and conversations never enter a file.

export const slugOf = (text) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 60) || 'sem-nome';

const line = (value) =>
  String(value ?? '')
    .replace(/\s*\n\s*/g, ' ')
    .trim();

export function frontmatter(fields, body = '') {
  const lines = Object.entries(fields)
    .filter(
      ([, value]) =>
        value !== undefined &&
        value !== null &&
        value !== '' &&
        !(Array.isArray(value) && !value.length),
    )
    .map(
      ([key, value]) =>
        `${key}: ${Array.isArray(value) ? value.map(line).join(', ') : line(value)}`,
    );
  return `---\n${lines.join('\n')}\n---\n${body.trim()}\n`;
}

export function parseFrontmatter(text) {
  const match = String(text).match(/^---\n([\s\S]*?)\n---\n?([\s\S]*)$/);
  if (!match) return { fields: {}, body: String(text).trim() };
  const fields = {};
  for (const row of match[1].split('\n')) {
    const at = row.indexOf(':');
    if (at > 0) fields[row.slice(0, at).trim()] = row.slice(at + 1).trim();
  }
  return { fields, body: match[2].trim() };
}

const list = (value) =>
  value
    ? value
        .split(',')
        .map((part) => part.trim())
        .filter(Boolean)
    : [];

/** Each agent's folder name, unique within the account even when two agents share a name. */
export function agentFolders(bots) {
  const used = new Map();
  const out = new Map();
  for (const bot of [...bots].sort(
    (a, b) => a.createdAt - b.createdAt || a.id.localeCompare(b.id),
  )) {
    const base = slugOf(bot.name);
    const count = (used.get(base) || 0) + 1;
    used.set(base, count);
    out.set(bot.id, count === 1 ? base : `${base}-${count}`);
  }
  return out;
}

/**
 * Every file of the account's repository, from what the central keeps:
 * { bots: [{ id, name, createdAt, templateId, model, effort, folder, instructions,
 *   uses: [title], skills: [name], routines: [...], memories: [...] }], skills, templates }.
 */
export function renderRepo({
  accountName = '',
  bots = [],
  skills = [],
  templates = [],
}) {
  const files = {};
  files['README.md'] =
    `# Gemini Code${accountName ? ` — ${accountName}` : ''}\n\nOs agentes, documentos, modelos e habilidades deste workspace, em Markdown. Cada mudança fica registrada no histórico.\n\n- \`agents/\`: um agente por pasta, com \`INSTRUCTIONS.md\`, rotinas, memória e \`docs/\` (documentos de trabalho).\n- \`templates/\`: os modelos customizados da conta.\n- \`skills/\`: as habilidades compartilhadas entre agentes.\n\nChaves do cofre, permissões, gasto e conversas nunca entram aqui.\n`;
  const folders = agentFolders(bots);
  for (const bot of bots) {
    const base = `agents/${folders.get(bot.id)}`;
    files[`${base}/INSTRUCTIONS.md`] = frontmatter(
      {
        name: bot.name,
        template: bot.templateId,
        model: bot.model,
        effort: bot.effort,
        folder: bot.folder,
        uses: bot.uses,
        skills: bot.skills,
      },
      bot.instructions,
    );
    for (const routine of bot.routines || [])
      files[`${base}/routines/${slugOf(routine.name)}.md`] = frontmatter(
        {
          name: routine.name,
          cron: routine.cron,
          at: routine.runAt
            ? new Date(routine.runAt * 1000).toISOString()
            : null,
          timezone: routine.timezone,
          on: routine.isEnabled ? 'yes' : 'no',
        },
        routine.instruction,
      );
    const kept = (bot.memories || []).filter(
      (memory) => memory.kind !== 'observation',
    );
    if (kept.length) {
      const section = (kind, title) => {
        const rows = kept.filter((memory) => memory.kind === kind);
        return rows.length
          ? `\n## ${title}\n\n${rows.map((memory) => `- ${line(memory.content)}`).join('\n')}\n`
          : '';
      };
      files[`${base}/memory/decisions.md`] =
        `# O que ${bot.name} lembra\n${section('decision', 'Decisões')}${section('preference', 'Preferências')}`;
    }
  }
  for (const skill of skills)
    files[`skills/${slugOf(skill.name)}/SKILL.md`] = frontmatter(
      { name: skill.name, when: skill.whenToUse },
      skill.steps,
    );
  for (const template of templates)
    files[`templates/${template.id}/TEMPLATE.md`] = frontmatter(
      {
        name: template.name,
        area: template.area,
        owns: template.owns,
        measure: template.measure,
        when: template.when,
        asks: template.asks,
        model: template.model,
        effort: template.effort,
        uses: (template.uses || []).map((use) => use.service),
        skills: (template.skills || []).map((skill) => skill.name),
      },
      template.instructions,
    );
  return files;
}

/**
 * What an edited file changes in the central, or null when the file is not one
 * the central reads back (work files, the README).
 */
export function readEdit(path, text) {
  const { fields, body } = parseFrontmatter(text);
  let match = path.match(/^agents\/([^/]+)\/INSTRUCTIONS\.md$/);
  if (match)
    return {
      kind: 'agent',
      folder: match[1],
      fields: {
        instructions: body,
        ...(fields.model ? { model: fields.model } : {}),
        ...(fields.effort ? { effort: fields.effort } : {}),
        ...('folder' in fields ? { folder: fields.folder || null } : {}),
      },
    };
  match = path.match(/^agents\/([^/]+)\/routines\/([^/]+)\.md$/);
  if (match)
    return {
      kind: 'routine',
      folder: match[1],
      name: fields.name || match[2],
      fields: {
        instruction: body,
        ...(fields.cron ? { cron: fields.cron } : {}),
        ...(fields.on ? { isEnabled: fields.on !== 'no' } : {}),
      },
    };
  match = path.match(/^agents\/([^/]+)\/memory\/decisions\.md$/);
  if (match) {
    const memories = [];
    let kind = null;
    for (const row of body.split('\n')) {
      if (/^##\s*Decis/i.test(row)) kind = 'decision';
      else if (/^##\s*Prefer/i.test(row)) kind = 'preference';
      else if (kind && /^-\s+/.test(row))
        memories.push({ kind, content: row.replace(/^-\s+/, '').trim() });
    }
    return { kind: 'memory', folder: match[1], memories };
  }
  match = path.match(/^skills\/([^/]+)\/SKILL\.md$/);
  if (match)
    return {
      kind: 'skill',
      name: fields.name || match[1],
      fields: { whenToUse: fields.when || '', steps: body },
    };
  match = path.match(/^templates\/([^/]+)\/TEMPLATE\.md$/);
  if (match)
    return {
      kind: 'template',
      id: match[1],
      fields: {
        name: fields.name,
        area: fields.area,
        owns: fields.owns,
        measure: fields.measure,
        when: fields.when,
        asks: fields.asks,
        instructions: body,
        ...(fields.model ? { model: fields.model } : {}),
        ...(fields.effort ? { effort: fields.effort } : {}),
        uses: list(fields.uses).map((service) => ({ service, reach: 'write' })),
        skills: list(fields.skills).map((name) => ({ name, whenToUse: '' })),
      },
    };
  return null;
}

/** The files that changed between two renders: what to write and what to remove. */
export function diffFiles(before, after) {
  const write = Object.entries(after)
    .filter(([path, content]) => before[path] !== content)
    .map(([path, content]) => ({ path, content }));
  const remove = Object.keys(before).filter(
    (path) => !(path in after) && isOwned(path),
  );
  return { write, remove };
}

// What the central writes; anything else in the repository (work files) is the person's and stays.
export const isOwned = (path) =>
  path === 'README.md' ||
  /^agents\/[^/]+\/(INSTRUCTIONS\.md|routines\/[^/]+\.md|memory\/decisions\.md)$/.test(
    path,
  ) ||
  /^skills\/[^/]+\/SKILL\.md$/.test(path) ||
  /^templates\/[^/]+\/TEMPLATE\.md$/.test(path);
