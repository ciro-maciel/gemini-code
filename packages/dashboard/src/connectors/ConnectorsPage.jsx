import { useCallback, useEffect, useState } from 'react';

import {
  abandonConnection,
  createConnection,
  deleteConnection,
  fetchApps,
  reauthorizeConnection,
  retryConnection,
  saveConnectionSecret,
  searchRegistry,
} from '../services/api';
import { notify } from '../components/zen';
import { SEARCH_ICON } from '../shell/Column';
import { Menu, useMenu } from '../ui/Menu';
import { brandIconOf } from './brand-icon';
import { fromRegistry, lineOf, sectionsOf, usedBy } from './catalog';
import { openSignIn, whenClosed } from './sign-in';
import { DeviceSignIn } from './DeviceSignIn';
import { keepIfSame } from '../state/keep-if-same';

/**
 * The app's mark: its brand icon in its own colors when the repository has
 * one, otherwise the image the server gives, on the gray scale.
 */
function AppIcon({ app }) {
  const brand = brandIconOf(app.id);
  const src = brand ?? app.icon;
  return (
    <span className={brand ? 'app-ic is-brand' : 'app-ic'}>
      {src ? (
        <img alt="" src={src} data-keep-colors={brand ? '' : undefined} />
      ) : (
        <i className="ti ti-plug-connected" />
      )}
    </span>
  );
}

/** Reading the tools again, signing in again, or removing (a second click confirms, in the menu itself). */
function ConnectionMenu({ app, onChange }) {
  const menu = useMenu();
  const [isConfirmingRemoval, setIsConfirmingRemoval] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const connection = app.connection;
  const run = async (action, success) => {
    try {
      const result = await action();
      if (success) notify.success(success);
      onChange();
      return result;
    } catch (error) {
      notify.error(error.message);
    }
  };
  const close = () => {
    setIsConfirmingRemoval(false);
    menu.close();
  };
  return (
    <>
      <button
        className="icon-btn"
        aria-label={`Set up ${app.title}`}
        onClick={menu.open('connection')}
      >
        <i className="ti ti-dots" />
      </button>
      {menu.is('connection') && (
        <Menu
          anchor={menu.anchor}
          title={app.title}
          width={240}
          onClose={close}
        >
          <button
            aria-busy={isRefreshing || undefined}
            onClick={async () => {
              if (isRefreshing) return;
              setIsRefreshing(true);
              await run(() => retryConnection(connection.id), 'Tools updated');
              setIsRefreshing(false);
            }}
          >
            <i className={`ti ti-refresh${isRefreshing ? ' spin' : ''}`} />
            {isRefreshing ? 'Updating tools…' : 'Update tools'}
          </button>
          <button
            onClick={async () => {
              close();
              const updated = await run(() =>
                reauthorizeConnection(connection.id),
              );
              if (updated?.status === 'pending_auth')
                openSignIn(updated.statusDetail);
            }}
          >
            <i className="ti ti-login" />
            {app.reauthorizeLabel || 'Sign in again'}
          </button>
          <hr />
          <button
            className="danger"
            onClick={async () => {
              if (!isConfirmingRemoval) return setIsConfirmingRemoval(true);
              close();
              await run(
                () => deleteConnection(connection.id),
                `${app.title} removed`,
              );
            }}
          >
            <i className="ti ti-plug-connected-x" />
            {isConfirmingRemoval ? 'Click again to remove' : 'Remover'}
          </button>
        </Menu>
      )}
    </>
  );
}

