import { describe, expect, test } from 'bun:test'
import { agentFolders, diffFiles, frontmatter, isOwned, parseFrontmatter, readEdit, renderRepo } from './repo-files.js'

const bot = {
    id: 'b1',
    name: 'Relatório do ep39',
    createdAt: 1,
    templateId: 'metrics',
    model: 'deepseek/deepseek-v4.1-flash',
    effort: 'high',
    folder: 'relatorios',
    instructions: 'Você cuida da retenção.\n\n- Toda segunda, o relatório.',
    uses: ['YouTube Analytics', 'Gmail'],
    skills: ['metricas-youtube'],
    routines: [{ name: 'Métricas do canal', cron: '0 7 * * *', timezone: 'America/Sao_Paulo', isEnabled: true, instruction: 'Lê as métricas de ontem.' }],
    memories: [
        { kind: 'decision', content: 'A meta é 40%.' },
        { kind: 'preference', content: 'Sem número de inscrito.' },
        { kind: 'observation', content: 'O pico foi na quarta.' },
    ],
}

describe('renderRepo', () => {
    const files = renderRepo({ accountName: 'Ana', bots: [bot], skills: [{ name: 'metricas-youtube', whenToUse: 'toda segunda', steps: '1. abrir' }], templates: [{ id: 'cortes-1', name: 'Cortes', area: 'Canal', owns: 'os cortes', instructions: 'Corte.', uses: [{ service: 'Instagram' }], skills: [] }] })

    test('one folder per agent, with its instructions, routines and kept memory', () => {
        expect(Object.keys(files).sort()).toEqual([
            'README.md',
            'agents/relatorio-do-ep39/INSTRUCTIONS.md',
            'agents/relatorio-do-ep39/memory/decisions.md',
            'agents/relatorio-do-ep39/routines/metricas-do-canal.md',
            'skills/metricas-youtube/SKILL.md',
            'templates/cortes-1/TEMPLATE.md',
        ])
        expect(files['agents/relatorio-do-ep39/INSTRUCTIONS.md']).toContain('uses: YouTube Analytics, Gmail')
    })

    test('observations stay in the central; decisions and preferences are written', () => {
        const memory = files['agents/relatorio-do-ep39/memory/decisions.md']
        expect(memory).toContain('A meta é 40%.')
        expect(memory).toContain('Sem número de inscrito.')
        expect(memory).not.toContain('O pico foi na quarta.')
    })

    test('every file the central writes reads back to what it came from', () => {
        expect(readEdit('agents/relatorio-do-ep39/INSTRUCTIONS.md', files['agents/relatorio-do-ep39/INSTRUCTIONS.md'])).toEqual({
            kind: 'agent',
            folder: 'relatorio-do-ep39',
            fields: { instructions: bot.instructions, model: bot.model, effort: 'high', folder: 'relatorios' },
        })
        expect(readEdit('agents/relatorio-do-ep39/memory/decisions.md', files['agents/relatorio-do-ep39/memory/decisions.md']).memories).toEqual([
            { kind: 'decision', content: 'A meta é 40%.' },
            { kind: 'preference', content: 'Sem número de inscrito.' },
        ])
        expect(readEdit('agents/relatorio-do-ep39/routines/metricas-do-canal.md', files['agents/relatorio-do-ep39/routines/metricas-do-canal.md'])).toMatchObject({ kind: 'routine', name: 'Métricas do canal', fields: { cron: '0 7 * * *', isEnabled: true } })
        expect(readEdit('skills/metricas-youtube/SKILL.md', files['skills/metricas-youtube/SKILL.md'])).toEqual({ kind: 'skill', name: 'metricas-youtube', fields: { whenToUse: 'toda segunda', steps: '1. abrir' } })
        expect(readEdit('templates/cortes-1/TEMPLATE.md', files['templates/cortes-1/TEMPLATE.md'])).toMatchObject({ kind: 'template', id: 'cortes-1', fields: { name: 'Cortes', instructions: 'Corte.' } })
        expect(readEdit('relatorios/ep39.html', '<html>')).toBeNull()
    })
})

test('two agents with the same name get their own folders', () => {
    const folders = agentFolders([
        { id: 'a', name: 'SDR', createdAt: 1 },
        { id: 'b', name: 'SDR', createdAt: 2 },
    ])
    expect([folders.get('a'), folders.get('b')]).toEqual(['sdr', 'sdr-2'])
})

test('a diff writes what changed and removes only what the central owns', () => {
    const before = { 'README.md': 'a', 'agents/x/INSTRUCTIONS.md': 'b', 'relatorios/ep39.html': 'c' }
    const after = { 'README.md': 'a', 'agents/y/INSTRUCTIONS.md': 'b' }
    expect(diffFiles(before, after)).toEqual({ write: [{ path: 'agents/y/INSTRUCTIONS.md', content: 'b' }], remove: ['agents/x/INSTRUCTIONS.md'] })
    expect(isOwned('relatorios/ep39.html')).toBe(false)
})

test('frontmatter survives values with line breaks and reads back', () => {
    const text = frontmatter({ name: 'A', when: 'toda\nsegunda' }, 'corpo')
    expect(parseFrontmatter(text)).toEqual({ fields: { name: 'A', when: 'toda segunda' }, body: 'corpo' })
})
