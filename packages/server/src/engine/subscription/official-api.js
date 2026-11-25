// Transport: the official third-party subscription API. NOT AVAILABLE YET.
//
// A report (see OFFICIAL_API in state.js) says Google may let Gemini AI Pro and
// Ultra subscriptions work in third-party harnesses starting 02/12/2026. Google
// has not published how. This file holds the place: it answers with the same
// shape as antigravity-cli.js, so turning it on is writing these two functions
// against whatever Google ships (REST, WebSocket or an SDK) and setting
// SUBSCRIPTION_TRANSPORT=official-api. Nothing else in Gemini Code changes.

import { OFFICIAL_API } from './state.js';

export const id = 'official-api';

export async function probe() {
  return {
    status: 'error',
    transport: id,
    error: `The official subscription API is not available yet (expected ${OFFICIAL_API.expectedOn}, unconfirmed). Use SUBSCRIPTION_TRANSPORT=antigravity-cli.`,
  };
}

export async function runTurn() {
  return {
    conversationId: null,
    text: '',
    status: 'ERROR',
    error: 'The official subscription API is not available yet.',
  };
}
