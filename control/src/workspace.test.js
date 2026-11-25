import { describe, expect, test } from 'bun:test'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-workspace-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { config } = await import('./config.js')
const { db, now } = await import('./db.js')
const github = await import('./github.js')
const workspace = await import('./workspace.js')
const { fakeGithub } = await import('./fake-github.test-support.js')

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
Object.assign(config, { githubAppId: '123', githubOrg: 'org-test', githubAppKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) })
const fake = fakeGithub()
github.useFetch(fake.fetch)

// The bot's computer, in memory: path -> bytes.
const disk = new Map()
const writes = []
workspace.useComputer({
    write: async (sprite, filePath, bytes) => {
        writes.push(filePath)
        disk.set(filePath, Buffer.from(bytes))
    },
    read: async (sprite, filePath) => disk.get(filePath),
})

db.query("INSERT INTO accounts (id, email, name, status, repo, created_at, last_seen_at) VALUES ('acc-w', 'w@exemplo.com', 'W', 'active', 'assistant-acc-w', ?, ?)").run(now(), now())
db.query("INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES ('w-1', 'Métricas', 'sprite-w1', 'idle', 'm', 1, 1, 'acc-w')").run()
const bot = { id: 'w-1', name: 'Métricas', spriteName: 'sprite-w1', accountId: 'acc-w' }
const W = '/home/sprite/workspace'
const repoFiles = () => fake.repos.get('assistant-acc-w')

describe('the repository on the bot computer, and the work back', () => {
    test('what the repository has goes into workspace/, and next time only what changed', async () => {
        await github.ensureRepo('assistant-acc-w', '# W')
        await github.commitFiles('assistant-acc-w', { write: [{ path: 'relatorios/ep39.md', content: 'ep39' }] }, 'm')
        expect(await workspace.bringRepo(bot)).toBe(2)
        expect(disk.get(`${W}/relatorios/ep39.md`).toString()).toBe('ep39')
        expect(await workspace.bringRepo(bot)).toBe(0)
        await github.commitFiles('assistant-acc-w', { write: [{ path: 'relatorios/ep39.md', content: 'ep39 revisto' }] }, 'm')
        writes.length = 0
        expect(await workspace.bringRepo(bot)).toBe(1)
        expect(writes).toEqual([`${W}/relatorios/ep39.md`])
    })

    test('the turn work becomes one commit in the bot name; attachments and the central files stay out', async () => {
        disk.set(`${W}/relatorios/ep40.md`, Buffer.from('ep40'))
        disk.set(`${W}/relatorios/ep39.md`, Buffer.from('ep39 do agente'))
        const before = repoFiles().commits.length
        const result = await workspace.returnWork(bot, [
            { path: `${W}/relatorios/ep40.md`, size: 4 },
            { path: `${W}/relatorios/ep39.md`, size: 14 },
            { path: `${W}/anexos/foto.png`, size: 10 },
            { path: `${W}/agents/metricas/INSTRUCTIONS.md`, size: 5 },
            { path: '/home/sprite/Downloads/x.pdf', size: 5 },
        ])
        expect(result).toEqual({ committed: ['relatorios/ep40.md', 'relatorios/ep39.md'], conflicts: [] })
        expect(repoFiles().commits.length).toBe(before + 1)
        expect(repoFiles().commits[0].author.name).toBe('Métricas via Gemini Code')
        expect(repoFiles().files['relatorios/ep39.md']).toBe('ep39 do agente')
    })

    test('what was copied in and never touched is neither committed nor shown as work', async () => {
        await workspace.bringRepo(bot)
        const before = repoFiles().commits.length
        const copied = Object.keys(repoFiles().files).map(rel => ({ path: `${W}/${rel}`, size: 1 }))
        expect(await workspace.returnWork(bot, copied)).toEqual({ committed: [], conflicts: [] })
        expect(repoFiles().commits.length).toBe(before)
        // The same name git hash-object gives.
        expect(workspace.blobSha(Buffer.from('ep39'))).toBe('4f7f2e3b6216d4d3b03b299dd816ffc5c95ff20b')
    })

    test('a file changed in the repository while the bot worked keeps both versions', async () => {
        await github.commitFiles('assistant-acc-w', { write: [{ path: 'relatorios/ep40.md', content: 'ep40 da Ana' }] }, 'Ana')
        disk.set(`${W}/relatorios/ep40.md`, Buffer.from('ep40 do agente'))
        const result = await workspace.returnWork(bot, [{ path: `${W}/relatorios/ep40.md`, size: 14 }])
        expect(result.conflicts).toEqual([{ path: 'relatorios/ep40.md', beside: 'relatorios/ep40 (versão de Métricas).md' }])
        expect(repoFiles().files['relatorios/ep40.md']).toBe('ep40 da Ana')
        expect(repoFiles().files['relatorios/ep40 (versão de Métricas).md']).toBe('ep40 do agente')
    })
})
