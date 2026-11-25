import { describe, expect, test } from 'bun:test';
import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

process.env.DATA_DIR ||= mkdtempSync(
  path.join(tmpdir(), 'gemini-code-templates-'),
);
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64');

const { db, now } = await import('./db.js');
const templates = await import('./templates.js');
const skills = await import('./skills.js');
const { config } = await import('./config.js');

const seedBot = (id, account) => {
  db.query(
    'INSERT INTO accounts (id, email, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING',
  ).run(account, `${account}@example.com`, 'active', now(), now());
  db.query(
    'INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
  ).run(
    id,
    id,
    `local-${id}`,
    'idle',
    'gemini-2.5-flash',
    now(),
    now(),
    account,
  );
};

describe('engineering templates', () => {
  test('provides built-in engineering templates mapped to configured Gemini models', () => {
    const list = templates.listTemplates('acc-t');
    expect(list.length).toBeGreaterThanOrEqual(10);
    for (const template of list) {
      expect(config.models.some((model) => model.id === template.model)).toBe(
        true,
      );
      expect(template.instructions).toContain('bot_handoff');
      expect(template.instructions).toContain('routine_create');
      expect(template.instructions).toContain(
        `When you work: ${template.when}.`,
      );
      expect(template).toMatchObject({
        area: expect.any(String),
        owns: expect.any(String),
        isHouse: true,
      });
    }
    expect(new Set(list.map((template) => template.id)).size).toBe(list.length);
  });

  test('all handoffs point to templates that exist', () => {
    const ids = new Set(
      templates.listTemplates('acc-t').map((template) => template.id),
    );
    for (const template of templates.listTemplates('acc-t')) {
      for (const other of [...template.from, ...template.to])
        expect(ids.has(other)).toBe(true);
    }
  });

  test('editing a built-in template keeps the account copy; deleting restores the built-in one', () => {
    const edited = templates.saveTemplate('acc-t', {
      id: 'software-engineer',
      instructions: 'Focus on Rust services.',
    });
    expect(edited).toMatchObject({
      id: 'software-engineer',
      instructions: 'Focus on Rust services.',
      isHouse: false,
      name: 'Software Engineer',
    });
    expect(
      templates
        .listTemplates('acc-t')
        .filter((template) => template.id === 'software-engineer'),
    ).toHaveLength(1);
    expect(
      templates
        .listTemplates('acc-other')
        .find((template) => template.id === 'software-engineer').isHouse,
    ).toBe(true);
    templates.deleteTemplate('acc-t', 'software-engineer');
    expect(templates.fetchTemplate('acc-t', 'software-engineer').isHouse).toBe(
      true,
    );
  });

  test('an agent starts with only the connections its template names, matched by title', () => {
    const eng = templates.fetchTemplate('acc-t', 'software-engineer');
    const account = [
      { id: 'c-gh', title: 'GitHub' },
      { id: 'c-lin', title: 'linear' },
      { id: 'c-ctx', title: 'Context7' },
      { id: 'c-stripe', title: 'Stripe' },
    ];
    expect(templates.templateConnectionIds(eng, account)).toEqual([
      'c-gh',
      'c-lin',
      'c-ctx',
    ]);
    expect(templates.templateConnectionIds(null, account)).toEqual([]);
  });

  test('a new template requires a name and appears first', () => {
    expect(() => templates.saveTemplate('acc-t', { name: '' })).toThrow('name');
    const own = templates.saveTemplate('acc-t', {
      name: 'Data Pipeline',
      owns: 'ETL jobs',
      area: 'Engineering',
    });
    expect(templates.listTemplates('acc-t')[0].id).toBe(own.id);
  });
});

describe('the skills library', () => {
  test('a skill outlives its agent, is shared by name, and each agent marks its own', () => {
    seedBot('k-1', 'acc-k');
    seedBot('k-2', 'acc-k');
    const written = skills.createSkill({
      botId: 'k-1',
      name: 'release-check',
      whenToUse: 'before tagging',
      steps: '1. run tests',
    });
    expect(skills.listSkills('k-1').map((skill) => skill.name)).toEqual([
      'release-check',
    ]);
    expect(skills.ensureAccountSkill('acc-k', { name: 'Release-Check' })).toBe(
      written.id,
    );
    skills.setSkillUse('k-2', written.id, true);
    db.query('DELETE FROM bots WHERE id = ?').run('k-1');
    expect(skills.listSkills('k-2').map((skill) => skill.name)).toEqual([
      'release-check',
    ]);
    expect(skills.listAccountSkills('acc-k')[0].agents).toBe(1);
    expect(() => skills.setSkillUse('k-2', 'nope', true)).toThrow('unknown');
  });
});
