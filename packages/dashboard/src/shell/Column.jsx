import { useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth, useSignOut } from '../auth/AuthContext';

import { GeminiSparkle } from '../components/zen';
import { LANGUAGES, currentLanguage } from '../lib/language';
import { version } from '../../package.json';
import { Menu, useMenu } from '../ui/Menu';

import { listAgents, stateOf, waitsOn } from '../state/agents';
import { AgentAvatar } from './AgentAvatar';
import { AgentGroups, AgentsSkeleton } from './AgentGroups';

// The search glass, the one icon drawn heavier than the system stroke (29/10/2026).
export const SEARCH_ICON = (
  <svg className="glass" viewBox="0 0 24 24" aria-hidden="true">
    <circle cx="10" cy="10" r="7" />
    <path d="M21 21l-6-6" />
  </svg>
);

// The column's right edge drags: wider, narrower, and under SNAP_AT it snaps to the small rail.
export const NAV_MIN = 220;
export const NAV_MAX = 440;
const SNAP_AT = 150;

function Item({ label, icon, isOn, onClick, extra = null }) {
  return (
    <button
      className={`item${isOn ? ' on' : ''}`}
      title={label}
      onClick={onClick}
    >
      {icon}
      <span className="t">{label}</span>
      {extra}
    </button>
  );
}

const REPO = 'https://github.com/ciro-maciel/gemini-code';

/** One line of the account card: a tonal glyph, what it is and, under it, what it holds. */
function AccountItem({ icon, title, note, isUntranslated = false, onClick }) {
  return (
    <button
      className="acct-item"
      onClick={onClick}
      data-no-translate={isUntranslated ? '' : undefined}
    >
      <span className="acct-glyph">
        <i className={`ti ${icon}`} />
      </span>
      <span className="acct-text">
        <span className="acct-title">{title}</span>
        {note && <span className="acct-note">{note}</span>}
      </span>
      <i className="ti ti-chevron-right acct-go" aria-hidden="true" />
    </button>
  );
}

const initialsOf = (name) =>
  String(name || '?')
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .slice(0, 2)
    .toUpperCase();

/**
 * The person at the foot of the column, as every panel of the house draws it
 * (10/11/2026, the kit's SidebarShell foot and the Dashboards' UserCard): the
 * black square with the initials, the name, the e-mail as a label, and the
 * menu of the account (Conta, Plano, Suporte, Sair) opening upward. The theme
 * is the square beside it, never a written item.
 */
function AccountFoot({ account, isDark, onAccount, onTheme }) {
  const menu = useMenu();
  const { isLocalMode } = useAuth();
  const signOut = useSignOut();
  const navigate = useNavigate();
  const name = account?.name || account?.email || 'Developer';
  const email = account?.email || '';
  const leave = async () => {
    menu.close();
    try {
      await signOut();
    } finally {
      navigate('/auth/signin');
    }
  };
  return (
    <div className="acct-foot">
      <button
        className={`user-card${menu.is('account') ? ' open' : ''}`}
        onClick={menu.open('account')}
        title={email ? `${name} · ${email}` : name}
        aria-label={`Account ${name}`}
        aria-haspopup="menu"
        aria-expanded={menu.is('account')}
      >
        <span className="avatar">{initialsOf(name)}</span>
        <span className="who">
          <b>{name}</b>
          {email && <span>{email}</span>}
        </span>
        <i className="ti ti-chevron-down chev" />
      </button>
      <button
        className="theme-sq"
        onClick={onTheme}
        title={isDark ? 'Light theme' : 'Dark theme'}
        aria-label={isDark ? 'Light theme' : 'Dark theme'}
      >
        <i className={`ti ${isDark ? 'ti-sun' : 'ti-moon'}`} />
      </button>
      {menu.is('account') && (
        <Menu
          anchor={menu.anchor}
          alignLeft
          width={340}
          maxHeight="calc(100vh - 16px)"
          className="acct-menu"
          onClose={menu.close}
        >
          <div className="acct-card">
            {email && <span className="acct-email">{email}</span>}
            <span className="acct-avatar" aria-hidden="true">
              <span>{initialsOf(name)}</span>
            </span>
            <b className="acct-hi">{`Hi, ${name}!`}</b>
            {isLocalMode && (
              <span className="acct-mode">
                <i className="ti ti-device-desktop" />
                Local · no sign-in
              </span>
            )}
            <button
              className="acct-manage"
              onClick={() => {
                menu.close();
                navigate('/settings/accounts');
              }}
            >
              Manage settings
            </button>
          </div>
          <div className="acct-list">
            <AccountItem
              icon="ti-key"
              title="API keys & models"
              note="Your Gemini API key and the models agents use"
              onClick={() => {
                menu.close();
                onAccount();
              }}
            />
            <AccountItem
              icon="ti-language"
              title="Language · Idioma"
              note={
                LANGUAGES.find((item) => item.id === currentLanguage())?.label
              }
              isUntranslated
              onClick={() => {
                menu.close();
                navigate('/settings/language');
              }}
            />
            <AccountItem
              icon="ti-stethoscope"
              title="Diagnostics"
              note="Whether everything works, is connected and is allowed"
              onClick={() => {
                menu.close();
                navigate('/settings/diagnostics');
              }}
            />
            {!isLocalMode && (
              <AccountItem icon="ti-logout" title="Sign out" onClick={leave} />
            )}
          </div>
          <footer className="acct-foot-links">
            <span>Gemini Code {version}</span>
            <span aria-hidden="true">·</span>
            <a
              href={`${REPO}/blob/main/CHANGELOG.md`}
              target="_blank"
              rel="noreferrer"
            >
              Changelog
            </a>
            <span aria-hidden="true">·</span>
            <a href={REPO} target="_blank" rel="noreferrer">
              GitHub
            </a>
          </footer>
        </Menu>
      )}
    </div>
  );
}

