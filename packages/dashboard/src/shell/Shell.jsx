import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { useComputedColorScheme, useMantineColorScheme } from '@mantine/core';
import { useHotkeys } from '@mantine/hooks';
import { useLocation, useNavigate } from 'react-router-dom';

import { useAccount } from '../components/Session';
import {
  deleteRepoPath,
  renameRepoFolder,
  saveRepoFile,
} from '../services/api';
import { DeleteModal, notify } from '../components/zen';
import { NameModal } from '../ui/NameModal';
import { useBots } from '../state/use-bots';
import { templateById, useTemplates } from '../state/templates';
import {
  closeTab,
  cloneBoard,
  dropTabs,
  emptyBoard,
  isEmpty,
  kindOf,
  openTab,
  paneOfTab,
  panesOf,
  refOf,
} from '../mesa/layout';
import { Mesa } from '../mesa/Mesa';
import { AgentTab } from '../agent/AgentTab';
import { AgentSettings } from '../agent/AgentSettings';
import { ScreenTab } from '../agent/ScreenTab';
import { ComputerFileTab } from '../files/ComputerFileTab';
import { RepoFileTab } from '../files/RepoFileTab';
import { useRepoFiles } from '../files/FileTree';
import { CommandCenter } from '../pages/CommandCenter';
import { SearchPalette } from '../search/SearchPalette';
import { Column, NAV_MAX, NAV_MIN } from './Column';
import { PaneTools } from './PaneTools';
import { TabMenu } from './TabMenu';
import { pathOf, tabOf } from '../mesa/routes';

// Screens opened now and then load when opened: the first page carries less.
const TemplateTab = lazy(() =>
  import('../pages/TemplateTab').then((module) => ({
    default: module.TemplateTab,
  })),
);
const NewTemplateTab = lazy(() =>
  import('../pages/NewTemplateTab').then((module) => ({
    default: module.NewTemplateTab,
  })),
);
const SettingsPage = lazy(() =>
  import('../pages/SettingsPage').then((module) => ({
    default: module.SettingsPage,
  })),
);
const ConnectorsPage = lazy(() =>
  import('../connectors/ConnectorsPage').then((module) => ({
    default: module.ConnectorsPage,
  })),
);

const STORE = 'assistant.shell';
const readStore = () => {
  try {
    return JSON.parse(localStorage.getItem(STORE)) || {};
  } catch {
    return {};
  }
};
const writeStore = (value) => {
  try {
    localStorage.setItem(STORE, JSON.stringify(value));
  } catch {}
};

/**
 * The panel: the one column, and beside it the command center, the Mesa or the
 * settings. The Mesa, the column's width and whether it is collapsed are kept
 * in the browser; the address always follows what is in front.
 */
