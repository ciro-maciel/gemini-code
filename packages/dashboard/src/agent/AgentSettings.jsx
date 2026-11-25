import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  deleteBot,
  deleteMemory,
  fetchBotDocuments,
  fetchProjects,
  fetchHandoffs,
  fetchInbox,
  fetchMemories,
  rotateInbox,
  updateBot,
  updateMemory,
} from '../services/api';
import { Routines } from '../components/Routines';
import { Vault } from '../components/DoorAndVault';
import { DeleteModal, notify } from '../components/zen';
import { Menu, Opt, useMenu } from '../ui/Menu';
import { botGone, botsChanged } from '../state/use-bots';
import { AgentAvatar } from '../shell/AgentAvatar';
import { pathOf } from '../mesa/routes';

const money = (value) => `US$ ${(value || 0).toFixed(2).replace('.', ',')}`;
const TABS = [
  ['when', 'When'],
  ['vault', 'Cofre'],
  ['memory', 'Memory'],
];

function Trigger({ icon, title, children, right = null }) {
  return (
    <div className="check">
      <span className="big-letter">
        <i className={`ti ${icon}`} />
      </span>
      <div className="grow">
        <b>{title}</b>
        <div className="p">{children}</div>
      </div>
      {right}
    </div>
  );
}

// As the prototype says it: who passed work here, and who this agent passed to.
function Handoffs({ botId }) {
  const [passes, setPasses] = useState(null);
  useEffect(() => {
    fetchHandoffs(botId)
      .then(setPasses)
      .catch(() => setPasses({ from: [], to: [] }));
  }, [botId]);
  const lines = passes
    ? [
        ...passes.from.map((bot) => `Receives work from "${bot.name}".`),
        ...passes.to.map((bot) => `Hands work to "${bot.name}".`),
      ]
    : [];
  return (
    <Trigger icon="ti-arrows-exchange" title="Another agent">
      {passes === null ? 'Loading…' : lines.join(' ') || 'No handoffs.'}
    </Trigger>
  );
}

function Door({ botId }) {
  const [door, setDoor] = useState(null);
  useEffect(() => {
    fetchInbox(botId)
      .then(setDoor)
      .catch(() => {});
  }, [botId]);
  const rotate = async () => {
    try {
      setDoor(await rotateInbox(botId));
      notify.success('Address changed', 'The old one stopped immediately.');
    } catch (error) {
      notify.error(error.message);
    }
  };
  const copy = () => {
    navigator.clipboard?.writeText(door.url);
    notify.success('Entry point address copied');
  };
  return (
    <Trigger
      icon="ti-webhook"
      title="Inbound endpoint"
      right={
        <button className="btn outline sm" onClick={rotate}>
          Change address
        </button>
      }
    >
      Another system sends a POST and it lands here:{' '}
      {door && (
        <span className="door-addr">
          <span className="mono">{door.url.replace(/^https:\/\//, '')}</span>
          <button
            className="icon-btn"
            onClick={copy}
            title="Copy the address"
            aria-label="Copy the address"
          >
            <i className="ti ti-copy" />
          </button>
        </span>
      )}
    </Trigger>
  );
}

function When({ bot }) {
  return (
    <>
      <div className="box">
        <div className="bh">
          <b className="grow">What writes to this agent</b>
        </div>
        <div className="bb">
          <Trigger
            icon="ti-user"
            title="A person"
            right={<span className="pill-st dark">always</span>}
          >
            Anyone with access can write here.
          </Trigger>
          <Trigger icon="ti-clock-play" title="Time">
            <Routines botId={bot.id} />
          </Trigger>
          <Door botId={bot.id} />
          <Handoffs botId={bot.id} />
        </div>
      </div>
      <p className="fine">
        Anything that isn’t a person writes here labeled with its source, but
        can never answer a permission request.
      </p>
    </>
  );
}

// As the prototype groups them: what a person decided, what a person prefers, what the agent observed.
const MEMORY_KINDS = [
  ['decision', 'Decisions', 'in the memory/decisions.md file'],
  ['preference', 'Preferences', 'in the memory/decisions.md file'],
  ['observation', 'Notes', 'server only; expire in 30 days'],
];
const when = (seconds) =>
  new Date(seconds * 1000).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });

