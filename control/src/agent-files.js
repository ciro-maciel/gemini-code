// An agent's own files: every operation on its folder, in one place.
//
// The dashboard's file tree, the agent's file tools and the files MCP server
// (mcp-files.js) all call these same handlers, so what the screen can do the
// agent can do, and nothing more. Every path is resolved inside the agent's
// root and refused when it leaves it: "..", an absolute path elsewhere, or a
// symbolic link that points out.
//
// The root is `<WORKSPACE_DIR>/agents/<agent folder>`. OPERATIONS is the
// table the MCP's guide shows; a new operation is a new row, never a new tool.

import { createHmac, timingSafeEqual } from 'node:crypto'
import { copyFileSync, cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, renameSync, rmSync, statSync, watch, writeFileSync } from 'node:fs'
import path from 'node:path'

import { config } from './config.js'
import { agentDirOf } from './bots.js'

export const OPERATIONS = [
    { tool: 'read', op: 'list', does: 'The entries of one folder: name, kind, size, modified time.', args: { path: 'folder, "" for the root' } },
    { tool: 'read', op: 'tree', does: 'The folder tree, folders first, with what changed marked (A added, M modified).', args: { path: 'folder, "" for the root', depth: 'levels, 1 to 8 (default 4)' } },
    { tool: 'read', op: 'read', does: 'One text file, whole or a range of lines.', args: { path: 'file', offset: 'first line, 1-based (optional)', limit: 'number of lines (optional)' } },
    { tool: 'read', op: 'read_many', does: 'Several text files at once.', args: { paths: 'list of files (up to 20)' } },
    { tool: 'read', op: 'info', does: 'Kind, size, created and modified times of a file or folder.', args: { path: 'file or folder' } },
    { tool: 'read', op: 'search', does: 'Files and folders whose name contains the text.', args: { query: 'part of a name', path: 'where to look (optional)' } },
    { tool: 'read', op: 'grep', does: 'Lines that contain the text, in every text file under a folder.', args: { query: 'text to find', path: 'where to look (optional)' } },
    { tool: 'read', op: 'changes', does: 'What was added or modified in the folder since the server started watching it.', args: {} },
    { tool: 'write', op: 'write', does: 'Creates a file, or replaces it when overwrite is true. Creates missing folders.', args: { path: 'file', content: 'text', overwrite: 'true to replace an existing file' } },
    { tool: 'write', op: 'edit', does: 'Replaces one exact piece of text in a file. Fails when the piece is missing or appears more than once.', args: { path: 'file', find: 'exact text', replace: 'new text' } },
    { tool: 'write', op: 'append', does: 'Adds text to the end of a file, creating it if needed.', args: { path: 'file', content: 'text' } },
    { tool: 'write', op: 'mkdir', does: 'Creates a folder and any missing parents.', args: { path: 'folder' } },
    { tool: 'write', op: 'move', does: 'Moves or renames a file or folder. Refuses to replace something that exists.', args: { from: 'current path', to: 'new path' } },
    { tool: 'write', op: 'copy', does: 'Copies a file or folder. Refuses to replace something that exists.', args: { from: 'source', to: 'destination' } },
    { tool: 'write', op: 'upload', does: 'Writes a binary file from base64.', args: { path: 'file', base64: 'content', overwrite: 'true to replace' } },
    { tool: 'delete', op: 'delete', does: 'Deletes a file or a folder with everything in it. Needs the confirmation code from a first call.', args: { path: 'file or folder', confirm: 'true, with the code', code: 'from the first call' } },
]

const MAX_READ_BYTES = 2_000_000
const MAX_TREE_NODES = 2_000
const SKIP_DIRS = new Set(['.git', 'node_modules', '.DS_Store'])

export class FilesError extends Error {
    constructor(code, message) {
        super(message)
        this.code = code
    }
}
const refuse = (code, message) => {
    throw new FilesError(code, message)
}

/** The agent's root folder on disk, made if missing. */
export function rootOf(bot) {
    const folder = agentDirOf(bot) || `agents/${bot.id}`
    const root = path.join(config.localWorkspaceDir, folder)
    mkdirSync(root, { recursive: true })
    return realpathSync(root)
}

