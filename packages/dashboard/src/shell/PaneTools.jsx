import { closeAll, closePane, kindOf, refOf } from '../mesa/layout';
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
  // The live screen exists only for an agent that has its computer ('ready'); most never need one.
  const hasComputer =
    isAgent &&
    bots.find((bot) => bot.id === refOf(pane.active))?.status === 'ready';
  const link = pane.active ? `${location.origin}${pathOf(pane.active)}` : null;
  return (
    <>
      <button
        className="icon-btn"
        onClick={menu.open('recent')}
        title="Agentes recentes"
      >
        <i className="ti ti-clock" />
      </button>
      <button
        className="icon-btn"
        onClick={menu.open('more')}
        title="Mais"
        aria-label={isAgent ? 'Mais ações do agente' : 'Mais ações do painel'}
      >
        <i className="ti ti-dots" />
      </button>
      {menu.is('recent') && (
        <Menu
          anchor={menu.anchor}
          title="Agentes recentes"
          onClose={menu.close}
        >
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
          {!recent.length && <p className="menu-note">Nenhum agente ainda.</p>}
        </Menu>
      )}
      {menu.is('more') && (
        <Menu anchor={menu.anchor} width={240} onClose={menu.close}>
          {link && (
            <button
              onClick={() => {
                navigator.clipboard?.writeText(link);
                menu.close();
                notify.success(
                  isAgent ? 'Link do agente copiado' : 'Link copiado',
                );
              }}
            >
              <i className="ti ti-link" />
              {isAgent ? 'Copiar link do agente' : 'Copiar link'}
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
              Abrir em outra janela
            </button>
          )}
          {hasComputer && (
            <button
              onClick={() => {
                menu.close();
                onOpen(`screen:${refOf(pane.active)}`);
              }}
            >
              <i className="ti ti-device-desktop" />
              Ver a tela ao vivo
            </button>
          )}
          <hr />
          {onReopen && (
            <button
              onClick={() => {
                menu.close();
                if (!onReopen())
                  notify.info(
                    'Nada para reabrir',
                    'Nenhuma aba foi fechada desde que o painel abriu.',
                  );
              }}
              title="Alt + Shift + T"
            >
              <i className="ti ti-arrow-back-up" />
              Reabrir a última fechada
            </button>
          )}
          <button
            onClick={() => {
              menu.close();
              change((next) => closePane(next, pane.id));
            }}
          >
            <i className="ti ti-x" />
            Fechar o painel
          </button>
          <button
            onClick={() => {
              menu.close();
              change((next) => closeAll(next));
            }}
          >
            <i className="ti ti-layout-off" />
            Fechar tudo
          </button>
        </Menu>
      )}
    </>
  );
}