export function Shell() {
  const account = useAccount();
  const { bots, reload } = useBots();
  const { items: templates } = useTemplates();
  const [isFilesOpen, setIsFilesOpen] = useState(false);
  const location = useLocation();
  const navigate = useNavigate();
  const { setColorScheme } = useMantineColorScheme();
  const colorScheme = useComputedColorScheme('light');
  const stored = useMemo(readStore, []);
  const [board, setBoard] = useState(() => stored.board || emptyBoard());
  const [nav, setNav] = useState(() => ({
    collapsed: false,
    width: 288,
    side: 'agents',
    filter: 'all',
    ...stored.nav,
  }));
  const [settingsTab, setSettingsTab] = useState({});
  const [isSearch, setIsSearch] = useState(false);
  const [naming, setNaming] = useState(null);
  const [deleting, setDeleting] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const isSettings = location.pathname.startsWith('/settings');
  const isConnectors = location.pathname === '/connectors';
  const isHome = location.pathname === '/';
  const isDark = colorScheme === 'dark';

  useEffect(() => writeStore({ board, nav }), [board, nav]);
  useEffect(
    () => setIsFilesOpen((current) => current || nav.side === 'files'),
    [nav.side],
  );
  const repoFiles = useRepoFiles(isFilesOpen);
  const change = useCallback(
    (fn) =>
      setBoard((current) => {
        const next = cloneBoard(current);
        fn(next);
        return next;
      }),
    [],
  );

  // The address opens its tab; the command center is the Mesa set aside.
  useEffect(() => {
    const tab = tabOf(location.pathname + location.search);
    if (tab) change((next) => openTab(next, tab));
  }, [location.pathname, location.search, change]);

  // A deleted agent takes its tabs with it.
  useEffect(() => {
    if (!bots) return;
    const ids = new Set(bots.map((bot) => bot.id));
    change((next) =>
      dropTabs(
        next,
        (tab) =>
          ['agent', 'settings', 'screen'].includes(kindOf(tab)) &&
          !ids.has(refOf(tab)),
      ),
    );
  }, [bots, change]);

  // Closing what is in front: the address follows the tab left in front, or the command center.
  // The tabs closed lately, newest last: "Reabrir a última fechada" brings them back one by one (04/11/2026).
  const closedRef = useRef([]);
  // The tab whose menu is open (right button, Shift + F10, a finger held), and where.
  const [tabMenu, setTabMenu] = useState(null);
  const removeAndFollow = useCallback(
    (fn) => {
      const next = cloneBoard(board);
      fn(next);
      const left = new Set(panesOf(next.layout).flatMap((pane) => pane.tabs));
      const gone = panesOf(board.layout)
        .flatMap((pane) => pane.tabs)
        .filter((tab) => !left.has(tab));
      if (gone.length)
        closedRef.current = [
          ...closedRef.current.filter((tab) => !gone.includes(tab)),
          ...gone,
        ].slice(-10);
      setBoard(next);
      const current = tabOf(location.pathname + location.search);
      if (current && !paneOfTab(next.layout, current)) {
        const front = panesOf(next.layout).find((p) => p.active);
        navigate(front ? pathOf(front.active) : '/', { replace: true });
      }
    },
    [board, location.pathname, location.search, navigate],
  );

  const reopenClosed = () => {
    const open = new Set(panesOf(board.layout).flatMap((pane) => pane.tabs));
    closedRef.current = closedRef.current.filter((tab) => !open.has(tab));
    const tab = closedRef.current.pop();
    if (tab) navigate(pathOf(tab));
    return Boolean(tab);
  };

  useHotkeys(
    [
      ['mod+K', () => setIsSearch(true)],
      ['alt+shift+T', () => reopenClosed()],
    ],
    [],
  );

  const go = (tab) => navigate(pathOf(tab));
  const botOf = (id) => bots?.find((bot) => bot.id === id);
  const activeTab = tabOf(location.pathname + location.search);
  const activeBotId =
    activeTab && ['agent', 'settings', 'screen'].includes(kindOf(activeTab))
      ? refOf(activeTab)
      : null;

  // The context row's offer for an agent: the repository files open on the
  // Mesa, and the files of that agent's own computer.
  const openTabs = panesOf(board.layout).flatMap((pane) => pane.tabs);
  const suggestionsFor = (botId) =>
    openTabs.flatMap((tab) => {
      const ref = refOf(tab);
      if (kindOf(tab) === 'file')
        return [
          {
            k: tab,
            name: ref.split('/').pop(),
            icon: 'ti-file-text',
            path: ref,
          },
        ];
      if (kindOf(tab) === 'cfile' && ref.startsWith(`${botId}/`)) {
        const rest = ref.slice(botId.length + 1);
        return [
          {
            k: tab,
            name: rest.split('/').pop(),
            icon: 'ti-file-text',
            path: rest.startsWith('/') ? rest : `/${rest}`,
          },
        ];
      }
      return [];
    });

  // A file or a folder deleted: one commit, and the tabs of what is gone close.
  const removeRepoPath = async () => {
    const { path, isFolder } = deleting;
    setIsDeleting(true);
    try {
      await deleteRepoPath(path);
      change((next) =>
        dropTabs(
          next,
          (tab) =>
            kindOf(tab) === 'file' &&
            (refOf(tab) === path || refOf(tab).startsWith(`${path}/`)),
        ),
      );
      notify.success(
        isFolder
          ? `Folder ${path} deleted`
          : `${path.split('/').pop()} apagado`,
      );
      setDeleting(null);
      repoFiles.reload();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsDeleting(false);
    }
  };
  const saveName = async (name) => {
    const { action, path } = naming;
    setNaming(null);
    try {
      if (action === 'file') {
        await saveRepoFile(
          `${path}/${name}`,
          `# ${name.replace(/\.md$/, '')}\n`,
        );
        go(`file:${path}/${name}`);
      } else if (action === 'folder')
        await saveRepoFile(
          `${path ? `${path}/` : ''}${name}/README.md`,
          `# ${name}\n`,
        );
      else {
        const parent = path.includes('/')
          ? path.slice(0, path.lastIndexOf('/'))
          : '';
        await renameRepoFolder(path, parent ? `${parent}/${name}` : name);
        notify.success(`Folder renamed to ${name}`);
      }
      repoFiles.reload();
    } catch (error) {
      notify.error(error.message);
    }
  };

  const tabInfo = (tab) => {
    const kind = kindOf(tab);
    const ref = refOf(tab);
    const bot = botOf(ref);
    if (kind === 'agent')
      return {
        icon: 'ti-message',
        name: bot?.name || 'Agente',
        live: Boolean(bot?.runningCount),
      };
    if (kind === 'settings')
      return {
        icon: 'ti-adjustments-horizontal',
        name: `Settings · ${bot?.name || 'agente'}`,
      };
    if (kind === 'screen')
      return {
        icon: 'ti-device-desktop',
        name: `Screen · ${bot?.name || 'agente'}`,
        live: true,
      };
    if (kind === 'template')
      return ref === 'new'
        ? { icon: 'ti-plus', name: 'New model' }
        : {
            icon: templateById(ref)?.icon || 'ti-template',
            name: `Model · ${templateById(ref)?.name || ref}`,
          };
    if (kind === 'file' || kind === 'cfile')
      return { icon: 'ti-file-text', name: ref.split('/').pop() };
    return { icon: 'ti-file', name: tab };
  };

  const renderTab = (tab, pane) => {
    const kind = kindOf(tab);
    const ref = refOf(tab);
    const bot = botOf(ref);
    const template = templateById(bot?.templateId);
    if (['agent', 'settings', 'screen'].includes(kind) && !bot)
      return bots === null ? null : (
        <div className="pane-empty">
          <i className="ti ti-message-off" />
          <b>Unknown agent</b>
          <span className="muted">This address doesn’t match any agent.</span>
        </div>
      );
    if (kind === 'agent')
      return (
        <AgentTab
          key={ref}
          bot={bot}
          template={template}
          isVisible={pane.active === tab}
          modelLabel={bot.model.split('/').pop()}
          onOpenSettings={() => go(`settings:${ref}`)}
          onOpenScreen={() => go(`screen:${ref}`)}
          onOpenFile={(path) => go(`cfile:${path}`)}
          onOpenRepoFile={(path) => go(`file:${path}`)}
          suggestions={suggestionsFor(ref)}
        />
      );
    if (kind === 'settings')
      return (
        <AgentSettings
          bot={bot}
          template={template}
          tab={settingsTab[ref] || 'when'}
          onTab={(value) =>
            setSettingsTab((current) => ({ ...current, [ref]: value }))
          }
        />
      );
    if (kind === 'screen') return <ScreenTab bot={bot} />;
    if (kind === 'template' && ref === 'new')
      return (
        <Suspense fallback={null}>
          <NewTemplateTab
            onCreated={(id) => {
              change((next) => closeTab(next, 'template:new'));
              go(`template:${id}`);
            }}
          />
        </Suspense>
      );
    if (kind === 'template')
      return (
        <Suspense fallback={null}>
          <TemplateTab
            templateId={ref}
            bots={bots ?? []}
            onOpenAgent={(id) => go(`agent:${id}`)}
            onOpenTemplate={(id) => go(`template:${id}`)}
            onOpenFile={(path) => go(`file:${path}`)}
          />
        </Suspense>
      );
    if (kind === 'file')
      return (
        <RepoFileTab
          path={ref}
          repoMode={repoFiles.repo?.mode || 'local'}
          onDelete={() => setDeleting({ path: ref, isFolder: false })}
        />
      );
    if (kind === 'cfile') return <ComputerFileTab path={ref} />;
    return null;
  };

  const front = isSettings ? (
    <Suspense fallback={null}>
      <SettingsPage section={location.pathname.split('/')[2] || 'accounts'} />
    </Suspense>
  ) : isConnectors ? (
    <Suspense fallback={null}>
      <ConnectorsPage
        bots={bots ?? []}
        onOpenAgent={(id) => go(`agent:${id}`)}
      />
    </Suspense>
  ) : isHome || isEmpty(board.layout) ? (
    <main className="mesa home">
      <CommandCenter
        account={account}
        bots={bots}
        templates={templates}
        onOpenAgent={(id) => go(`agent:${id}`)}
        onOpenTemplate={(id) => go(`template:${id}`)}
        onNewTemplate={() => go('template:new')}
      />
    </main>
  ) : (
    <Mesa
      board={board}
      change={change}
      remove={removeAndFollow}
      tabInfo={tabInfo}
      renderTab={renderTab}
      onActivate={go}
      onFocus={(tab) =>
        tab !== activeTab && navigate(pathOf(tab), { replace: true })
      }
      onTabMenu={setTabMenu}
      tools={(pane) => (
        <PaneTools
          pane={pane}
          bots={bots ?? []}
          change={removeAndFollow}
          onOpen={go}
          onReopen={reopenClosed}
        />
      )}
    />
  );

  return (
    <div className="app">
      <Column
        bots={bots}
        activeBotId={activeBotId}
        isHome={isHome}
        isSettings={isSettings}
        isConnectors={isConnectors}
        onConnectors={() => navigate('/connectors')}
        filter={nav.filter}
        collapsed={nav.collapsed}
        width={nav.width}
        isDark={isDark}
        account={account}
        onFilter={(filter) => setNav((current) => ({ ...current, filter }))}
        onToggle={() =>
          setNav((current) => ({ ...current, collapsed: !current.collapsed }))
        }
        onResize={(width) =>
          setNav((current) =>
            width === null
              ? { ...current, collapsed: true }
              : {
                  ...current,
                  collapsed: false,
                  width: Math.min(NAV_MAX, Math.max(NAV_MIN, width)),
                },
          )
        }
        onSearch={() => setIsSearch(true)}
        onHome={() => navigate('/')}
        onOpenAgent={(id) => go(`agent:${id}`)}
        onNewAgent={(sectionId) =>
          navigate(
            '/',
            typeof sectionId === 'string'
              ? { state: { sectionId } }
              : undefined,
          )
        }
        onSettings={(section) =>
          navigate(
            `/settings/${typeof section === 'string' ? section : 'accounts'}`,
          )
        }
        onTheme={() => setColorScheme(isDark ? 'light' : 'dark')}
      />
      {front}
      {tabMenu && (
        <TabMenu
          target={tabMenu}
          title={tabInfo(tabMenu.tab).name}
          bots={bots ?? []}
          change={removeAndFollow}
          onOpen={go}
          onReopen={reopenClosed}
          onClose={() => setTabMenu(null)}
        />
      )}
      {naming && (
        <NameModal
          title={
            { file: 'New file', folder: 'New folder', rename: 'Rename' }[
              naming.action
            ]
          }
          icon={
            {
              file: 'ti-file-plus',
              folder: 'ti-folder-plus',
              rename: 'ti-pencil',
            }[naming.action]
          }
          initial={
            naming.action === 'rename'
              ? naming.path.split('/').pop()
              : naming.action === 'folder'
                ? 'nova-pasta'
                : 'novo.md'
          }
          action={naming.action === 'rename' ? 'Rename' : 'Create'}
          onSave={saveName}
          onClose={() => setNaming(null)}
        />
      )}
      <DeleteModal
        opened={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={removeRepoPath}
        target={deleting?.path.split('/').pop() ?? ''}
        context={
          deleting?.isFolder
            ? `Folder · ${deleting.path}/`
            : `File · ${deleting?.path ?? ''}`
        }
        consequences={
          repoFiles.repo?.mode === 'github'
            ? deleting?.isFolder
              ? [
                  'The folder and everything in it will be removed from your files in a commit under your name.',
                  'The history stays on GitHub.',
                ]
              : [
                  'The file is removed from your files in a commit under your name.',
                  'The history stays on GitHub.',
                ]
            : deleting?.isFolder
              ? [
                  'The folder and every file in it will be removed from the local workspace.',
                  'The revision history stays on the server.',
                ]
              : [
                  'The file will be removed from the local workspace.',
                  'The revision history stays on the server.',
                ]
        }
        confirmLabel={deleting?.isFolder ? 'Delete folder' : 'Delete file'}
        loading={isDeleting}
      />
      {isSearch && (
        <SearchPalette
          bots={bots ?? []}
          templates={templates}
          onClose={() => setIsSearch(false)}
          onOpen={(tab) => {
            setIsSearch(false);
            go(tab);
          }}
          onStart={(text) => {
            setIsSearch(false);
            navigate('/', { state: { draft: text } });
          }}
          reload={reload}
        />
      )}
    </div>
  );
}
