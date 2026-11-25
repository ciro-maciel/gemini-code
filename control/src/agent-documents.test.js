import { afterAll, beforeAll, describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'gemini-agent-docs-data-'))
process.env.WORKSPACE_DIR ||= mkdtempSync(path.join(tmpdir(), 'gemini-agent-docs-ws-'))
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { config } = await import('./config.js')
const { db, now } = await import('./db.js')
const { createBot, fetchBot, updateBotSettings } = await import('./bots.js')
const { createSkill } = await import('./skills.js')
const { createRoutine } = await import('./routines.js')
const { saveMemory } = await import('./engine/memory.js')
const { syncAccount } = await import('./repo.js')
const { createAgentDocument, deleteAgentDocument, listAgentDocuments, saveAgentDocument, uploadAgentDocuments } = await import('./agent-documents.js')
const { buildSystemPrompt } = await import('./engine/run.js')

const wsDir = mkdtempSync(path.join(tmpdir(), 'gemini-agent-docs-run-'))
let savedConfig

beforeAll(() => {
    savedConfig = {
        localWorkspaceDir: config.localWorkspaceDir,
        githubAppId: config.githubAppId,
        githubOrg: config.githubOrg,
        githubAppKey: config.githubAppKey,
    }
    Object.assign(config, {
        localWorkspaceDir: wsDir,
        githubAppId: '',
        githubOrg: '',
        githubAppKey: '',
    })
})

afterAll(() => {
    Object.assign(config, savedConfig)
})

db.query('INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?, ?)').run(
    'acc-docs',
    'docs@gemini.local',
    'Ana',
    'active',
    now(),
    now()
)

describe('agent folder and documents', () => {
    test('new agents automatically receive a unique default folder agents/<slug>/docs', () => {
        const first = createBot({ accountId: 'acc-docs', name: 'Backend Engineer', instructions: 'Build APIs.' })
        const second = createBot({ accountId: 'acc-docs', name: 'Backend Engineer', instructions: 'Second backend.' })

        expect(first.folder).toBe('agents/backend-engineer/docs')
        expect(second.folder).toBe('agents/backend-engineer-2/docs')
        expect(first.instructionsPath).toBe(`${first.agentDir}/INSTRUCTIONS.md`)
        expect([fetchBot(first.id).agentDir, fetchBot(second.id).agentDir].sort()).toEqual([
            'agents/backend-engineer',
            'agents/backend-engineer-2',
        ])
    })

    test('aggregates work docs, instructions, routines, memory and linked skills per agent', async () => {
        const bot = createBot({ accountId: 'acc-docs', name: 'Docs Agent', instructions: 'Keep architecture docs.' })
        saveMemory({ botId: bot.id, kind: 'decision', content: 'Use Markdown for specs.' })
        createRoutine({ botId: bot.id, name: 'Daily Digest', instruction: 'Summarize changes.', when: { cron: '0 9 * * *' }, timezone: 'America/Sao_Paulo' })
        createSkill({ botId: bot.id, name: 'Release Notes', whenToUse: 'Before shipping', steps: '1. Gather commits' })

        await syncAccount('acc-docs')
        await createAgentDocument(bot, 'acc-docs', { name: 'architecture.md', content: '# Architecture\n' })
        await uploadAgentDocuments(bot, 'acc-docs', 'guides', [{ name: 'onboarding.md', bytes: Buffer.from('# Onboarding\n') }])

        const all = await listAgentDocuments(bot)
        expect(all.mode).toBe('local')
        expect(all.folder).toBe('agents/docs-agent/docs')
        expect(all.counts).toMatchObject({ work: 2, instructions: 1, memory: 1, routine: 1, skill: 1, core: 3, all: 6 })
        expect(all.items.map(item => `${item.group}:${item.name}`)).toEqual([
            'work:architecture.md',
            'work:onboarding.md',
            'instructions:INSTRUCTIONS.md',
            'memory:decisions.md',
            'routine:daily-digest.md',
            'skill:SKILL.md',
        ])

        const onlyWork = await listAgentDocuments(bot, { group: 'work', q: 'onboard' })
        expect(onlyWork.items).toHaveLength(1)
        expect(onlyWork.items[0].path).toBe('agents/docs-agent/docs/guides/onboarding.md')

        const prompt = buildSystemPrompt(fetchBot(bot.id), {}, 'terça-feira, 24/11/2026, 10:00')
        expect(prompt).toContain('## Documentos deste agente')
        expect(prompt).toContain('/agents/docs-agent/docs/architecture.md')
    })

    test('enforces scope when saving and deleting agent documents', async () => {
        const alpha = createBot({ accountId: 'acc-docs', name: 'Alpha', instructions: 'Alpha rules' })
        const beta = createBot({ accountId: 'acc-docs', name: 'Beta', instructions: 'Beta rules' })
        await syncAccount('acc-docs')
        await createAgentDocument(alpha, 'acc-docs', { name: 'secret.md', content: 'alpha only' })

        await expect(saveAgentDocument(beta, 'acc-docs', 'agents/alpha/docs/secret.md', 'hijack')).rejects.toThrow('não pertence')
        await expect(deleteAgentDocument(beta, 'acc-docs', 'agents/alpha/docs/secret.md')).rejects.toThrow('não pertence')
        await expect(deleteAgentDocument(alpha, 'acc-docs', 'agents/alpha/INSTRUCTIONS.md')).rejects.toThrow('ajustes')

        const saved = await saveAgentDocument(alpha, 'acc-docs', 'agents/alpha/docs/secret.md', 'alpha updated')
        expect(saved.path).toBe('agents/alpha/docs/secret.md')

        const deleted = await deleteAgentDocument(alpha, 'acc-docs', 'agents/alpha/docs/secret.md')
        expect(deleted.removed).toBe(1)

        // Switching folder updates where documents are scoped
        const moved = updateBotSettings(alpha.id, { folder: 'projects/alpha-app' })
        expect(moved.folder).toBe('projects/alpha-app')
        const createdInNewFolder = await createAgentDocument(moved, 'acc-docs', { name: 'README.md', content: '# App\n' })
        expect(createdInNewFolder.path).toBe('projects/alpha-app/README.md')
    })
})
