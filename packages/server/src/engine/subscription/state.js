// The Google subscription's state tree.
//
// One plain, serializable object says everything the rest of Gemini Code needs
// to know about signing in with a Google AI Pro or Ultra subscription: whether
// it works right now, through which transport, which models it opens and when
// the quota comes back. Nothing outside this folder reads the transport
// directly; everything reads this tree.
//
// Why a tree and not direct calls: the transport is expected to change. Today
// the only working path is Google's own Antigravity CLI (`agy`), run on the
// person's machine with their cached sign-in. A report says Google may open
// subscriptions to third-party harnesses on 02/12/2026 (see OFFICIAL_API
// below). When that or any other transport arrives (REST, WebSocket, a remote
// agent), it only has to fill this same tree; the agent loop, the server
// routes and the dashboard keep working unchanged.

/** What we know about an official third-party subscription API. Unconfirmed until Google says so. */
export const OFFICIAL_API = {
  status: 'awaiting',
  expectedOn: '2026-12-02',
  isConfirmed: false,
  source:
    'https://www.testingcatalog.com/gemini-subscriptions-may-reach-hermes-agent-on-december-2/',
  note: 'Reported, not announced: Google AI Studio lead Logan Kilpatrick hinted that Gemini subscriptions reach third-party harnesses on 02/12/2026, starting with Hermes Agent. Replace transports/official-api.js when Google publishes it.',
};

/** The states a subscription can be in. `ready` is the only one an agent can talk in. */
export const STATUSES = [
  'unknown',
  'checking',
  'ready',
  'not_installed',
  'signed_out',
  'quota_exhausted',
  'error',
];

export function initialState() {
  return {
    version: 1,
    status: 'unknown',
    transport: null,
    transportVersion: null,
    models: [],
    quota: { isExhausted: false, resetsAt: null },
    officialApi: { ...OFFICIAL_API },
    checkedAt: null,
    error: null,
  };
}

/**
 * A tiny store around the tree: read a frozen snapshot, merge a patch, and be
 * told of every change. The same three calls are what a remote source (an
 * API pushing updates over a socket, say) would drive.
 */
export function createSubscriptionStore(initial = initialState()) {
  let state = Object.freeze({ ...initial });
  const listeners = new Set();
  return {
    get: () => state,
    set(patch) {
      if (patch.status && !STATUSES.includes(patch.status))
        throw new Error(`unknown subscription status: ${patch.status}`);
      state = Object.freeze({
        ...state,
        ...patch,
        quota: { ...state.quota, ...(patch.quota ?? {}) },
      });
      for (const listener of listeners) listener(state);
      return state;
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
  };
}

/** Whether an agent can talk through the subscription now; a passed quota reset counts as back. */
export function isUsable(state, nowMs = Date.now()) {
  if (state.status === 'ready') return true;
  return (
    state.status === 'quota_exhausted' &&
    Boolean(state.quota.resetsAt) &&
    nowMs >= state.quota.resetsAt
  );
}
