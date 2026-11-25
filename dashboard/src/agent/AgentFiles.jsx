import { useCallback, useEffect, useMemo, useState } from 'react'

import { askDeleteAgentPath, deleteAgentPath, fetchAgentTree, makeAgentFolder, writeAgentFile } from '../services/api'
import { NameModal } from '../ui/NameModal'
import { DeleteModal, notify } from '../components/zen'

/**
 * The agent's own folder, next to its conversation. It reads through the same
 * routes as the files MCP (control/src/agent-files.js), shows what the agent
 * added (A) or modified (M), and reads itself again when a file changes.
 */
export function AgentFiles({ bot, canWrite, onOpenFile, onClose }) {
    const [tree, setTree] = useState(null)
    const [error, setError] = useState(null)
    const [open, setOpen] = useState(() => new Set())
    const [filter, setFilter] = useState('')
    const [naming, setNaming] = useState(null)
    const [deleting, setDeleting] = useState(null)

    const load = useCallback(() => {
        fetchAgentTree(bot.id)
            .then(data => {
                setTree(data)
                setError(null)
            })
            .catch(failure => setError(failure.message))
    }, [bot.id])

    useEffect(load, [load])
    useEffect(() => {
        const onChange = event => event.detail?.botId === bot.id && load()
        window.addEventListener('gemini:files', onChange)
        return () => window.removeEventListener('gemini:files', onChange)
    }, [bot.id, load])

    const rows = useMemo(() => flatten(tree?.items ?? [], open, filter.trim().toLowerCase()), [tree, open, filter])
    const toggle = folder =>
        setOpen(current => {
            const next = new Set(current)
            next.has(folder) ? next.delete(folder) : next.add(folder)
            return next
        })

    const create = async name => {
        const target = naming.parent ? `${naming.parent}/${name}` : name
        try {
            if (naming.kind === 'folder') await makeAgentFolder(bot.id, target)
            else await writeAgentFile(bot.id, target, '')
            setNaming(null)
            load()
            if (naming.kind === 'file') onOpenFile(target)
        } catch (failure) {
            notify.error(failure.message)
        }
    }

    const askDelete = async item => {
        try {
            const answer = await askDeleteAgentPath(bot.id, item.path)
            setDeleting(answer)
        } catch (failure) {
            notify.error(failure.message)
        }
    }

    return (
        <aside
            className="agent-files"
            aria-label={`Arquivos de ${bot.name}`}
        >
            <div className="af-head">
                <b>Arquivos</b>
                {canWrite && (
                    <>
                        <button
                            className="icon-btn"
                            title="Novo arquivo"
                            aria-label="Novo arquivo"
                            onClick={() => setNaming({ kind: 'file', parent: '' })}
                        >
                            <i className="ti ti-file-plus" />
                        </button>
                        <button
                            className="icon-btn"
                            title="Nova pasta"
                            aria-label="Nova pasta"
                            onClick={() => setNaming({ kind: 'folder', parent: '' })}
                        >
                            <i className="ti ti-folder-plus" />
                        </button>
                    </>
                )}
                <button
                    className="icon-btn"
                    title="Fechar arquivos"
                    aria-label="Fechar arquivos"
                    onClick={onClose}
                >
                    <i className="ti ti-x" />
                </button>
            </div>
            <span
                className="af-root"
                title="Só a pasta deste agente. O terminal dele começa aqui."
            >
                {tree?.root || '…'}
            </span>
            <label className="af-filter">
                <i className="ti ti-search" />
                <input
                    value={filter}
                    onChange={event => setFilter(event.target.value)}
                    placeholder="Filtrar"
                    aria-label="Filtrar arquivos"
                />
            </label>
            {error ? (
                <p className="af-msg">Não consegui ler a pasta: {error}</p>
            ) : tree === null ? (
                <div className="af-list">
                    {[0, 1, 2, 3, 4].map(key => (
                        <span
                            key={key}
                            className="af-skel"
                        />
                    ))}
                </div>
            ) : rows.length === 0 ? (
                <p className="af-msg">{filter ? 'Nada com esse nome.' : 'A pasta está vazia. Peça ao agente para criar algo, ou crie um arquivo.'}</p>
            ) : (
                <ul
                    className="af-list"
                    role="tree"
                >
                    {rows.map(row => (
                        <li
                            key={row.path}
                            role="treeitem"
                            aria-expanded={row.kind === 'folder' ? row.isOpen : undefined}
                            className={`af-row${row.mark ? ' marked' : ''}`}
                            style={{ paddingLeft: 10 + row.depth * 16 }}
                        >
                            <button
                                className="af-name"
                                onClick={() => (row.kind === 'folder' ? toggle(row.path) : row.kind === 'file' && onOpenFile(row.path))}
                                title={row.path}
                            >
                                {row.kind === 'folder' ? <i className={`ti ti-chevron-${row.isOpen ? 'down' : 'right'} af-chev`} /> : <span className="af-chev" />}
                                <i className={`ti ${iconOf(row)}`} />
                                <span className="n">{row.name}</span>
                            </button>
                            {row.mark && (
                                <span
                                    className={`af-mark ${row.mark === 'A' ? 'added' : 'changed'}`}
                                    title={row.mark === 'A' ? 'Criado agora' : 'Alterado agora'}
                                >
                                    {row.mark}
                                </span>
                            )}
                            {canWrite && row.kind !== 'link' && (
                                <button
                                    className="af-del"
                                    title={`Apagar ${row.name}`}
                                    aria-label={`Apagar ${row.name}`}
                                    onClick={() => askDelete(row)}
                                >
                                    <i className="ti ti-trash" />
                                </button>
                            )}
                        </li>
                    ))}
                </ul>
            )}
            {naming && (
                <NameModal
                    title={naming.kind === 'folder' ? 'Nova pasta' : 'Novo arquivo'}
                    icon={naming.kind === 'folder' ? 'ti-folder-plus' : 'ti-file-plus'}
                    initial={naming.kind === 'folder' ? 'nova-pasta' : 'novo.md'}
                    action="Criar"
                    onSave={create}
                    onClose={() => setNaming(null)}
                />
            )}
            {deleting && (
                <DeleteModal
                    opened
                    target={deleting.path}
                    context={deleting.kind === 'folder' ? `Pasta com ${deleting.inside} itens dentro` : 'Arquivo da pasta deste agente'}
                    consequences={['Apagar não tem volta.']}
                    confirmLabel={deleting.kind === 'folder' ? 'Apagar a pasta' : 'Apagar o arquivo'}
                    onClose={() => setDeleting(null)}
                    onConfirm={async () => {
                        try {
                            await deleteAgentPath(bot.id, deleting.path, deleting.code)
                            setDeleting(null)
                            load()
                        } catch (failure) {
                            notify.error(failure.message)
                        }
                    }}
                />
            )}
        </aside>
    )
}