function MiniRow({ bot, isOn, onOpen }) {
  const state = stateOf(bot);
  const waits = waitsOn(bot);
  return (
    <button
      className={`mini-conv${isOn ? ' on' : ''}`}
      title={`${bot.name}${state.word ? ` · ${state.word}` : ''}`}
      onClick={onOpen}
    >
      <AgentAvatar bot={bot} size="sm" />
      {waits ? (
        <span className="mk wait">{waits}</span>
      ) : state.mark === 'live' ? (
        <span className="mk live" />
      ) : state.mark === 'done' ? (
        <span className="mk done" />
      ) : null}
    </button>
  );
}

/**
 * The one column: the brand and the search on top, the command center, the
 * agents or the files, then Conectores and Configurações under a rule, and the
 * person with the theme square at the foot. Collapsed, it is
 * a rail of icons that still lists every agent.
 */
export function Column({
  bots,
  activeBotId,
  isHome,
  isSettings,
  isConnectors,
  onConnectors,
  filter,
  collapsed,
  width,
  isDark,
  account,
  onFilter,
  onToggle,
  onResize,
  onSearch,
  onHome,
  onOpenAgent,
  onNewAgent,
  onSettings,
  onTheme,
}) {
  const navRef = useRef(null);
  const list = listAgents(bots ?? [], filter);

  const startDrag = (event) => {
    if (event.button !== 0) return;
    event.preventDefault();
    const nav = navRef.current;
    const left = nav.getBoundingClientRect().left;
    nav.classList.add('dragging');
    const move = (ev) =>
      onResize(
        ev.clientX - left < SNAP_AT
          ? null
          : Math.min(NAV_MAX, Math.max(NAV_MIN, ev.clientX - left)),
      );
    const up = () => {
      nav.classList.remove('dragging');
      removeEventListener('pointermove', move);
      removeEventListener('pointerup', up);
    };
    addEventListener('pointermove', move);
    addEventListener('pointerup', up);
  };

  // Files live in each agent now (the files MCP's tree beside its conversation): the side lists agents only.
  return (
    <nav
      ref={navRef}
      className={`nav${collapsed ? ' collapsed' : ''}`}
      style={collapsed ? undefined : { width }}
      aria-label="Navigation"
    >
      <div className="top">
        <button
          className="wordmark"
          onClick={onToggle}
          title="Toggle sidebar"
          aria-label="Toggle sidebar"
        >
          <GeminiSparkle size={20} />
        </button>
        <span className="brand">Gemini Code</span>
        <button
          className="icon-btn search-top"
          onClick={onSearch}
          title="Search (⌘K)"
          aria-label="Search"
        >
          {SEARCH_ICON}
        </button>
      </div>
      {collapsed && (
        <Item
          label="Buscar"
          icon={<i className="ti ti-search" />}
          onClick={onSearch}
        />
      )}
      <Item
        label="Command center"
        icon={<i className="ti ti-layout-grid" />}
        isOn={isHome}
        onClick={onHome}
      />
      {collapsed ? (
        <div className="nav-mini">
          <button className="item" onClick={onNewAgent} title="New agent">
            <i className="ti ti-message-plus" />
          </button>
          <div className="mini-list">
            {list.map((bot) => (
              <MiniRow
                key={bot.id}
                bot={bot}
                isOn={bot.id === activeBotId && !isHome}
                onOpen={() => onOpenAgent(bot.id)}
              />
            ))}
          </div>
        </div>
      ) : (
        <div className="nav-side">
          <div className="side-head">
            <div className="side-tabs">
              <b className="side-title grow">Agents</b>
              <>
                <button
                  className="icon-btn"
                  onClick={() =>
                    window.dispatchEvent(new CustomEvent('assistant:new-group'))
                  }
                  title="New group"
                  aria-label="New group"
                >
                  <i className="ti ti-category-plus" />
                </button>
                <button
                  className="icon-btn"
                  onClick={onNewAgent}
                  title="New agent"
                  aria-label="New agent"
                >
                  <i className="ti ti-message-plus" />
                </button>
              </>
            </div>
          </div>
          <div className="side-body">
            <>
              {bots === null ? (
                <AgentsSkeleton />
              ) : bots.length ? (
                <AgentGroups
                  bots={bots}
                  filter={filter}
                  activeBotId={activeBotId}
                  isHome={isHome}
                  onFilter={onFilter}
                  onOpenAgent={onOpenAgent}
                  onNewAgent={onNewAgent}
                />
              ) : (
                <p className="muted" style={{ padding: '12px 6px' }}>
                  No agents yet.
                </p>
              )}
            </>
          </div>
        </div>
      )}
      {/* The account's navigation under a rule, secondary in gray, as the kit's accountNav. */}
      <div className="acct-nav">
        <Item
          label="Connectors"
          icon={<i className="ti ti-plug-connected" />}
          isOn={isConnectors}
          onClick={onConnectors}
        />
        <Item
          label="Settings"
          icon={<i className="ti ti-adjustments-horizontal" />}
          isOn={isSettings}
          onClick={onSettings}
        />
      </div>
      <AccountFoot
        account={account}
        isDark={isDark}
        onAccount={() => onSettings('accounts')}
        onTheme={onTheme}
      />
      <div
        className="nav-grip"
        title="Drag to open or close the menu"
        aria-hidden="true"
        onPointerDown={startDrag}
      />
    </nav>
  );
}
