// The connectors page's logic, kept out of the drawing so it can be tested:
// which apps show in which section, what each one says, who uses it.

const fold = (text) =>
  String(text || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');

/** The sections to draw: Recomendados and each category, one filter, the search results, or the connected ones. */
export function sectionsOf(apps, categories, filter, term) {
  const words = fold(term).trim();
  const visible = apps.filter(
    (app) => !words || fold(`${app.title} ${app.description}`).includes(words),
  );
  if (filter === 'connected')
    return [
      {
        id: 'connected',
        label: 'Conectados',
        apps: apps.filter((app) => app.connection),
      },
    ];
  if (filter === 'all' && !words) {
    return [
      {
        id: 'recommended',
        label: 'Recomendados',
        apps: visible.filter((app) => app.isRecommended),
      },
      ...categories.map((category) => ({
        id: category.id,
        label: category.label,
        apps: visible.filter((app) => app.category === category.id),
      })),
    ].filter((section) => section.apps.length);
  }
  const inCategory =
    filter === 'all'
      ? visible
      : visible.filter((app) => app.category === filter);
  return [
    {
      id: 'results',
      label: words
        ? `Results for “${String(term).trim()}”`
        : categories.find((category) => category.id === filter)?.label ||
          'Aplicativos',
      apps: inCategory,
    },
  ];
}

/** What the row says under the app's name. */
export function lineOf(app) {
  const connection = app.connection;
  if (connection?.status === 'failed')
    return connection.statusDetail || 'Connection failed';
  if (connection?.status === 'pending_auth') return 'Needs to sign in again';
  if (connection?.status === 'needs_secret')
    return 'Paste the service token to finish';
  if (connection?.status === 'needs_device')
    return (
      connection.statusDetail ||
      'Sign in on GitHub with the Gemini Code app, then approve it'
    );
  if (connection?.status === 'connected')
    return `${connection.tools.length} ${connection.tools.length === 1 ? 'tool' : 'tools'} · ${app.description}`;
  return app.description;
}

/** The account's agents that use a connection: all of them unless an agent picked its own list. */
export function usedBy(connection, bots) {
  if (!connection) return [];
  return bots.filter(
    (bot) =>
      (bot.access ?? 'owner') === 'owner' &&
      (!Array.isArray(bot.connectionIds) ||
        bot.connectionIds.includes(connection.id)),
  );
}

/** A registry server as a row of the page. */
export function fromRegistry(server) {
  const remote = server.remotes[0];
  return {
    id: `registry:${server.serverName}`,
    title: server.title,
    description: server.description || server.serverName,
    serverName: server.serverName,
    url: remote.url,
    transport: remote.transport,
    icon: null,
    connection: null,
  };
}
