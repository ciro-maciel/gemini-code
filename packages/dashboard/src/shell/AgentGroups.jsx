import { useEffect, useState } from 'react';

import { shortWhen, stateOf, waitsOn } from '../state/agents';
import {
  companiesToGroup,
  groupAgents,
  moveBefore,
  shortNameOf,
} from '../state/groups';
import { useGroups } from '../state/use-groups';
import { fetchConversation, markBotUnread } from '../services/api';
import { botsChanged } from '../state/use-bots';
import { DeleteModal, notify } from '../components/zen';
import { refresh, remembered } from '../state/remembered';
import { Menu, useMenu } from '../ui/Menu';
import { AgentAvatar } from './AgentAvatar';

/**
 * The name of a group, typed in place: a pill field with the panel's focus
 * ring. Enter keeps it, Escape or an empty name gives up; blurring keeps a
 * name that was typed.
 */
function GroupNameField({ initial = '', placeholder, onDone }) {
  const [value, setValue] = useState(initial);
  const finish = (isKept) => onDone(isKept ? value.trim() : '');
  return (
    <label className="agroup-field">
      <i className="ti ti-folder" aria-hidden="true" />
      <input
        autoFocus
        maxLength={40}
        aria-label="Group name"
        placeholder={placeholder}
        value={value}
        onFocus={(event) => event.target.select()}
        onChange={(event) => setValue(event.target.value)}
        onBlur={() => finish(Boolean(value.trim()))}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault();
            finish(true);
          }
          if (event.key === 'Escape') {
            event.preventDefault();
            finish(false);
          }
        }}
      />
      <kbd aria-hidden="true">↵</kbd>
    </label>
  );
}

const CLOSED_STORE = 'assistant.closedGroups';
const readClosed = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(CLOSED_STORE) || '[]'));
  } catch {
    return new Set();
  }
};

// The pointer over an agent reads its conversation, so the click shows it at once.
const prefetchConversation = (botId) => {
  if (remembered(`conversation:${botId}`)) return;
  refresh(`conversation:${botId}`, () =>
    fetchConversation(botId).then((data) => ({
      events: data.items,
      thread: data.thread,
    })),
  ).catch(() => {});
};

/** The column while the agents and their groups load: rows shaped like the real ones, so nothing jumps. */
export function AgentsSkeleton({ rows = 6 }) {
  return (
    <div
      className="agents-skeleton"
      aria-busy="true"
      aria-label="Loading agents"
    >
      {Array.from({ length: rows }, (_, index) => (
        <div key={index} className="sk-row assistant-pulse">
          <span className="sk-av" />
          <span className="sk-lines">
            <span
              className="sk-line"
              style={{ width: `${70 - (index % 3) * 12}%` }}
            />
            <span className="sk-line short" />
          </span>
        </div>
      ))}
    </div>
  );
}

function AgentRow({
  bot,
  name,
  isOn,
  isDropTarget,
  onOpen,
  onMenu,
  dragProps,
}) {
  const state = stateOf(bot);
  const waits = waitsOn(bot);
  return (
    <div
      className={`crow${isOn ? ' on' : ''}${isDropTarget ? ' drop-above' : ''}`}
      role="button"
      tabIndex={0}
      title={bot.name}
      onClick={onOpen}
      onMouseEnter={() => prefetchConversation(bot.id)}
      onKeyDown={(event) => event.key === 'Enter' && onOpen()}
      {...dragProps}
    >
      <AgentAvatar bot={bot} size="sm" />
      <div className="grow">
        <div className="t">{name}</div>
        <div className="s">
          {state.mark === 'wait' && <span className="wait-dot" />}
          {state.mark === 'live' && <span className="live" />}
          {state.mark === 'done' && <span className="done-dot" />}
          {state.word ? `${state.word}${bot.lastMessage ? ' · ' : ''}` : ''}
          {bot.lastMessage || (state.word ? '' : 'Say hi')}
        </div>
      </div>
      <div className="end">
        <span className="meta">
          {shortWhen(bot.lastActivityAt || bot.createdAt)}
        </span>
        {waits ? (
          <span className="unread wait" title="Waits for you">
            {waits}
          </span>
        ) : null}
      </div>
      {onMenu && (
        <button
          className="crow-more"
          aria-label={`More actions for ${bot.name}`}
          title="Unread, move to a group"
          onClick={(event) => {
            event.stopPropagation();
            onMenu(event);
          }}
        >
          <i className="ti ti-dots" />
        </button>
      )}
    </div>
  );
}

