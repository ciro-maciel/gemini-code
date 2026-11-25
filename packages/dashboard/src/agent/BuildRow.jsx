import { useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import {
  fetchBrains,
  fetchConnections,
  fetchRepoFiles,
  fetchSkillLibrary,
  fetchSkills,
  saveRepoFile,
  setSkillUse,
  updateBot,
} from '../services/api';
import { botsChanged } from '../state/use-bots';
import { notify } from '../components/zen';
import { AgentAvatar } from '../shell/AgentAvatar';
import { CheckOpt, Menu, Opt, useMenu } from '../ui/Menu';
import { keepIfSame } from '../state/keep-if-same';
import { refresh, remembered } from '../state/remembered';

// How hard the model thinks, sent to OpenRouter as reasoning.effort; null is the model's own.
export const EFFORTS = [
  ['low', 'Baixo', 'responde rápido, pensa pouco'],
  ['medium', 'Médio', 'o padrão'],
  ['high', 'Alto', 'pensa mais antes de mexer em arquivo'],
];
const effortLabel = (id) => EFFORTS.find(([key]) => key === id)?.[1] || 'Médio';
const CLASS_SHORT = {
  read: 'lê',
  write: 'cria e altera rascunho',
  external: 'publica, envia, paga ou apaga',
};

// keep: how long the chip keeps its words as the bar narrows ("long" goes last).
function Chip({
  icon,
  label,
  value,
  title = label,
  isShrinking = false,
  keep = 'short',
  onClick,
  children = null,
}) {
  return (
    <button
      className={isShrinking ? 'bchip shrink' : 'bchip'}
      data-keep={keep}
      title={`${title}: ${value}`}
      aria-label={`${label}: ${value}`}
      onClick={onClick}
    >
      {children || <i className={`ti ${icon}`} />}
      <b>{value}</b>
      <i className="ti ti-chevron-down" />
    </button>
  );
}

/** Every folder that holds a file, parents included: a/b/c.md gives a and a/b. */
export const foldersOf = (paths) =>
  [
    ...new Set(
      paths.flatMap((path) =>
        path
          .split('/')
          .slice(0, -1)
          .map((_, index, parts) => parts.slice(0, index + 1).join('/')),
      ),
    ),
  ].sort();

/** What was typed, as a folder: no spaces at the ends, no leading or trailing slash, no way up. */
export const cleanFolder = (text) => {
  const parts = text
    .split('/')
    .map((part) => part.trim())
    .filter(Boolean);
  return parts.length && !parts.includes('..') && !parts.includes('.')
    ? parts.join('/')
    : null;
};

const save = async (bot, fields, message) => {
  try {
    await updateBot(bot.id, fields);
    botsChanged();
    if (message) notify.success(message);
  } catch (error) {
    notify.error(error.message);
  }
};

/**
 * What an agent is made of, as chips on the box's bottom line: the template it
 * starts from (only before the first message), the AI account,
 * connections, skills, model and effort, and the working folder. Each opens the
 * same menu, aligned with the chip.
 */
export function BuildRow({
  bot,
  isStarted,
  templates = [],
  template = null,
  onPickTemplate,
  onNewTemplate,
  onChange = null,
}) {
  const menu = useMenu();
  const navigate = useNavigate();
  // A draft (an agent not created yet) keeps its choices; a real agent saves each one.
  const change = (fields, message) =>
    onChange ? onChange(fields) : save(bot, fields, message);
  const [brains, setBrains] = useState(() => remembered('brains') ?? []);
  const [connections, setConnections] = useState(
    () => remembered('connections') ?? null,
  );
  const [skills, setSkills] = useState(
    () => (bot?.id ? remembered(`skills:${bot.id}`) : undefined) ?? null,
  );
  const [library, setLibrary] = useState(null);
  const [folders, setFolders] = useState(null);
  const [folderQuery, setFolderQuery] = useState('');

  useEffect(() => {
    if (!bot?.id) return;
    refresh(`skills:${bot.id}`, () =>
      fetchSkills(bot.id).then((data) => data.items),
    )
      .then((items) => setSkills(keepIfSame(items)))
      .catch(() => setSkills([]));
  }, [bot?.id]);
  useEffect(() => {
    refresh('connections', () => fetchConnections().then((data) => data.items))
      .then((items) => setConnections(keepIfSame(items)))
      .catch(() => setConnections((current) => current ?? []));
  }, []);

  // A draft from a template starts with the template's connections, matched by title, as the central does.
  const fromTemplate =
    !isStarted && !bot?.connectionIds && template?.uses && connections
      ? connections
          .filter((connection) =>
            template.uses.some(
              (use) =>
                use.service.toLowerCase() ===
                String(connection.title || '').toLowerCase(),
            ),
          )
          .map((connection) => connection.id)
      : null;
  const chosenIds = bot?.connectionIds ?? fromTemplate;
  const used =
    connections?.filter(
      (connection) => !chosenIds || chosenIds.includes(connection.id),
    ) ?? [];
  // Marked first, then the rest, each by name; fixed when the menu opens so a row never jumps under the click.
  const [connectionOrder, setConnectionOrder] = useState([]);
  const openConnections = (event) => {
    const byName = (first, second) =>
      first.title.localeCompare(second.title, 'pt-BR');
    setConnectionOrder(
      [...used]
        .sort(byName)
        .concat(
          (connections ?? [])
            .filter((connection) => !used.includes(connection))
            .sort(byName),
        )
        .map((connection) => connection.id),
    );
    menu.open('connections')(event);
  };
  const orderedConnections = [...(connections ?? [])].sort((first, second) => {
    const [a, b] = [
      connectionOrder.indexOf(first.id),
      connectionOrder.indexOf(second.id),
    ];
    return (
      (a < 0 ? Infinity : a) - (b < 0 ? Infinity : b) ||
      first.title.localeCompare(second.title, 'pt-BR')
    );
  });
  // An agent not created yet runs on the central's default, the first model it lists.
  // Every agent talks on a key: an existing one shows its key, a draft the first key the central will give it.
  const brain = bot?.aiAccount
    ? brains.find((group) => group.account.id === bot.aiAccount)
    : bot?.id
      ? null
      : brains[0];
  const model =
    brain?.models.find((item) => item.id === bot?.model) ||
    (bot?.id ? null : brain?.models[0]);
  const modelName = model?.label || (bot?.model || '').split('/').pop();
  const brainName = brain
    ? [brain.account.providerName, modelName, effortLabel(bot?.effort)].join(
        ' · ',
      )
    : 'Escolher conta de IA';

  const openModels = menu.open('brain');
  useEffect(() => {
    refresh('brains', () => fetchBrains().then((data) => data.items))
      .then((items) => setBrains(keepIfSame(items)))
      .catch(() => {});
  }, []);

  // The folders are the account's files, the same ones under Arquivos, so a draft has them too.
  const openFolders = (event) => {
    menu.open('folder')(event);
    setFolderQuery('');
    fetchRepoFiles()
      .then((data) =>
        setFolders(foldersOf(data.items.map((file) => file.path))),
      )
      .catch(() => setFolders([]));
  };
  // A name that is not a folder yet becomes one: its LEIA.md, the way Arquivos makes folders.
  const createFolder = async (folder) => {
    menu.close();
    try {
      await saveRepoFile(`${folder}/LEIA.md`, `# ${folder.split('/').pop()}\n`);
      change({ folder }, `Pasta ${folder}/ criada`);
    } catch (error) {
      notify.error(error.message);
    }
  };
  const newFolder = cleanFolder(folderQuery);

  const openSkills = (event) => {
    menu.open('skills')(event);
    if (bot?.id)
      fetchSkillLibrary()
        .then((data) => setLibrary(data.items))
        .catch(() => setLibrary([]));
  };
  const toggleSkill = async (skill) => {
    const isUsed = !skills?.some((item) => item.id === skill.id);
    try {
      setSkills((await setSkillUse(bot.id, skill.id, isUsed)).items);
    } catch (error) {
      notify.error(error.message);
    }
  };
  // Before the agent exists, its skills are the template's.
  const shownSkills = bot?.id
    ? skills
    : (template?.skills ?? []).map((skill) => ({
        id: skill.name,
        name: skill.name,
        whenToUse: skill.whenToUse,
      }));

  const toggleConnection = (connection) => {
    const current = chosenIds ?? connections.map((item) => item.id);
    const next = current.includes(connection.id)
      ? current.filter((id) => id !== connection.id)
      : [...current, connection.id];
    change({ connectionIds: next });
  };

  if (!bot) return null;
  return (
    <div className="build">
      {!isStarted && (
        <Chip
          label="Começar de"
          keep="long"
          value={template?.name || 'Do zero'}
          onClick={menu.open('template')}
        >
          <AgentAvatar
            bot={null}
            icon={template?.icon || 'ti-sparkles'}
            size="sm"
          />
        </Chip>
      )}
      <Chip
        icon="ti-cpu"
        label="Conta, modelo e esforço"
        keep="long"
        value={brainName}
        onClick={openModels}
      />
      <Chip
        icon="ti-plug"
        label="Conexões"
        value={`${used.length} ${used.length === 1 ? 'conexão' : 'conexões'}`}
        onClick={openConnections}
      />
      <Chip
        icon="ti-sparkles"
        label="Habilidades"
        value={`${shownSkills?.length ?? 0} ${shownSkills?.length === 1 ? 'habilidade' : 'habilidades'}`}
        onClick={openSkills}
      />
      <Chip
        icon="ti-folder"
        label="Pasta"
        value={bot.folder ? `${bot.folder.split('/').pop()}/` : '/'}
        title={`Pasta: /${bot.folder ? `${bot.folder}/` : ''}`}
        isShrinking
        onClick={openFolders}
      />

      {menu.is('template') && (
        <Menu
          anchor={menu.anchor}
          title="Começar de"
          search
          width={340}
          alignLeft
          onClose={menu.close}
        >
          {[...new Set(templates.map((item) => item.area))].map((area) => [
            <div key={area} className="h label">
              {area}
            </div>,
            ...templates
              .filter((item) => item.area === area)
              .map((item) => (
                <Opt
                  key={item.id}
                  icon={<AgentAvatar bot={null} icon={item.icon} size="sm" />}
                  title={item.name}
                  note={item.owns}
                  isOn={template?.id === item.id}
                  onClick={() => {
                    menu.close();
                    onPickTemplate?.(item);
                  }}
                />
              )),
          ])}
          <hr />
          <button
            onClick={() => {
              menu.close();
              onNewTemplate?.();
            }}
          >
            <i className="ti ti-plus" />
            Novo modelo
          </button>
        </Menu>
      )}
      {menu.is('connections') && (
        <Menu
          anchor={menu.anchor}
          title="Conexões deste agente"
          search
          width={340}
          alignLeft
          onClose={menu.close}
        >
          {orderedConnections.map((connection) => (
            <CheckOpt
              key={connection.id}
              isOn={used.includes(connection)}
              title={connection.title}
              note={
                connection.status === 'connected'
                  ? `${connection.tools.length} ferramentas`
                  : 'precisa conectar'
              }
              onClick={() => toggleConnection(connection)}
            />
          ))}
          {connections?.length === 0 && (
            <p className="menu-note">Nenhuma conexão na conta ainda.</p>
          )}
          <hr />
          <button
            onClick={() => {
              menu.close();
              navigate('/connectors');
            }}
          >
            <i className="ti ti-plug-connected" />
            Conectar outro aplicativo
          </button>
          <p className="menu-note">
            O que ele faz sem perguntar só muda quando alguém toca em Permitir.
            Pagar e entrar numa conta sempre perguntam. Até:{' '}
            {Object.values(CLASS_SHORT).join(' · ')}.
          </p>
        </Menu>
      )}
      {menu.is('skills') && (
        <Menu
          anchor={menu.anchor}
          title="Habilidades deste agente"
          search
          width={340}
          alignLeft
          onClose={menu.close}
        >
          {bot.id
            ? (library ?? []).map((skill) => (
                <CheckOpt
                  key={skill.id}
                  isOn={skills?.some((item) => item.id === skill.id)}
                  mono
                  title={skill.name}
                  note={skill.whenToUse}
                  onClick={() => toggleSkill(skill)}
                />
              ))
            : shownSkills.map((skill) => (
                <CheckOpt
                  key={skill.id}
                  isOn
                  mono
                  title={skill.name}
                  note={skill.whenToUse}
                />
              ))}
          {bot.id && library === null && (
            <p className="menu-note">Carregando…</p>
          )}
          {(bot.id ? library?.length === 0 : shownSkills.length === 0) && (
            <p className="menu-note">
              Nenhuma habilidade ainda. Ensine uma tarefa pelo mais.
            </p>
          )}
          <p className="menu-note">
            Ficam em skills/ e servem pra qualquer agente.
          </p>
        </Menu>
      )}
      {menu.is('brain') && (
        <Menu
          anchor={menu.anchor}
          title="Conta e modelo"
          search
          width={340}
          alignLeft
          onClose={menu.close}
        >
          {brains.length === 0 && (
            <p className="menu-note">
              Nenhuma conta de IA com modelos ligados ainda. Ligue a chave de um
              provedor e marque os modelos.
            </p>
          )}
          {brains.map((group) => (
            <div key={group.account.id}>
              <div className="h label">{`${group.account.providerName}${group.account.name !== group.account.providerName ? ` · ${group.account.name}` : ''}`}</div>
              {group.models.map((item) => (
                <Opt
                  key={item.id}
                  title={item.label}
                  note={item.note}
                  mono
                  isOn={
                    brain?.account.id === group.account.id &&
                    model?.id === item.id
                  }
                  onClick={() => {
                    menu.close();
                    change(
                      { aiAccount: group.account.id, model: item.id },
                      `Modelo: ${item.label}`,
                    );
                  }}
                />
              ))}
            </div>
          ))}
          <div className="h label">Esforço</div>
          {EFFORTS.map(([id, label, note]) => (
            <Opt
              key={id}
              title={label}
              note={note}
              isOn={(bot.effort || 'medium') === id}
              onClick={() => {
                menu.close();
                change({ effort: id }, `Esforço: ${label}`);
              }}
            />
          ))}
          <hr />
          <button
            onClick={() => {
              menu.close();
              navigate('/settings/accounts');
            }}
          >
            <i className="ti ti-plus" />
            Ligar outra conta de IA
          </button>
        </Menu>
      )}
      {menu.is('folder') && (
        <Menu
          anchor={menu.anchor}
          title="Pasta de trabalho"
          search
          onQuery={setFolderQuery}
          width={320}
          alignLeft
          onClose={menu.close}
        >
          <Opt
            mono
            title="/"
            isOn={!bot.folder}
            onClick={() => {
              menu.close();
              change({ folder: null });
            }}
          />
          {(folders ?? []).map((folder) => (
            <Opt
              key={folder}
              mono
              title={`${folder}/`}
              isOn={bot.folder === folder}
              onClick={() => {
                menu.close();
                change({ folder });
              }}
            />
          ))}
          {folders && newFolder && !folders.includes(newFolder) && (
            <Opt
              mono
              icon={<i className="ti ti-folder-plus" />}
              title={`Criar ${newFolder}/`}
              onClick={() => createFolder(newFolder)}
            />
          )}
          {folders === null && <p className="menu-note">Carregando…</p>}
        </Menu>
      )}
    </div>
  );
}