/** A path inside the root, resolved; refused when it leaves the root. "" is the root itself. */
export function resolveInside(root, relative = '') {
    const raw = String(relative ?? '').replace(/\\/g, '/').trim()
    if (raw.includes('\0')) refuse('INVALID_PATH', 'caminho inválido')
    const target = path.resolve(root, raw.replace(/^\/+/, ''))
    if (target !== root && !target.startsWith(root + path.sep)) refuse('OUTSIDE_ROOT', 'esse caminho sai da pasta do agente')
    // The nearest part that exists must also be inside once links are followed.
    let probe = target
    while (!existsSync(probe) && probe !== root) probe = path.dirname(probe)
    const real = realpathSync(probe)
    if (real !== root && !real.startsWith(root + path.sep)) refuse('OUTSIDE_ROOT', 'esse caminho aponta para fora da pasta do agente')
    return target
}

const relativeOf = (root, full) => path.relative(root, full).split(path.sep).join('/')

function entryOf(root, full) {
    const stat = lstatSync(full)
    // A link is shown, never followed: it may point out of the root.
    const kind = stat.isSymbolicLink() ? 'link' : stat.isDirectory() ? 'folder' : 'file'
    return { path: relativeOf(root, full), name: path.basename(full), kind, size: kind === 'file' ? stat.size : null, modifiedAt: Math.round(stat.mtimeMs) }
}

const byFoldersFirst = (a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name) : a.kind === 'folder' ? -1 : 1)

function isText(buffer) {
    const sample = buffer.subarray(0, 8000)
    return !sample.includes(0)
}

// --- What changed: one watcher per root, kept while the server runs ------

const watchers = new Map()
let onChange = () => {}

/** Who hears that a root changed (the server publishes it to the dashboard). */
export function onFilesChanged(listener) {
    onChange = listener
}

function watchRoot(root, key) {
    if (watchers.has(root)) return watchers.get(root)
    const state = { since: Date.now(), marks: new Map(), watcher: null }
    try {
        state.watcher = watch(root, { recursive: true }, (_event, name) => {
            if (!name || name.split(path.sep).some(part => SKIP_DIRS.has(part))) return
            const full = path.join(root, name)
            const rel = name.split(path.sep).join('/')
            if (!existsSync(full)) state.marks.delete(rel)
            else {
                const stat = statSync(full)
                if (!stat.isDirectory()) state.marks.set(rel, stat.birthtimeMs >= state.since ? 'A' : 'M')
            }
            onChange(key, rel)
        })
    } catch {}
    watchers.set(root, state)
    return state
}

/** Stops every watcher (tests, shutdown). */
export function stopWatching() {
    for (const state of watchers.values()) state.watcher?.close()
    watchers.clear()
}

// --- Confirmation codes for deletion --------------------------------------

const CODE_TTL_MS = 10 * 60_000
const sign = text => createHmac('sha256', config.encryptionKey).update(text).digest('base64url')

export function confirmationCode(botId, relative, nowMs = Date.now()) {
    const expires = nowMs + CODE_TTL_MS
    return `${expires}.${sign(`${botId}:delete:${relative}:${expires}`)}`
}

export function isValidCode(botId, relative, code, nowMs = Date.now()) {
    const [expires, mac] = String(code || '').split('.')
    if (!expires || !mac || Number(expires) < nowMs) return false
    const expected = Buffer.from(sign(`${botId}:delete:${relative}:${expires}`))
    const given = Buffer.from(mac)
    return expected.length === given.length && timingSafeEqual(expected, given)
}

// --- The operations --------------------------------------------------------

function tree(root, start, depth, marks) {
    let count = 0
    const walk = (dir, level) => {
        const children = []
        for (const name of readdirSync(dir)) {
            if (SKIP_DIRS.has(name) || count >= MAX_TREE_NODES) continue
            const full = path.join(dir, name)
            const entry = entryOf(root, full)
            count += 1
            if (entry.kind === 'folder') entry.children = level < depth ? walk(full, level + 1) : null
            else if (marks.has(entry.path)) entry.mark = marks.get(entry.path)
            children.push(entry)
        }
        return children.sort(byFoldersFirst)
    }
    return { path: relativeOf(root, start), items: walk(start, 1), isTruncated: count >= MAX_TREE_NODES }
}

