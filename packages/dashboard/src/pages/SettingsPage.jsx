import { locale } from '../lib/language';
import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AccountSwitcher, useSignOut } from '../auth/AuthContext';

import {
  createAiAccount,
  deleteAiAccount,
  fetchAiAccounts,
  fetchAiProviders,
  fetchAvailableModels,
  fetchConnections,
  fetchPush,
  fetchRepoFiles,
  setAiAccountModels,
  fetchUserBrowser,
  linkUserBrowser,
  unlinkUserBrowser,
} from '../services/api';
import { canPush, currentSubscription, turnOff, turnOn } from '../push/phone';
import { DeleteModal, notify } from '../components/zen';
import { useAccount } from '../components/Session';
import { People } from './People';

// Dollars in the reader's own number format: US$ 0.00 in English, US$ 0,00 in Portuguese.
const money = (value) =>
  `US$ ${(value || 0).toLocaleString(locale(), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const NAV = [
  [
    'Your account',
    [
      ['accounts', 'AI accounts'],
      ['chrome', 'Meu Chrome'],
      ['security', 'Security'],
      ['phone', 'Celular'],
    ],
  ],
  [
    'Organization',
    [
      ['people', 'People', true],
      ['files', 'Files and GitHub'],
      ['connections', 'Team connections'],
      ['dictation', 'Ditado'],
      ['email', 'E-mail'],
      ['org-security', 'Security'],
    ],
  ],
];

function Head({ title, lead }) {
  return (
    <div>
      <h2 className="set-h">{title}</h2>
      <p className="lead" style={{ marginTop: 6 }}>
        {lead}
      </p>
    </div>
  );
}

const launchedOn = (seconds) =>
  new Date(seconds * 1000).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
// Dollars per million tokens: what the model reads, then what it writes.
const amount = (value) =>
  value.toLocaleString('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 3,
  });
const priceLine = (price) =>
  price && price.input !== null && price.output !== null
    ? price.input === 0 && price.output === 0
      ? 'free'
      : `${amount(price.input)} / ${amount(price.output)}`
    : 'no price';

/** Every chat model the account's key opens, newest first, searched and turned on one by one. */
function ModelPicker({ item, onSaved }) {
  const [available, setAvailable] = useState(null);
  const [query, setQuery] = useState('');
  const [on, setOn] = useState(item.models);
  useEffect(() => {
    fetchAvailableModels(item.id)
      .then((data) => setAvailable(data.items))
      .catch((error) => {
        setAvailable([]);
        notify.error(error.message);
      });
  }, [item.id]);
  const toggle = async (id) => {
    const next = on.includes(id)
      ? on.filter((model) => model !== id)
      : [...on, id];
    setOn(next);
    try {
      await setAiAccountModels(item.id, next);
      onSaved();
    } catch (error) {
      setOn(on);
      notify.error(error.message);
    }
  };
  const q = query.trim().toLowerCase();
  const shown = (available ?? []).filter(
    (model) => !q || `${model.id} ${model.label}`.toLowerCase().includes(q),
  );
  return (
    <>
      <input
        className="field"
        style={{ width: '100%' }}
        autoFocus
        placeholder="Search model…"
        aria-label="Search model"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {available === null && (
        <p className="muted">Asking for the list from {item.providerName}…</p>
      )}
      {available?.length > 0 && (
        <div className="model-head">
          <span className="grow">Model</span>
          <span className="model-when">Launch</span>
          <span className="model-price">US$ per million</span>
        </div>
      )}
      <div className="model-pick">
        {shown.map((model) => (
          <button
            key={model.id}
            className={`model-opt${on.includes(model.id) ? ' on' : ''}`}
            onClick={() => toggle(model.id)}
          >
            <i
              className={`ti ${on.includes(model.id) ? 'ti-square-check' : 'ti-square'}`}
            />
            <span className="grow model-name">
              <b>{model.label}</b>
              {model.label !== model.id && (
                <small className="mono">{model.id}</small>
              )}
            </span>
            <span className="model-when">
              {model.createdAt ? launchedOn(model.createdAt) : '–'}
            </span>
            <span className="model-price">{priceLine(model.price)}</span>
          </button>
        ))}
      </div>
      {available && (
        <p className="muted">
          {on.length} de {available.length} ligados. Os ligados aparecem no chip
          de modelo de cada agente.
        </p>
      )}
    </>
  );
}

function AiAccounts() {
  const [items, setItems] = useState(null);
  const [providers, setProviders] = useState([]);
  const [form, setForm] = useState(null);
  const [picking, setPicking] = useState(null);
  const [removing, setRemoving] = useState(null);
  const [isRemoving, setIsRemoving] = useState(false);
  const reload = () =>
    fetchAiAccounts()
      .then((data) => setItems(data.items))
      .catch(() => setItems([]));
  useEffect(() => {
    reload();
    fetchAiProviders()
      .then((data) => setProviders(data.items))
      .catch(() => {});
  }, []);
  const provider = providers.find((item) => item.id === form?.provider);
  const add = async () => {
    try {
      const created = await createAiAccount(form);
      setForm(null);
      await reload();
      if (created.provider !== 'claude-code') setPicking(created.id);
      notify.success(
        `${created.providerName} turned on`,
        created.provider === 'claude-code'
          ? "The agents' long-running work will use this account."
          : 'Now choose the models agents can use.',
      );
    } catch (error) {
      notify.error(error.message);
    }
  };
  // One model off the list; agents already on it keep it, it just stops being offered.
  const removeModel = async (item, model) => {
    setItems((current) =>
      current.map((row) =>
        row.id === item.id
          ? { ...row, models: row.models.filter((id) => id !== model) }
          : row,
      ),
    );
    try {
      await setAiAccountModels(
        item.id,
        item.models.filter((id) => id !== model),
      );
      reload();
    } catch (error) {
      notify.error(error.message);
      reload();
    }
  };
  const remove = async () => {
    setIsRemoving(true);
    try {
      await deleteAiAccount(removing.id);
      notify.success(`${removing.name} removida`);
      setRemoving(null);
      reload();
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsRemoving(false);
    }
  };
  return (
    <>
      <Head
        title="AI accounts"
        lead="Where the agents' intelligence comes from: each provider's key, with the models the agents can use. Usage is billed to the provider account."
      />
      {items === null && <p className="muted">Loading…</p>}
      {(items ?? []).map((item) => (
        <div className="box" key={item.id}>
          <div className="bh">
            <div className="grow">
              <b>{item.providerName}</b>
              {item.name !== item.providerName && (
                <span className="muted"> · {item.name}</span>
              )}
              <div className="muted">
                {[
                  item.provider !== 'claude-code' &&
                    `${money(item.usage?.today)} today · ${money(item.usage?.last30Days)} in 30 days`,
                  item.agents
                    ? `${item.agents} ${item.agents === 1 ? 'agent' : 'agents'}`
                    : 'no agents',
                ]
                  .filter(Boolean)
                  .join(' · ')}
              </div>
            </div>
            {item.provider !== 'claude-code' && (
              <button
                className="btn outline sm"
                onClick={() => setPicking(picking === item.id ? null : item.id)}
              >
                {picking === item.id ? 'Close' : 'Choose models'}
              </button>
            )}
            <button
              className="btn outline sm"
              onClick={() => setRemoving(item)}
            >
              Remove…
            </button>
          </div>
          <div className="bb">
            {item.provider === 'claude-code' ? (
              <p className="muted">
                For long-running Claude Code work on the agents’ computers.
                Applies to all agents on the account.
              </p>
            ) : picking === item.id ? (
              <ModelPicker item={item} onSaved={reload} />
            ) : item.models.length ? (
              <div className="chips">
                {item.models.map((model) => (
                  <span className="chip mono model-chip" key={model}>
                    {model}
                    <button
                      className="chip-x"
                      title="Remove from list"
                      aria-label={`Remove ${model} from list`}
                      onClick={() => removeModel(item, model)}
                    >
                      <i className="ti ti-x" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">
                No models turned on yet: agents can’t see this account yet.
              </p>
            )}
          </div>
        </div>
      ))}
      <div className="box">
        <div className="bb">
          {form ? (
            <>
              {providers.length > 1 && (
                <div className="chips">
                  {providers.map((item) => (
                    <button
                      key={item.id}
                      className={`chip-btn${form.provider === item.id ? ' on' : ''}`}
                      onClick={() => setForm({ ...form, provider: item.id })}
                    >
                      {item.name}
                    </button>
                  ))}
                </div>
              )}
              {provider && (
                <div className="row">
                  <input
                    className="field"
                    placeholder={`Name (optional), like ${provider.name}`}
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                  />
                  <input
                    className="field grow"
                    type="password"
                    autoFocus
                    placeholder={`Key: ${provider.keyHint}`}
                    value={form.token}
                    onChange={(event) =>
                      setForm({ ...form, token: event.target.value })
                    }
                    onKeyDown={(event) =>
                      event.key === 'Enter' && form.token.trim() && add()
                    }
                  />
                  <a
                    className="muted"
                    href={provider.keyUrl}
                    target="_blank"
                    rel="noreferrer"
                  >
                    Where to get it
                  </a>
                </div>
              )}
              <div className="row">
                <span className="grow muted">
                  The key is stored encrypted on the server; agents and the
                  dashboard see only its name.
                </span>
                <button
                  className="btn outline sm"
                  onClick={() => setForm(null)}
                >
                  Cancel
                </button>
                <button
                  className="btn filled sm"
                  onClick={add}
                  disabled={!provider || !form.token.trim()}
                >
                  Turn on
                </button>
              </div>
            </>
          ) : (
            <button
              className="chip-btn"
              onClick={() =>
                setForm({
                  provider: providers.length === 1 ? providers[0].id : null,
                  name: '',
                  token: '',
                })
              }
            >
              {providers.length === 1
                ? `+ Add a ${providers[0].name} API key`
                : '+ Add account'}
            </button>
          )}
        </div>
      </div>
      <DeleteModal
        opened={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        target={removing?.name ?? ''}
        context={`AI account · ${removing?.providerName ?? ''}`}
        consequences={
          removing?.provider === 'claude-code'
            ? [
                "Long-running Claude Code work on the agents' computers stops using this account.",
                "The key will be removed from the hub and this can't be undone. To restore it, paste it again.",
              ]
            : [
                `${removing?.agents ? `${removing.agents} ${removing.agents === 1 ? 'agent for' : 'agents stop'}` : 'Agents using this account will stop'} until they get another account in the model chip.`,
                'Models turned on in this account will disappear from the model chip.',
                "The key will be removed from the hub and this can't be undone. To restore it, paste it again.",
              ]
        }
        confirmLabel="Remove account"
        loading={isRemoving}
      />
    </>
  );
}

/**
 * The person's own Chrome for the agents: Assistant Navigation (github.com/ciro-maciel/assistant-navigation), paired
 * once with its connection code. How to install it, then the state and the way out.
 */
function MyChrome() {
  const [state, setState] = useState(null);
  const [code, setCode] = useState('');
  const [isLinking, setIsLinking] = useState(false);
  const load = () =>
    fetchUserBrowser()
      .then(setState)
      .catch(() => setState({ isLinked: false }));
  const link = async () => {
    setIsLinking(true);
    try {
      setState(await linkUserBrowser(code));
      setCode('');
      notify.success('Chrome connected', 'Agents can now act in your browser.');
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsLinking(false);
    }
  };
  useEffect(() => {
    load();
  }, []);
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
      <Head
        title="Meu Chrome"
        lead="Agents act in your own Chrome with your logins: a dashboard, an inbox, an account that only opens when logged in as you. Every action that changes something goes through the same risk check as the others."
      />
      {state?.isLinked ? (
        <div className="box">
          <div className="bb">
            <div className="check">
              <span className="big-letter">
                <i className="ti ti-brand-chrome" />
              </span>
              <div className="grow">
                <b>On</b>
                <div className="p">
                  Os agentes desta conta agem no seu Chrome pelo Assistant
                  Navigation. Para cortar na hora, desligue na janela da
                  extensão; para tirar daqui, desligue.
                </div>
              </div>
              <button className="btn outline sm" onClick={unlink}>
                Turn off
              </button>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="setup-steps">
            <div className="setup-step">
              <span className="setup-n">1</span>
              <i className="ti ti-download setup-ic" />
              <b>Download Assistant Navigation</b>
              <p>
                The open-source extension that lets agents act in your Chrome.
                Unzip it into a folder that will stay on your computer.
              </p>
              <a
                className="btn filled sm"
                href="https://github.com/ciro-maciel/assistant-navigation/releases/latest/download/assistant-navigation-extension.zip"
              >
                <i className="ti ti-download" />
                Download
              </a>
            </div>
            <div className="setup-step">
              <span className="setup-n">2</span>
              <i className="ti ti-puzzle setup-ic" />
              <b>Load in Chrome</b>
              <p>
                In <span className="mono">chrome://extensions</span>, turn on
                Developer mode and use Load unpacked with that folder.
              </p>
              <button
                className="btn outline sm"
                onClick={() => {
                  navigator.clipboard?.writeText('chrome://extensions');
                  notify.success(
                    'Address copied',
                    'Paste into a new Chrome tab.',
                  );
                }}
              >
                <i className="ti ti-copy" />
                Copy address
              </button>
            </div>
            <div className="setup-step">
              <span className="setup-n">3</span>
              <i className="ti ti-link setup-ic" />
              <b>Paste the code once</b>
              <p>
                A extensão abre com o código de conexão. Copie e cole aqui; ele
                não muda mais.
              </p>
              <div className="setup-code">
                <input
                  className="field"
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
                  {isLinking ? 'Ligando…' : 'Turn on'}
                </button>
              </div>
            </div>
          </div>
          <div className="setup-facts">
            <span>
              <i className="ti ti-power" />
              Turns on automatically when Chrome opens, no pinned tab
            </span>
            <span>
              <i className="ti ti-hand-stop" />
              Turning it off in the extension cuts it off immediately
            </span>
            <span>
              <i className="ti ti-shield-check" />
              No debug banner and no stuck tab
            </span>
          </div>
        </>
      )}
    </>
  );
}

function Security() {
  const signOut = useSignOut();
  const navigate = useNavigate();
  return (
    <>
      <Head
        title="Security"
        lead="You always sign in with a code sent to your email: there's no password to leak. Each agent's keys stay encrypted on the server and never go to its computer's disk."
      />
      <div className="box">
        <div className="bb">
          <div className="check">
            <span className="big-letter">
              <i className="ti ti-mail" />
            </span>
            <div className="grow">
              <b>Code by email</b>
              <div className="p">
                Each sign-in requires a new code, valid for 10 minutes.
              </div>
            </div>
          </div>
        </div>
      </div>
      {/* The other accounts of this browser: one click switches, no code. */}
      <AccountSwitcher
        hasDivider={false}
        onSignedOut={() => navigate('/auth/signin')}
      />
      <div>
        <button
          className="btn outline"
          onClick={async () => {
            await signOut();
            navigate('/auth/signin');
          }}
        >
          <i className="ti ti-logout" />
          Sign out of this account
        </button>
      </div>
    </>
  );
}

function Connections() {
  const navigate = useNavigate();
  const [items, setItems] = useState(null);
  useEffect(() => {
    fetchConnections()
      .then((data) => setItems(data.items))
      .catch(() => setItems([]));
  }, []);
  return (
    <>
      <Head
        title="Team connections"
        lead="The services this account has connected. Each agent selects which ones it uses in the Connections chip."
      />
      <div className="box">
        <div className="bh">
          <b className="grow">
            {items
              ? `${items.length} ${items.length === 1 ? 'conexão' : 'conexões'}`
              : 'Connections'}
          </b>
          <button
            className="btn filled sm"
            onClick={() => navigate('/connectors')}
          >
            <i className="ti ti-plug-connected" />
            Open connectors
          </button>
        </div>
        <div className="bb">
          {items === null ? (
            <p className="muted">Loading…</p>
          ) : items.length ? (
            items.map((connection) => (
              <div className="row" key={connection.id}>
                <b style={{ width: 220 }}>{connection.title}</b>
                <span className="grow muted">
                  {connection.status === 'connected'
                    ? `${connection.tools.length} tools`
                    : 'needs connecting'}
                </span>
                <span
                  className={`pill-st${connection.status === 'connected' ? ' dark' : ' dash'}`}
                >
                  {connection.status === 'connected' ? 'ligada' : 'pendente'}
                </span>
              </div>
            ))
          ) : (
            <p className="muted">None yet.</p>
          )}
        </div>
      </div>
    </>
  );
}

function OrgSecurity() {
  return (
    <>
      <Head
        title="Security"
        lead="What applies to everyone on this Gemini Code and the steps that protect the agents' computers."
      />
      <div className="box">
        <div className="bb">
          <div className="check">
            <span className="big-letter">
              <i className="ti ti-lock" />
            </span>
            <div className="grow">
              <b>Agent computers have no secrets</b>
              <div className="p">
                As chaves ficam no cofre da central e entram em cada comando;
                nunca ficam no disco do computador do agente, e voltam
                mascaradas como [cofre: NOME].
              </div>
            </div>
          </div>
          <div className="check">
            <span className="big-letter">
              <i className="ti ti-shield" />
            </span>
            <div className="grow">
              <b>Payments and sign-ins always ask</b>
              <div className="p">
                Even with “always allow”, which lasts 90 days per agent and per
                service.
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function Files() {
  const [state, setState] = useState(null);
  useEffect(() => {
    fetchRepoFiles()
      .then((data) => setState({ repo: data.repo, count: data.items.length }))
      .catch(() => setState({ repo: null, count: 0 }));
  }, []);
  const link = state?.repo
    ? `https://github.com/${state.repo.org}/${state.repo.name}`
    : null;
  return (
    <>
      <Head
        title="Files and GitHub"
        lead="Each agent's instructions, skills, routines, and decisions, plus its work, are Markdown files in your account's repository. Every change becomes a commit showing who made it and what changed."
      />
      <div className="box">
        <div className="bb">
          {state === null ? (
            <p className="muted">Loading…</p>
          ) : !state.repo ? (
            <p className="muted">GitHub files aren’t enabled here yet.</p>
          ) : (
            <div className="kv">
              <span>Repository</span>
              <a
                className="mono"
                href={link}
                target="_blank"
                rel="noopener noreferrer"
              >
                {state.repo.org}/{state.repo.name}
              </a>
            </div>
          )}
          {state?.repo && (
            <p className="fine">
              {state.count
                ? `${state.count} files. Private: only organization members can see.`
                : "The repository is created on an agent's first change."}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

function Phone() {
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
          'The browser blocked notifications. Allow them in the site permissions.',
        );
      await load();
    } catch {
      // The browser refused the subscription itself (a private window, push turned off).
      notify.error(
        "This browser didn't allow notifications. They don't work in a private window.",
      );
    } finally {
      setIsBusy(false);
    }
  };
  return (
    <>
      <Head
        title="Celular"
        lead="A notification when an agent needs you or delivers something. Tapping opens it directly. No alerts for what you're already viewing."
      />
      <div className="box">
        <div className="bb">
          {state === null ? (
            <p className="muted">Loading…</p>
          ) : !state.isReady ? (
            <p className="muted">
              Mobile notifications aren’t enabled here yet.
            </p>
          ) : !canPush() ? (
            <p className="muted">
              This browser doesn’t receive notifications. On iPhone, add
              Assistant to your Home Screen (Share, Add to Home Screen) and open
              it from there.
            </p>
          ) : (
            <div className="kv">
              <span>
                {state.isOn
                  ? 'This device receives notifications'
                  : "This device doesn't receive notifications"}
              </span>
              <button
                className={`btn ${state.isOn ? 'outline' : 'filled'} sm`}
                onClick={toggle}
                disabled={isBusy}
              >
                {state.isOn ? 'Turn off' : 'Turn on alerts'}
              </button>
            </div>
          )}
          {state?.isReady && (
            <p className="fine">
              {state.devices === 1
                ? '1 device connected to this account.'
                : `${state.devices} devices connected to this account.`}
            </p>
          )}
        </div>
      </div>
    </>
  );
}

