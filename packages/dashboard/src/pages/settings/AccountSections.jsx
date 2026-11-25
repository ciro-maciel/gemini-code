import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import { AccountSwitcher, useAuth, useSignOut } from '../../auth/AuthContext';
import {
  fetchPush,
  fetchUserBrowser,
  linkUserBrowser,
  unlinkUserBrowser,
} from '../../services/api';
import {
  canPush,
  currentSubscription,
  turnOff,
  turnOn,
} from '../../push/phone';
import { notify } from '../../components/zen';
import {
  Notice,
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
  SettingsSkeleton,
  StateTag,
} from './kit';

const EXTENSION_ZIP =
  'https://github.com/ciro-maciel/assistant-navigation/releases/latest/download/assistant-navigation-extension.zip';

/**
 * Settings › My Chrome: agents act in the person's own Chrome, with their
 * logins, through the open-source Assistant Navigation extension, paired once
 * with its connection code.
 */
export function MyChrome() {
  const [state, setState] = useState(null);
  const [code, setCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const load = () =>
    fetchUserBrowser()
      .then(setState)
      .catch(() => setState({ isLinked: false }));
  useEffect(() => {
    load();
  }, []);
  const link = async () => {
    setIsLinking(true);
    try {
      setState(await linkUserBrowser(code));
      setCode('');
      notify.success('Chrome linked', 'Agents can now act in your browser.');
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsLinking(false);
    }
  };
  const unlink = async () => {
    try {
      await unlinkUserBrowser();
      load();
    } catch (error) {
      notify.error(error.message);
    }
  };
  return (
    <>
      <SettingsHeader
        title="My Chrome"
        description="Agents can act in your own Chrome, with your logins: a dashboard, an inbox, an account that only opens signed in as you. Every action that changes something passes the same risk judge as the rest."
      />
      {state === null && <SettingsSkeleton rows={1} />}
      {state?.isLinked && (
        <SettingsGroup>
          <SettingsRow
            icon="ti-brand-chrome"
            title="Your Chrome is linked"
            description="Agents of this account act in it through Assistant Navigation. To cut it at once, turn it off in the extension's window."
          >
            <StateTag status="ok">On</StateTag>
            <button className="btn outline sm" onClick={unlink}>
              Turn off
            </button>
          </SettingsRow>
        </SettingsGroup>
      )}
      {state && !state.isLinked && (
        <SettingsGroup
          title="Link it in three steps"
          note="Once. After that it turns on by itself when Chrome opens."
        >
          <SettingsRow
            step="1"
            title="Download Assistant Navigation"
            description="The open-source extension that lets agents act in Chrome. Unzip it into a folder that stays on your computer."
          >
            <a className="btn outline sm" href={EXTENSION_ZIP}>
              <i className="ti ti-download" />
              Download
            </a>
          </SettingsRow>
          <SettingsRow
            step="2"
            title="Load it in Chrome"
            description="In chrome://extensions, turn on Developer mode and choose Load unpacked with that folder."
          >
            <button
              className="btn outline sm"
              onClick={() => {
                navigator.clipboard?.writeText('chrome://extensions');
                notify.success('Address copied', 'Paste it in a new tab.');
              }}
            >
              <i className="ti ti-copy" />
              Copy address
            </button>
          </SettingsRow>
          <SettingsRow
            step="3"
            title="Paste its connection code"
            description="The extension shows it when it opens. It does not change afterwards."
          />
          <div className="st-form">
            <div className="st-form-row">
              <input
                className="st-field"
                type="password"
                placeholder="wss://…/extension"
                aria-label="Assistant Navigation connection code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                onKeyDown={(event) =>
                  event.key === 'Enter' && code.trim() && link()
                }
              />
              <button
                className="btn filled sm"
                onClick={link}
                disabled={!code.trim() || isLinking}
              >
                {isLinking ? 'Linking…' : 'Link Chrome'}
              </button>
            </div>
          </div>
        </SettingsGroup>
      )}
    </>
  );
}

/**
 * Settings › Security: how this account signs in, the other accounts of this
 * browser, and signing out. In local mode there is no sign-in, and it says so.
 */
