import { useEffect, useState } from 'react';

import { useNavigate } from 'react-router-dom';

import {
  fetchBrains,
  fetchConnections,
  fetchSkillLibrary,
  fetchSkills,
  setSkillUse,
  updateBot,
} from '../services/api';
import { botsChanged } from '../state/use-bots';
import { notify } from '../components/zen';
import { AgentAvatar } from '../shell/AgentAvatar';
import { brandIconOf } from '../connectors/brand-icon';
import { CheckOpt, Menu, Opt, useMenu } from '../ui/Menu';
import { keepIfSame } from '../state/keep-if-same';
import { refresh, remembered } from '../state/remembered';

// How hard the model thinks, sent to OpenRouter as reasoning.effort; null is the model's own.
export const EFFORTS = [
  ['low', 'Baixo', 'answers fast, thinks less'],
  ['medium', 'Medium', 'the default'],
  ['high', 'Alto', 'thinks more before changing files'],
];
const effortLabel = (id) =>
  EFFORTS.find(([key]) => key === id)?.[1] || 'Medium';
// A connection's line in the menu: what it opens, or what it waits for.
const connectionNote = (connection) =>
  ({
    connected: `${connection.tools.length} ${connection.tools.length === 1 ? 'tool' : 'tools'}`,
    pending_auth: 'Waiting for sign-in, in Connectors',
    needs_secret: 'Waiting for its token, in Connectors',
    needs_device: 'Waiting for sign-in, in Connectors',
    failed: 'Failed, see Connectors',
  })[connection.status] ?? 'Not connected yet';

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
 * connections, skills, model and effort. Each opens the same menu, aligned
 * with the chip. The working folder is the agent's own (agents/<name>), shown
 * beside the conversation, so it has no chip.
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
    : 'Choose AI account';

  const openModels = menu.open('brain');
  useEffect(() => {
    refresh('brains', () => fetchBrains().then((data) => data.items))
      .then((items) => setBrains(keepIfSame(items)))
      .catch(() => {});
  }, []);

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
          label="Start from"
          keep="long"
          value={template?.name || 'From scratch'}
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
        label="Account, model, and effort"
        keep="long"
        value={brainName}
        onClick={openModels}
      />
      <Chip
        icon="ti-plug"
        label="Connections"
        value={`${used.length} ${used.length === 1 ? 'connection' : 'connections'}`}
        onClick={openConnections}
      />
      <Chip
        icon="ti-sparkles"
        label="Skills"
        value={`${shownSkills?.length ?? 0} ${shownSkills?.length === 1 ? 'skill' : 'skills'}`}
        onClick={openSkills}
      />

      {menu.is('template') && (
        <Menu
          anchor={menu.anchor}
          title="Start from"
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
            New model
          </button>
        </Menu>
      )}
      {menu.is('connections') && (
        <Menu
          anchor={menu.anchor}
          title="This agent's connections"
          search
          width={360}
          alignLeft
          onClose={menu.close}
          footer={
            <>
              <button
                className="menu-foot-action"
                onClick={() => {
                  menu.close();
                  navigate('/connectors');
                }}
              >
                <i className="ti ti-plus" />
                Connect another app
              </button>
              <p>
                The risk judge reads every action first. Sending, publishing and
                deleting ask until you allow them; paying and signing in always
                ask.
              </p>
            </>
          }
        >
          {orderedConnections.map((connection) => (
            <CheckOpt
              key={connection.id}
              isOn={used.includes(connection)}
              image={brandIconOf(
                connection.title.toLowerCase().split(/[^a-z0-9]/)[0],
              )}
              icon="ti-plug"
              title={connection.title}
              note={connectionNote(connection)}
              onClick={() => toggleConnection(connection)}
            />
          ))}
          {connections?.length === 0 && (
            <p className="menu-empty">
              No connections yet. Connect a service once and every agent can use
              it.
            </p>
          )}
        </Menu>
      )}
      {menu.is('skills') && (
        <Menu
          anchor={menu.anchor}
          title="This agent's skills"
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
          {bot.id && library === null && <p className="menu-empty">Loading…</p>}
          {(bot.id ? library?.length === 0 : shownSkills.length === 0) && (
            <p className="menu-empty">
              No skills yet. A skill is a SKILL.md file in the skills/ folder,
              and any agent can use it.
            </p>
          )}
        </Menu>
      )}
      {menu.is('brain') && (
        <Menu
          anchor={menu.anchor}
          title="Account and model"
          search
          width={340}
          alignLeft
          onClose={menu.close}
        >
          {brains.length === 0 && (
            <p className="menu-note">
              No AI accounts with models turned on yet. Add a provider key and
              select the models.
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
                      `Model: ${item.label}`,
                    );
                  }}
                />
              ))}
            </div>
          ))}
          <div className="h label">Effort</div>
          {EFFORTS.map(([id, label, note]) => (
            <Opt
              key={id}
              title={label}
              note={note}
              isOn={(bot.effort || 'medium') === id}
              onClick={() => {
                menu.close();
                change({ effort: id }, `Effort: ${label}`);
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
            Connect another AI account
          </button>
        </Menu>
      )}
    </div>
  );
}
