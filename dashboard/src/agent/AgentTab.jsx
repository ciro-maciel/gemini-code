import { useEffect, useRef, useState } from 'react'

import { canWork } from '../labels'
import { ApprovalDock, Thread } from './Thread'
import { useAccount } from '../components/Session'
import { VoiceMode } from '../components/VoiceMode'
import { TeachScreen } from '../components/TeachScreen'
import { TakeoverScreen } from '../components/TakeoverScreen'
import { AuditTrail } from '../components/AuditTrail'
import { AgentAvatar } from '../shell/AgentAvatar'
import { Composer } from './Composer'
import { BuildRow } from './BuildRow'
import { AgentFiles } from './AgentFiles'
import { useAgentConversation } from './use-agent-conversation'
import { releaseContext } from '../services/api'
import { notify } from '../components/zen'
import { ShareModal } from './ShareModal'
import { MarkedButton, ResultsBar, useBookmarks, VersionsButton } from './ConversationExtras'

const money = value => `US$ ${(value || 0).toFixed(2).replace('.', ',')}`

// Where the conversation's latest request came from, as the prototype labels it.
function originOf(events) {
    const last = [...(events ?? [])].reverse().find(event => event.type === 'user_message')?.data
    if (!last) return { icon: 'ti-user', label: 'Pessoa' }
    if (last.routine) return { icon: 'ti-clock-play', label: `Rotina · ${last.routine.name || last.routine}` }
    if (last.inbound) return { icon: 'ti-webhook', label: 'Porta de entrada' }
    if (last.handoff) return { icon: 'ti-arrows-exchange', label: `Passagem de ${last.handoff.fromName || last.handoff.from || 'outro agente'}` }
    return { icon: 'ti-user', label: 'Pessoa' }
}

/**
 * An agent on the Mesa: the header that opens its own settings, the
 * conversation (or its trail), and the box with the setup chips.
 */