export function Security() {
  const { isLocalMode } = useAuth();
  const signOut = useSignOut();
  const navigate = useNavigate();
  if (isLocalMode)
    return (
      <>
        <SettingsHeader
          title="Security"
          description="How this Gemini Code is reached and who can act in it."
        />
        <SettingsGroup>
          <SettingsRow
            icon="ti-device-desktop"
            title="Local mode, no sign-in"
            description="The dashboard and the server run on this machine for you alone. Whoever reaches its port acts as you, so keep it on localhost."
          >
            <StateTag status="warn">No sign-in</StateTag>
          </SettingsRow>
          <SettingsRow
            icon="ti-lock"
            title="Keys stay on the server"
            description="AI keys and each agent's secrets are encrypted on the server and never reach what the model reads."
          >
            <StateTag status="ok">Encrypted</StateTag>
          </SettingsRow>
        </SettingsGroup>
      </>
    );
  return (
    <>
      <SettingsHeader
        title="Security"
        description="You sign in with a code sent to your e-mail: there is no password to leak. Each agent's keys stay encrypted on the server and never reach its computer's disk."
      />
      <SettingsGroup>
        <SettingsRow
          icon="ti-mail"
          title="Code by e-mail"
          description="Each sign-in asks for a new code, valid for 10 minutes."
        >
          <StateTag status="ok">On</StateTag>
        </SettingsRow>
      </SettingsGroup>
      <AccountSwitcher
        hasDivider={false}
        onSignedOut={() => navigate('/auth/signin')}
      />
      <SettingsGroup>
        <SettingsRow
          icon="ti-logout"
          title="Sign out of this account"
          description="This browser stops being signed in; your agents keep working."
        >
          <button
            className="btn outline sm"
            onClick={async () => {
              await signOut();
              navigate('/auth/signin');
            }}
          >
            Sign out
          </button>
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}

/**
 * Settings › Notifications: a push when an agent needs the person or delivers
 * something, on this device; tapping opens it. Nothing for what is on screen.
 */
export function Notifications() {
  const [state, setState] = useState(null);
  const [isBusy, setIsBusy] = useState(false);
  const load = async () => {
    const [push, subscription] = await Promise.all([
      fetchPush(),
      currentSubscription().catch(() => null),
    ]);
    setState({ ...push, isOn: Boolean(subscription) });
  };
  useEffect(() => {
    load().catch(() => setState({ isReady: false }));
  }, []);
  const toggle = async () => {
    setIsBusy(true);
    try {
      if (state.isOn) await turnOff();
      else if (!(await turnOn(state.publicKey)))
        notify.error(
          'The browser blocked notifications. Allow them in the site settings.',
        );
      await load();
    } catch {
      notify.error(
        "This browser didn't allow notifications. They don't work in a private window.",
      );
    } finally {
      setIsBusy(false);
    }
  };
  return (
    <>
      <SettingsHeader
        title="Notifications"
        description="A notification on this device when an agent needs you or delivers something. Tapping it opens the agent. Nothing for what you are already looking at."
      />
      {state === null && <SettingsSkeleton rows={1} />}
      {state && !state.isReady && (
        <Notice icon="ti-bell-off" title="Notifications are off on this server">
          The server has no push keys yet, so no device can receive them.
        </Notice>
      )}
      {state?.isReady && !canPush() && (
        <Notice
          icon="ti-device-mobile"
          title="This browser cannot receive them"
        >
          On iPhone, add Gemini Code to the Home Screen (Share, Add to Home
          Screen) and open it from there.
        </Notice>
      )}
      {state?.isReady && canPush() && (
        <SettingsGroup
          footer={`${state.devices} ${state.devices === 1 ? 'device' : 'devices'} linked to this account.`}
        >
          <SettingsRow
            icon="ti-bell"
            title="This device"
            description={
              state.isOn
                ? 'Receives a notification when an agent needs you.'
                : 'Does not receive notifications.'
            }
          >
            <StateTag status={state.isOn ? 'ok' : 'off'}>
              {state.isOn ? 'On' : 'Off'}
            </StateTag>
            <button
              className={`btn ${state.isOn ? 'outline' : 'filled'} sm`}
              onClick={toggle}
              disabled={isBusy}
            >
              {state.isOn ? 'Turn off' : 'Turn on'}
            </button>
          </SettingsRow>
        </SettingsGroup>
      )}
    </>
  );
}
