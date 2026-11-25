import { useEffect, useState } from 'react';

import { fetchRepoFiles } from '../services/api';
import { buildTree, FOLDER_ICON, iconOf } from './tree';
import { Menu, useMenu } from '../ui/Menu';
import { keepIfSame } from '../state/keep-if-same';

const OPEN_STORE = 'assistant.tree';
const readOpen = () => {
  try {
    return new Set(JSON.parse(localStorage.getItem(OPEN_STORE)) || ['agents']);
  } catch {
    return new Set(['agents']);
  }
};

/** The person's repository as a tree; the first line says where it lives and when it last changed. */
export function useRepoFiles(isOpen) {
  const [state, setState] = useState({ items: null, repo: null });
  const [loadKey, setLoadKey] = useState(0);
  useEffect(() => {
    if (!isOpen) return;
    let isAlive = true;
    const load = () =>
      fetchRepoFiles()
        .then(
          (data) =>
            isAlive &&
            setState(keepIfSame({ items: data.items, repo: data.repo })),
        )
        .catch(() => isAlive && setState({ items: [], repo: null }));
    load();
    const timer = setInterval(load, 15000);
    // What left the panel goes from the tree at once; a commit reads the tree again.
    const onGone = (event) =>
      setState((current) => ({
        ...current,
        items:
          current.items?.filter(
            (item) => !item.path.startsWith(`${event.detail.folder}/`),
          ) ?? current.items,
      }));
    window.addEventListener('assistant:files-gone', onGone);
    window.addEventListener('assistant:repo', load);
    return () => {
      isAlive = false;
      clearInterval(timer);
      window.removeEventListener('assistant:files-gone', onGone);
      window.removeEventListener('assistant:repo', load);
    };
  }, [isOpen, loadKey]);
  return { ...state, reload: () => setLoadKey((key) => key + 1) };
}

// The prototype's folder menu, in its order.
export const FOLDER_ACTIONS = [
  ['cite', 'Mention in chat', 'ti-quote'],
  ['agent', 'New agent in this folder', 'ti-message-plus'],
  ['copy', 'Copy path', 'ti-copy'],
  null,
  ['file', 'New file…', 'ti-file-plus'],
  ['folder', 'New folder…', 'ti-folder-plus'],
  ['upload', 'Upload files here…', 'ti-upload'],
  null,
  ['rename', 'Rename…', 'ti-pencil'],
  ['delete', 'Delete folder…', 'ti-trash'],
];

export function FileTree({ items, repo, activePath, onOpen, onFolderAction }) {
  const [open, setOpen] = useState(readOpen);
  const menu = useMenu();
  const [menuPath, setMenuPath] = useState(null);
  const toggle = (path) =>
    setOpen((current) => {
      const next = new Set(current);
      next.has(path) ? next.delete(path) : next.add(path);
      try {
        localStorage.setItem(OPEN_STORE, JSON.stringify([...next]));
      } catch {}
      return next;
    });

  if (items === null)
    return (
      <p className="muted" style={{ padding: '12px 6px' }}>
        Loading…
      </p>
    );
  if (!repo)
    return (
      <p className="muted" style={{ padding: '12px 6px' }}>
        The file workspace is not set up yet.
      </p>
    );
  if (!items.length)
    return (
      <p className="muted" style={{ padding: '12px 6px' }}>
        {repo.mode === 'local'
          ? 'Local workspace ready. Create a folder or document above.'
          : "The repository is created on an agent's first change."}
      </p>
    );

  const draw = (node, depth) => [
    ...node.dirs.flatMap((dir) => {
      const isOpen = open.has(dir.path);
      return [
        <div
          key={`d:${dir.path}`}
          className="node"
          style={{ paddingLeft: depth * 14 }}
          role="button"
          tabIndex={0}
          onClick={() => toggle(dir.path)}
        >
          <i
            className={`ti chev ${isOpen ? 'ti-chevron-down' : 'ti-chevron-right'}`}
          />
          <i
            className={`ti kind ${depth === 0 && FOLDER_ICON[dir.name] ? FOLDER_ICON[dir.name] : 'ti-folder'}`}
          />
          <span className="name">{dir.name}</span>
          <button
            className="more"
            aria-label="Folder actions"
            onClick={(event) => {
              event.stopPropagation();
              setMenuPath(dir.path);
              menu.open('folder')(event);
            }}
          >
            <i className="ti ti-dots" />
          </button>
        </div>,
        ...(isOpen ? draw(dir, depth + 1) : []),
      ];
    }),
    ...node.files.map((path) => (
      <div
        key={`f:${path}`}
        className={`node${path === activePath ? ' on' : ''}`}
        style={{ paddingLeft: depth * 14 + 21 }}
        role="button"
        tabIndex={0}
        title={path}
        onClick={() => onOpen(path)}
      >
        <i className={`ti kind ${iconOf(path)}`} />
        <span className="name">{path.split('/').pop()}</span>
      </div>
    )),
  ];
  return (
    <>
      {draw(buildTree(items.map((item) => item.path)), 0)}
      {menu.is('folder') && (
        <Menu anchor={menu.anchor} width={240} onClose={menu.close}>
          {FOLDER_ACTIONS.map((action, index) =>
            action ? (
              <button
                key={action[0]}
                onClick={() => {
                  menu.close();
                  onFolderAction(action[0], menuPath);
                }}
              >
                <i className={`ti ${action[2]}`} />
                {action[1]}
              </button>
            ) : (
              <hr key={index} />
            ),
          )}
        </Menu>
      )}
    </>
  );
}