function walkFiles(root, start, visit) {
    const stack = [start]
    let seen = 0
    while (stack.length && seen < 5_000) {
        const dir = stack.pop()
        for (const name of readdirSync(dir)) {
            if (SKIP_DIRS.has(name)) continue
            const full = path.join(dir, name)
            const stat = lstatSync(full)
            // Links are not followed: one could lead out of the root.
            if (stat.isSymbolicLink()) continue
            seen += 1
            if (stat.isDirectory()) stack.push(full)
            if (visit(full, stat) === false) return
        }
    }
}

/**
 * Runs one operation on the agent's folder. Returns plain data; throws
 * FilesError with a code the routes turn into an HTTP status.
 */
export function runFileOperation(bot, op, args = {}) {
    const root = rootOf(bot)
    const watched = watchRoot(root, bot.id)
    const at = key => resolveInside(root, args[key])
    switch (op) {
        case 'list': {
            const dir = at('path')
            if (!existsSync(dir) || !statSync(dir).isDirectory()) refuse('NOT_FOUND', 'pasta não encontrada')
            return { path: relativeOf(root, dir), items: readdirSync(dir).filter(name => !SKIP_DIRS.has(name)).map(name => entryOf(root, path.join(dir, name))).sort(byFoldersFirst) }
        }
        case 'tree': {
            const dir = at('path')
            if (!existsSync(dir) || !statSync(dir).isDirectory()) refuse('NOT_FOUND', 'pasta não encontrada')
            return tree(root, dir, Math.min(Math.max(Number(args.depth) || 4, 1), 8), watched.marks)
        }
        case 'read': {
            const file = at('path')
            if (!existsSync(file) || statSync(file).isDirectory()) refuse('NOT_FOUND', 'arquivo não encontrado')
            if (statSync(file).size > MAX_READ_BYTES) refuse('TOO_LARGE', 'arquivo grande demais para ler de uma vez')
            const buffer = readFileSync(file)
            if (!isText(buffer)) return { path: relativeOf(root, file), isBinary: true, size: buffer.length }
            const lines = buffer.toString('utf8').split('\n')
            const offset = Math.max(Number(args.offset) || 1, 1)
            const limit = args.limit ? Math.max(Number(args.limit), 1) : lines.length
            return { path: relativeOf(root, file), content: lines.slice(offset - 1, offset - 1 + limit).join('\n'), totalLines: lines.length, offset }
        }
        case 'read_many': {
            const paths = Array.isArray(args.paths) ? args.paths.slice(0, 20) : refuse('INVALID_ARGS', 'paths precisa ser uma lista')
            return {
                items: paths.map(one => {
                    try {
                        return runFileOperation(bot, 'read', { path: one })
                    } catch (error) {
                        return { path: one, error: error.message }
                    }
                }),
            }
        }
        case 'info': {
            const target = at('path')
            if (!existsSync(target)) refuse('NOT_FOUND', 'não encontrado')
            const stat = statSync(target)
            return { ...entryOf(root, target), createdAt: Math.round(stat.birthtimeMs) }
        }
        case 'search': {
            const query = String(args.query || '').toLowerCase()
            if (!query) refuse('INVALID_ARGS', 'falta o texto da busca')
            const found = []
            walkFiles(root, at('path'), full => {
                if (path.basename(full).toLowerCase().includes(query)) found.push(entryOf(root, full))
                return found.length < 200
            })
            return { items: found }
        }
        case 'grep': {
            const query = String(args.query || '')
            if (!query) refuse('INVALID_ARGS', 'falta o texto da busca')
            const found = []
            walkFiles(root, at('path'), (full, stat) => {
                if (stat.isDirectory() || stat.size > MAX_READ_BYTES) return true
                const buffer = readFileSync(full)
                if (!isText(buffer)) return true
                buffer
                    .toString('utf8')
                    .split('\n')
                    .forEach((line, index) => {
                        if (line.includes(query) && found.length < 200) found.push({ path: relativeOf(root, full), line: index + 1, text: line.slice(0, 300) })
                    })
                return found.length < 200
            })
            return { items: found }
        }
        case 'changes':
            return { since: watched.since, items: [...watched.marks].map(([file, mark]) => ({ path: file, mark })) }
        case 'write':
        case 'upload': {
            const file = at('path')
            if (file === root) refuse('INVALID_PATH', 'falta o nome do arquivo')
            if (existsSync(file) && statSync(file).isDirectory()) refuse('IS_FOLDER', 'já existe uma pasta com esse nome')
            if (existsSync(file) && args.overwrite !== true) refuse('EXISTS', 'o arquivo já existe: mande overwrite true para substituir')
            mkdirSync(path.dirname(file), { recursive: true })
            writeFileSync(file, op === 'upload' ? Buffer.from(String(args.base64 || ''), 'base64') : String(args.content ?? ''))
            return entryOf(root, file)
        }
        case 'edit': {
            const file = at('path')
            if (!existsSync(file) || statSync(file).isDirectory()) refuse('NOT_FOUND', 'arquivo não encontrado')
            const text = readFileSync(file, 'utf8')
            const find = String(args.find ?? '')
            if (!find) refuse('INVALID_ARGS', 'falta o trecho a trocar')
            const count = text.split(find).length - 1
            if (count === 0) refuse('NOT_FOUND', 'o trecho não está no arquivo')
            if (count > 1) refuse('AMBIGUOUS', `o trecho aparece ${count} vezes: mande um trecho maior`)
            writeFileSync(file, text.replace(find, () => String(args.replace ?? '')))
            return entryOf(root, file)
        }
        case 'append': {
            const file = at('path')
            mkdirSync(path.dirname(file), { recursive: true })
            writeFileSync(file, (existsSync(file) ? readFileSync(file, 'utf8') : '') + String(args.content ?? ''))
            return entryOf(root, file)
        }
        case 'mkdir': {
            const dir = at('path')
            mkdirSync(dir, { recursive: true })
            return entryOf(root, dir)
        }
        case 'move':
        case 'copy': {
            const from = at('from')
            const to = at('to')
            if (from === root) refuse('INVALID_PATH', 'a pasta do agente não sai do lugar')
            if (!existsSync(from)) refuse('NOT_FOUND', 'a origem não existe')
            if (existsSync(to)) refuse('EXISTS', 'o destino já existe')
            mkdirSync(path.dirname(to), { recursive: true })
            if (op === 'move') renameSync(from, to)
            else if (statSync(from).isDirectory()) cpSync(from, to, { recursive: true })
            else copyFileSync(from, to)
            return entryOf(root, to)
        }
        case 'delete': {
            const target = at('path')
            if (target === root) refuse('INVALID_PATH', 'a pasta do agente não pode ser apagada')
            if (!existsSync(target)) refuse('NOT_FOUND', 'não encontrado')
            const relative = relativeOf(root, target)
            if (args.confirm !== true || !isValidCode(bot.id, relative, args.code)) {
                const isFolder = statSync(target).isDirectory()
                let inside = 0
                if (isFolder) walkFiles(root, target, () => ++inside < 10_000)
                return { confirmRequired: true, path: relative, kind: isFolder ? 'folder' : 'file', inside, code: confirmationCode(bot.id, relative), expiresInSeconds: CODE_TTL_MS / 1000, say: `Vou apagar ${isFolder ? `a pasta ${relative} com ${inside} itens dentro` : `o arquivo ${relative}`}. Confirma?` }
            }
            rmSync(target, { recursive: true, force: true })
            return { deleted: true, path: relative }
        }
        default:
            refuse('UNKNOWN_OPERATION', `operação desconhecida: ${op}. Leia files_guide.`)
    }
}

/** Which of the four tools an operation belongs to. */
export const toolOf = op => OPERATIONS.find(row => row.op === op)?.tool ?? null
