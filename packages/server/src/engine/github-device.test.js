import { describe, expect, test } from 'bun:test';

import {
  isGithubConnection,
  pendingDeviceSignIn,
  startDeviceSignIn,
} from './github-device.js';

// GitHub answers the code request, then each poll with the next reply.
function fakeGithub(replies) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    const fields = Object.fromEntries(new URLSearchParams(init.body));
    calls.push({ url, fields });
    const body = url.endsWith('/login/device/code')
      ? {
          device_code: 'device-1',
          user_code: 'ABCD-1234',
          verification_uri: 'https://github.com/login/device',
          expires_in: 900,
          interval: 5,
        }
      : replies.shift();
    return new Response(JSON.stringify(body), { status: 200 });
  };
  return { calls, fetchImpl };
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20));

describe('GitHub sign-in through the Gemini Code app', () => {
  test('shows the code, waits for the approval and hands over the token', async () => {
    const github = fakeGithub([
      { error: 'authorization_pending' },
      { error: 'slow_down', interval: 10 },
      { access_token: 'gho_token', token_type: 'bearer' },
    ]);
    const waits = [];
    let token = null;
    const signIn = await startDeviceSignIn('conn-1', {
      clientId: 'client-1',
      fetchImpl: github.fetchImpl,
      wait: async (ms) => waits.push(ms),
      onToken: (value) => {
        token = value;
      },
    });
    expect(signIn.userCode).toBe('ABCD-1234');
    expect(signIn.verificationUri).toBe('https://github.com/login/device');
    await settle();
    expect(token).toBe('gho_token');
    // GitHub asked to slow down: the next poll waited its new interval.
    expect(waits).toEqual([5000, 5000, 10000]);
    const poll = github.calls[1].fields;
    expect(poll.client_id).toBe('client-1');
    expect(poll.device_code).toBe('device-1');
    expect(poll.grant_type).toBe(
      'urn:ietf:params:oauth:grant-type:device_code',
    );
    // No secret ever goes to GitHub: the app's public id is enough.
    expect(github.calls.some((call) => 'client_secret' in call.fields)).toBe(
      false,
    );
    expect(pendingDeviceSignIn('conn-1')).toBeNull();
  });

  test('says in words when the person refuses the app', async () => {
    const github = fakeGithub([{ error: 'access_denied' }]);
    let reason = null;
    let token = null;
    await startDeviceSignIn('conn-2', {
      clientId: 'client-1',
      fetchImpl: github.fetchImpl,
      wait: async () => {},
      onToken: (value) => {
        token = value;
      },
      onFailure: (value) => {
        reason = value;
      },
    });
    await settle();
    expect(token).toBeNull();
    expect(reason).toBe('You did not approve Gemini Code on GitHub');
  });

  test('knows the GitHub connector by its address', () => {
    expect(
      isGithubConnection({ url: 'https://api.githubcopilot.com/mcp/' }),
    ).toBe(true);
    expect(isGithubConnection({ url: 'https://mcp.linear.app/mcp' })).toBe(
      false,
    );
    expect(isGithubConnection({ url: 'not a url' })).toBe(false);
  });
});
