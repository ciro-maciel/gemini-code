import { useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import {
  fetchApps,
  fetchDiagnostics,
  fetchProjects,
  saveProjectsRoot,
} from '../../services/api';
import { notify } from '../../components/zen';
import {
  Notice,
  Parts,
  SettingsGroup,
  SettingsHeader,
  SettingsRow,
  SettingsSkeleton,
  StateTag,
} from './kit';

/**
 * Settings › Projects: the folder on this machine that holds the person's
 * repositories. Each agent picks one of them and works in its own git
 * worktree of it, on its own branch, so agents never overwrite each other or
 * what the person is editing. GitHub is reached through the GitHub connector.
 */
export function Projects() {
  const navigate = useNavigate();
  const [state, setState] = useState(null);
  const [draft, setDraft] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const [github, setGithub] = useState(null);
  useEffect(() => {
    fetchProjects()
      .then((data) => {
        setState(data);
        setDraft(data.root ?? '');
      })
      .catch((error) => setState({ error: error.message }));
    fetchApps()
      .then((data) =>
        setGithub(data.items.find((app) => app.id === 'github') ?? null),
      )
      .catch(() => setGithub(null));
  }, []);
  const save = async () => {
    setIsSaving(true);
    try {
      const data = await saveProjectsRoot(draft);
      setState(data);
      setDraft(data.root);
      notify.success(
        'Projects folder saved',
        `${data.items.length} repositories found.`,
      );
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };
  const isConnected = github?.connection?.status === 'connected';
  return (
    <>
      <SettingsHeader
        title="Projects"
        description="The folder that holds your repositories. Each agent picks one and works in its own copy of it, a git worktree on its own branch, so agents never overwrite each other or what you are editing."
      />
      {state === null && <SettingsSkeleton rows={3} />}
      {state?.error && (
        <Notice
          tone="fail"
          icon="ti-alert-triangle"
          title="Could not read the projects"
        >
          {state.error}
        </Notice>
      )}
      {state && !state.error && (
        <>
          <SettingsGroup
            title="Projects folder"
            note="Where your repositories live on this machine, for example ~/code. Repositories up to two levels down are found."
          >
            <div className="st-form">
              <div className="st-form-row">
                <input
                  id="projects-root"
                  className="st-field grow mono"
                  placeholder="~/code"
                  aria-label="Projects folder"
                  value={draft}
                  onChange={(event) => setDraft(event.target.value)}
                  onKeyDown={(event) =>
                    event.key === 'Enter' && draft.trim() && save()
                  }
                />
                <button
                  className="btn filled sm"
                  onClick={save}
                  disabled={isSaving || !draft.trim() || draft === state.root}
                >
                  Save
                </button>
              </div>
            </div>
          </SettingsGroup>
          {state.root && (
            <SettingsGroup
              title="Repositories"
              note={
                state.items.length
                  ? "Pick one in an agent's settings. Its worktree is made under the workspace, in worktrees/."
                  : undefined
              }
            >
              {state.items.length === 0 && (
                <SettingsRow
                  icon="ti-folder-question"
                  title="No repositories here yet"
                  description="Clone one into this folder, or choose the folder that holds them."
                />
              )}
              {state.items.map((item) => (
                <SettingsRow
                  key={item.path}
                  icon={item.github ? 'ti-brand-github' : 'ti-git-branch'}
                  title={item.name}
                  description={
                    <Parts
                      items={[
                        item.path === '.'
                          ? 'the folder itself'
                          : item.path !== item.name && item.path,
                        item.branch,
                      ]}
                    />
                  }
                >
                  {item.github ? (
                    <a
                      className="st-link mono"
                      href={`https://github.com/${item.github}`}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      {item.github}
                    </a>
                  ) : (
                    <StateTag status="off">Local only</StateTag>
                  )}
                </SettingsRow>
              ))}
            </SettingsGroup>
          )}
          <SettingsGroup title="GitHub">
            <SettingsRow
              icon="ti-brand-github"
              title="GitHub connector"
              description={
                isConnected
                  ? 'Agents open pull requests, read issues and manage your repositories through it.'
                  : 'Connect it once so agents can open pull requests and read issues in your repositories.'
              }
            >
              {isConnected ? (
                <StateTag status="ok">Connected</StateTag>
              ) : (
                <button
                  className="btn outline sm"
                  onClick={() => navigate('/connectors')}
                >
                  Open Connectors
                </button>
              )}
            </SettingsRow>
          </SettingsGroup>
        </>
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
