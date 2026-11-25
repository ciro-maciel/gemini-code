import { useEffect, useRef, useState } from 'react';

import { ApprovalDock, Thread } from './Thread';
import { useAccount } from '../components/Session';
import { VoiceMode } from '../components/VoiceMode';
import { AuditTrail } from '../components/AuditTrail';
import { AgentAvatar } from '../shell/AgentAvatar';
import { Composer } from './Composer';
import { BuildRow } from './BuildRow';
import { AgentFiles } from './AgentFiles';
import { useAgentConversation } from './use-agent-conversation';
import { releaseContext } from '../services/api';
import { notify } from '../components/zen';
import {
  MarkedButton,
  ResultsBar,
  useBookmarks,
  VersionsButton,
} from './ConversationExtras';

const money = (value) => `US$ ${(value || 0).toFixed(2).replace('.', ',')}`;

// Where the conversation's latest request came from, as the prototype labels it.
function originOf(events) {
  const last = [...(events ?? [])]
    .reverse()
    .find((event) => event.type === 'user_message')?.data;
  if (!last) return { icon: 'ti-user', label: 'Pessoa' };
  if (last.routine)
    return {
      icon: 'ti-clock-play',
      label: `Routine · ${last.routine.name || last.routine}`,
    };
  if (last.inbound) return { icon: 'ti-webhook', label: 'Inbound endpoint' };
  if (last.handoff)
    return {
      icon: 'ti-arrows-exchange',
      label: `Handoff from ${last.handoff.fromName || last.handoff.from || 'outro agente'}`,
    };
  return { icon: 'ti-user', label: 'Pessoa' };
}

/**
 * An agent on the Mesa: the header that opens its own settings, the
 * conversation (or its trail), and the box with the setup chips.
 */