const TEXTS = {
  dictation: [
    'Voice & Dictation',
    'Hold the microphone to dictate directly into the composer, or launch Voice Mode for hands-free spoken turns.',
  ],
  email: [
    'Inbound Webhooks',
    'Each agent has its own authenticated inbound URL so external tools, CI hooks, or scripts can send events directly into the thread.',
  ],
};

/** The settings, with the prototype's side list of sections. */
export function SettingsPage({ section }) {
  const account = useAccount();
  const navigate = useNavigate();
  const nav = NAV.map(([group, items]) => [
    group,
    items.filter(([, , isOwnerOnly]) => !isOwnerOnly || account?.isOwner),
  ]);
  return (
    <main className="page">
      <div className="page-in">
        <div className="settings">
          <div className="subnav">
            <h1 style={{ fontSize: 24, padding: '0 10px 4px' }}>Settings</h1>
            {nav.map(([group, items]) => [
              <div className="label" key={group}>
                {group}
              </div>,
              ...items.map(([id, label]) => (
                <button
                  key={id}
                  className={section === id ? 'on' : ''}
                  onClick={() => navigate(`/settings/${id}`)}
                >
                  {label}
                </button>
              )),
            ])}
          </div>
          <div className="grow">
            {section === 'accounts' && <AiAccounts account={account} />}
            {section === 'chrome' && <MyChrome />}
            {section === 'org-security' && <OrgSecurity />}
            {section === 'security' && <Security />}
            {section === 'people' && account?.isOwner && <People />}
            {section === 'connections' && <Connections />}
            {section === 'files' && <Files />}
            {section === 'phone' && <Phone />}
            {TEXTS[section] && (
              <Head title={TEXTS[section][0]} lead={TEXTS[section][1]} />
            )}
          </div>
        </div>
      </div>
    </main>
  );
}
