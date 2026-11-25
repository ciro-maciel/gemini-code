import { expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-release-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { db, now } = await import('./db.js')
const { releasableOf, releaseContext } = await import('./engine/run.js')

function seed(taskId, enabled, calls) {
    db.query('INSERT INTO accounts (id, email, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').run('acc-rel', 'rel@exemplo.com', 'active', now(), now())
    db.query('INSERT OR IGNORE INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run('bot-rel', 'Bot', 'sprite-rel', 'idle', 'x/y', now(), now(), 'acc-rel')
    db.query('INSERT INTO tasks (id, bot_id, prompt, status, enabled_tools, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?)').run(taskId, 'bot-rel', 'p', 'done', JSON.stringify(enabled), now(), now())
    const messages = [{ role: 'user', content: 'oi' }, { role: 'assistant', content: '', tool_calls: calls.map((name, index) => ({ id: `c${index}`, type: 'function', function: { name, arguments: '{}' } })) }]
    messages.forEach((message, seq) => db.query('INSERT INTO task_messages (task_id, seq, message) VALUES (?, ?, ?)').run(taskId, seq, JSON.stringify(message)))
}

test('"Liberar contexto" drops the connected tools never called and the unused computer, keeping what was used', () => {
    seed('t-rel-1', ['mcp__blogs__blogs_list_posts', 'mcp__search__perf', 'mcp__search__sites'], ['mcp__blogs__blogs_list_posts', 'file_write'])
    expect(releasableOf('t-rel-1')).toEqual({ connected: ['mcp__search__perf', 'mcp__search__sites'], isComputer: true })
    expect(releaseContext('t-rel-1')).toEqual({ connected: 2, isComputer: true })
    const task = db.query('SELECT enabled_tools, is_computer_released FROM tasks WHERE id = ?').get('t-rel-1')
    expect(JSON.parse(task.enabled_tools)).toEqual(['mcp__blogs__blogs_list_posts'])
    expect(task.is_computer_released).toBe(1)
    expect(releasableOf('t-rel-1')).toEqual({ connected: [], isComputer: false })
})

test('a conversation that used the computer keeps it', () => {
    seed('t-rel-2', [], ['computer_shell'])
    expect(releasableOf('t-rel-2')).toEqual({ connected: [], isComputer: false })
})
