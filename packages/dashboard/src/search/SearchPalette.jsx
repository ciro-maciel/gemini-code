import { useEffect, useMemo, useRef, useState } from 'react';

import {
  fetchDeliveries,
  fetchRepoFiles,
  searchMemories,
} from '../services/api';
import { iconOf } from '../files/tree';
import { AgentAvatar } from '../shell/AgentAvatar';
import { SEARCH_ICON } from '../shell/Column';
import { findTemplates } from '../state/templates';
import { listAgents, shortWhen, stateOf } from '../state/agents';

const fold = (text) =>
  (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

const GROUP_ICONS = {
  'Quick actions': 'ti-bolt',
  'Recent agents': 'ti-sparkles',
  Agents: 'ti-sparkles',
  Models: 'ti-template',
  Deliverables: 'ti-package',
  Files: 'ti-files',
  Memory: 'ti-brain',
};

/** The text in pieces, with the part that matches the query marked; folded the same way as the search. */
export function matchParts(text, query) {
  const value = String(text || '');
  const q = fold(query).trim();
  if (!q) return [{ text: value, isMatch: false }];
  const at = fold(value).indexOf(q);
  if (at < 0) return [{ text: value, isMatch: false }];
  return [
    { text: value.slice(0, at), isMatch: false },
    { text: value.slice(at, at + q.length), isMatch: true },
    { text: value.slice(at + q.length), isMatch: false },
  ].filter((part) => part.text);
}

function Marked({ text, query }) {
  return matchParts(text, query).map((part, index) =>
    part.isMatch ? <mark key={index}>{part.text}</mark> : part.text,
  );
}

/**
 * ⌘K: agents, models, deliverables, files and what the agents remember in one
 * list. Empty, it offers quick actions and the recent agents; with text, the
 * first line starts a new agent with it. Arrows move one selection, Enter opens
 * it, Esc closes.
 */
export function SearchPalette({
  bots,
  templates,
  onClose,
  onOpen,
  onStart,
  onNavigate = () => {},
}) {
  const [query, setQuery] = useState('');
  const [deliveries, setDeliveries] = useState([]);
  const [memories, setMemories] = useState([]);
  const [files, setFiles] = useState([]);
  const [selected, setSelected] = useState(0);
  const listRef = useRef(null);

  useEffect(() => {
    fetchDeliveries()
      .then((data) => setDeliveries(data.items))
      .catch(() => {});
    fetchRepoFiles()
      .then((data) => setFiles(data.items.map((item) => item.path)))
      .catch(() => {});
  }, []);
  // The memories live in the server: asked a moment after the typing stops.
  useEffect(() => {
    if (!query.trim()) return setMemories([]);
    const timer = setTimeout(() => {
      searchMemories(query)
        .then((data) => setMemories(data.items))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);

  const results = useMemo(() => {
    const q = fold(query);
    const has = (text) => !q || fold(text).includes(q);
    const agentRow = (bot, group) => {
      const state = stateOf(bot);
      return {
        key: `a${bot.id}`,
        group,
        icon: <AgentAvatar bot={bot} size="sm" />,
        title: bot.name,
        note: bot.lastMessage,
        meta: state.word || shortWhen(bot.lastActivityAt || bot.createdAt),
        mark: state.mark,
        run: () => onOpen(`agent:${bot.id}`),
      };
    };
    if (!q) {
      return [
        {
          key: 'go-new',
          group: 'Quick actions',
          icon: <i className="ti ti-message-plus" />,
          title: 'New agent',
          run: () => onNavigate('/'),
        },
        {
          key: 'go-home',
          group: 'Quick actions',
          icon: <i className="ti ti-layout-grid" />,
          title: 'Command center',
          run: () => onNavigate('/'),
        },
        {
          key: 'go-connectors',
          group: 'Quick actions',
          icon: <i className="ti ti-plug-connected" />,
          title: 'Connectors',
          run: () => onNavigate('/connectors'),
        },
        {
          key: 'go-settings',
          group: 'Quick actions',
          icon: <i className="ti ti-settings" />,
          title: 'Settings',
          run: () => onNavigate('/settings/accounts'),
        },
        ...listAgents(bots)
          .slice(0, 5)
          .map((bot) => agentRow(bot, 'Recent agents')),
      ];
    }
    return [
      {
        key: 'new',
        isAccent: true,
        icon: <i className="ti ti-sparkles" />,
        title: query,
        note: 'Start a new agent',
        run: () => onStart(query),
      },
      ...bots
        .filter((bot) => has(`${bot.name} ${bot.lastMessage || ''}`))
        .slice(0, 5)
        .map((bot) => agentRow(bot, 'Agents')),
      ...findTemplates(templates, query)
        .slice(0, 4)
        .map((item) => ({
          key: `t${item.id}`,
          group: 'Models',
          icon: <AgentAvatar bot={null} icon={item.icon} size="sm" />,
          title: item.name,
          note: item.area,
          run: () => onOpen(`template:${item.id}`),
        })),
      ...deliveries
        .filter((item) => has(`${item.title} ${item.verdict}`))
        .slice(0, 4)
        .map((item) => ({
          key: `d${item.id}`,
          group: 'Deliverables',
          icon: <i className="ti ti-package" />,
          title: item.title,
          note: item.verdict,
          run: () => onOpen(`agent:${item.botId}`),
        })),
      ...files
        .filter(has)
        .slice(0, 4)
        .map((path) => ({
          key: `f${path}`,
          group: 'Files',
          icon: <i className={`ti ${iconOf(path)}`} />,
          title: path.split('/').pop(),
          note: path,
          run: () => onOpen(`file:${path}`),
        })),
      ...memories.slice(0, 4).map((item) => ({
        key: `m${item.id}`,
        group: 'Memory',
        icon: <i className="ti ti-brain" />,
        title: item.content,
        note: item.botName,
        run: () => onOpen(`settings:${item.botId}`),
      })),
    ];
  }, [
    query,
    bots,
    templates,
    deliveries,
    files,
    memories,
    onOpen,
    onStart,
    onNavigate,
  ]);

  // A new list starts at its first line; the selection never points past the end.
  useEffect(() => setSelected(0), [query]);
  const current = Math.min(selected, Math.max(results.length - 1, 0));
  useEffect(() => {
    listRef.current
      ?.querySelector(`[data-index="${current}"]`)
      ?.scrollIntoView({ block: 'nearest' });
  }, [current]);

  const onKeyDown = (event) => {
    if (event.key === 'Escape') return onClose();
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      const step = event.key === 'ArrowDown' ? 1 : -1;
      setSelected((at) => (at + step + results.length) % results.length);
    }
    if (event.key === 'Enter') results[current]?.run();
  };

  return (
    <div
      className="backdrop pal"
      onPointerDown={(event) =>
        event.target === event.currentTarget && onClose()
      }
    >
      <div className="palette ne-palette" role="dialog" aria-label="Search">
        <label className="pin">
          {SEARCH_ICON}
          <input
            autoFocus
            placeholder="Search agents, deliverables, files, or memory…"
            autoComplete="off"
            aria-label="Search"
            role="combobox"
            aria-expanded="true"
            aria-controls="palette-results"
            aria-activedescendant={
              results[current] ? `palette-${results[current].key}` : undefined
            }
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={onKeyDown}
          />
          <kbd>esc</kbd>
        </label>
        <div
          className="pres"
          id="palette-results"
          role="listbox"
          aria-label="Search"
          ref={listRef}
        >
          {results.map((item, index) => (
            <div key={item.key}>
              {item.group && item.group !== results[index - 1]?.group && (
                <div className="pg">
                  <i
                    className={`ti ${GROUP_ICONS[item.group] || 'ti-point'}`}
                  />
                  {item.group}
                </div>
              )}
              <button
                id={`palette-${item.key}`}
                role="option"
                aria-selected={index === current}
                data-index={index}
                className={`pr${index === current ? ' on' : ''}${item.isAccent ? ' accent' : ''}`}
                onPointerMove={() => index !== current && setSelected(index)}
                onClick={item.run}
              >
                <span className="pr-icon">{item.icon}</span>
                <span className="pr-text">
                  <span className="pr-title">
                    {item.isAccent ? (
                      <>“{item.title}”</>
                    ) : (
                      <Marked text={item.title} query={query} />
                    )}
                  </span>
                  {item.note && (
                    <span className="pr-note">
                      {item.isAccent ? (
                        item.note
                      ) : (
                        <Marked text={item.note} query={query} />
                      )}
                    </span>
                  )}
                </span>
                {item.meta && (
                  <span
                    // The state goes in a data attribute: a class named after it ("live") hit the global dot style.
                    className="pr-meta"
                    data-mark={item.mark || undefined}
                  >
                    {item.mark && <i className="dot" />}
                    {item.meta}
                  </span>
                )}
                <kbd className="pr-enter" aria-hidden="true">
                  ↵
                </kbd>
              </button>
            </div>
          ))}
          {!results.length && (
            <p className="pr-empty">
              <i className="ti ti-search-off" />
              Nothing matches “{query}”.
            </p>
          )}
        </div>
        <div className="pal-foot" aria-hidden="true">
          <span>
            <kbd>↑</kbd>
            <kbd>↓</kbd> to move
          </span>
          <span>
            <kbd>↵</kbd> to open
          </span>
          <span>
            <kbd>esc</kbd> to close
          </span>
        </div>
      </div>
    </div>
  );
}
