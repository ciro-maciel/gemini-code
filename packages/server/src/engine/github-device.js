// GitHub sign-in through the Gemini Code app registered on GitHub, with the
// device flow: GitHub shows the person a short code page, they type the code,
// approve the app, and the server receives the token while it waits. The flow
// needs only the app's public client id, no secret, so it works on any
// computer that runs Gemini Code (github.com/settings/applications/4056485).

import { config } from '../config.js';

const DEVICE_CODE_URL = 'https://github.com/login/device/code';
const TOKEN_URL = 'https://github.com/login/oauth/access_token';
const GRANT_TYPE = 'urn:ietf:params:oauth:grant-type:device_code';

// What the GitHub MCP server needs to read and work in the person's
// repositories, issues and pull requests, including their organizations'.
export const GITHUB_SCOPES = 'repo read:org read:user';

/** Whether a connection signs in through the GitHub app. */
export const isGithubConnection = (connection) =>
  /(^|\.)githubcopilot\.com$/.test(hostOf(connection?.url));

function hostOf(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

// connectionId -> { userCode, verificationUri, expiresAt, cancel }
const pending = new Map();

const post = (fetchImpl, url, fields) =>
  fetchImpl(url, {
    method: 'POST',
    headers: {
      Accept: 'application/json',
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams(fields).toString(),
  }).then(async (response) => {
    if (!response.ok)
      throw new Error(`GitHub answered ${response.status} to the sign-in`);
    return response.json();
  });

/** The code the person is typing on GitHub now, if any. */
export function pendingDeviceSignIn(connectionId) {
  const item = pending.get(connectionId);
  if (!item || item.expiresAt < Date.now()) return null;
  return {
    userCode: item.userCode,
    verificationUri: item.verificationUri,
    expiresAt: item.expiresAt,
  };
}

/**
 * Asks GitHub for a code and waits, in the background, for the person to
 * approve it. Resolves at once with what the person needs to see; onToken
 * runs with the access token when they approve, onFailure with the reason
 * when they refuse or the code expires.
 */
export async function startDeviceSignIn(
  connectionId,
  {
    onToken,
    onFailure = () => {},
    fetchImpl = globalThis.fetch,
    wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)),
    clientId = config.githubClientId,
  },
) {
  pending.get(connectionId)?.cancel();
  const answer = await post(fetchImpl, DEVICE_CODE_URL, {
    client_id: clientId,
    scope: GITHUB_SCOPES,
  });
  if (!answer.device_code)
    throw new Error(
      answer.error_description || 'GitHub did not give a sign-in code',
    );

  let isCancelled = false;
  const item = {
    userCode: answer.user_code,
    verificationUri: answer.verification_uri,
    expiresAt: Date.now() + answer.expires_in * 1000,
    cancel: () => {
      isCancelled = true;
    },
  };
  pending.set(connectionId, item);

  const finish = () => {
    if (pending.get(connectionId) === item) pending.delete(connectionId);
  };

  (async () => {
    let interval = (answer.interval || 5) * 1000;
    while (!isCancelled && Date.now() < item.expiresAt) {
      await wait(interval);
      if (isCancelled) return;
      let reply;
      try {
        reply = await post(fetchImpl, TOKEN_URL, {
          client_id: clientId,
          device_code: answer.device_code,
          grant_type: GRANT_TYPE,
        });
      } catch {
        continue; // a network blip: ask again on the next turn
      }
      if (reply.access_token) {
        finish();
        await onToken(reply.access_token);
        return;
      }
      if (reply.error === 'authorization_pending') continue;
      if (reply.error === 'slow_down') {
        interval = (reply.interval || interval / 1000 + 5) * 1000;
        continue;
      }
      finish();
      await onFailure(
        reply.error === 'access_denied'
          ? 'You did not approve Gemini Code on GitHub'
          : reply.error === 'expired_token'
            ? 'The GitHub code expired before it was approved'
            : reply.error_description || reply.error || 'GitHub refused',
      );
      return;
    }
    if (!isCancelled) {
      finish();
      await onFailure('The GitHub code expired before it was approved');
    }
  })();

  return pendingDeviceSignIn(connectionId);
}

/** Stops waiting for a code (the connection was removed or restarted). */
export function cancelDeviceSignIn(connectionId) {
  pending.get(connectionId)?.cancel();
  pending.delete(connectionId);
}
