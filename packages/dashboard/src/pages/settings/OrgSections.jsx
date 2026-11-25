import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  fetchConnections,
  fetchDiagnostics,
  fetchRepoFiles,
} from '../../services/api';
import { useAccount } from '../../components/Session';
import { brandIconOf } from '../../connectors/brand-icon';
import {
  Notice,
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
  SettingsSkeleton,
  StateTag,
} from './kit';

/**
 * Settings › Files and GitHub: where the agents' files live. Local mode keeps
 * them in the workspace folder on this machine; with GitHub set up on the
 * server, they are Markdown files in the account's repository, one commit per
 * change.
 */
export function Files() {
  const account = useAccount();
  const [state, setState] = useState(null);
  useEffect(() => {
    fetchRepoFiles()
      .then((data) => setState({ repo: data.repo, count: data.items.length }))
      .catch(() => setState({ repo: null, count: 0 }));
  }, []);
  const workspace = account?.runtime?.workspaceDir;
  return (
    <>
      <SettingsHeader
        title="Files and GitHub"
        description="Each agent works in its own folder: its instructions, skills, decisions and work are files you can open, edit and review. Every change shows who made it."
      />
      {state === null && <SettingsSkeleton rows={2} />}
      {state && (
        <SettingsGroup>
          {workspace && (
            <SettingsRow
              icon="ti-folder"
              title="Workspace on this machine"
              description={workspace}
            >
              <StateTag status="ok">Local</StateTag>
            </SettingsRow>
          )}
          <SettingsRow
            icon="ti-brand-github"
            title="GitHub repository"
            description={
              state.repo
                ? state.count
                  ? `${state.count} files. Private: only members of the organization see it.`
                  : "It is created on an agent's first change."
                : 'Off: the server has no GitHub App set up (GITHUB_APP_ID, GITHUB_ORG). Files stay in the workspace.'
            }
          >
            {state.repo ? (
              <a
                className="st-link mono"
                href={`https://github.com/${state.repo.org}/${state.repo.name}`}
                target="_blank"
                rel="noopener noreferrer"
              >
                {state.repo.org}/{state.repo.name}
              </a>
            ) : (
              <StateTag status="off">Off</StateTag>
            )}
          </SettingsRow>
        </SettingsGroup>
      )}
    </>
  );
}

const STATE = {
  connected: ['ok', 'Connected'],
  pending_auth: ['wait', 'Waiting for sign-in'],
  needs_secret: ['wait', 'Waiting for a token'],
  failed: ['fail', 'Failed'],
};

/**
 * Settings › Team connections: the services this account connected, each with
 * its real state. Each agent picks the ones it uses in its Connections chip.
 */
export function TeamConnections() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  useEffect(() => {
    fetchConnections()
      .then((data) => setItems(data.items))
      .catch(() => setItems([]));
  }, []);
  return (
    <>
      <SettingsHeader
        title="Team connections"
        description="The services this account connected through MCP. Connected once, every agent can use them; each agent picks its own in the Connections chip."
        actions={
          <button
            className="btn filled sm"
            onClick={() => navigate('/connectors')}
          >
            <i className="ti ti-plug-connected" />
            Open connectors
          </button>
        }
      />
      {items === null && <SettingsSkeleton rows={3} />}
      {items?.length === 0 && (
        <Notice icon="ti-plug" title="No connection yet">
          Connectors lists GitHub, Linear, Notion and others, each connected
          with its own sign-in.
        </Notice>
      )}
      {items?.length > 0 && (
        <SettingsGroup>
          {items.map((connection) => {
            const [status, label] = STATE[connection.status] ?? [
              'off',
              connection.status,
            ];
            const slug = connection.title.toLowerCase().split(/[^a-z0-9]/)[0];
            return (
              <SettingsRow
                key={connection.id}
                image={brandIconOf(slug)}
                icon="ti-plug"
                title={connection.title}
                description={
                  connection.status === 'connected'
                    ? `${connection.tools.length} ${connection.tools.length === 1 ? 'tool' : 'tools'}`
                    : connection.status === 'pending_auth'
                      ? 'Sign in to finish connecting.'
                      : connection.status === 'needs_secret'
                        ? 'Paste its token in Connectors to finish connecting.'
                        : connection.statusDetail || label
                }
              >
                <StateTag status={status}>{label}</StateTag>
                {connection.status === 'pending_auth' &&
                  /^https:\/\//.test(connection.statusDetail ?? '') && (
                    <a
                      className="btn outline sm"
                      href={connection.statusDetail}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      Sign in
                    </a>
                  )}
              </SettingsRow>
            );
          })}
        </SettingsGroup>
      )}
    </>
  );
}

