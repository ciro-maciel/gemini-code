import { useEffect, useState } from 'react';

import { keepIfSame } from './keep-if-same';

// Every call to the central crosses to Dallas and back, about half a second
// (measured 29/10/2026). What the panel already read shows at once from here,
// and the central is asked again behind it; the screen changes only if the
// answer did.
const memory = new Map();
const asking = new Map();

/** The last value read under `key`, or undefined. */
export const remembered = (key) => memory.get(key);

// Conversations are the heavy values: only the most recent ones stay.
const MAX_CONVERSATIONS = 12;

/** Keeps a value under `key`, for the next screen that needs it; the newest goes last. */
export function remember(key, value) {
  memory.delete(key);
  memory.set(key, value);
  const conversations = [...memory.keys()].filter((each) =>
    each.startsWith('conversation:'),
  );
  for (const old of conversations.slice(
    0,
    Math.max(0, conversations.length - MAX_CONVERSATIONS),
  ))
    memory.delete(old);
}

/** Reads `key` again from the central, once at a time however many screens ask. */
export function refresh(key, load) {
  if (!asking.has(key))
    asking.set(
      key,
      load()
        .then((value) => {
          remember(key, value);
          return value;
        })
        .finally(() => asking.delete(key)),
    );
  return asking.get(key);
}

/** A value shown at once from memory and refreshed from the central behind it. */
export function useRemembered(key, load, fallback = null) {
  const [value, setValue] = useState(() =>
    key && memory.has(key) ? memory.get(key) : fallback,
  );
  useEffect(() => {
    if (!key) return;
    let isAlive = true;
    if (memory.has(key)) setValue(keepIfSame(memory.get(key)));
    refresh(key, load)
      .then((next) => isAlive && setValue(keepIfSame(next)))
      .catch(() => isAlive && setValue((current) => current ?? fallback));
    return () => {
      isAlive = false;
    };
    // The loader is the key's: a new function each render is the same question.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return value;
}
