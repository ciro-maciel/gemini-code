import { useCallback, useEffect, useState } from 'react';

import { fetchBots, streamAccount } from '../services/api';
import { keepIfSame } from './keep-if-same';

// The account's agents, read again when the account stream says one changed,
// when a screen says so (a message sent, an agent read or renamed), and now
// and then in case the stream missed something.
const EVERY_MS = 30_000;

export function useBots() {
  const [bots, setBots] = useState(null);

  const reload = useCallback(() => {
    // The stream says "changed" every second while an agent works: the screen redraws only when the list did.
    fetchBots()
      .then((data) => setBots(keepIfSame(data.items)))
      .catch(() => {});
  }, []);

  useEffect(() => {
    reload();
    const timer = setInterval(
      () => document.visibilityState === 'visible' && reload(),
      EVERY_MS,
    );
    const close = streamAccount(reload);
    const onRead = (event) =>
      setBots(
        (current) =>
          current?.map((bot) =>
            bot.id === event.detail.botId ? { ...bot, hasNews: false } : bot,
          ) ?? current,
      );
    const onGone = (event) =>
      setBots(
        (current) =>
          current?.filter((bot) => bot.id !== event.detail.botId) ?? current,
      );
    window.addEventListener('assistant:bot-read', onRead);
    window.addEventListener('assistant:bot-gone', onGone);
    window.addEventListener('assistant:bots-changed', reload);
    return () => {
      clearInterval(timer);
      close();
      window.removeEventListener('assistant:bot-read', onRead);
      window.removeEventListener('assistant:bot-gone', onGone);
      window.removeEventListener('assistant:bots-changed', reload);
    };
  }, [reload]);

  return { bots, reload };
}

export const botsChanged = () =>
  window.dispatchEvent(new Event('assistant:bots-changed'));

/** An agent leaves the panel at once: its row and its folder under agents/; the central catches up behind. */
export const botGone = (bot) => {
  window.dispatchEvent(
    new CustomEvent('assistant:bot-gone', { detail: { botId: bot.id } }),
  );
  if (bot.instructionsPath)
    window.dispatchEvent(
      new CustomEvent('assistant:files-gone', {
        detail: {
          folder: bot.instructionsPath.replace(/\/INSTRUCTIONS\.md$/, ''),
        },
      }),
    );
};