function Memory({ bot }) {
  const [items, setItems] = useState(null);
  const reload = useCallback(() => {
    fetchMemories(bot.id)
      .then((data) => setItems(data.items))
      .catch(() => setItems([]));
  }, [bot.id]);
  useEffect(reload, [reload]);

  const forget = async (memory) => {
    await deleteMemory(bot.id, memory.id).catch((error) =>
      notify.error(error.message),
    );
    notify.success('Esquecido', memory.content.slice(0, 60));
    reload();
  };
  const fix = async (memory) => {
    const content = prompt('Fix the memory', memory.content);
    if (!content?.trim() || content.trim() === memory.content) return;
    try {
      await updateMemory(bot.id, memory.id, content.trim());
      reload();
    } catch (error) {
      notify.error(error.message);
    }
  };

  return MEMORY_KINDS.map(([kind, label, where]) => {
    const list = (items ?? []).filter((memory) => memory.kind === kind);
    return (
      <div className="box" key={kind}>
        <div className="bh">
          <b className="grow">{label}</b>
          <span className="muted">{where}</span>
        </div>
        <div className="bb">
          {items === null ? (
            <p className="muted">Loading…</p>
          ) : list.length ? (
            list.map((memory) => (
              <div className="row" key={memory.id}>
                <div className="grow">
                  <b>{memory.content}</b>
                  <div className="muted">
                    {memory.sourceTaskId
                      ? 'from a conversation'
                      : 'from a person'}{' '}
                    · {when(memory.createdAt)}
                    {memory.daysLeft
                      ? `· due in ${memory.daysLeft} ${memory.daysLeft === 1 ? 'dia' : 'dias'}`
                      : ''}
                  </div>
                </div>
                <button className="btn outline sm" onClick={() => fix(memory)}>
                  Fix
                </button>
                <button
                  className="btn outline sm"
                  onClick={() => forget(memory)}
                >
                  Forget
                </button>
              </div>
            ))
          ) : (
            <p className="muted">Nothing here.</p>
          )}
        </div>
      </div>
    );
  });
}

/**
 * An agent's own settings, opened beside it: its name and the day's spend, and
 * what writes to it, its keys and its memory.
 */
export function AgentSettings({ bot, template, tab = 'when', onTab }) {
  const navigate = useNavigate();
  const spend = bot.spendToday ?? 0;
  const isOwner = (bot.access ?? 'owner') === 'owner';
  const [docStats, setDocStats] = useState(null);
  const menu = useMenu();
  const [projects, setProjects] = useState(null);

  useEffect(() => {
    let alive = true;
    fetchBotDocuments(bot.id)
      .then((data) => alive && setDocStats(data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [bot.id, bot.folder]);

  // The repository it works on, from Settings › Projects; it works in its own worktree of it.
  const openProjects = (event) => {
    menu.open('project')(event);
    fetchProjects()
      .then(setProjects)
      .catch((error) =>
        setProjects({ root: null, items: [], error: error.message }),
      );
  };
  const pickProject = async (project) => {
    menu.close();
    try {
      await updateBot(bot.id, { project });
      botsChanged();
      notify.success(
        project ? `Works on ${project} now` : 'Works in its own folder now',
        project ? 'In its own worktree, on its own branch.' : undefined,
      );
      window.dispatchEvent(new Event('assistant:repo'));
    } catch (error) {
      notify.error(error.message);
    }
  };

  const openAgentDocs = () => {
    navigate(pathOf(`agent:${bot.id}`));
    setTimeout(
      () =>
        window.dispatchEvent(
          new CustomEvent('assistant:agent-view', {
            detail: { botId: bot.id, view: 'docs' },
          }),
        ),
      60,
    );
  };

  return (
    <div className="agent-pane">
      <div className="page-in">
        <div className="agent-top">
          <div className="agent-head">
            <AgentAvatar bot={bot} icon={template?.icon} />
            {isOwner ? <AgentName bot={bot} /> : <h2>{bot.name}</h2>}
          </div>
          <p className="lead">
            {template
              ? `${template.owns.charAt(0).toUpperCase()}${template.owns.slice(1)}. Started from template ${template.name}.`
              : 'Started from scratch.'}
          </p>
          <div className="agent-links">
            {bot.instructionsPath && isOwner && (
              <button
                className="instr-link"
                onClick={() => navigate(pathOf(`file:${bot.instructionsPath}`))}
              >
                <i className="ti ti-file-text" />
                Instructions
                <span className="mono">{bot.instructionsPath}</span>
                <i className="ti ti-arrow-up-right" />
              </button>
            )}
            <button className="instr-link" onClick={openAgentDocs}>
              <i className="ti ti-folder" />
              Folder & Documents
              <span className="mono">
                {bot.folder ? `/${bot.folder}/` : '/'}
              </span>
              {docStats && (
                <span className="tag">{docStats.counts?.all ?? 0}</span>
              )}
              <i className="ti ti-arrow-up-right" />
            </button>
            {isOwner && (
              <button className="btn outline sm" onClick={openProjects}>
                <i className="ti ti-git-branch" />
                {bot.project ? `Project: ${bot.project}` : 'Choose a project'}
              </button>
            )}
          </div>
          <div className="agent-row">
            <div className="grow">
              <span className="muted">
                {money(spend)} hoje neste agente, na chave de IA dele
              </span>
            </div>
          </div>
        </div>
        {menu.is('project') && (
          <Menu
            anchor={menu.anchor}
            title="Works on"
            search={(projects?.items?.length ?? 0) > 8}
            width={340}
            alignLeft
            onClose={menu.close}
          >
            <Opt
              icon={<i className="ti ti-folder" />}
              title="Its own folder"
              note="No repository: it works in its folder in the workspace"
              isOn={!bot.project}
              onClick={() => pickProject(null)}
            />
            {projects === null && <div className="h label">Loading…</div>}
            {projects?.items?.length > 0 && (
              <div className="h label">Repositories</div>
            )}
            {projects?.items?.map((item) => (
              <Opt
                key={item.path}
                icon={
                  <i
                    className={`ti ${item.github ? 'ti-brand-github' : 'ti-git-branch'}`}
                  />
                }
                title={item.name}
                note={
                  item.path === '.'
                    ? item.branch
                    : `${item.path} · ${item.branch ?? ''}`
                }
                isOn={bot.project === item.path}
                onClick={() => pickProject(item.path)}
              />
            ))}
            {projects && !projects.root && (
              <>
                <hr />
                <button
                  onClick={() => {
                    menu.close();
                    navigate('/settings/projects');
                  }}
                >
                  <i className="ti ti-folders" />
                  Choose your projects folder
                </button>
              </>
            )}
          </Menu>
        )}
        <div className="atabs">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'on' : ''}
              onClick={() => onTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'when' && <When bot={bot} />}
        {tab === 'vault' && (
          <>
            <div className="box">
              <div className="bh">
                <b className="grow">This agent’s keys</b>
              </div>
              <div className="bb">
                <Vault botId={bot.id} />
              </div>
            </div>
            <p className="fine">
              They stay encrypted on the server and are injected into each
              command of this agent. The agent and the dashboard only see the
              names, and no key goes into the files.
            </p>
          </>
        )}
        {tab === 'memory' && <Memory bot={bot} />}
        {(bot.access ?? 'owner') === 'owner' && <DeleteAgent bot={bot} />}
      </div>
    </div>
  );
}

/** The name, edited where it is: a click turns it into a field; Enter or leaving saves, Esc undoes. */
function AgentName({ bot }) {
  const [draft, setDraft] = useState(null);
  const save = async () => {
    const name = draft?.trim();
    setDraft(null);
    if (!name || name === bot.name) return;
    try {
      await updateBot(bot.id, { name });
      botsChanged();
    } catch (error) {
      notify.error(error.message);
    }
  };
  if (draft !== null)
    return (
      <input
        className="name-edit"
        autoFocus
        aria-label="Agent name"
        maxLength={60}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.target.blur();
          if (event.key === 'Escape') setDraft(null);
        }}
      />
    );
  return (
    <>
      <h2
        className="name-click"
        title="Rename agent"
        onClick={() => setDraft(bot.name)}
      >
        {bot.name}
      </h2>
      <button
        className="icon-btn"
        title="Rename agent"
        aria-label="Rename agent"
        onClick={() => setDraft(bot.name)}
      >
        <i className="ti ti-pencil" />
      </button>
    </>
  );
}

