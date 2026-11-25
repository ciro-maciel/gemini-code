// Signing in with a Google subscription: the single entry point.
//
// The agent loop calls runSubscriptionTurn(); the server reads
// subscriptionState(). Which transport answers is chosen by
// SUBSCRIPTION_TRANSPORT (default: antigravity-cli). See state.js for why the
// state tree sits in the middle.

import * as antigravityCli from './antigravity-cli.js';
import * as officialApi from './official-api.js';
import { createSubscriptionStore, isUsable } from './state.js';

export const PROVIDER_ID = 'google-subscription';

const TRANSPORTS = {
  [antigravityCli.id]: antigravityCli,
  [officialApi.id]: officialApi,
};

export const store = createSubscriptionStore();
let transport =
  TRANSPORTS[process.env.SUBSCRIPTION_TRANSPORT] || antigravityCli;

/** For tests and for a future transport: swap who answers. */
export function useTransport(next) {
  transport = next;
}

export const subscriptionState = () => store.get();

let probing = null;
/** Asks the transport again and puts the answer in the tree. One probe at a time. */
export function refreshSubscription() {
  if (probing) return probing;
  store.set({ status: 'checking' });
  probing = transport
    .probe()
    .then((answer) =>
      store.set({
        quota: { isExhausted: false, resetsAt: null },
        ...answer,
        checkedAt: Date.now(),
      }),
    )
    .catch((error) =>
      store.set({
        status: 'error',
        error: error.message,
        checkedAt: Date.now(),
      }),
    )
    .finally(() => {
      probing = null;
    });
  return probing;
}

// The conversation an agent's task holds inside the transport, so a follow-up continues it.
const conversations = new Map();

/**
 * One turn of an agent on the subscription. Streams events to `onEvent` and
 * resolves with the transport's answer. Quota and errors update the tree.
 */
export async function runSubscriptionTurn({
  taskId,
  prompt,
  model,
  cwd,
  onEvent,
  signal,
}) {
  if (!isUsable(store.get())) await refreshSubscription();
  const state = store.get();
  if (!isUsable(state))
    return {
      status: 'UNAVAILABLE',
      text: '',
      error: state.error || `subscription is ${state.status}`,
    };
  const answer = await transport.runTurn({
    prompt,
    model,
    cwd,
    conversationId: conversations.get(taskId) ?? null,
    onEvent,
    signal,
  });
  if (answer.conversationId) conversations.set(taskId, answer.conversationId);
  if (answer.status === 'QUOTA')
    store.set({
      status: 'quota_exhausted',
      quota: {
        isExhausted: true,
        resetsAt: answer.resetInMs ? Date.now() + answer.resetInMs : null,
      },
      error: answer.error,
    });
  else if (answer.status === 'SUCCESS' && state.status !== 'ready')
    store.set({
      status: 'ready',
      quota: { isExhausted: false, resetsAt: null },
      error: null,
    });
  return answer;
}

export function forgetConversation(taskId) {
  conversations.delete(taskId);
}
