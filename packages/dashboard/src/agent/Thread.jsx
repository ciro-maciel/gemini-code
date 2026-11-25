import { Fragment, useEffect, useState } from 'react';

import { attachmentUrl, pageCaptureUrl } from '../services/api';
import {
  ApprovalCard,
  ConnectCard,
  FailedCard,
} from '../components/InlineCards';
import { ArtifactCard } from '../components/Artifact';
import { SkillCard } from '../components/Skills';
import { RichText } from '../components/RichText';
import {
  describeTool,
  summarizeSteps,
  placeOf,
} from '../components/describe-tool';
import { AgentAvatar } from '../shell/AgentAvatar';
import { decisionText } from './decision';
import { messageWhen } from '../labels';

const initials = (account) =>
  (account?.name || account?.email || 'eu').slice(0, 2).toUpperCase();

// "Pensando… · 12s": how long the turn being made has been at it.
function Since({ from }) {
  const [, tick] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => tick((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, []);
  return <span>{Math.max(0, Math.round((Date.now() - from) / 1000))}s</span>;
}

function Tool({ step }) {
  const [isOpen, setIsOpen] = useState(false);
  const info = describeTool(step.name, step.args || {});
  return (
    <div
      className={`tool${isOpen ? ' open' : ''}${step.isError ? ' err' : ''}`}
      role="button"
      tabIndex={0}
      onClick={() => setIsOpen(!isOpen)}
    >
      <i
        className={`ti ${step.result === undefined ? 'ti-loader-2 spin' : 'ti-chevron-right'}`}
      />
      <b>{info.text}</b>
      {info.detail && <span className="mono">{info.detail}</span>}
      <div className="out mono">{step.result ?? '…'}</div>
    </div>
  );
}

// One reply carries the agent's face and name once; what follows it, until the person speaks, continues under it.
function AgentMessage({
  bot,
  modelLabel,
  isContinued = false,
  rowId = null,
  children,
}) {
  return (
    <div
      className={`m${isContinued ? ' cont' : ''}`}
      data-row={rowId ?? undefined}
    >
      <AgentAvatar bot={bot} />
      <div className="body">
        {!isContinued && (
          <div className="who">
            {bot.name}
            {modelLabel && <small>{modelLabel}</small>}
          </div>
        )}
        {children}
      </div>
    </div>
  );
}

// The steps between two things the agent said, closed into one line: what it did, or, while it
// works, the step it is on. A click opens each step and what came back.
function Steps({ steps, isLive }) {
  const [isOpen, setIsOpen] = useState(false);
  const current = isLive ? steps.at(-1) : null;
  const now = current ? describeTool(current.name, current.args || {}) : null;
  const isRunning = isLive && current?.result === undefined;
  // Red only for what stayed undone; a step the agent did again is part of the work ("refeito").
  const errors = steps.filter((step) => step.isError && !step.recovered).length;
  const redone = steps.filter((step) => step.isError && step.recovered).length;
  const summary = summarizeSteps(steps);
  return (
    <div className={`steps${isOpen ? ' open' : ''}`}>
      <button
        className="steps-head"
        aria-expanded={isOpen}
        onClick={() => setIsOpen(!isOpen)}
      >
        <i
          className={`ti ${isRunning ? 'ti-loader-2 spin' : 'ti-chevron-right'}`}
        />
        <span className="steps-text">{now ? now.text : summary}</span>
        {now?.detail && <span className="mono">{now.detail}</span>}
        {!now && steps.length > 1 && !summary.endsWith(`${steps.length}×`) && (
          <span className="steps-count">{steps.length} passos</span>
        )}
        {redone > 0 && <span className="steps-count">refeito</span>}
        {errors > 0 && (
          <span className="steps-err">
            {errors === 1 ? '1 not done' : `${errors} not done`}
          </span>
        )}
      </button>
      {isOpen && (
        <div className="tools">
          {steps.map((step) => (
            <Tool key={step.id} step={step} />
          ))}
        </div>
      )}
    </div>
  );
}

const secondsLabel = (seconds) =>
  seconds < 60
    ? `${Math.max(1, seconds)} s`
    : `${Math.round(seconds / 60)} min`;

/** The places of a turn's work, in the order they came: "memória, Blogs". */
function placesOf(row) {
  const places = [];
  for (const entry of row.entries)
    for (const step of entry.steps) {
      const place = placeOf(step.name);
      if (place && !places.includes(place)) places.push(place);
    }
  return places;
}

/**
 * The work of a turn ("Trabalho e resposta", 10/11/2026). While the agent works: one line that
 * changes, the step it is on in words. When it is done: that line becomes the summary ("6 passos ·
 * memória, Blogs · 38 s"), folded, and the answer is what stays on screen. Opened, the fold shows
 * everything in order: what the agent said on the way and each step. With no answer after it, the
 * last thing the agent said stays outside the fold, since it is what the person reads.
 */
function Work({ row, isLive, streamingText }) {
  const [isOpen, setIsOpen] = useState(false);
  const steps = row.entries.flatMap((entry) => entry.steps);
  const current = isLive ? steps.at(-1) : null;
  const now = current ? describeTool(current.name, current.args || {}) : null;
  const places = placesOf(row);
  const lastThought =
    !isLive && !row.hasAnswer
      ? row.entries.findLast((entry) => entry.thought)?.thought
      : null;
  const unresolved =
    row.unresolved ??
    steps.filter((step) => step.isError && !step.recovered).length;
  // While it works there is no box: the step it is on goes into the status line below (Thread).
  if (isLive)
    return streamingText ? (
      <div className="txt">
        <RichText text={streamingText} />
      </div>
    ) : null;
  // Words with no step (the agent spoke, then a card or a question came): nothing to fold, the words stay.
  if (!steps.length && !isLive)
    return row.entries
      .filter((entry) => entry.thought)
      .map((entry) => (
        <div key={entry.id} className="txt">
          <RichText text={entry.thought} />
        </div>
      ));
  const head = isLive
    ? `${now ? now.text : row.entries.at(-1)?.thought ? 'Thinking about the next step' : 'Starting'}${steps.length ? ` · step ${steps.length}` : ''}`
    : `${steps.length === 1 ? '1 step' : `${steps.length} steps`}${places.length ? ` · ${places.join(', ')}` : ''}${row.seconds ? ` · ${secondsLabel(row.seconds)}` : ''}`;
  return (
    <>
      <div className={`work${isOpen ? ' open' : ''}`}>
        <button
          className="work-head"
          aria-expanded={isOpen}
          onClick={() => setIsOpen(!isOpen)}
        >
          <i
            className={`ti ${isLive ? 'ti-loader-2 spin' : 'ti-chevron-right'}`}
          />
          <span className="work-text">{head}</span>
          {isLive && now?.detail && <span className="mono">{now.detail}</span>}
          {unresolved > 0 && (
            <span className="steps-err">
              {unresolved === 1 ? '1 not done' : `${unresolved} not done`}
            </span>
          )}
          <span className="work-toggle">{isOpen ? 'Hide' : 'Show'}</span>
        </button>
        {isOpen && (
          <div className="work-body">
            {row.entries.map((entry, index) => (
              <Fragment key={entry.id}>
                {entry.thought && (
                  <div className="txt thought">{entry.thought}</div>
                )}
                {entry.steps.length > 0 && (
                  <Steps
                    steps={entry.steps}
                    isLive={isLive && index === row.entries.length - 1}
                  />
                )}
              </Fragment>
            ))}
          </div>
        )}
      </div>
      {lastThought && (
        <div className="txt">
          <RichText text={lastThought} />
        </div>
      )}
      {isLive && streamingText && (
        <div className="txt">
          <RichText text={streamingText} />
        </div>
      )}
    </>
  );
}

function originLabel(row) {
  if (row.choice)
    return `Choice · ${row.choice.title}${row.choice.item ? ` · ${row.choice.item}` : ''}`;
  if (row.routine) return `Routine · ${row.routine.name}`;
  if (row.inbound)
    return `Inbox${row.inbound.from ? ` · ${row.inbound.from}` : ''}`;
  if (row.handoff) return `Handoff from ${row.handoff.from}`;
  return null;
}

// Under an answer: the memories the agent had in front of it, opened on a click.
function MemLine({ memories }) {
  const [isOpen, setIsOpen] = useState(false);
  return (
    <>
      <button className="memline" onClick={() => setIsOpen(!isOpen)}>
        <i className="ti ti-brain" />
        usou {memories.length} {memories.length === 1 ? 'memory' : 'memories'}
        <i className={`ti ${isOpen ? 'ti-chevron-up' : 'ti-chevron-down'}`} />
      </button>
      {isOpen && (
        <div className="memlist">
          {memories.map((text, index) => (
            <div key={index}>
              <i className="ti ti-point" />
              {text}
            </div>
          ))}
        </div>
      )}
    </>
  );
}

// "Entre nós": a dashed note between the people; whoever wrote it can send it to the agent.
function NoteMessage({ row, account, onSend }) {
  const isMine = row.accountId === account?.id;
  return (
    <div className={`m person${isMine ? ' mine' : ''}`}>
      <span className="av">
        {isMine ? initials(account) : row.author.slice(0, 2).toUpperCase()}
      </span>
      <div className="body">
        {isMine ? (
          <div className="me-label">You</div>
        ) : (
          <div className="who">{row.author}</div>
        )}
        <div className="note">
          <span className="label">
            <i className="ti ti-lock" />
            {isMine ? 'Your note' : `Note from ${row.author}`} · o agente não vê
          </span>
          <div className="txt">
            <RichText text={row.text} />
          </div>
          {isMine && onSend && (
            <button
              className="btn outline sm note-btn"
              onClick={() => onSend(row.id)}
            >
              Send to agent
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

// One clock for every time on screen: each label redraws on its tick, not on its own timer.
const listeners = new Set();
let clock = null;
function useClock() {
  const [, tick] = useState(0);
  useEffect(() => {
    const listener = () => tick((value) => value + 1);
    listeners.add(listener);
    clock ??= setInterval(() => listeners.forEach((each) => each()), 30_000);
    return () => {
      listeners.delete(listener);
      if (!listeners.size) {
        clearInterval(clock);
        clock = null;
      }
    };
  }, []);
}

/** When a message was sent, kept current while the conversation is open; the full date on hover. */
function When({ seconds }) {
  useClock();
  if (!seconds) return null;
  return (
    <time
      className="when"
      dateTime={new Date(seconds * 1000).toISOString()}
      title={new Date(seconds * 1000).toLocaleString('pt-BR', {
        dateStyle: 'full',
        timeStyle: 'short',
      })}
    >
      {messageWhen(seconds)}
    </time>
  );
}

// What came through the entry door, in one line: the e-mail subject, else the event's start.
const inboundPreviewOf = (text) => {
  try {
    const event = JSON.parse(text);
    const subject = event?.data?.properties?.subject ?? event?.subject;
    const from = event?.data?.properties?.from ?? event?.from;
    if (subject) return from ? `${from}: ${subject}` : subject;
  } catch {}
  return String(text ?? '')
    .replace(/\s+/g, ' ')
    .slice(0, 140);
};

function UserMessage({ row, account, owner, isQueued, onRewind }) {
  const label = originLabel(row);
  // The entry door brings raw events: closed by default, a click shows what came.
  const [isOpen, setIsOpen] = useState(!row.inbound);
  const isFromPerson = !row.routine && !row.inbound && !row.handoff;
  // In a shared agent each message carries who sent it; one without a name
  // came before the sharing, from the owner. Only yours is "Você".
  const author = row.author || owner;
  const isMine =
    isFromPerson && (!author || author === (account?.name || account?.email));
  // Everything that asks the agent for work (the person, a routine, another agent, the
  // entry door) sits on the asking side; the agent answers on the left.
  return (
    <div className="m person mine">
      {isFromPerson ? (
        <span className="av">
          {isMine ? initials(account) : author.slice(0, 2).toUpperCase()}
        </span>
      ) : (
        <span className="av">
          <i
            className={`ti ${row.routine ? 'ti-clock-play' : row.inbound ? 'ti-webhook' : 'ti-arrows-exchange'}`}
          />
        </span>
      )}
      <div className="body">
        {isMine ? (
          <div className="me-label">
            <When seconds={row.createdAt} />
            You
          </div>
        ) : (
          <div className="who">
            {isFromPerson
              ? author
              : row.routine
                ? 'Rotina'
                : row.inbound
                  ? 'Inbound endpoint'
                  : 'Another agent'}
            <When seconds={row.createdAt} />
          </div>
        )}
        {row.inbound ? (
          <button
            className="inbound-head"
            aria-expanded={isOpen}
            onClick={() => setIsOpen((value) => !value)}
          >
            <i
              className={`ti ${isOpen ? 'ti-chevron-down' : 'ti-chevron-right'}`}
            />
            <span className="label">{label}</span>
            {!isOpen && row.text && (
              <span className="inbound-preview">
                {inboundPreviewOf(row.text)}
              </span>
            )}
          </button>
        ) : (
          label && <div className="label">{label}</div>
        )}
        {row.text && isOpen && (
          <div className="txt">
            <RichText text={row.text} />
          </div>
        )}
        {row.context?.length > 0 && (
          <div className="ctx" style={{ padding: 0 }}>
            {row.context.map((path) => (
              <button key={path} className="on" tabIndex={-1} title={path}>
                <i className="ti ti-paperclip" />
                {path.split('/').filter(Boolean).pop()}
              </button>
            ))}
          </div>
        )}
        {row.attachments?.length > 0 && (
          <div className="ctx" style={{ padding: 0 }}>
            {row.attachments.map((file) =>
              file.isImage ||
              /^image\//.test(file.mimeType ?? file.type ?? '') ? (
                <a
                  key={file.id}
                  href={attachmentUrl(row.botId, file.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="ctx-img"
                >
                  <img
                    alt={file.name}
                    src={attachmentUrl(row.botId, file.id)}
                  />
                </a>
              ) : (
                <a
                  key={file.id}
                  className="on"
                  href={attachmentUrl(row.botId, file.id)}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  <i className="ti ti-paperclip" />
                  {file.name}
                </a>
              ),
            )}
          </div>
        )}
        {(isQueued || onRewind) && (
          <div className="m-acts">
            {isQueued && (
              <span className="muted">
                <i className="ti ti-list" /> queued · the agent reads it on the
                next step
              </span>
            )}
            {onRewind && (
              <button
                className="pill"
                onClick={onRewind}
                title="Edit from here"
              >
                <i className="ti ti-arrow-back-up" />
                Go back to here
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// What the agent says or hands over; a run of these after one message is one reply.
const AGENT_KINDS = new Set([
  'work',
  'bot',
  'artifact',
  'connect',
  'skill',
  'files',
  'pages',
]);

/** The permissions the agent waits on now; they sit above the box, not in the conversation. */
export const pendingRequests = (rows, thread) => {
  if (thread?.status !== 'waiting_approval') return [];
  const pending = new Set(
    (thread.approvals ?? [])
      .filter((approval) => approval.status === 'pending')
      .map((approval) => approval.id),
  );
  return rows.filter(
    (row) => row.kind === 'request' && pending.has(row.data.approvalId),
  );
};

/** Above the box, like a question asked where the answer is typed. */
export function ApprovalDock({ rows, thread, onResolved }) {
  const requests = pendingRequests(rows, thread);
  if (!requests.length) return null;
  return (
    <div className="ask-dock">
      {requests.map((row) => (
        <ApprovalCard
          key={row.id}
          taskId={row.taskId}
          approvalId={row.data.approvalId}
          toolName={row.data.name}
          summary={row.data.summary}
          reason={row.data.reason}
          checkpointId={row.data.checkpointId}
          service={row.data.service ?? null}
          reach={row.data.reach ?? null}
          isAlwaysAsk={Boolean(row.data.isAlwaysAsk)}
          args={row.data.arguments ?? null}
          onDone={onResolved}
        />
      ))}
    </div>
  );
}

const fileTab = (botId, path) =>
  `${botId}/${path.replace(/^\/home\/sprite\/workspace\/?/, '')}`;

/**
 * The conversation as the prototype draws it: each message with its face, the
 * agent's name and model, its steps that open to show what came back, the text,
 * and the cards (permission, delivery, connection, screen, failure) in place.
 */
export function Thread({
  bot,
  account,
  modelLabel,
  rows,
  thread,
  isWorking,
  streamingText,
  rewindFromSeq,
  onRewind,
  onSendNote,
  onResolved,
  onOpenFile,
  onOpenRepoFile = null,
  bookmarked = null,
  onBookmark = null,
}) {
  const lastWorkIndex = rows.findLastIndex(
    (row) => row.kind === 'work' || row.kind === 'bot',
  );
  const lastRow = rows.at(-1);
  const failedTaskId = thread?.status === 'failed' ? thread.id : null;
  const isMakingReply =
    Boolean(streamingText) ||
    (isWorking && (lastRow?.kind === 'user' || lastRow?.kind === 'work'));
  const liveWork = isMakingReply && lastRow?.kind === 'work' ? lastRow : null;
  const shown = liveWork ? rows.slice(0, -1) : rows;
  // The step the agent is on, in words, with its count: the one line that changes while it works.
  const liveSteps = liveWork
    ? liveWork.entries.flatMap((entry) => entry.steps)
    : [];
  const liveStepText = liveSteps.length
    ? `${describeTool(liveSteps.at(-1).name, liveSteps.at(-1).args || {}).text} · step ${liveSteps.length}`
    : null;
  const turnStart =
    (thread?.updatedAt || thread?.createdAt || Date.now() / 1000) * 1000;

  const isAgentAt = (index) =>
    index >= 0 && AGENT_KINDS.has(shown[index]?.kind);
  const say = (row, body, index) => (
    <AgentMessage
      key={row.id}
      bot={bot}
      modelLabel={modelLabel}
      isContinued={isAgentAt(index - 1)}
      rowId={row.id}
    >
      {body}
    </AgentMessage>
  );

  const render = (row, index) => {
    if (row.kind === 'colleague')
      return (
        <AgentMessage
          key={row.id}
          bot={{ id: row.botId, name: row.name }}
          modelLabel="called with @"
        >
          <div className="txt">
            <RichText text={row.text} />
          </div>
        </AgentMessage>
      );
    if (row.kind === 'note')
      return (
        <NoteMessage
          key={row.id}
          row={row}
          account={account}
          onSend={onSendNote}
        />
      );
    if (row.kind === 'user')
      return (
        <UserMessage
          key={row.id}
          row={row}
          account={account}
          owner={bot.sharedBy}
          isQueued={isWorking && row.isQueued && index > lastWorkIndex}
          onRewind={
            onRewind && row.taskId && !row.mention
              ? () =>
                  onRewind({
                    taskId: row.taskId,
                    eventId: row.id,
                    seq: row.seq,
                    text: row.text,
                  })
              : null
          }
        />
      );
    if (row.kind === 'bot')
      return say(
        row,
        <>
          <div className="txt">
            <RichText
              text={row.text}
              folder={bot.folder}
              onOpenPath={onOpenRepoFile}
            />
          </div>
          {row.memories?.length > 0 && <MemLine memories={row.memories} />}
          {onBookmark && row.text && !row.isQuestion && (
            <div
              className={`m-acts bookmark${bookmarked?.has(row.id) ? ' on' : ''}`}
            >
              <button
                className="pill"
                onClick={() => onBookmark(row.id)}
                title={
                  bookmarked?.has(row.id)
                    ? 'Remove the mark'
                    : 'Bookmark for later'
                }
              >
                <i
                  className={`ti ${bookmarked?.has(row.id) ? 'ti-bookmark-filled' : 'ti-bookmark'}`}
                />
                {bookmarked?.has(row.id) ? 'Marcada' : 'Marcar'}
              </button>
            </div>
          )}
        </>,
        index,
      );
    if (row.kind === 'work') return say(row, <Work row={row} />, index);
    if (row.kind === 'decision')
      return (
        <div key={row.id} className="divider">
          {decisionText(row.data)}
        </div>
      );
    // A pending permission waits above the box (ApprovalDock); once answered, its decision shows here.
    if (row.kind === 'request') return null;
    if (row.kind === 'artifact')
      return say(
        row,
        <ArtifactCard botId={row.botId} data={row.data} />,
        index,
      );
    if (row.kind === 'connect')
      return say(
        row,
        <ConnectCard
          connectionId={row.connectionId}
          reason={row.reason}
          isReady={row.isReady}
        />,
        index,
      );
    if (row.kind === 'connected')
      return (
        <div key={row.id} className="divider">
          {row.title} conectado
        </div>
      );
    if (row.kind === 'skill')
      return say(row, <SkillCard data={row.data} />, index);
    if (row.kind === 'files')
      return say(
        row,
        <div className="cards">
          {row.files.map((file) => (
            <button
              key={file.path}
              className="card"
              onClick={() => onOpenFile(fileTab(row.botId, file.path))}
            >
              <i className="ti ti-file-text" />
              <b>{file.name || file.path.split('/').pop()}</b>
              <small>
                {/* Relative to the workspace: never the machine's own folders. */}
                {file.path
                  .replace(
                    /^(?:\/home\/sprite\/workspace|.*?\/workspace)\/?/,
                    '',
                  )
                  .split('/')
                  .slice(0, -1)
                  .join('/') || 'workspace'}
                /
              </small>
            </button>
          ))}
        </div>,
        index,
      );
    if (row.kind === 'pages')
      return say(
        row,
        <div className="cards">
          {row.pages.map((page) => (
            <a
              key={page.id}
              className="card"
              href={
                page.captureId
                  ? pageCaptureUrl(row.botId, page.captureId)
                  : page.url
              }
              target="_blank"
              rel="noopener noreferrer"
            >
              <i className="ti ti-world" />
              <b>{page.title || page.url}</b>
              <small>{page.url ? new URL(page.url).host : ''}</small>
            </a>
          ))}
        </div>,
        index,
      );
    if (row.kind === 'takeover')
      return (
        <div key={row.id} className="divider">
          A tela foi sua; o agente seguiu depois.
        </div>
      );
    if (row.kind === 'failure')
      return row.isMinor ? (
        <div key={row.id} className="divider">
          {row.text}
        </div>
      ) : (
        say(
          row,
          <>
            <div className="callout">
              <i className="ti ti-alert-triangle" />
              <div>
                <b>Stopped</b>
                {row.text}
              </div>
            </div>
            {row.taskId && row.taskId === failedTaskId && (
              <FailedCard taskId={row.taskId} onDone={onResolved} />
            )}
          </>,
          index,
        )
      );
    return null;
  };

  return (
    <>
      {shown.map((row, index) => {
        const node = render(row, index);
        // While an edit from an earlier message is pending, what would be cut stays, faded.
        return rewindFromSeq !== null && row.seq >= rewindFromSeq && node ? (
          <div key={`f${row.id}`} className="faded">
            {node}
          </div>
        ) : (
          node
        );
      })}
      {isMakingReply && rewindFromSeq === null && (
        <AgentMessage
          bot={bot}
          modelLabel={modelLabel}
          isContinued={isAgentAt(shown.length - 1)}
        >
          {liveWork && (
            <Work row={liveWork} isLive streamingText={streamingText} />
          )}
          {!liveWork && streamingText && (
            <div className="txt">
              <RichText text={streamingText} />
            </div>
          )}
          {isWorking && !streamingText && (
            <div className="status">
              <i className="ti ti-loader-2 spin" />
              <b>{liveStepText ?? 'Thinking…'}</b>
              <span className="mono">
                Agent · <Since from={turnStart} />
              </span>
            </div>
          )}
        </AgentMessage>
      )}
    </>
  );
}
