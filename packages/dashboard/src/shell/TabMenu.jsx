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
  const hasComputer = bot?.status === 'ready';
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
        Fechar
      </button>
      {!isAlone && (
        <button
          onClick={run(() => change((next) => closeOtherTabs(next, tab)))}
        >
          <i className="ti ti-list-details" />
          Fechar as outras
        </button>
      )}
      {!isLast && (
        <button
          onClick={run(() => change((next) => closeTabsRight(next, tab)))}
        >
          <i className="ti ti-arrow-bar-to-right" />
          Fechar as da direita
        </button>
      )}
      {onReopen && (
        <button
          onClick={run(() => {
            if (!onReopen())
              notify.info(
                'Nada para reabrir',
                'Nenhuma aba foi fechada desde que o painel abriu.',
              );
          })}
          title="Alt + Shift + T"
        >
          <i className="ti ti-arrow-back-up" />
          Reabrir a última fechada
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
            Dividir à direita
          </button>
          <button
            onClick={run(() =>
              change((next) => placeTab(next, tab, pane.id, 'bottom')),
            )}
          >
            <i className="ti ti-layout-rows" />
            Dividir abaixo
          </button>
        </>
      )}
      {bot && (
        <>
          <hr />
          {isOwner && (
            <button onClick={run(() => onOpen(`settings:${bot.id}`))}>
              <i className="ti ti-adjustments-horizontal" />
              Ajustes do agente
            </button>
          )}
          <button
            disabled={!hasComputer}
            onClick={run(() => onOpen(`screen:${bot.id}`))}
          >
            <i className="ti ti-device-desktop" />
            Ver a tela ao vivo
            {!hasComputer && (
              <span className="menu-why">sem computador agora</span>
            )}
          </button>
          {isOwner && (
            <button
              onClick={run(async () => {
                try {
                  await markBotUnread(bot.id);
                  botsChanged();
                } catch (error) {
                  notify.error(
                    'Não marquei como não lida',
                    `${error.message}. Tente de novo.`,
                  );
                }
              })}
            >
              <i className="ti ti-mail" />
              Marcar como não lida
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
              notify.success(
                isAgent ? 'Link do agente copiado' : 'Link copiado',
              ),
            )
            .catch(() => notify.error('Não copiei o link', link));
        })}
      >
        <i className="ti ti-link" />
        Copiar link
      </button>
      {isAgent && (
        <button onClick={run(() => window.open(link, '_blank', 'noopener'))}>
          <i className="ti ti-app-window" />
          Abrir em outra janela
        </button>
      )}
    </Menu>
  );
}
