import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';

import {
  deleteBot,
  deleteMemory,
  fetchBotDocuments,
  fetchHandoffs,
  fetchInbox,
  fetchMemories,
  rotateInbox,
  updateBot,
  updateMemory,
} from '../services/api';
import { Routines } from '../components/Routines';
import { Vault } from '../components/DoorAndVault';
import { DeleteModal, notify } from '../components/zen';
import { NameModal } from '../ui/NameModal';
import { botGone, botsChanged } from '../state/use-bots';
import { AgentAvatar } from '../shell/AgentAvatar';
import { pathOf } from '../mesa/routes';

const money = (value) => `US$ ${(value || 0).toFixed(2).replace('.', ',')}`;
const TABS = [
  ['when', 'Quando'],
  ['vault', 'Cofre'],
  ['memory', 'Memória'],
];

function Trigger({ icon, title, children, right = null }) {
  return (
    <div className="check">
      <span className="big-letter">
        <i className={`ti ${icon}`} />
      </span>
      <div className="grow">
        <b>{title}</b>
        <div className="p">{children}</div>
      </div>
      {right}
    </div>
  );
}

// As the prototype says it: who passed work here, and who this agent passed to.
function Handoffs({ botId }) {
  const [passes, setPasses] = useState(null);
  useEffect(() => {
    fetchHandoffs(botId)
      .then(setPasses)
      .catch(() => setPasses({ from: [], to: [] }));
  }, [botId]);
  const lines = passes
    ? [
        ...passes.from.map((bot) => `Recebe trabalho de "${bot.name}".`),
        ...passes.to.map((bot) => `Passa trabalho pra "${bot.name}".`),
      ]
    : [];
  return (
    <Trigger icon="ti-arrows-exchange" title="Outro agente">
      {passes === null ? 'Carregando…' : lines.join(' ') || 'Nenhuma passagem.'}
    </Trigger>
  );
}

function Door({ botId }) {
  const [door, setDoor] = useState(null);
  useEffect(() => {
    fetchInbox(botId)
      .then(setDoor)
      .catch(() => {});
  }, [botId]);
  const rotate = async () => {
    try {
      setDoor(await rotateInbox(botId));
      notify.success('Endereço trocado', 'O antigo parou na hora.');
    } catch (error) {
      notify.error(error.message);
    }
  };
  const copy = () => {
    navigator.clipboard?.writeText(door.url);
    notify.success('Endereço da porta copiado');
  };
  return (
    <Trigger
      icon="ti-webhook"
      title="Porta de entrada"
      right={
        <button className="btn outline sm" onClick={rotate}>
          Trocar o endereço
        </button>
      }
    >
      Outro sistema manda um POST e cai aqui:{' '}
      {door && (
        <span className="door-addr">
          <span className="mono">{door.url.replace(/^https:\/\//, '')}</span>
          <button
            className="icon-btn"
            onClick={copy}
            title="Copiar o endereço"
            aria-label="Copiar o endereço"
          >
            <i className="ti ti-copy" />
          </button>
        </span>
      )}
    </Trigger>
  );
}

function When({ bot }) {
  return (
    <>
      <div className="box">
        <div className="bh">
          <b className="grow">O que escreve neste agente</b>
        </div>
        <div className="bb">
          <Trigger
            icon="ti-user"
            title="Pessoa"
            right={<span className="pill-st dark">sempre</span>}
          >
            Quem tem acesso escreve aqui.
          </Trigger>
          <Trigger icon="ti-clock-play" title="Horário">
            <Routines botId={bot.id} />
          </Trigger>
          <Door botId={bot.id} />
          <Handoffs botId={bot.id} />
          <Trigger icon="ti-mail" title="E-mail">
            A caixa fica no Messages: o que chega nela pode vir pra este agente
            pela porta de entrada.
          </Trigger>
        </div>
      </div>
      <p className="fine">
        O que não é uma pessoa escreve aqui com o rótulo de onde veio, mas nunca
        responde um pedido de permissão.
      </p>
    </>
  );
}

// As the prototype groups them: what a person decided, what a person prefers, what the agent observed.
const MEMORY_KINDS = [
  ['decision', 'Decisões', 'no arquivo memory/decisions.md'],
  ['preference', 'Preferências', 'no arquivo memory/decisions.md'],
  ['observation', 'Observações', 'só na central; vencem em 30 dias'],
];
const when = (seconds) =>
  new Date(seconds * 1000).toLocaleDateString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
  });