export function AgentTab({
  bot,
  isVisible,
  template,
  modelLabel,
  suggestions = [],
  onOpenSettings,
  onOpenFile,
  onOpenRepoFile = null,
}) {
  const account = useAccount();
  const conversation = useAgentConversation(bot.id, { isVisible });
  const bookmarks = useBookmarks(bot.id);
  const {
    events,
    rows,
    thread,
    streaming,
    isSending,
    isWorking,
    rewindPoint,
    composerRef,
  } = conversation;
  const [view, setView] = useState('conv');
  // The agent's folder sits next to its conversation (the files MCP's tree); it remembers being closed.
  const [isFilesOpen, setIsFilesOpen] = useState(() => readFilesOpen());
  const [isVoice, setIsVoice] = useState(false);
  const [isDropping, setIsDropping] = useState(false);
  const threadRef = useRef(null);
  const isAtBottomRef = useRef(true);
  const lastTopRef = useRef(0);

  // The end of the conversation holds: opened or reloaded, the thread starts
  // there, and while the person stays there it follows everything that grows
  // it (new rows, rows drawn at their real height, images that load). Only
  // their own scroll up lets go; scrolling back down holds again (30/10).
  useEffect(() => {
    const box = threadRef.current;
    if (box && isAtBottomRef.current) box.scrollTop = box.scrollHeight;
  }, [events, thread, streaming, view, isVisible]);

  // A row shown from a list (Entregue, Marcadas) lets go of the end, as a scroll up would.
  useEffect(() => {
    const box = threadRef.current;
    if (!box) return;
    const letGo = () => (isAtBottomRef.current = false);
    box.addEventListener('assistant:let-go', letGo);
    return () => box.removeEventListener('assistant:let-go', letGo);
  }, []);

  useEffect(() => {
    // "Abrir os documentos" from elsewhere now opens the agent's folder.
    const onView = (event) => {
      if (event.detail?.botId !== bot.id || !event.detail?.view) return;
      if (event.detail.view === 'docs') {
        writeFilesOpen(true);
        setIsFilesOpen(true);
      } else setView(event.detail.view);
    };
    window.addEventListener('assistant:agent-view', onView);
    return () => window.removeEventListener('assistant:agent-view', onView);
  }, [bot.id]);

  useEffect(() => {
    const box = threadRef.current;
    const inner = box?.firstElementChild;
    if (!inner || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(() => {
      if (isAtBottomRef.current) box.scrollTop = box.scrollHeight;
    });
    observer.observe(inner);
    observer.observe(box);
    return () => observer.disconnect();
  }, []);

  // Only the owner changes the agent; a member who entered writes, one who reads follows.
  const isOwner = (bot.access ?? 'owner') === 'owner';
  // A computer that did not get ready never closes the box (30/10): the agent works without it and tries again when it needs it.
  const canWrite = bot.access !== 'read';
  // "Liberar contexto": what this conversation did not use leaves the next step.
  const releaseUnused = async () => {
    try {
      const freed = await releaseContext(bot.id);
      notify.success(
        'Context released',
        [
          freed.connected > 0 &&
            `${freed.connected} ${freed.connected === 1 ? 'ferramenta saiu' : 'ferramentas saíram'}`,
          freed.isComputer && 'the computer and browser were removed',
        ]
          .filter(Boolean)
          .join('; ') + '. The change takes effect on the next step.',
      );
      conversation.reloadThread();
    } catch (error) {
      notify.error(error.message);
    }
  };
  const members = bot.members ?? [];
  const others = conversation.seeing.filter(
    (person) => person.accountId !== account?.id,
  );
  // The same person in two windows (the Mac and the phone): both work, and each says so.
  const isOpenElsewhere =
    (conversation.seeing.find((person) => person.accountId === account?.id)
      ?.windows ?? 0) > 1;
  // Agents called here with @ join the people in the bar.
  const called = [
    ...new Map(
      rows
        .filter((row) => row.kind === 'colleague')
        .map((row) => [row.botId, { id: row.botId, name: row.name }]),
    ).values(),
  ];
  const crew = [
    bot.sharedBy
      ? { name: bot.sharedBy }
      : { name: account?.name || account?.email || 'You' },
    ...members,
  ];
  const origin = originOf(events);
  const cost = thread?.cost ?? 0;

  return (
    <div className={`agent-shell${isFilesOpen ? ' with-files' : ''}`}>
      <div
        className="conv"
        onDragOver={(event) => {
          if (!canWrite || !event.dataTransfer.types.includes('Files')) return;
          event.preventDefault();
          setIsDropping(true);
        }}
        onDragLeave={(event) =>
          !event.currentTarget.contains(event.relatedTarget) &&
          setIsDropping(false)
        }
        onDrop={(event) => {
          if (!event.dataTransfer.files.length) return;
          event.preventDefault();
          setIsDropping(false);
          composerRef.current?.addFiles(event.dataTransfer.files);
        }}
      >
        {isDropping && (
          <div className="drop-attach">
            <b>Drop to attach to {bot.name}</b>
          </div>
        )}
        <div className="conv-sub">
          {isOwner && (
            <button
              className="m-btn agent-chip"
              onClick={onOpenSettings}
              title="Agent settings: schedule, vault, and memory"
            >
              <i className="ti ti-adjustments-horizontal" />
              Agent settings
              <i className="ti ti-layout-sidebar-right" />
            </button>
          )}
          <span className="orig" title="Where this agent came from">
            <i className={`ti ${origin.icon}`} />
            {origin.label}
          </span>
          <span className="grow" />
          {isOpenElsewhere && (
            <span
              className="orig"
              title="You have this agent open in another window or device; both receive everything live"
            >
              <i className="ti ti-devices" />
              Also open in another window
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
              Conversation
            </button>
            <button
              className={view === 'trail' ? 'on' : ''}
              onClick={() => setView('trail')}
            >
              Trail
            </button>
          </span>
          <button
            className={`files-toggle${isFilesOpen ? ' on' : ''}`}
            aria-pressed={isFilesOpen}
            onClick={() => {
              writeFilesOpen(!isFilesOpen);
              setIsFilesOpen(!isFilesOpen);
            }}
            title="This agent's folder: only it works there"
          >
            <i className="ti ti-folder" />
            Files
          </button>
        </div>
        {members.length > 0 && (
          <div className="banner">
            <i className="ti ti-users" />
            {isOwner ? (
              <span className="grow">
                <b>Shared</b> · Each message goes to the agent with the sender’s
                name. Runs as you, on your plan.
              </span>
            ) : (
              <span className="grow">
                <b>Shared by {bot.sharedBy}</b> ·{' '}
                {bot.access === 'read'
                  ? 'You watch live without sending messages.'
                  : "Your message goes to the agent under your name. It runs on the creator's plan."}
              </span>
            )}
          </div>
        )}
        {(members.length > 0 || called.length > 0) && (
          <div className="crew">
            <span className="muted" style={{ whiteSpace: 'nowrap' }}>
              {crew.length} {crew.length === 1 ? 'pessoa' : 'pessoas'},{' '}
              {called.length + 1} {called.length ? 'agentes' : 'agente'}
            </span>
            {crew.map((person) => (
              <span className="who" key={person.email || person.name}>
                <span className="av sm">
                  {person.name.slice(0, 2).toUpperCase()}
                </span>
                {person.name}
              </span>
            ))}
            <span className="who">
              <AgentAvatar bot={bot} icon={template?.icon} size="sm" />
              {bot.name}
            </span>
            {called.map((agent) => (
              <span className="who" key={agent.id}>
                <AgentAvatar bot={agent} size="sm" />
                {agent.name}
              </span>
            ))}
            <span className="grow" />
            {others.length > 0 && (
              <span className="seeing">
                <i className="ti ti-eye" />
                viewing now
                {others.map((person) => (
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
          onWheel={(event) => {
            if (event.deltaY < 0) isAtBottomRef.current = false;
          }}
          onScroll={(event) => {
            const box = event.currentTarget;
            const isUp = box.scrollTop < lastTopRef.current - 1;
            lastTopRef.current = box.scrollTop;
            if (isUp) isAtBottomRef.current = false;
            else if (box.scrollHeight - box.scrollTop - box.clientHeight < 8)
              isAtBottomRef.current = true;
          }}
        >
          <div className="thread-inner">
            {view === 'trail' ? (
              <div className="trail">
                <p className="fine">
                  Every action by this agent, who did it, when, and what allowed
                  it. Notes between people aren’t included.
                </p>
                <AuditTrail botId={bot.id} />
              </div>
            ) : events !== null && rows.length === 0 && !streaming ? (
              <div className="conv-empty">
                <AgentAvatar bot={bot} icon={template?.icon} />
                <b>{bot.name}</b>
                <p className="muted">
                  Ask anything. It uses its own computer, connects to your apps,
                  and asks for your approval before sending, paying, or
                  deleting.
                </p>
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
            You follow this agent. To send messages, ask {bot.sharedBy} o acesso
            “pode entrar”.
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
            build={isOwner ? <BuildRow bot={bot} isStarted /> : null}
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
            <ResultsBar rows={rows} onOpenFile={onOpenFile} />
          )}
          <span className="cfoot-cost">
            {template ? `Started from template ${template.name} ·` : ''}
            {money(cost)} neste agente
          </span>
        </div>
      </div>
      {isFilesOpen && (
        <AgentFiles
          bot={bot}
          canWrite={canWrite}
          onOpenFile={(path) => onOpenFile(`${bot.id}/${path}`)}
          onClose={() => {
            writeFilesOpen(false);
            setIsFilesOpen(false);
          }}
        />
      )}
    </div>
  );
}

const FILES_OPEN_KEY = 'gemini-code:agent-files-open';
function readFilesOpen() {
  try {
    return localStorage.getItem(FILES_OPEN_KEY) !== '0';
  } catch {
    return true;
  }
}
function writeFilesOpen(isOpen) {
  try {
    localStorage.setItem(FILES_OPEN_KEY, isOpen ? '1' : '0');
  } catch {}
}
