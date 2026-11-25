import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'gemini-code-brain-'))
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { db, now } = await import('./db.js')
const ai = await import('./ai-accounts.js')

function key(account, id, provider, models, createdAt) {
    db.query('INSERT INTO accounts (id, email, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').run(account, `${account}@example.com`, 'active', now(), now())
    db.query('INSERT INTO ai_accounts (id, account_id, name, token, provider, models, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(id, account, provider, 'x', provider, JSON.stringify(models), createdAt)
}

describe('where a new agent talks', () => {
    test('the default Gemini model wins over a secondary key added first', () => {
        key('acc-b1', 'or', 'openrouter', ['qwen/qwen3.6-plus', 'deepseek/deepseek-v4.1-flash'], 1)
        key('acc-b1', 'gm', 'google', ['gemini-3.6-flash', 'gemini-3.5-flash-lite'], 2)
        expect(ai.brainForNewAgent('acc-b1')).toEqual({ aiAccount: 'gm', model: 'gemini-3.5-flash-lite' })
        const [first] = ai.brainsFor('acc-b1')
        expect([first.account.id, first.models[0].id]).toEqual(['gm', 'gemini-3.5-flash-lite'])
    })

    test('a template model matches across keys and spellings', () => {
        key('acc-b2', 'or2', 'openrouter', ['google/gemini-2.5-pro'], 1)
        expect(ai.brainForNewAgent('acc-b2', 'gemini-2.5-pro')).toEqual({ aiAccount: 'or2', model: 'google/gemini-2.5-pro' })
    })

    test('without the default anywhere, the first key and its first model win', () => {
        key('acc-b3', 'or3', 'openrouter', ['deepseek/deepseek-v4.1-flash'], 1)
        key('acc-b3', 'oa3', 'openai', ['gpt-6-mini'], 2)
        expect(ai.brainForNewAgent('acc-b3')).toEqual({ aiAccount: 'or3', model: 'deepseek/deepseek-v4.1-flash' })
    })
})