export function AgentTab({ bot, isVisible, template, modelLabel, suggestions = [], onOpenSettings, onOpenScreen, onOpenFile, onOpenRepoFile = null }) {
    const account = useAccount()
    const conversation = useAgentConversation(bot.id, { isVisible })
    const bookmarks = useBookmarks(bot.id)
    const { events, rows, thread, streaming, isSending, isWorking, rewindPoint, composerRef } = conversation
    const [view, setView] = useState('conv')
    // The agent's folder sits next to its conversation (the files MCP's tree); it remembers being closed.
    const [isFilesOpen, setIsFilesOpen] = useState(() => readFilesOpen())
    const [isVoice, setIsVoice] = useState(false)
    const [isTeaching, setIsTeaching] = useState(false)
    const [isFullscreen, setIsFullscreen] = useState(false)
    const [isDropping, setIsDropping] = useState(false)
    const [isSharing, setIsSharing] = useState(false)
    const threadRef = useRef(null)
    const isAtBottomRef = useRef(true)
    const lastTopRef = useRef(0)

    // The end of the conversation holds: opened or reloaded, the thread starts
    // there, and while the person stays there it follows everything that grows
    // it (new rows, rows drawn at their real height, images that load). Only
    // their own scroll up lets go; scrolling back down holds again (30/10).
    useEffect(() => {
        const box = threadRef.current
        if (box && isAtBottomRef.current) box.scrollTop = box.scrollHeight
    }, [events, thread, streaming, view, isVisible])

    // A row shown from a list (Entregue, Marcadas) lets go of the end, as a scroll up would.
    useEffect(() => {
        const box = threadRef.current
        if (!box) return
        const letGo = () => (isAtBottomRef.current = false)
        box.addEventListener('assistant:let-go', letGo)
        return () => box.removeEventListener('assistant:let-go', letGo)
    }, [])

    useEffect(() => {
        // "Abrir os documentos" from elsewhere now opens the agent's folder.
        const onView = event => {
            if (event.detail?.botId !== bot.id || !event.detail?.view) return
            if (event.detail.view === 'docs') {
                writeFilesOpen(true)
                setIsFilesOpen(true)
            } else setView(event.detail.view)
        }
        window.addEventListener('assistant:agent-view', onView)
        return () => window.removeEventListener('assistant:agent-view', onView)
    }, [bot.id])

    useEffect(() => {
        const box = threadRef.current
        const inner = box?.firstElementChild
        if (!inner || typeof ResizeObserver === 'undefined') return
        const observer = new ResizeObserver(() => {
            if (isAtBottomRef.current) box.scrollTop = box.scrollHeight
        })
        observer.observe(inner)
        observer.observe(box)
        return () => observer.disconnect()
    }, [])

    const isReady = canWork(bot.status)
    // Only the owner changes the agent; a member who entered writes, one who reads follows.
    const isOwner = (bot.access ?? 'owner') === 'owner'
    // A computer that did not get ready never closes the box (30/10): the agent works without it and tries again when it needs it.
    const canWrite = bot.access !== 'read'
    // "Liberar contexto": what this conversation did not use leaves the next step.
    const releaseUnused = async () => {
        try {
            const freed = await releaseContext(bot.id)
            notify.success(
                'Contexto liberado',
                [freed.connected > 0 && `${freed.connected} ${freed.connected === 1 ? 'ferramenta saiu' : 'ferramentas saíram'}`, freed.isComputer && 'o computador e o navegador saíram'].filter(Boolean).join('; ') +
                    '. O efeito aparece no próximo passo.'
            )
            conversation.reloadThread()
        } catch (error) {
            notify.error(error.message)
        }
    }
    const members = bot.members ?? []
    const others = conversation.seeing.filter(person => person.accountId !== account?.id)
    // The same person in two windows (the Mac and the phone): both work, and each says so.
    const isOpenElsewhere = (conversation.seeing.find(person => person.accountId === account?.id)?.windows ?? 0) > 1
    // Agents called here with @ join the people in the bar.
    const called = [...new Map(rows.filter(row => row.kind === 'colleague').map(row => [row.botId, { id: row.botId, name: row.name }])).values()]
    const crew = [bot.sharedBy ? { name: bot.sharedBy } : { name: account?.name || account?.email || 'Você' }, ...members]
    const origin = originOf(events)
    const cost = thread?.cost ?? 0

    return (
        <div className={`agent-shell${isFilesOpen ? ' with-files' : ''}`}>
            <div
                className="conv"
                onDragOver={event => {
                    if (!canWrite || !event.dataTransfer.types.includes('Files')) return
                    event.preventDefault()
                    setIsDropping(true)
                }}
                onDragLeave={event => !event.currentTarget.contains(event.relatedTarget) && setIsDropping(false)}
                onDrop={event => {
                    if (!event.dataTransfer.files.length) return
                    event.preventDefault()
                    setIsDropping(false)
                    composerRef.current?.addFiles(event.dataTransfer.files)
                }}
            >
                {isDropping && (
                    <div className="drop-attach">
                        <b>Solte pra anexar a {bot.name}</b>
                    </div>
                )}
                <div className="conv-sub">
                    {isOwner && (
                        <button
                            className="m-btn agent-chip"
                            onClick={onOpenSettings}
                            title="Ajustes deste agente: quando, cofre e memória"
                        >
                            <i className="ti ti-adjustments-horizontal" />
                            Ajustes do agente
                            <i className="ti ti-layout-sidebar-right" />
                        </button>
                    )}
                    <span
                        className="orig"
                        title="De onde veio este agente"
                    >
                        <i className={`ti ${origin.icon}`} />
                        {origin.label}
                    </span>
                    <span className="grow" />
                    {isOpenElsewhere && (
                        <span
                            className="orig"
                            title="Você está com este agente aberto em outra janela ou aparelho; as duas recebem tudo ao vivo"
                        >
                            <i className="ti ti-devices" />
                            Aberta também em outra janela
                        </span>
                    )}
                    <MarkedButton bookmarks={bookmarks} />
                    <VersionsButton
                        bot={bot}
                        account={account}
                        modelLabel={modelLabel}
                        refreshKey={conversation.loadKey}
                    />
                    <span className="seg-sm tiny">
                        <button
                            className={view === 'conv' ? 'on' : ''}
                            onClick={() => setView('conv')}
                        >
                            Conversa
                        </button>
                        <button
                            className={view === 'trail' ? 'on' : ''}
                            onClick={() => setView('trail')}
                        >
                            Trilha
                        </button>
                    </span>
                    <button
                        className={`files-toggle${isFilesOpen ? ' on' : ''}`}
                        aria-pressed={isFilesOpen}
                        onClick={() => {
                            writeFilesOpen(!isFilesOpen)
                            setIsFilesOpen(!isFilesOpen)
                        }}
                        title="A pasta deste agente: só ele trabalha nela"
                    >
                        <i className="ti ti-folder" />
                        Arquivos
                    </button>
                    {isOwner && (
                        <button
                            className="share"
                            onClick={() => setIsSharing(true)}
                        >
                            <i className="ti ti-user-share" />
                            Compartilhar
                        </button>
                    )}
                </div>
                {members.length > 0 && (
                    <div className="banner">
                        <i className="ti ti-users" />
                        {isOwner ? (
                            <span className="grow">
                                <b>Compartilhada</b> · Cada mensagem vai pro agente com o nome de quem mandou. Roda como você, no seu plano.
                            </span>
                        ) : (
                            <span className="grow">
                                <b>Compartilhada por {bot.sharedBy}</b> · {bot.access === 'read' ? 'Você acompanha ao vivo, sem mandar mensagem.' : 'Sua mensagem vai pro agente com o seu nome. Roda no plano de quem criou.'}
                            </span>
                        )}
                        {isOwner && (
                            <button
                                className="btn outline sm"
                                onClick={() => setIsSharing(true)}
                            >
                                Gerenciar
                            </button>
                        )}
                    </div>
                )}
                {(members.length > 0 || called.length > 0) && (
                    <div className="crew">
                        <span
                            className="muted"
                            style={{ whiteSpace: 'nowrap' }}
                        >
                            {crew.length} {crew.length === 1 ? 'pessoa' : 'pessoas'}, {called.length + 1} {called.length ? 'agentes' : 'agente'}
                        </span>
                        {crew.map(person => (
                            <span
                                className="who"
                                key={person.email || person.name}
                            >
                                <span className="av sm">{person.name.slice(0, 2).toUpperCase()}</span>
                                {person.name}
                            </span>
                        ))}
                        <span className="who">
                            <AgentAvatar
                                bot={bot}
                                icon={template?.icon}
                                size="sm"
                            />
                            {bot.name}
                        </span>
                        {called.map(agent => (
                            <span
                                className="who"
                                key={agent.id}
                            >
                                <AgentAvatar
                                    bot={agent}
                                    size="sm"
                                />
                                {agent.name}
                            </span>
                        ))}
                        <span className="grow" />
                        {others.length > 0 && (
                            <span className="seeing">
                                <i className="ti ti-eye" />
                                vendo agora
                                {others.map(person => (
                                    <span
                                        key={person.accountId}
                                        className="av sm"
                                        title={person.name}
                                    >
                                        {person.name.slice(0, 2).toUpperCase()}
                                    </span>
                                ))}
                            </span>
                        )}
                    </div>
                )}
                <div
                    className="thread"
                    ref={threadRef}
                    // Any move up lets go at once, even a slow drag: a margin near the end
                    // pulled it back on every new word, and the screen shook (30/10). Only
                    // reaching the end again holds it.
                    onWheel={event => {
                        if (event.deltaY < 0) isAtBottomRef.current = false
                    }}
                    onScroll={event => {
                        const box = event.currentTarget
                        const isUp = box.scrollTop < lastTopRef.current - 1
                        lastTopRef.current = box.scrollTop
                        if (isUp) isAtBottomRef.current = false
                        else if (box.scrollHeight - box.scrollTop - box.clientHeight < 8) isAtBottomRef.current = true
                    }}
                >
                    <div className="thread-inner">
                        {view === 'trail' ? (
                            <div className="trail">
                                <p className="fine">Cada ação deste agente, com quem fez, quando e o que a liberou. Notas entre pessoas não entram.</p>
                                <AuditTrail botId={bot.id} />
                            </div>
                        ) : events !== null && rows.length === 0 && !streaming ? (
                            <div className="conv-empty">
                                <AgentAvatar
                                    bot={bot}
                                    icon={template?.icon}
                                />
                                <b>{bot.name}</b>
                                <p className="muted">Peça qualquer coisa. Ele usa o computador dele, conecta nos seus aplicativos e pede sua aprovação antes de enviar, pagar ou apagar.</p>
                            </div>
                        ) : (
                            <Thread
                                bot={bot}
                                account={account}
                                modelLabel={modelLabel}
                                rows={rows}
                                isWorking={isWorking}
                                thread={thread}
                                streamingText={streaming?.text || ''}
                                thinkingText={conversation.thinking}
                                onOpenScreen={onOpenScreen}
                                onOpenTakeover={() => setIsFullscreen(true)}
                                onOpenFile={onOpenFile}
                                onOpenRepoFile={onOpenRepoFile}
                                onResolved={conversation.reloadThread}
                                onRewind={isOwner ? conversation.startRewind : null}
                                onSendNote={canWrite ? conversation.sendNoteToAgent : null}
                                rewindFromSeq={rewindPoint?.seq ?? null}
                                bookmarked={bookmarks.ids}
                                onBookmark={bookmarks.toggle}
                            />
                        )}
                    </div>
                </div>
                {view !== 'trail' && (
                    <ApprovalDock
                        rows={rows}
                        thread={thread}
                        onResolved={conversation.reloadThread}
                    />
                )}
                {bot.access === 'read' ? (
                    <div className="read-only">
                        <i className="ti ti-eye" />
                        Você acompanha este agente. Para mandar mensagem, peça a {bot.sharedBy} o acesso "pode entrar".
                    </div>
                ) : isVoice ? (
                    <div className="composer voice">
                        <VoiceMode
                            bot={bot}
                            thread={thread}
                            events={events}
                            streaming={streaming}
                            onExit={() => setIsVoice(false)}
                        />
                    </div>
                ) : (
                    <Composer
                        ref={composerRef}
                        botId={bot.id}
                        build={
                            isOwner ? (
                                <BuildRow
                                    bot={bot}
                                    isStarted
                                />
                            ) : null
                        }
                        canWrite={canWrite}
                        isSending={isSending}
                        isWorking={isWorking}
                        rewind={rewindPoint}
                        onCancelRewind={conversation.cancelRewind}
                        queue={thread?.queue ?? []}
                        onSend={conversation.send}
                        onAsk={canWrite ? conversation.ask : null}
                        onUnqueue={conversation.unqueue}
                        onStop={conversation.stop}
                        onTeach={isReady && isOwner ? () => setIsTeaching(true) : null}
                        onVoice={() => setIsVoice(true)}
                        onNote={members.length > 0 ? conversation.note : null}
                        suggestions={suggestions}
                        workSeconds={thread?.workSeconds ?? 0}
                        contextShare={thread?.contextShare ?? null}
                        context={thread?.context ?? null}
                        releasable={thread?.releasable ?? null}
                        onReleaseContext={canWrite ? releaseUnused : null}
                    />
                )}
                <div className="cfoot">
                    {view !== 'trail' && (
                        <ResultsBar
                            rows={rows}
                            onOpenFile={onOpenFile}
                        />
                    )}
                    <span className="cfoot-cost">
                        {template ? `Começou do modelo ${template.name} · ` : ''}
                        {money(cost)} neste agente
                    </span>
                </div>
                {isSharing && (
                    <ShareModal
                        bot={bot}
                        onClose={() => setIsSharing(false)}
                    />
                )}
                {isReady && (
                    <TeachScreen
                        bot={bot}
                        opened={isTeaching}
                        onClose={() => setIsTeaching(false)}
                    />
                )}
                {isReady && (
                    <TakeoverScreen
                        bot={bot}
                        opened={isFullscreen}
                        onClose={() => setIsFullscreen(false)}
                        onReturn={note => {
                            setIsFullscreen(false)
                            conversation.giveBack(note)
                        }}
                    />
                )}
            </div>
            {isFilesOpen && (
                <AgentFiles
                    bot={bot}
                    canWrite={canWrite}
                    onOpenFile={path => onOpenFile(`${bot.id}/${path}`)}
                    onClose={() => {
                        writeFilesOpen(false)
                        setIsFilesOpen(false)
                    }}
                />
            )}
        </div>
    )
}

const FILES_OPEN_KEY = 'gemini-code:agent-files-open'
function readFilesOpen() {
    try {
        return localStorage.getItem(FILES_OPEN_KEY) !== '0'
    } catch {
        return true
    }
}
function writeFilesOpen(isOpen) {
    try {
        localStorage.setItem(FILES_OPEN_KEY, isOpen ? '1' : '0')
    } catch {}
}
