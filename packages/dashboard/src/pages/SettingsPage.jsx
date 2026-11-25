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

const money = (value) => `US$ ${(value || 0).toFixed(2).replace('.', ',')}`;

const NAV = [
  [
    'Sua conta',
    [
      ['accounts', 'Contas de IA'],
      ['chrome', 'Meu Chrome'],
      ['security', 'Segurança'],
      ['phone', 'Celular'],
    ],
  ],
  [
    'Organização',
    [
      ['people', 'Pessoas', true],
      ['files', 'Arquivos e GitHub'],
      ['connections', 'Conexões do time'],
      ['dictation', 'Ditado'],
      ['email', 'E-mail'],
      ['org-security', 'Segurança'],
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
      ? 'grátis'
      : `${amount(price.input)} / ${amount(price.output)}`
    : 'sem preço';

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
        placeholder="Buscar modelo…"
        aria-label="Buscar modelo"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
      />
      {available === null && (
        <p className="muted">Pedindo a lista à {item.providerName}…</p>
      )}
      {available?.length > 0 && (
        <div className="model-head">
          <span className="grow">Modelo</span>
          <span className="model-when">Lançamento</span>
          <span className="model-price">US$ por milhão</span>
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
        `${created.providerName} ligada`,
        created.provider === 'claude-code'
          ? 'O trabalho longo dos agentes passa a usar essa conta.'
          : 'Agora escolha os modelos que os agentes podem usar.',
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
        title="Contas de IA"
        lead="De onde vem a inteligência dos agentes: a chave de cada provedor, com os modelos que os agentes podem usar. O gasto cai na conta do provedor."
      />
      {items === null && <p className="muted">Carregando…</p>}
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
                    `${money(item.usage?.today)} hoje · ${money(item.usage?.last30Days)} em 30 dias`,
                  item.agents
                    ? `${item.agents} ${item.agents === 1 ? 'agente' : 'agentes'}`
                    : 'nenhum agente',
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
                {picking === item.id ? 'Fechar' : 'Escolher modelos'}
              </button>
            )}
            <button
              className="btn outline sm"
              onClick={() => setRemoving(item)}
            >
              Remover…
            </button>
          </div>
          <div className="bb">
            {item.provider === 'claude-code' ? (
              <p className="muted">
                Para o trabalho longo com o Claude Code no computador dos
                agentes. Vale para todos os agentes da conta.
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
                      title="Tirar da lista"
                      aria-label={`Tirar ${model} da lista`}
                      onClick={() => removeModel(item, model)}
                    >
                      <i className="ti ti-x" />
                    </button>
                  </span>
                ))}
              </div>
            ) : (
              <p className="muted">
                Nenhum modelo ligado ainda: os agentes ainda não veem esta
                conta.
              </p>
            )}
          </div>
        </div>
      ))}
      <div className="box">
        <div className="bb">
          {form ? (
            <>
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
              {provider && (
                <div className="row">
                  <input
                    className="field"
                    placeholder={`Nome (opcional), como ${provider.name}`}
                    value={form.name}
                    onChange={(event) =>
                      setForm({ ...form, name: event.target.value })
                    }
                  />
                  <input
                    className="field grow"
                    type="password"
                    autoFocus
                    placeholder={`Chave: ${provider.keyHint}`}
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
                    Onde pegar
                  </a>
                </div>
              )}
              <div className="row">
                <span className="grow muted">
                  A chave fica cifrada na central; os agentes e o painel só veem
                  o nome.
                </span>
                <button
                  className="btn outline sm"
                  onClick={() => setForm(null)}
                >
                  Cancelar
                </button>
                <button
                  className="btn filled sm"
                  onClick={add}
                  disabled={!provider || !form.token.trim()}
                >
                  Ligar
                </button>
              </div>
            </>
          ) : (
            <button
              className="chip-btn"
              onClick={() => setForm({ provider: null, name: '', token: '' })}
            >
              + Adicionar conta
            </button>
          )}
        </div>
      </div>
      <DeleteModal
        opened={Boolean(removing)}
        onClose={() => setRemoving(null)}
        onConfirm={remove}
        target={removing?.name ?? ''}
        context={`Conta de IA · ${removing?.providerName ?? ''}`}
        consequences={
          removing?.provider === 'claude-code'
            ? [
                'O trabalho longo com o Claude Code nos computadores dos agentes para de usar esta conta.',
                'A chave sai da central e não há como desfazer: para voltar, cole de novo.',
              ]
            : [
                `${removing?.agents ? `${removing.agents} ${removing.agents === 1 ? 'agente para' : 'agentes param'}` : 'Os agentes que usam esta conta param'} até ganhar outra conta no chip de modelo.`,
                'Os modelos ligados nesta conta somem do chip de modelo.',
                'A chave sai da central e não há como desfazer: para voltar, cole de novo.',
              ]
        }
        confirmLabel="Remover conta"
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
      notify.success(
        'Chrome ligado',
        'Os agentes já podem agir no seu navegador.',
      );
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
        lead="Os agentes agem no seu próprio Chrome, com os seus logins: um painel, uma caixa de entrada, uma conta que só abre logada como você. Cada ação que muda algo passa pelo mesmo juiz de risco das outras."
      />
      {state?.isLinked ? (
        <div className="box">
          <div className="bb">
            <div className="check">
              <span className="big-letter">
                <i className="ti ti-brand-chrome" />
              </span>
              <div className="grow">
                <b>Ligado</b>
                <div className="p">
                  Os agentes desta conta agem no seu Chrome pelo Assistant
                  Navigation. Para cortar na hora, desligue na janela da
                  extensão; para tirar daqui, desligue.
                </div>
              </div>
              <button className="btn outline sm" onClick={unlink}>
                Desligar
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
              <b>Baixe o Assistant Navigation</b>
              <p>
                A extensão de código aberto que deixa os agentes agirem no seu
                Chrome. Descompacte numa pasta que vai ficar no computador.
              </p>
              <a
                className="btn filled sm"
                href="https://github.com/ciro-maciel/assistant-navigation/releases/latest/download/assistant-navigation-extension.zip"
              >
                <i className="ti ti-download" />
                Baixar
              </a>
            </div>
            <div className="setup-step">
              <span className="setup-n">2</span>
              <i className="ti ti-puzzle setup-ic" />
              <b>Carregue no Chrome</b>
              <p>
                Em <span className="mono">chrome://extensions</span>, ligue o
                Modo do desenvolvedor e use Carregar sem compactação com essa
                pasta.
              </p>
              <button
                className="btn outline sm"
                onClick={() => {
                  navigator.clipboard?.writeText('chrome://extensions');
                  notify.success(
                    'Endereço copiado',
                    'Cole numa aba nova do Chrome.',
                  );
                }}
              >
                <i className="ti ti-copy" />
                Copiar endereço
              </button>
            </div>
            <div className="setup-step">
              <span className="setup-n">3</span>
              <i className="ti ti-link setup-ic" />
              <b>Cole o código, uma vez</b>
              <p>
                A extensão abre com o código de conexão. Copie e cole aqui; ele
                não muda mais.
              </p>
              <div className="setup-code">
                <input
                  className="field"
                  type="password"
                  placeholder="wss://…/extension"
                  aria-label="Código de conexão do Assistant Navigation"
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
                  {isLinking ? 'Ligando…' : 'Ligar'}
                </button>
              </div>
            </div>
          </div>
          <div className="setup-facts">
            <span>
              <i className="ti ti-power" />
              Liga sozinha quando o Chrome abre, sem aba presa
            </span>
            <span>
              <i className="ti ti-hand-stop" />
              Desligar na extensão corta na hora
            </span>
            <span>
              <i className="ti ti-shield-check" />
              Sem faixa de depuração e sem aba presa
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
        title="Segurança"
        lead="Entrar é sempre por um código no seu e-mail: não há senha para vazar. As chaves de cada agente ficam cifradas na central e nunca vão para o disco do computador dele."
      />
      <div className="box">
        <div className="bb">
          <div className="check">
            <span className="big-letter">
              <i className="ti ti-mail" />
            </span>
            <div className="grow">
              <b>Código por e-mail</b>
              <div className="p">
                Cada entrada pede um código novo, que vale 10 minutos.
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
          Sair desta conta
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
        title="Conexões do time"
        lead="Os serviços que a conta ligou. Cada agente marca, no chip de Conexões, quais deles usa."
      />
      <div className="box">
        <div className="bh">
          <b className="grow">
            {items
              ? `${items.length} ${items.length === 1 ? 'conexão' : 'conexões'}`
              : 'Conexões'}
          </b>
          <button
            className="btn filled sm"
            onClick={() => navigate('/connectors')}
          >
            <i className="ti ti-plug-connected" />
            Abrir os conectores
          </button>
        </div>
        <div className="bb">
          {items === null ? (
            <p className="muted">Carregando…</p>
          ) : items.length ? (
            items.map((connection) => (
              <div className="row" key={connection.id}>
                <b style={{ width: 220 }}>{connection.title}</b>
                <span className="grow muted">
                  {connection.status === 'connected'
                    ? `${connection.tools.length} ferramentas`
                    : 'precisa conectar'}
                </span>
                <span
                  className={`pill-st${connection.status === 'connected' ? ' dark' : ' dash'}`}
                >
                  {connection.status === 'connected' ? 'ligada' : 'pendente'}
                </span>
              </div>
            ))
          ) : (
            <p className="muted">Nenhuma ainda.</p>
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
        title="Segurança"
        lead="O que vale pra todo mundo deste Assistant e os passos que protegem os computadores dos agentes."
      />
      <div className="box">
        <div className="bb">
          <div className="check">
            <span className="big-letter">
              <i className="ti ti-lock" />
            </span>
            <div className="grow">
              <b>Computadores dos agentes sem segredo</b>
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
              <b>Pagar e entrar numa conta sempre perguntam</b>
              <div className="p">
                Mesmo com “sempre permitir”, que vale 90 dias por agente e por
                serviço.
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
        title="Arquivos e GitHub"
        lead="Instruções, habilidades, rotinas e decisões de cada agente, mais o trabalho, são arquivos em Markdown no repositório da sua conta. Cada mudança vira um commit, com quem fez e o que mudou."
      />
      <div className="box">
        <div className="bb">
          {state === null ? (
            <p className="muted">Carregando…</p>
          ) : !state.repo ? (
            <p className="muted">
              Os arquivos no GitHub ainda não estão ligados nesta central.
            </p>
          ) : (
            <div className="kv">
              <span>Repositório</span>
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
                ? `${state.count} arquivos. Particular: só quem é da organização vê.`
                : 'O repositório nasce na primeira mudança de um agente.'}
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
          'O navegador não deixou mandar avisos. Libere nas permissões do site.',
        );
      await load();
    } catch {
      // The browser refused the subscription itself (a private window, push turned off).
      notify.error(
        'Este navegador não deixou ligar os avisos. Numa janela anônima eles não funcionam.',
      );
    } finally {
      setIsBusy(false);
    }
  };
  return (
    <>
      <Head
        title="Celular"
        lead="Um aviso quando um agente precisa de você ou entrega alguma coisa. Tocar abre direto nele. Não avisa do que você já está olhando."
      />
      <div className="box">
        <div className="bb">
          {state === null ? (
            <p className="muted">Carregando…</p>
          ) : !state.isReady ? (
            <p className="muted">
              Os avisos no celular ainda não estão ligados nesta central.
            </p>
          ) : !canPush() ? (
            <p className="muted">
              Este navegador não recebe avisos. No iPhone, adicione o Assistant
              à tela de início (Compartilhar, Adicionar à Tela de Início) e abra
              por lá.
            </p>
          ) : (
            <div className="kv">
              <span>
                {state.isOn
                  ? 'Este aparelho recebe avisos'
                  : 'Este aparelho não recebe avisos'}
              </span>
              <button
                className={`btn ${state.isOn ? 'outline' : 'filled'} sm`}
                onClick={toggle}
                disabled={isBusy}
              >
                {state.isOn ? 'Desligar' : 'Ligar avisos'}
              </button>
            </div>
          )}
          {state?.isReady && (
            <p className="fine">
              {state.devices === 1
                ? '1 aparelho ligado nesta conta.'
                : `${state.devices} aparelhos ligados nesta conta.`}
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
            <h1 style={{ fontSize: 24, padding: '0 10px 4px' }}>
              Configurações
            </h1>
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
