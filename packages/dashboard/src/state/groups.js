import { listAgents, waitsOn } from './agents';

// Groups of agents in the column (31/10/2026). The central calls them sections
// (/api/sections): a group has an id, a name and a place; an agent sits in one
// group or in none. Agents shared by another account have no group here.

/** The company an agent works for, from its name: "Acme Studio - SEO" gives "Acme Studio". */
export const companyOf = (name) =>
  String(name).includes(' - ') ? String(name).split(' - ')[0].trim() : null;

/** Inside a group named after its company, the name drops what the header already says. */
export const shortNameOf = (bot, group) =>
  group && companyOf(bot.name) === group.name
    ? bot.name.slice(bot.name.indexOf(' - ') + 3)
    : bot.name;

/**
 * The column's groups, in the account's order, each with its agents, and the
 * agents in no group. Everywhere the most recent agent is on top (listAgents).
 */
// An agent with nothing for 14 days goes down to "Parados" (04/11/2026), out of
// the way and one click from coming back; anything new brings it up at once.
export const IDLE_DAYS = 14;
export const isIdle = (bot, nowSeconds) =>
  nowSeconds !== null &&
  !waitsOn(bot) &&
  !bot.runningCount &&
  !bot.hasNews &&
  bot.status !== 'provisioning' &&
  nowSeconds - (bot.lastActivityAt || bot.createdAt || nowSeconds) >
    IDLE_DAYS * 86400;

export function groupAgents(
  bots,
  groups,
  filter = 'all',
  { nowSeconds = null } = {},
) {
  const listed = listAgents(bots, filter);
  const idle = listed.filter((bot) => isIdle(bot, nowSeconds));
  const shown = listed.filter((bot) => !idle.includes(bot));
  const known = new Set(groups.map((group) => group.id));
  const groupOf = (bot) =>
    !bot.sharedBy && known.has(bot.sectionId) ? bot.sectionId : null;
  // The groups too: the one with the most recent agent on top; empty ones last (04/11/2026).
  const latestOf = (list) =>
    Math.max(0, ...list.map((bot) => bot.lastActivityAt || bot.createdAt || 0));
  return {
    groups: groups
      .map((group) => {
        // Inside a group too, the most recent on top: a dragged place no longer holds an agent down.
        const list = shown.filter((bot) => groupOf(bot) === group.id);
        return {
          ...group,
          bots: list,
          waiting: list.reduce((sum, bot) => sum + (waitsOn(bot) ? 1 : 0), 0),
          latestAt: latestOf(list),
        };
      })
      .map((group, index) => [group, index])
      .sort(([a, i], [b, j]) => b.latestAt - a.latestAt || i - j)
      .map(([group]) => group),
    loose: shown.filter((bot) => groupOf(bot) === null),
    idle,
  };
}

/**
 * The companies to offer "Agrupar por empresa" for: two or more, while none of
 * the person's agents is in a group yet (empty groups left from before do not count).
 */
export function companiesToGroup(bots, groups) {
  const known = new Set(groups.map((group) => group.id));
  if (bots.some((bot) => !bot.sharedBy && known.has(bot.sectionId))) return [];
  const counts = new Map();
  for (const bot of bots) {
    const company = !bot.sharedBy && companyOf(bot.name);
    if (company) counts.set(company, (counts.get(company) ?? 0) + 1);
  }
  return counts.size >= 2 ? [...counts.keys()] : [];
}

/** The order of a list after moving one id before another (or to the end). */
export function moveBefore(ids, movingId, beforeId = null) {
  const rest = ids.filter((id) => id !== movingId);
  const at = beforeId ? rest.indexOf(beforeId) : -1;
  rest.splice(at < 0 ? rest.length : at, 0, movingId);
  return rest;
}
