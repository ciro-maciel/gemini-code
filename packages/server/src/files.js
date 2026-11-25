import path from 'node:path'
import { config } from './config.js'
import { isLocalMode, listLocalFiles } from './local-runtime.js'
import { runCommand } from './sprites.js'

// What a bot made or downloaded: its workspace and its Downloads. One reader
// for the Library and for the file cards in the conversation, so the two never
// disagree about what exists.
export const FILE_ROOTS = ['/home/sprite/workspace', '/home/sprite/Downloads']

// A git checkout is not something the bot made for the person: a clone of
// eleven repositories would otherwise fill the conversation with their files.
export function listFilesCommand({ sinceSeconds = null, limit = 200 } = {}) {
    const newer = sinceSeconds ? `-newermt @${Math.floor(sinceSeconds)}` : ''
    const skip = `-type d \\( -name node_modules -o -name '.*' -o -exec test -e '{}/.git' \\; \\) -prune`
    return `find ${FILE_ROOTS.join(' ')} -maxdepth 4 ${skip} -o -type f ${newer} -not -name '.*' -printf '%T@\\t%s\\t%p\\n' 2>/dev/null | sort -rn | head -${limit}`
}

export async function listBotFiles(spriteName, { sinceSeconds = null, limit = 200 } = {}) {
    if (isLocalMode()) return listLocalFiles({ sinceSeconds, limit })
    const command = listFilesCommand({ sinceSeconds, limit })
    const { output } = await runCommand(spriteName, command, { timeoutSeconds: 30 })
    return output
        .split('\n')
        .filter(Boolean)
        .map(line => {
            const [modified, size, filePath] = line.split('\t')
            return { path: filePath, name: path.basename(filePath), size: Number(size), modifiedAt: Math.floor(Number(modified)) }
        })
}

export function isBotFilePath(filePath) {
    if (filePath.includes('..')) return false
    const roots = isLocalMode() ? [...FILE_ROOTS, config.localWorkspaceDir] : FILE_ROOTS
    return roots.some(root => filePath.startsWith(`${root}/`))
}