/**
 * Settings › Dictation: talking instead of typing. The microphone in the
 * composer dictates; voice mode speaks the answers. What transcribes and
 * speaks comes from the server's own check.
 */
export function Dictation() {
  const [voice, setVoice] = useState(null);
  useEffect(() => {
    fetchDiagnostics()
      .then((data) =>
        setVoice(data.items.find((item) => item.id === 'voice') ?? null),
      )
      .catch(() =>
        setVoice({ status: 'fail', detail: 'The server did not answer' }),
      );
  }, []);
  return (
    <>
      <SettingsHeader
        title="Dictation"
        description="Talk instead of typing. Hold the microphone in the composer to dictate a request, or open voice mode to hear the answers."
      />
      <SettingsGroup>
        <SettingsRow
          icon="ti-microphone"
          title="Dictate in the composer"
          description="Hold the microphone, speak, release: the text lands in the box for you to read before sending."
        />
        <SettingsRow
          icon="ti-headphones"
          title="Voice mode"
          description="Spoken turns, hands free: the agent's answer is read aloud."
        />
        {voice === null ? (
          <SettingsRow
            icon="ti-wave-sine"
            title="Voice service"
            description="Checking…"
          />
        ) : (
          <SettingsRow
            icon="ti-wave-sine"
            title="Voice service"
            description={voice.detail}
          >
            <StateTag status={voice.status}>
              {
                { ok: 'Ready', warn: 'Partial', fail: 'Failing', off: 'Off' }[
                  voice.status
                ]
              }
            </StateTag>
          </SettingsRow>
        )}
      </SettingsGroup>
    </>
  );
}

/**
 * Settings › Agent safety: the rules that hold for every agent of this
 * Gemini Code, whatever anyone allows.
 */
export function AgentSafety() {
  return (
    <>
      <SettingsHeader
        title="Agent safety"
        description="What holds for every agent here, whatever anyone allows. These rules are in the code, not in a setting."
      />
      <SettingsGroup>
        <SettingsRow
          icon="ti-folder-cog"
          title="Each agent works only in its folder"
          description="Its files MCP and the permission rules refuse any path outside it, and deleting waits for a person."
        >
          <StateTag status="ok">Always</StateTag>
        </SettingsRow>
        <SettingsRow
          icon="ti-scale"
          title="A risk judge reads each action"
          description="Shell commands, browser actions and connector writes are judged before they run; sending, publishing and deleting ask until you allow them."
        >
          <StateTag status="ok">Always</StateTag>
        </SettingsRow>
        <SettingsRow
          icon="ti-credit-card"
          title="Payments and sign-ins always ask"
          description="Even with “always allow”, which lasts 90 days per agent and per service."
        >
          <StateTag status="ok">Always</StateTag>
        </SettingsRow>
        <SettingsRow
          icon="ti-lock"
          title="Secrets never reach the model"
          description="Keys live encrypted in each agent's vault, enter only the command that needs them, and come back masked with their name."
        >
          <StateTag status="ok">Always</StateTag>
        </SettingsRow>
      </SettingsGroup>
    </>
  );
}
