import { useEffect, useState } from 'react';

import {
  fetchDeliveries,
  fetchRepoFiles,
  searchMemories,
} from '../services/api';
import { iconOf } from '../files/tree';
import { AgentAvatar } from '../shell/AgentAvatar';
import { SEARCH_ICON } from '../shell/Column';
import { findTemplates } from '../state/templates';

const fold = (text) =>
  (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');

/**
 * ⌘K: agents, templates, deliveries and what the agents remember in one list; with text typed, the first
 * line starts a new agent with it. Enter opens the first result.
 */
export function SearchPalette({ bots, templates, onClose, onOpen, onStart }) {
  const [query, setQuery] = useState('');
  const [deliveries, setDeliveries] = useState([]);
  const [memories, setMemories] = useState([]);
  const [files, setFiles] = useState([]);
  useEffect(() => {
    fetchDeliveries()
      .then((data) => setDeliveries(data.items))
      .catch(() => {});
    fetchRepoFiles()
      .then((data) => setFiles(data.items.map((item) => item.path)))
      .catch(() => {});
  }, []);
  // The memories live in the central: asked a moment after the typing stops.
  useEffect(() => {
    if (!query.trim()) return setMemories([]);
    const timer = setTimeout(() => {
      searchMemories(query)
        .then((data) => setMemories(data.items))
        .catch(() => {});
    }, 200);
    return () => clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    const onKey = (event) => event.key === 'Escape' && onClose();
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onClose]);

  const q = fold(query);
  const has = (text) => !q || fold(text).includes(q);
  const agents = bots
    .filter((bot) => has(`${bot.name} ${bot.lastMessage || ''}`))
    .slice(0, 5);
  const found = deliveries
    .filter((item) => has(`${item.title} ${item.verdict}`))
    .slice(0, 4);
  const models = q ? findTemplates(templates, query).slice(0, 4) : [];
  const results = [
    ...(q
      ? [
          {
            key: 'new',
            icon: <i className="ti ti-message-plus" />,
            title: `New agent: "${query}"`,
            run: () => onStart(query),
          },
        ]
      : []),
    ...agents.map((bot) => ({
      key: `a${bot.id}`,
      group: 'Agents',
      icon: <AgentAvatar bot={bot} size="sm" />,
      title: bot.name,
      note: bot.lastMessage,
      run: () => onOpen(`agent:${bot.id}`),
    })),
    ...models.map((item) => ({
      key: `t${item.id}`,
      group: 'Models',
      icon: <AgentAvatar bot={null} icon={item.icon} size="sm" />,
      title: item.name,
      note: item.area,
      run: () => onOpen(`template:${item.id}`),
    })),
    ...found.map((item) => ({
      key: `d${item.id}`,
      group: 'Entregas',
      icon: <i className="ti ti-package" />,
      title: item.title,
      note: item.verdict,
      run: () => onOpen(`agent:${item.botId}`),
    })),
    ...(q ? files.filter(has).slice(0, 4) : []).map((path) => ({
      key: `f${path}`,
      group: 'Files',
      icon: <i className={`ti ${iconOf(path)}`} />,
      title: path,
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

  return (
    <div
      className="backdrop pal"
      onPointerDown={(event) =>
        event.target === event.currentTarget && onClose()
      }
    >
      <div className="palette" role="dialog" aria-label="Buscar">
        <label className="pin">
          {SEARCH_ICON}
          <input
            autoFocus
            placeholder="Search agents, deliverables, files, or memory…"
            autoComplete="off"
            aria-label="Buscar"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => event.key === 'Enter' && results[0]?.run()}
          />
          <kbd>esc</kbd>
        </label>
        <div className="pres">
          {results.map((item, index) => (
            <div key={item.key}>
              {item.group && item.group !== results[index - 1]?.group && (
                <div className="label pg">{item.group}</div>
              )}
              <button onClick={item.run}>
                {item.icon}
                <span className="grow">{item.title}</span>
                {item.note && <span className="muted">{item.note}</span>}
              </button>
            </div>
          ))}
          {!results.length && (
            <p className="menu-note">Nothing with “{query}”.</p>
          )}
        </div>
      </div>
    </div>
  );
}
