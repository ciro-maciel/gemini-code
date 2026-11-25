// How an agent reads in the column, as in the prototype: what waits for a
// person comes first, then what runs, then what finished, then the rest.

/** How many things wait for a person in this agent: approvals, questions, connections and open choices. */
export const waitsOn = (bot) =>
  (bot.needsYou ? Math.max(1, bot.waitingCount || 0) : bot.waitingCount || 0) +
  (bot.pendingChoices || 0);

/** The state word under the agent's name, and the mark it carries. */
export function stateOf(bot) {
  if (bot.status === 'provisioning')
    return { word: 'preparando o computador', mark: 'live' };
  if (bot.status === 'failed')
    return { word: 'o computador não ficou pronto', mark: 'stopped' };
  if (waitsOn(bot)) return { word: 'espera você', mark: 'wait' };
  if (bot.runningCount) return { word: 'rodando', mark: 'live' };
  if (bot.hasNews) return { word: 'terminou', mark: 'done' };
  return { word: '', mark: null };
}

export const FILTERS = [
  ['all', 'Todos'],
  ['mine', 'Meus'],
  ['shared', 'Compartilhados'],
];

// An agent is shared when it belongs to another account and the person is a member of it.
const FILTER_FN = {
  all: () => true,
  mine: (bot) => !bot.sharedBy,
  shared: (bot) => Boolean(bot.sharedBy),
};

export function listAgents(bots, filter = 'all') {
  return (
    bots
      .filter(FILTER_FN[filter] || FILTER_FN.all)
      .map((bot, index) => [bot, index])
      // The most recent always on top (04/11/2026): what waits or runs shows by its mark, not by jumping the line.
      .sort(
        ([a, i], [b, j]) =>
          (b.lastActivityAt || b.createdAt) -
            (a.lastActivityAt || a.createdAt) || i - j,
      )
      .map(([bot]) => bot)
  );
}

/** "agora", "12 min", "3 h", "ontem", "2 d" from a time in seconds. */
export function shortWhen(seconds, nowSeconds = Date.now() / 1000) {
  if (!seconds) return '';
  const minutes = Math.floor((nowSeconds - seconds) / 60);
  if (minutes < 1) return 'agora';
  if (minutes < 60) return `${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h`;
  const days = Math.floor(hours / 24);
  return days === 1 ? 'ontem' : `${days} d`;
}