function Memory({ bot }) {
  const [items, setItems] = useState(null);
  const reload = useCallback(() => {
    fetchMemories(bot.id)
      .then((data) => setItems(data.items))
      .catch(() => setItems([]));
  }, [bot.id]);
  useEffect(reload, [reload]);

  const forget = async (memory) => {
    await deleteMemory(bot.id, memory.id).catch((error) =>
      notify.error(error.message),
    );
    notify.success('Esquecido', memory.content.slice(0, 60));
    reload();
  };
  const fix = async (memory) => {
    const content = prompt('Corrigir a memória', memory.content);
    if (!content?.trim() || content.trim() === memory.content) return;
    try {
      await updateMemory(bot.id, memory.id, content.trim());
      reload();
    } catch (error) {
      notify.error(error.message);
    }
  };

  return MEMORY_KINDS.map(([kind, label, where]) => {
    const list = (items ?? []).filter((memory) => memory.kind === kind);
    return (
      <div className="box" key={kind}>
        <div className="bh">
          <b className="grow">{label}</b>
          <span className="muted">{where}</span>
        </div>
        <div className="bb">
          {items === null ? (
            <p className="muted">Carregando…</p>
          ) : list.length ? (
            list.map((memory) => (
              <div className="row" key={memory.id}>
                <div className="grow">
                  <b>{memory.content}</b>
                  <div className="muted">
                    {memory.sourceTaskId ? 'de uma conversa' : 'de uma pessoa'}{' '}
                    · {when(memory.createdAt)}
                    {memory.daysLeft
                      ? ` · vence em ${memory.daysLeft} ${memory.daysLeft === 1 ? 'dia' : 'dias'}`
                      : ''}
                  </div>
                </div>
                <button className="btn outline sm" onClick={() => fix(memory)}>
                  Corrigir
                </button>
                <button
                  className="btn outline sm"
                  onClick={() => forget(memory)}
                >
                  Esquecer
                </button>
              </div>
            ))
          ) : (
            <p className="muted">Nada aqui.</p>
          )}
        </div>
      </div>
    );
  });
}

/**
 * An agent's own settings, opened beside it: its name and the day's spend, and
 * what writes to it, its keys and its memory.
 */
export function AgentSettings({ bot, template, tab = 'when', onTab }) {
  const navigate = useNavigate();
  const spend = bot.spendToday ?? 0;
  const isOwner = (bot.access ?? 'owner') === 'owner';
  const [docStats, setDocStats] = useState(null);
  const [isEditingFolder, setIsEditingFolder] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchBotDocuments(bot.id)
      .then((data) => alive && setDocStats(data))
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [bot.id, bot.folder]);

  const saveFolder = async (nextFolder) => {
    setIsEditingFolder(false);
    const clean =
      nextFolder === '/' ? null : nextFolder.replace(/^\/+|\/+$/g, '') || null;
    try {
      await updateBot(bot.id, { folder: clean });
      botsChanged();
      notify.success(
        clean
          ? `Pasta atualizada para /${clean}/`
          : 'Pasta definida para a raiz do workspace',
      );
      window.dispatchEvent(new Event('assistant:repo'));
    } catch (error) {
      notify.error(error.message);
    }
  };

  const openAgentDocs = () => {
    navigate(pathOf(`agent:${bot.id}`));
    setTimeout(
      () =>
        window.dispatchEvent(
          new CustomEvent('assistant:agent-view', {
            detail: { botId: bot.id, view: 'docs' },
          }),
        ),
      60,
    );
  };

  return (
    <div className="agent-pane">
      <div className="page-in">
        <div className="agent-top">
          <div className="agent-head">
            <AgentAvatar bot={bot} icon={template?.icon} />
            {isOwner ? <AgentName bot={bot} /> : <h2>{bot.name}</h2>}
          </div>
          <p className="lead">
            {template
              ? `${template.owns.charAt(0).toUpperCase()}${template.owns.slice(1)}. Começou do modelo ${template.name}.`
              : 'Começou do zero.'}
          </p>
          <div className="agent-links">
            {bot.instructionsPath && isOwner && (
              <button
                className="instr-link"
                onClick={() => navigate(pathOf(`file:${bot.instructionsPath}`))}
              >
                <i className="ti ti-file-text" />
                Instruções
                <span className="mono">{bot.instructionsPath}</span>
                <i className="ti ti-arrow-up-right" />
              </button>
            )}
            <button className="instr-link" onClick={openAgentDocs}>
              <i className="ti ti-folder" />
              Pasta & Documentos
              <span className="mono">
                {bot.folder ? `/${bot.folder}/` : '/'}
              </span>
              {docStats && (
                <span className="tag">{docStats.counts?.all ?? 0}</span>
              )}
              <i className="ti ti-arrow-up-right" />
            </button>
            {isOwner && (
              <button
                className="btn outline sm"
                onClick={() => setIsEditingFolder(true)}
              >
                <i className="ti ti-folder-cog" />
                Trocar pasta
              </button>
            )}
          </div>
          <div className="agent-row">
            <div className="grow">
              <span className="muted">
                {money(spend)} hoje neste agente, na chave de IA dele
              </span>
            </div>
          </div>
        </div>
        {isEditingFolder && (
          <NameModal
            title="Pasta de trabalho do agente"
            icon="ti-folder-cog"
            initial={bot.folder || docStats?.defaultFolder || ''}
            action="Salvar pasta"
            onSave={saveFolder}
            onClose={() => setIsEditingFolder(false)}
          />
        )}
        <div className="atabs">
          {TABS.map(([key, label]) => (
            <button
              key={key}
              className={tab === key ? 'on' : ''}
              onClick={() => onTab(key)}
            >
              {label}
            </button>
          ))}
        </div>
        {tab === 'when' && <When bot={bot} />}
        {tab === 'vault' && (
          <>
            <div className="box">
              <div className="bh">
                <b className="grow">Chaves deste agente</b>
              </div>
              <div className="bb">
                <Vault botId={bot.id} />
              </div>
            </div>
            <p className="fine">
              Ficam cifradas na central e entram em cada comando deste agente. O
              agente e o painel só veem os nomes, e nenhuma chave vai pros
              arquivos.
            </p>
          </>
        )}
        {tab === 'memory' && <Memory bot={bot} />}
        {(bot.access ?? 'owner') === 'owner' && <DeleteAgent bot={bot} />}
      </div>
    </div>
  );
}

