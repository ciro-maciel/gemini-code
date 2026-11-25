import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-system-prompt-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { db, now } = await import('./db.js')
const { buildSystemPrompt, dayOf } = await import('./engine/run.js')

db.query("INSERT INTO accounts (id, email, name, status, created_at, last_seen_at) VALUES ('sp-acc', 'sp@exemplo.com', 'Ana', 'active', ?, ?)").run(now(), now())
db.query("INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES ('sp-bot', 'Blog', 'sprite-sp', 'idle', 'x/y', 1, 1, 'sp-acc')").run()
const bot = { id: 'sp-bot', name: 'Blog', accountId: 'sp-acc' }

describe('the system prompt every call starts with', () => {
    test('stays the same all day, so a new turn keeps the cached conversation', () => {
        const morning = buildSystemPrompt(bot, {}, 'terça-feira, 04/11/2026, 08:05 (America/Sao_Paulo)')
        const night = buildSystemPrompt(bot, {}, 'terça-feira, 04/11/2026, 23:59 (America/Sao_Paulo)')
        expect(morning).toBe(night)
        expect(morning).toContain('Hoje: terça-feira, 04/11/2026 (America/Sao_Paulo)')
        expect(buildSystemPrompt(bot, {}, 'quarta-feira, 05/11/2026, 08:05 (America/Sao_Paulo)')).not.toBe(morning)
        expect(dayOf('quarta-feira, 05/11/2026, 08:05:30')).toBe('quarta-feira, 05/11/2026')
    })

    test('people given access write orders too; the person\'s Chrome only for their session; an approval with a change is redone', () => {
        const prompt = buildSystemPrompt(bot, {}, 'terça-feira, 04/11/2026, 08:05')
        expect(prompt).toContain('de Ana ou de quem recebeu acesso para escrever aqui')
        expect(prompt).toContain('chrome_* é o Chrome do próprio usuário')
        expect(prompt).toContain('se aprovar com uma mudança, chame de novo já com a mudança')
        expect(prompt).not.toContain('Agora:')
    })
})