/** What the row offers, by the state of its connection. */
function ConnectionAction({ app, onChange }) {
  const [isBusy, setIsBusy] = useState(false);
  const [secret, setSecret] = useState('');
  // Apps whose address names the person's project (Auth, Payments, Messages):
  // the address is copied from that product's panel and pasted here.
  const [address, setAddress] = useState(null);
  const connection = app.connection;
  const run = async (action) => {
    setIsBusy(true);
    try {
      await action();
      onChange();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsBusy(false);
    }
  };
  const connect = (url = app.url) =>
    run(async () => {
      const created = await createConnection({
        serverName: app.serverName,
        title: app.title,
        url,
        transport: app.transport,
      });
      if (created.status === 'pending_auth') {
        // The connection counts only when the whole sign-in finished: closing or cancelling the window drops it.
        whenClosed(openSignIn(created.statusDetail), async () => {
          await abandonConnection(created.id).catch(() => {});
          onChange();
        });
      }
    });
  const isAddressValid = Boolean(
    app.addressPrefix &&
    address?.trim().startsWith(app.addressPrefix) &&
    address.trim().length > app.addressPrefix.length,
  );

  if (connection?.status === 'connected')
    return (
      <span className="conn-act">
        <span className="pill-st dark">
          <i className="ti ti-check" />
          conectado
        </span>
        <ConnectionMenu app={app} onChange={onChange} />
      </span>
    );
  if (connection?.status === 'pending_auth')
    return (
      <span className="conn-act">
        <button
          className="btn outline sm"
          onClick={() => openSignIn(connection.statusDetail)}
        >
          Sign in
        </button>
        <ConnectionMenu app={app} onChange={onChange} />
      </span>
    );
  if (connection?.status === 'needs_device')
    return (
      <span className="conn-act">
        <DeviceSignIn connection={connection} onChange={onChange} />
        <ConnectionMenu app={app} onChange={onChange} />
      </span>
    );
  if (connection?.status === 'needs_secret')
    return (
      <span className="conn-act">
        <input
          className="input sm"
          type="password"
          placeholder="Token"
          aria-label={`${app.title} token`}
          value={secret}
          onChange={(event) => setSecret(event.target.value)}
        />
        <button
          className="btn outline sm"
          disabled={!secret.trim() || isBusy}
          onClick={() =>
            run(() => saveConnectionSecret(connection.id, { value: secret }))
          }
        >
          Save
        </button>
      </span>
    );
  if (connection?.status === 'failed')
    return (
      <span className="conn-act">
        <button
          className="btn outline sm"
          disabled={isBusy}
          onClick={() => run(() => retryConnection(connection.id))}
        >
          Try again
        </button>
        <ConnectionMenu app={app} onChange={onChange} />
      </span>
    );
  if (address !== null)
    return (
      <span className="conn-act">
        <input
          className="input sm wide"
          autoFocus
          placeholder={`${app.addressPrefix}…`}
          title={app.addressHint}
          aria-label={`${app.title}'s address`}
          value={address}
          onChange={(event) => setAddress(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && isAddressValid)
              connect(address.trim());
            if (event.key === 'Escape') setAddress(null);
          }}
        />
        <button
          className="btn outline sm"
          disabled={!isAddressValid || isBusy}
          onClick={() => connect(address.trim())}
        >
          Connect
        </button>
      </span>
    );
  return (
    <button
      className="btn outline sm"
      disabled={isBusy}
      onClick={() => (app.addressPrefix ? setAddress('') : connect())}
    >
      Connect
    </button>
  );
}

function AppRow({ app, bots, onOpenAgent, onChange }) {
  const users = usedBy(
    app.connection?.status === 'connected' ? app.connection : null,
    bots,
  );
  const isEveryone =
    users.length > 0 &&
    users.length ===
      bots.filter((bot) => (bot.access ?? 'owner') === 'owner').length;
  return (
    <div className="app-row">
      <AppIcon app={app} />
      <div className="grow">
        <b>{app.title}</b>
        <div
          className={`muted${app.connection?.status === 'failed' ? ' bad' : ''}`}
        >
          {lineOf(app)}
        </div>
        {users.length > 0 && (
          <div className="used-by">
            <i className="ti ti-users" />
            {isEveryone ? 'All agents use' : 'Used by'}
            {!isEveryone &&
              users.map((bot) => (
                <button key={bot.id} onClick={() => onOpenAgent(bot.id)}>
                  {bot.name}
                </button>
              ))}
          </div>
        )}
      </div>
      <ConnectionAction app={app} onChange={onChange} />
    </div>
  );
}

/**
 * Conectores: the services the account connects once and its agents use,
 * with the old panel's whole flow (sign-in window, token, project address,
 * retry, read the tools again, sign in again, remove) in the prototype's design.
 */