/**
 * Deleting an agent takes two confirmations, never more: first the band that
 * says what will be lost and its button; then the kit's DeleteModal, where
 * the person types the name.
 */
function DeleteAgent({ bot }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const remove = async () => {
    // Gone from the panel on the click; the central destroys the computer behind, and a failure brings it back.
    botGone(bot);
    navigate('/');
    try {
      await deleteBot(bot.id);
      notify.success(`${bot.name} was deleted`);
    } catch (error) {
      notify.error(error.message);
    } finally {
      botsChanged();
      window.dispatchEvent(new Event('assistant:repo'));
    }
  };
  return (
    <>
      <div className="box danger-zone">
        <div className="bh">
          <b className="grow">Danger zone</b>
        </div>
        <div className="bb">
          <div className="check">
            <span className="big-letter">
              <i className="ti ti-trash" />
            </span>
            <div className="grow">
              <b>Delete this agent</b>
              <div className="p">
                The computer, conversation, and memory go away. Connected apps
                stay: they’re yours.
              </div>
            </div>
            <button
              className="btn outline sm danger"
              onClick={() => setIsOpen(true)}
            >
              <i className="ti ti-trash" />
              Delete agent…
            </button>
          </div>
        </div>
      </div>
      <DeleteModal
        opened={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={remove}
        target={bot.name}
        context={`Agent · ${bot.spriteName}`}
        consequences={[
          'The cloud computer is destroyed, along with its files, programs, and logins saved in Chrome.',
          'The conversation, ongoing tasks, memory, and restore points will be deleted.',
          "Connected apps remain: they're yours.",
          "This can't be undone.",
        ]}
        confirmLabel="Delete agent"
      />
    </>
  );
}
