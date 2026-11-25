import { createHash } from 'node:crypto'
import path from 'node:path'

import { db } from './db.js'
import { commitFiles, isGithubReady, listTree, readBlob, repoNameOf } from './github.js'
import { isOwned } from './repo-files.js'
import { repoChanged } from './repo.js'
import { readFile as readComputerFile, writeFile as writeComputerFile } from './sprites.js'

// The repository and the bot's computer (29/10/2026). Before the computer's
// first use in a turn, what changed in the repository is copied into
// workspace/; when the turn ends, what the bot made there goes back as one
// commit in its name. The computer never holds a GitHub token: the central
// carries both ways. Agents, templates and skills are the central's files,
// written from the panel, so the bot's copies of them never go back.

const WORKSPACE = '/home/sprite/workspace'
// GitHub slows down well before its 100 MB refusal; bigger files stay on the computer.
export const MAX_FILE_BYTES = 50 * 1024 * 1024

let computer = { read: readComputerFile, write: writeComputerFile }

/** For tests: a computer in memory instead of a Sprite. */
export function useComputer(fake) {
    computer = fake
}

/** Git's own name for some bytes: a file whose name matches the repository's did not change. */
export const blobSha = bytes => createHash('sha1').update(`blob ${bytes.length}\0`).update(bytes).digest('hex')

const known = botId => new Map(db.query('SELECT path, sha FROM computer_files WHERE bot_id = ?').all(botId).map(row => [row.path, row.sha]))
const remember = (botId, filePath, sha) => db.query('INSERT INTO computer_files (bot_id, path, sha) VALUES (?, ?, ?) ON CONFLICT (bot_id, path) DO UPDATE SET sha = excluded.sha').run(botId, filePath, sha)
const repoOf = bot => (isGithubReady() && db.query('SELECT repo FROM accounts WHERE id = ?').get(bot.accountId)?.repo ? repoNameOf(bot.accountId) : null)

/** The repository's files the computer does not have yet, copied in. Returns how many. */
export async function bringRepo(bot) {
    const name = repoOf(bot)
    if (!name || !bot.spriteName) return 0
    const have = known(bot.id)
    let copied = 0
    for (const entry of await listTree(name)) {
        if (have.get(entry.path) === entry.sha || (entry.size ?? 0) > MAX_FILE_BYTES) continue
        const bytes = await readBlob(name, entry.sha)
        if (!bytes) continue
        await computer.write(bot.spriteName, `${WORKSPACE}/${entry.path}`, bytes)
        remember(bot.id, entry.path, entry.sha)
        copied++
    }
    return copied
}

// "relatorios/ep39.html" made while someone changed it: "relatorios/ep39 (versão de Métricas).html".
const besideName = (filePath, botName) => {
    const ext = path.extname(filePath)
    return `${filePath.slice(0, filePath.length - ext.length)} (versão de ${botName})${ext}`
}

/**
 * What the bot changed in workspace/ this turn, back as one commit. A file
 * that also changed in the repository meanwhile keeps the repository's
 * version; the bot's goes beside it, and the turn says so.
 */
export async function returnWork(bot, files) {
    const name = repoOf(bot)
    if (!name) return { committed: [], conflicts: [], isSynced: false }
    const work = files.filter(file => file.path.startsWith(`${WORKSPACE}/`) && !file.path.startsWith(`${WORKSPACE}/anexos/`) && file.size <= MAX_FILE_BYTES).map(file => ({ ...file, rel: file.path.slice(WORKSPACE.length + 1) })).filter(file => !isOwned(file.rel))
    if (!work.length) return { committed: [], conflicts: [] }
    const tree = new Map((await listTree(name)).map(entry => [entry.path, entry.sha]))
    const have = known(bot.id)
    const write = []
    const conflicts = []
    for (const file of work) {
        const bytes = await computer.read(bot.spriteName, file.path)
        // Copied in from the repository and never touched: a fresh mtime, the same file.
        if (bytes && tree.get(file.rel) === blobSha(bytes)) continue
        const isChangedThere = tree.has(file.rel) && tree.get(file.rel) !== have.get(file.rel)
        const target = isChangedThere ? besideName(file.rel, bot.name) : file.rel
        if (isChangedThere) conflicts.push({ path: file.rel, beside: target })
        write.push({ path: target, bytes })
    }
    if (!write.length) return { committed: [], conflicts: [] }
    await commitFiles(name, { write }, write.length === 1 ? `${write[0].path} via Gemini Code` : `${write.length} arquivos via Gemini Code`, { name: `${bot.name} via Gemini Code`, email: 'agent@gemini-code.invalid' })
    repoChanged(bot.accountId)
    // What the computer now has is what the repository has for those paths.
    const after = new Map((await listTree(name)).map(entry => [entry.path, entry.sha]))
    for (const file of write) if (after.has(file.path)) remember(bot.id, file.path, after.get(file.path))
    return { committed: write.map(file => file.path), conflicts }
}