export function ConnectorsPage({ bots, onOpenAgent }) {
  const [apps, setApps] = useState(null);
  const [categories, setCategories] = useState([]);
  const [filter, setFilter] = useState('all');
  const [term, setTerm] = useState('');
  const [registry, setRegistry] = useState(null);
  const [isSearching, setIsSearching] = useState(false);

  const load = useCallback(() => {
    fetchApps()
      .then((data) => {
        setApps(keepIfSame(data.items));
        setCategories(keepIfSame(data.categories));
      })
      .catch(() => setApps((current) => current ?? []));
  }, []);
  // A sign-in finishes in another window: the page reads the states again meanwhile.
  useEffect(() => {
    load();
    const timer = setInterval(load, 4000);
    return () => clearInterval(timer);
  }, [load]);

  const words = term.trim();
  const connected = (apps ?? []).filter(
    (app) => app.connection?.status === 'connected',
  );
  // An empty section is not drawn, except the connected ones, which then say so.
  const sections = apps
    ? sectionsOf(apps, categories, filter, term).filter(
        (section) => section.apps.length || section.id === 'connected',
      )
    : [];

  const searchTheRegistry = async () => {
    if (!words) return;
    setIsSearching(true);
    try {
      const known = new Set((apps ?? []).map((app) => app.serverName));
      setRegistry(
        (await searchRegistry(words)).items
          .filter((server) => !known.has(server.serverName))
          .map(fromRegistry),
      );
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsSearching(false);
    }
  };

  return (
    <main className="page">
      <div className="page-in">
        <div className="ph">
          <div className="grow">
            <div className="tpl-kicker">
              Connect once, every agent can use it
            </div>
            <h1>Connectors</h1>
            <p className="lead">
              Os serviços que seus agentes usam, pelo login de cada um. Cada
              agente escolhe os dele no chip Conexões; o que ele faz sem
              perguntar só muda quando alguém toca em Permitir.
            </p>
          </div>
          {connected.length > 0 && (
            <button
              className="conn-sum"
              onClick={() => setFilter('connected')}
              aria-label="View connected"
            >
              <span className="stack">
                {connected.slice(0, 4).map((app) => (
                  <AppIcon key={app.id} app={app} />
                ))}
              </span>
              {connected.length}{' '}
              {connected.length === 1 ? 'conectado' : 'conectados'}
              <i className="ti ti-chevron-right" />
            </button>
          )}
        </div>
        <div className="box">
          <div className="bb tpl-find">
            <label className="tpl-q">
              {SEARCH_ICON}
              <input
                autoFocus
                placeholder="Search apps or any service in the MCP registry"
                aria-label="Search connectors"
                value={term}
                onChange={(event) => {
                  setTerm(event.target.value);
                  setRegistry(null);
                }}
                onKeyDown={(event) =>
                  event.key === 'Enter' && searchTheRegistry()
                }
              />
            </label>
            <div className="filters">
              {[
                ['all', 'Todos'],
                [
                  'connected',
                  `Connected${connected.length ? ` · ${connected.length}` : ''}`,
                ],
                ...categories.map((category) => [category.id, category.label]),
              ].map(([id, label]) => (
                <button
                  key={id}
                  className={filter === id ? 'on' : ''}
                  onClick={() => setFilter(id)}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>
        {apps === null && (
          <div className="box">
            <div className="bb">
              {[0, 1, 2, 3].map((index) => (
                <div className="app-row sk" key={index}>
                  <span className="app-ic" />
                  <span className="grow sk-line" />
                </div>
              ))}
            </div>
          </div>
        )}
        {sections.map((section) => (
          <div className="box" key={section.id}>
            <div className="bh">
              <b className="grow">{section.label}</b>
              {filter === 'all' && !words && section.id !== 'recommended' && (
                <button
                  className="btn outline sm"
                  onClick={() => setFilter(section.id)}
                >
                  View only this
                </button>
              )}
            </div>
            <div className="bb app-grid">
              {section.apps.length ? (
                section.apps.map((app) => (
                  <AppRow
                    key={app.id}
                    app={app}
                    bots={bots}
                    onOpenAgent={onOpenAgent}
                    onChange={load}
                  />
                ))
              ) : (
                <p className="muted">
                  {filter === 'connected'
                    ? 'No connected apps yet.'
                    : 'No apps here.'}
                </p>
              )}
            </div>
          </div>
        ))}
        {words && filter !== 'connected' && (
          <div className="box">
            <div className="bh">
              <b className="grow">In the MCP registry</b>
            </div>
            <div className="bb">
              {registry === null ? (
                <div className="row">
                  <span className="grow muted">
                    Did not find “{words}”? O registro oficial tem milhares de
                    servidores. Às vezes leva meio minuto.
                  </span>
                  <button
                    className="btn filled sm"
                    disabled={isSearching}
                    onClick={searchTheRegistry}
                  >
                    {isSearching ? 'Procurando…' : 'Search the registry'}
                  </button>
                </div>
              ) : registry.length === 0 ? (
                <p className="muted">
                  Nothing in the registry for “{words}”. Tente o nome da
                  empresa, em inglês.
                </p>
              ) : (
                <div className="app-grid">
                  {registry.map((app) => (
                    <AppRow
                      key={app.id}
                      app={app}
                      bots={bots}
                      onOpenAgent={onOpenAgent}
                      onChange={load}
                    />
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
