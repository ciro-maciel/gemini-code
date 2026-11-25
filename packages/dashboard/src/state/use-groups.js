import { useCallback, useEffect, useState } from 'react';

import {
  createSection,
  deleteSection,
  fetchSections,
  renameSection,
  reorderSection,
  reorderSections,
  updateBot,
} from '../services/api';
import { botsChanged } from './use-bots';
import { companyOf } from './groups';
import { notify } from '../components/zen';

/**
 * The account's groups and what a person does to them: create, rename, delete
 * (its agents go back to no group), reorder, and move agents in and out.
 * Each change reloads the groups and the agents.
 */
export function useGroups() {
  // null until the central answers: the column waits for the groups instead of drawing
  // every agent loose and open, then folding them away (14/11/2026). A failure shows the agents ungrouped.
  const [groups, setGroups] = useState(null);
  const reload = useCallback(
    () =>
      fetchSections()
        .then((data) => setGroups(data.items))
        .catch(() => setGroups((current) => current ?? [])),
    [],
  );
  useEffect(() => {
    reload();
  }, [reload]);

  const run = async (work, done) => {
    try {
      const result = await work();
      await reload();
      botsChanged();
      if (done)
        notify.success(typeof done === 'function' ? done(result) : done);
      return result;
    } catch (error) {
      notify.error(error.message);
      return null;
    }
  };

  return {
    groups: groups ?? [],
    isLoaded: groups !== null,
    create: (name) => run(() => createSection(name)),
    rename: (id, name) => run(() => renameSection(id, name)),
    remove: (id, name) =>
      run(() => deleteSection(id), `Grupo ${name} excluído`),
    reorder: (ids) => {
      setGroups((current) =>
        ids
          .map((id) => (current ?? []).find((group) => group.id === id))
          .filter(Boolean),
      );
      return run(() => reorderSections(ids));
    },
    // A group's agents in their new order; the moved one lands in the group with them.
    place: (groupId, botIds) => run(() => reorderSection(groupId, botIds)),
    moveTo: (botId, groupId, name) =>
      run(
        () => updateBot(botId, { sectionId: groupId }),
        `Movido para ${name}`,
      ),
    // One group per company, from the start of the agents' names, each with its agents.
    groupByCompany: (companies, bots) =>
      run(async () => {
        for (const company of companies) {
          const group = await createSection(company);
          const ids = bots
            .filter((bot) => !bot.sharedBy && companyOf(bot.name) === company)
            .map((bot) => bot.id);
          if (ids.length) await reorderSection(group.id, ids);
        }
      }, `${companies.length} grupos criados`),
    reload,
  };
}
