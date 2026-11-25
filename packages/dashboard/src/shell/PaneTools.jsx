import { closeAll, closePane, kindOf } from '../mesa/layout';
import { notify } from '../components/zen';
import { Menu, useMenu } from '../ui/Menu';
import { AgentAvatar } from './AgentAvatar';
import { pathOf } from '../mesa/routes';

/** The two buttons at the end of a pane's tab bar: recent agents, and more. */
export function PaneTools({ pane, bots, change, onOpen, onReopen = null }) {
  const menu = useMenu();
  const recent = [...bots]
    .sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0))
    .slice(0, 8);
  const isAgent = pane.active && kindOf(pane.active) === 'agent';
  const link = pane.active ? `${location.origin}${pathOf(pane.active)}` : null;
  return (
    <>
      <button
        className="icon-btn"
        onClick={menu.open('recent')}
        title="Recent agents"
      >
        <i className="ti ti-clock" />
      </button>
      <button
        className="icon-btn"
        onClick={menu.open('more')}
        title="More"
        aria-label={isAgent ? 'More agent actions' : 'More panel actions'}
      >
        <i className="ti ti-dots" />
      </button>
      {menu.is('recent') && (
        <Menu anchor={menu.anchor} title="Recent agents" onClose={menu.close}>
          {recent.map((bot) => (
            <button
              key={bot.id}
              onClick={() => {
                menu.close();
                onOpen(`agent:${bot.id}`);
              }}
            >
              <AgentAvatar bot={bot} size="sm" />
              <span className="grow">{bot.name}</span>
            </button>
          ))}
          {!recent.length && <p className="menu-note">No agents yet.</p>}
        </Menu>
      )}
      {menu.is('more') && (
        <Menu anchor={menu.anchor} width={240} onClose={menu.close}>
          {link && (
            <button
              onClick={() => {
                navigator.clipboard?.writeText(link);
                menu.close();
                notify.success(isAgent ? 'Agent link copied' : 'Link copied');
              }}
            >
              <i className="ti ti-link" />
              {isAgent ? 'Copy agent link' : 'Copy link'}
            </button>
          )}
          {link && (
            <button
              onClick={() => {
                menu.close();
                window.open(link, '_blank', 'noopener');
              }}
            >
              <i className="ti ti-app-window" />
              Open in new window
            </button>
          )}
          <hr />
          {onReopen && (
            <button
              onClick={() => {
                menu.close();
                if (!onReopen())
                  notify.info(
                    'Nothing to reopen',
                    'No tabs have been closed since the dashboard opened.',
                  );
              }}
              title="Alt + Shift + T"
            >
              <i className="ti ti-arrow-back-up" />
              Reopen last closed
            </button>
          )}
          <button
            onClick={() => {
              menu.close();
              change((next) => closePane(next, pane.id));
            }}
          >
            <i className="ti ti-x" />
            Close panel
          </button>
          <button
            onClick={() => {
              menu.close();
              change((next) => closeAll(next));
            }}
          >
            <i className="ti ti-layout-off" />
            Close all
          </button>
        </Menu>
      )}
    </>
  );
}
