import {
  closeOtherTabs,
  closeTab,
  closeTabsRight,
  kindOf,
  placeTab,
  refOf,
} from '../mesa/layout';
import { pathOf } from '../mesa/routes';
import { markBotUnread } from '../services/api';
import { botsChanged } from '../state/use-bots';
import { notify } from '../components/zen';
import { Menu } from '../ui/Menu';

// The menu opens where the pointer was: a point the Menu places itself under.
const pointAt = (x, y) => ({
  getBoundingClientRect: () => ({
    left: x,
    right: x,
    top: y,
    bottom: y,
    width: 0,
    height: 0,
  }),
  contains: () => false,
});

/**
 * The right button on a tab (14/11/2026): close it and its neighbours, split
 * the table, the agent's own shortcuts, and take it out. A command that does
 * not fit the tab is left out; one that fits but cannot run now shows grayed
 * with the reason. The tab's name heads the menu.
 */
export function TabMenu({
  target,
  title,
  bots,
  change,
  onOpen,
  onReopen,
  onClose,
}) {
  const { x, y, pane, tab } = target;
  const isAgent = kindOf(tab) === 'agent';
  const bot = isAgent ? bots.find((each) => each.id === refOf(tab)) : null;
  const isOwner =
    Boolean(bot) && !bot.sharedBy && (bot.access ?? 'owner') === 'owner';
  const index = pane.tabs.indexOf(tab);
  const isAlone = pane.tabs.length === 1;
  const isLast = index === pane.tabs.length - 1;
  const link = `${location.origin}${pathOf(tab)}`;
  const run = (action) => () => {
    onClose();
    action();
  };

  return (
    <Menu
      anchor={pointAt(x, y)}
      alignLeft
      title={title}
      width={280}
      maxHeight="calc(100vh - 16px)"
      onClose={onClose}
    >
      <button onClick={run(() => change((next) => closeTab(next, tab)))}>
        <i className="ti ti-x" />
        Close
      </button>
      {!isAlone && (
        <button
          onClick={run(() => change((next) => closeOtherTabs(next, tab)))}
        >
          <i className="ti ti-list-details" />
          Close others
        </button>
      )}
      {!isLast && (
        <button
          onClick={run(() => change((next) => closeTabsRight(next, tab)))}
        >
          <i className="ti ti-arrow-bar-to-right" />
          Close tabs to the right
        </button>
      )}
      {onReopen && (
        <button
          onClick={run(() => {
            if (!onReopen())
              notify.info(
                'Nothing to reopen',
                'No tabs have been closed since the dashboard opened.',
              );
          })}
          title="Alt + Shift + T"
        >
          <i className="ti ti-arrow-back-up" />
          Reopen last closed
          <kbd className="menu-kbd">Alt ⇧ T</kbd>
        </button>
      )}
      {!isAlone && (
        <>
          <hr />
          <button
            onClick={run(() =>
              change((next) => placeTab(next, tab, pane.id, 'right')),
            )}
          >
            <i className="ti ti-layout-columns" />
            Split right
          </button>
          <button
            onClick={run(() =>
              change((next) => placeTab(next, tab, pane.id, 'bottom')),
            )}
          >
            <i className="ti ti-layout-rows" />
            Split down
          </button>
        </>
      )}
      {bot && (
        <>
          <hr />
          {isOwner && (
            <button onClick={run(() => onOpen(`settings:${bot.id}`))}>
              <i className="ti ti-adjustments-horizontal" />
              Agent settings
            </button>
          )}
          {isOwner && (
            <button
              onClick={run(async () => {
                try {
                  await markBotUnread(bot.id);
                  botsChanged();
                } catch (error) {
                  notify.error(
                    "Couldn't mark as unread",
                    `${error.message}. Try again.`,
                  );
                }
              })}
            >
              <i className="ti ti-mail" />
              Mark as unread
            </button>
          )}
        </>
      )}
      <hr />
      <button
        onClick={run(() => {
          navigator.clipboard
            ?.writeText(link)
            .then(() =>
              notify.success(isAgent ? 'Agent link copied' : 'Link copied'),
            )
            .catch(() => notify.error("Couldn't copy the link", link));
        })}
      >
        <i className="ti ti-link" />
        Copy link
      </button>
      {isAgent && (
        <button onClick={run(() => window.open(link, '_blank', 'noopener'))}>
          <i className="ti ti-app-window" />
          Open in new window
        </button>
      )}
    </Menu>
  );
}
