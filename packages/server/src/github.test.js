import { describe, expect, test } from 'bun:test'
import { generateKeyPairSync } from 'node:crypto'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-github-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { config } = await import('./config.js')
const github = await import('./github.js')
const { fakeGithub } = await import('./fake-github.test-support.js')

const { privateKey } = generateKeyPairSync('rsa', { modulusLength: 2048 })
Object.assign(config, { githubAppId: '123', githubOrg: 'org-test', githubAppKey: privateKey.export({ type: 'pkcs8', format: 'pem' }) })

describe('github', () => {
    test('the key GitHub hands over (PKCS#1, one line with \\n in the .env) signs too', async () => {
        const kept = config.githubAppKey
        config.githubAppKey = privateKey.export({ type: 'pkcs1', format: 'pem' }).replace(/\n/g, '\\n')
        const fake = fakeGithub()
        github.useFetch(fake.fetch)
        await github.ensureRepo('assistant-pkcs1', '# oi')
        expect(fake.repos.has('assistant-pkcs1')).toBe(true)
        config.githubAppKey = kept
    })

    test('the repository is made private once, with its README', async () => {
        const fake = fakeGithub()
        github.useFetch(fake.fetch)
        await github.ensureRepo('assistant-acc', '# oi')
        await github.ensureRepo('assistant-acc', '# outro')
        expect(fake.repos.get('assistant-acc')).toMatchObject({ private: true, files: { 'README.md': '# oi' } })
    })

    test('one commit writes and removes many files, in the name of who changed them', async () => {
        const fake = fakeGithub()
        github.useFetch(fake.fetch)
        await github.ensureRepo('assistant-acc', '# oi')
        await github.commitFiles('assistant-acc', { write: [{ path: 'agents/a/INSTRUCTIONS.md', content: 'x' }, { path: 'skills/s/SKILL.md', content: 'y' }] }, 'primeiro', { name: 'Ana', email: 'ana@exemplo.com' })
        await github.commitFiles('assistant-acc', { write: [{ path: 'agents/a/INSTRUCTIONS.md', content: 'z' }], remove: ['skills/s/SKILL.md'] }, 'segundo')
        expect(await github.readFile('assistant-acc', 'agents/a/INSTRUCTIONS.md')).toMatchObject({ content: 'z' })
        expect((await github.listTree('assistant-acc')).map(file => file.path).sort()).toEqual(['README.md', 'agents/a/INSTRUCTIONS.md'])
        expect((await github.fileHistory('assistant-acc', 'agents/a/INSTRUCTIONS.md')).map(c => [c.message, c.author])).toEqual([
            ['segundo', 'Assistant'],
            ['primeiro', 'Ana'],
        ])
        const [latest] = await github.fileHistory('assistant-acc', 'agents/a/INSTRUCTIONS.md')
        expect(await github.fileDiff('assistant-acc', latest.sha, 'agents/a/INSTRUCTIONS.md')).toBe('-x\n+z')
        expect(await github.commitFiles('assistant-acc', {}, 'nada')).toBeNull()
    })
})