/** The visible rows: open folders expanded; with a filter, every match and its parents. */
export function flatten(items, open, filter, depth = 0) {
    const rows = []
    for (const item of items) {
        const children = item.children ?? []
        const inside = item.kind === 'folder' ? flatten(children, open, filter, depth + 1) : []
        const isMatch = !filter || item.name.toLowerCase().includes(filter)
        if (filter && !isMatch && inside.length === 0) continue
        const isOpen = Boolean(filter) || open.has(item.path)
        rows.push({ path: item.path, name: item.name, kind: item.kind, mark: item.mark ?? folderMark(item), depth, isOpen })
        if (item.kind === 'folder' && isOpen) rows.push(...inside)
    }
    return rows
}

/** A folder shows a mark when something inside it changed. */
function folderMark(item) {
    if (item.kind !== 'folder' || !item.children) return null
    for (const child of item.children) if (child.mark || folderMark(child)) return 'M'
    return null
}

function iconOf(row) {
    if (row.kind === 'folder') return row.isOpen ? 'ti-folder-open' : 'ti-folder'
    if (row.kind === 'link') return 'ti-link'
    if (/\.(png|jpe?g|gif|webp|svg)$/i.test(row.name)) return 'ti-photo'
    if (/\.(md|markdown)$/i.test(row.name)) return 'ti-markdown'
    if (/\.(json|ya?ml|toml)$/i.test(row.name)) return 'ti-braces'
    if (/\.(js|jsx|ts|tsx|py|go|rs|sh|css|html|sql|swift)$/i.test(row.name)) return 'ti-code'
    return 'ti-file-text'
}