/**
 * The agents in the column, in groups (31/10/2026): the filters with "+ Grupo",
 * the offer to group by company, each group with its header (open/closed,
 * name renamed in place, agents counted, those waiting for the person marked)
 * and its menu, then the agents in no group. Agents and groups are dragged;
 * an agent's menu moves it without dragging.
 */
export function AgentGroups({
  bots,
  filter,
  activeBotId,
  isHome,
  onOpenAgent,
  onNewAgent,
}) {
  const store = useGroups();
  const { groups, loose, idle } = groupAgents(bots, store.groups, filter, {
    nowSeconds: Date.now() / 1000,
  });
  const [isIdleOpen, setIsIdleOpen] = useState(false);
  const companies = companiesToGroup(bots, store.groups);
  const [closed, setClosed] = useState(readClosed);
  const [renaming, setRenaming] = useState(null);
  // A group being named before it exists: nothing is saved until it has a name.
  const [isCreating, setIsCreating] = useState(false);
  const [confirming, setConfirming] = useState(null);
  const [dragged, setDragged] = useState(null);
  const [over, setOver] = useState(null);
  const groupMenu = useMenu();
  const agentMenu = useMenu();
  const [menuGroup, setMenuGroup] = useState(null);
  const [menuBot, setMenuBot] = useState(null);
  const hasGroups = store.groups.length > 0;

  const toggle = (id) =>
    setClosed((current) => {
      const next = new Set(current);
      next.has(id) ? next.delete(id) : next.add(id);
      try {
        localStorage.setItem(CLOSED_STORE, JSON.stringify([...next]));
      } catch {}
      return next;
    });

  const startRename = (group) => setRenaming(group.id);
  const finishRename = async (name) => {
    const id = renaming;
    setRenaming(null);
    const group = store.groups.find((item) => item.id === id);
    if (group && name && name !== group.name) await store.rename(id, name);
  };
  const newGroup = () => setIsCreating(true);
  const finishCreate = async (name) => {
    setIsCreating(false);
    if (name) await store.create(name);
  };

  // "Novo grupo" sits beside "Agente novo" in the column's top row (Column.jsx).
  useEffect(() => {
    const onNewGroup = () => newGroup();
    window.addEventListener('assistant:new-group', onNewGroup);
    return () => window.removeEventListener('assistant:new-group', onNewGroup);
  });

  // Dragging: an agent between groups (and in order), a group header among groups.
  const drag = (item) => ({
    draggable: true,
    onDragStart: (event) => {
      event.stopPropagation();
      event.dataTransfer.effectAllowed = 'move';
      event.dataTransfer.setData('text/plain', item.id);
      setDragged(item);
    },
    onDragEnd: () => {
      setDragged(null);
      setOver(null);
    },
  });
  const dropZone = (groupId, beforeBotId = null) => ({
    onDragOver: (event) => {
      if (!dragged) return;
      event.preventDefault();
      event.stopPropagation();
      if (over?.groupId !== groupId || over?.beforeBotId !== beforeBotId)
        setOver({ groupId, beforeBotId });
    },
    onDrop: async (event) => {
      if (!dragged) return;
      event.preventDefault();
      event.stopPropagation();
      const item = dragged;
      setDragged(null);
      setOver(null);
      if (item.kind === 'group') {
        if (groupId && groupId !== item.id)
          await store.reorder(
            moveBefore(
              store.groups.map((group) => group.id),
              item.id,
              groupId,
            ),
          );
        return;
      }
      const target = groupId
        ? groups.find((group) => group.id === groupId)?.bots
        : loose;
      const ids = (target ?? [])
        .filter((bot) => !bot.sharedBy)
        .map((bot) => bot.id);
      await store.place(groupId, moveBefore(ids, item.id, beforeBotId));
    },
  });

  const row = (bot, group) => (
    <AgentRow
      key={bot.id}
      bot={bot}
      name={shortNameOf(bot, group)}
      isOn={bot.id === activeBotId && !isHome}
      isDropTarget={dragged?.kind === 'agent' && over?.beforeBotId === bot.id}
      onOpen={() => onOpenAgent(bot.id)}
      onMenu={
        bot.sharedBy
          ? null
          : (event) => {
              setMenuBot(bot);
              agentMenu.open('agent')(event);
            }
      }
      dragProps={
        bot.sharedBy
          ? {}
          : {
              ...drag({
                kind: 'agent',
                id: bot.id,
                sectionId: group?.id ?? null,
              }),
              ...dropZone(group?.id ?? null, bot.id),
            }
      }
    />
  );

  if (!store.isLoaded) return <AgentsSkeleton />;

  return (
    <>
      {companies.length > 0 && (
        <div className="group-suggest">
          <span className="grow">
            <b>{companies.length} companies</b> in your agents’ names.
          </span>
          <button onClick={() => store.groupByCompany(companies, bots)}>
            Group by company
          </button>
        </div>
      )}

      {/* The conversations in no group come first, with no label of their own (14/11/2026):
                the most recent work on top. A dragged agent dropped here leaves its group. */}
      {(loose.length > 0 || (hasGroups && dragged?.kind === 'agent')) && (
        <div
          className={`agroup loose${dragged?.kind === 'agent' && over?.groupId === null ? ' over' : ''}`}
          {...dropZone(null)}
        >
          {loose.map((bot) => row(bot, null))}
          {dragged?.kind === 'agent' && dragged.sectionId ? (
            <div className="agroup-empty">Drop here to remove from group</div>
          ) : null}
        </div>
      )}

      {isCreating && (
        <div className="agroup is-new">
          <div className="agroup-head">
            <span className="agroup-chev" aria-hidden="true">
              <i className="ti ti-chevron-down" />
            </span>
            <GroupNameField
              placeholder="Name the group"
              onDone={finishCreate}
            />
          </div>
        </div>
      )}

      {groups.map((group) => {
        const isClosed = closed.has(group.id);
        return (
          <div
            key={group.id}
            className={`agroup${isClosed ? ' closed' : ''}${dragged && over?.groupId === group.id ? ' over' : ''}`}
            {...dropZone(group.id)}
          >
            {/* A click anywhere on the header opens or closes the group; holding and moving drags it. */}
            <div
              className="agroup-head"
              role="button"
              tabIndex={0}
              aria-expanded={!isClosed}
              aria-label={
                isClosed ? `Open ${group.name}` : `Close ${group.name}`
              }
              onClick={(event) => {
                if (
                  renaming !== group.id &&
                  !event.target.closest('.agroup-more')
                )
                  toggle(group.id);
              }}
              onKeyDown={(event) => {
                if (
                  event.target !== event.currentTarget ||
                  (event.key !== 'Enter' && event.key !== ' ')
                )
                  return;
                event.preventDefault();
                toggle(group.id);
              }}
              {...(renaming === group.id
                ? {}
                : drag({ kind: 'group', id: group.id }))}
            >
              <span className="agroup-chev" aria-hidden="true">
                <i className="ti ti-chevron-down" />
              </span>
              {renaming === group.id ? (
                <GroupNameField
                  initial={group.name}
                  placeholder="Group name"
                  onDone={finishRename}
                />
              ) : (
                <span
                  className="agroup-name"
                  title="Click to open or close; double-click to rename"
                  onDoubleClick={(event) => {
                    // The two clicks before it toggled twice: the group is as it was.
                    event.stopPropagation();
                    startRename(group);
                  }}
                >
                  {group.name}
                </span>
              )}
              <span className="agroup-count">{group.bots.length}</span>
              {group.waiting > 0 && (
                <span
                  className="agroup-wait"
                  title={`Waiting for you: ${group.waiting}`}
                >
                  {group.waiting}
                </span>
              )}
              <span className="grow" />
              <button
                className="agroup-more"
                aria-label={`More actions for group ${group.name}`}
                onClick={(event) => {
                  setMenuGroup(group);
                  groupMenu.open('group')(event);
                }}
              >
                <i className="ti ti-dots" />
              </button>
            </div>
            {!isClosed &&
              (group.bots.length ? (
                group.bots.map((bot) => row(bot, group))
              ) : dragged?.kind === 'agent' ? (
                <div className="agroup-empty">Drop here</div>
              ) : (
                <div className="agroup-empty">
                  <span>No agents yet. Drag one here.</span>
                </div>
              ))}
          </div>
        );
      })}

      {idle.length > 0 && (
        <div className="agroup idle">
          <button
            className="agroup-head"
            onClick={() => setIsIdleOpen(!isIdleOpen)}
            aria-expanded={isIdleOpen}
            title="Idle for more than 14 days. A message or a routine brings it back."
          >
            <i
              className={`ti ${isIdleOpen ? 'ti-chevron-down' : 'ti-chevron-right'}`}
            />
            <span className="agroup-name">Stopped</span>
            <span className="agroup-count">{idle.length}</span>
          </button>
          {isIdleOpen && idle.map((bot) => row(bot, null))}
        </div>
      )}

      {(() => {
        const group = store.groups.find((item) => item.id === confirming);
        if (!group) return null;
        const count = (groups.find((item) => item.id === group.id)?.bots ?? [])
          .length;
        return (
          <DeleteModal
            opened
            target={group.name}
            context="Group of agents"
            consequences={[
              count === 0
                ? 'The group is empty.'
                : count === 1
                  ? 'Its agent goes back to the top, outside groups.'
                  : `Its ${count} agents go back to the top, outside groups.`,
              'No agent and no conversation is deleted.',
            ]}
            confirmLabel="Delete group"
            onClose={() => setConfirming(null)}
            onConfirm={async () => {
              setConfirming(null);
              await store.remove(group.id, group.name);
            }}
          />
        );
      })()}

      {groupMenu.is('group') && menuGroup && (
        <Menu anchor={groupMenu.anchor} width={230} onClose={groupMenu.close}>
          <button
            onClick={() => {
              groupMenu.close();
              startRename(menuGroup);
            }}
          >
            <i className="ti ti-pencil" />
            Rename
          </button>
          <button
            onClick={() => {
              groupMenu.close();
              onNewAgent(menuGroup.id);
            }}
          >
            <i className="ti ti-message-plus" />
            New agent in this group
          </button>
          <hr />
          <button
            className="danger"
            onClick={() => {
              groupMenu.close();
              setConfirming(menuGroup.id);
            }}
          >
            <i className="ti ti-trash" />
            Delete group
          </button>
        </Menu>
      )}
      {agentMenu.is('agent') && menuBot && (
        <Menu
          anchor={agentMenu.anchor}
          title={menuBot.name}
          width={230}
          onClose={agentMenu.close}
        >
          {!menuBot.sharedBy && menuBot.lastMessage && (
            <button
              onClick={async () => {
                agentMenu.close();
                try {
                  await markBotUnread(menuBot.id);
                  botsChanged();
                } catch (error) {
                  notify.error("Couldn't mark as unread", error.message);
                }
              }}
            >
              <i className="ti ti-mail" />
              Mark as unread
            </button>
          )}
          {(store.groups.length > 0 || menuBot.sectionId) && (
            <p className="menu-note">Move to</p>
          )}
          {store.groups
            .filter((group) => group.id !== menuBot.sectionId)
            .map((group) => (
              <button
                key={group.id}
                onClick={() => {
                  agentMenu.close();
                  store.moveTo(menuBot.id, group.id, group.name);
                }}
              >
                <i className="ti ti-folder" />
                {group.name}
              </button>
            ))}
          {menuBot.sectionId && (
            <button
              onClick={() => {
                agentMenu.close();
                store.moveTo(menuBot.id, null, 'outside groups');
              }}
            >
              <i className="ti ti-folder-off" />
              Remove from group
            </button>
          )}
        </Menu>
      )}
    </>
  );
}