/** The name, edited where it is: a click turns it into a field; Enter or leaving saves, Esc undoes. */
function AgentName({ bot }) {
  const [draft, setDraft] = useState(null);
  const save = async () => {
    const name = draft?.trim();
    setDraft(null);
    if (!name || name === bot.name) return;
    try {
      await updateBot(bot.id, { name });
      botsChanged();
    } catch (error) {
      notify.error(error.message);
    }
  };
  if (draft !== null)
    return (
      <input
        className="name-edit"
        autoFocus
        aria-label="Nome do agente"
        maxLength={60}
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
        onFocus={(event) => event.target.select()}
        onBlur={save}
        onKeyDown={(event) => {
          if (event.key === 'Enter') event.target.blur();
          if (event.key === 'Escape') setDraft(null);
        }}
      />
    );
  return (
    <>
      <h2
        className="name-click"
        title="Renomear agente"
        onClick={() => setDraft(bot.name)}
      >
        {bot.name}
      </h2>
      <button
        className="icon-btn"
        title="Renomear agente"
        aria-label="Renomear agente"
        onClick={() => setDraft(bot.name)}
      >
        <i className="ti ti-pencil" />
      </button>
    </>
  );
}

/**
 * Deleting an agent takes two confirmations, never more: first the band that
 * says what will be lost and its button; then the kit's DeleteModal, where
 * the person types the name.
 */
function DeleteAgent({ bot }) {
  const navigate = useNavigate();
  const [isOpen, setIsOpen] = useState(false);
  const remove = async () => {
    // Gone from the panel on the click; the central destroys the computer behind, and a failure brings it back.
    botGone(bot);
    navigate('/');
    try {
      await deleteBot(bot.id);
      notify.success(`${bot.name} foi excluído`);
    } catch (error) {
      notify.error(error.message);
    } finally {
      botsChanged();
      window.dispatchEvent(new Event('assistant:repo'));
    }
  };
  return (
    <>
      <div className="box danger-zone">
        <div className="bh">
          <b className="grow">Zona de risco</b>
        </div>
        <div className="bb">
          <div className="check">
            <span className="big-letter">
              <i className="ti ti-trash" />
            </span>
            <div className="grow">
              <b>Excluir este agente</b>
              <div className="p">
                Some o computador, a conversa e a memória. Os aplicativos
                conectados continuam: são seus.
              </div>
            </div>
            <button
              className="btn outline sm danger"
              onClick={() => setIsOpen(true)}
            >
              <i className="ti ti-trash" />
              Excluir agente…
            </button>
          </div>
        </div>
      </div>
      <DeleteModal
        opened={isOpen}
        onClose={() => setIsOpen(false)}
        onConfirm={remove}
        target={bot.name}
        context={`Agente · ${bot.spriteName}`}
        consequences={[
          'O computador na nuvem é destruído, com arquivos, programas e os logins salvos no Chrome.',
          'A conversa, as tarefas em andamento, a memória e os pontos de restauração somem.',
          'Os aplicativos conectados continuam: são seus.',
          'Não há como desfazer.',
        ]}
        confirmLabel="Excluir agente"
      />
    </>
  );
}
