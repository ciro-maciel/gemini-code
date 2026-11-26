import { useState } from 'react';

import { startGithubSignIn } from '../services/api';
import { notify } from '../components/zen';

/**
 * GitHub signs in through the Gemini Code app: GitHub gives a short code, the
 * person types it on github.com/login/device and approves the app there. The
 * server waits for the approval and connects by itself; the page sees the
 * connection turn connected on its next read.
 */
export function DeviceSignIn({ connection, onChange = () => {} }) {
  const [signIn, setSignIn] = useState(null);
  const [isBusy, setIsBusy] = useState(false);

  const start = async () => {
    setIsBusy(true);
    try {
      const answer = await startGithubSignIn(connection.id);
      setSignIn(answer);
      navigator.clipboard?.writeText(answer.userCode).catch(() => {});
      onChange();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsBusy(false);
    }
  };

  if (!signIn)
    return (
      <button className="btn filled sm" disabled={isBusy} onClick={start}>
        <i className="ti ti-brand-github" />
        {isBusy ? 'Asking GitHub…' : 'Sign in with GitHub'}
      </button>
    );
  return (
    <span className="device-sign-in">
      <button
        className="device-code"
        title="Copy the code"
        onClick={() => {
          navigator.clipboard?.writeText(signIn.userCode);
          notify.success('Code copied', 'Paste it on the GitHub page.');
        }}
      >
        {signIn.userCode}
        <i className="ti ti-copy" />
      </button>
      <a
        className="btn filled sm"
        href={signIn.verificationUri}
        target="_blank"
        rel="noreferrer"
      >
        Open GitHub
        <i className="ti ti-external-link" />
      </a>
    </span>
  );
}
