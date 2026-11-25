import { useEffect, useState } from 'react';

import { createBot, fetchBrains, updateTemplate } from '../services/api';
import { notify } from '../components/zen';
import { botsChanged } from '../state/use-bots';
import {
  fromOf,
  reloadTemplates,
  toOf,
  useTemplates,
} from '../state/templates';
import { EFFORTS } from '../agent/BuildRow';
import { AgentAvatar } from '../shell/AgentAvatar';
import { Menu, Opt, useMenu } from '../ui/Menu';

const upper = (text) =>
  text ? text.charAt(0).toUpperCase() + text.slice(1) : '';
const REACH = {
  read: 'lê',
  write: 'cria e altera rascunho',
  external: 'publica, envia, paga ou apaga',
};

function FlowRow({ template, onOpen }) {
  return (
    <button className="flow-row" onClick={() => onOpen(template.id)}>
      <AgentAvatar bot={null} icon={template.icon} size="sm" />
      <span className="grow">
        <b>{template.name}</b>
        <small>{upper(template.owns)}</small>
      </span>
      <i className="ti ti-chevron-right" />
    </button>
  );
}

/**
 * A template as a Mesa tab, as the prototype draws it: who it is, its numbers,
 * where it sits in the company, its instructions and skills, and on the side
 * how its agents are born, what they ask before, and which ones came from it.
 */
export function TemplateTab({
  templateId,
  bots,
  onOpenAgent,
  onOpenTemplate,
  onOpenFile,
}) {
  const { items } = useTemplates();
  const template = items.find((item) => item.id === templateId);
  const [brains, setBrains] = useState([]);
  const [draft, setDraft] = useState(null);
  const [isCreating, setIsCreating] = useState(false);
  const menu = useMenu();
  useEffect(() => {
    fetchBrains()
      .then((data) => setBrains(data.items))
      .catch(() => {});
  }, []);

  if (!template)
    return items.length ? (
      <div className="pane-empty">
        <i className="ti ti-template-off" />
        <b>Modelo desconhecido</b>
      </div>
    ) : null;

  const mine = bots.filter((bot) => bot.templateId === template.id);
  const from = fromOf(template, items)
    .map((id) => items.find((item) => item.id === id))
    .filter(Boolean);
  const to = toOf(template, items)
    .map((id) => items.find((item) => item.id === id))
    .filter(Boolean);
  // A template names a model; the agent is born on the key that has it turned on.
  const home = brains.find((brain) =>
    brain.models.some((item) => item.id === template.model),
  );
  const model = {
    label: [home?.account.providerName, template.model]
      .filter(Boolean)
      .join(' · '),
  };
  const effort = EFFORTS.find(([id]) => id === template.effort)?.[1] || 'Médio';

  const save = async (fields, message) => {
    try {
      await updateTemplate(template.id, fields);
      await reloadTemplates();
      if (message)
        notify.success(
          message,
          'Vale pros próximos agentes; os que já existem ficam como estão.',
        );
    } catch (error) {
      notify.error(error.message);
    }
  };
  const create = async () => {
    setIsCreating(true);
    try {
      const bot = await createBot({
        name: template.name,
        templateId: template.id,
      });
      botsChanged();
      onOpenAgent(bot.id);
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <div className="agent-pane">
      <div className="page-in tpl-page">
        <div className="tpl-hero">
          <span className="tpl-av">
            <AgentAvatar bot={null} icon={template.icon} />
          </span>
          <div className="grow">
            <div className="tpl-kicker">{template.area} · modelo</div>
            <h2>{template.name}</h2>
            <p className="lead">{upper(template.owns)}.</p>
            {template.measure && (
              <div className="tpl-measure">
                <i className="ti ti-target" />
                <span>Mede</span>
                <b>{template.measure}</b>
              </div>
            )}
          </div>
          <div className="tpl-acts">
            <button
              className="btn filled"
              onClick={create}
              disabled={isCreating}
            >
              <i className="ti ti-plus" />
              Criar agente
            </button>
            {!template.isHouse && (
              <button
                className="btn outline sm"
                onClick={() =>
                  onOpenFile(`templates/${template.id}/TEMPLATE.md`)
                }
              >
                <i className="ti ti-file-text" />
                Abrir o arquivo
              </button>
            )}
          </div>
        </div>
        <div className="tpl-stats">
          <div>
            <b>{mine.length}</b>
            <span>{mine.length === 1 ? 'agente' : 'agentes'} deste modelo</span>
          </div>
          <div>
            <b>{template.uses.length}</b>
            <span>conexões</span>
          </div>
          <div>
            <b>{template.skills.length}</b>
            <span>habilidades</span>
          </div>
          <div>
            <b>{template.model.split('/').pop()}</b>
            <span>esforço {effort.toLowerCase()}</span>
          </div>
        </div>
        {(from.length > 0 || to.length > 0) && (
          <div className="box">
            <div className="bh">
              <i className="ti ti-arrows-exchange" />
              <b className="grow">Na empresa</b>
              <span className="muted">
                de quem recebe trabalho e pra quem passa
              </span>
            </div>
            <div className="bb tpl-flow">
              <div className="col">
                <span className="label">
                  <i className="ti ti-arrow-down-right" />
                  Recebe trabalho de
                </span>
                {from.length ? (
                  from.map((item) => (
                    <FlowRow
                      key={item.id}
                      template={item}
                      onOpen={onOpenTemplate}
                    />
                  ))
                ) : (
                  <p className="muted">
                    De quem pede, da rotina ou da porta de entrada.
                  </p>
                )}
              </div>
              <div className="col">
                <span className="label">
                  <i className="ti ti-arrow-up-right" />
                  Passa trabalho pra
                </span>
                {to.length ? (
                  to.map((item) => (
                    <FlowRow
                      key={item.id}
                      template={item}
                      onOpen={onOpenTemplate}
                    />
                  ))
                ) : (
                  <p className="muted">Entrega direto pra quem pediu.</p>
                )}
              </div>
            </div>
          </div>
        )}
        <div className="tpl-grid">
          <div className="tpl-main">
            <div className="box">
              <div className="bh">
                <b className="grow">Instruções</b>
                {draft === null ? (
                  <button
                    className="btn outline sm"
                    onClick={() => setDraft(template.instructions)}
                  >
                    <i className="ti ti-pencil" />
                    Editar
                  </button>
                ) : (
                  <>
                    <button
                      className="btn outline sm"
                      onClick={() => setDraft(null)}
                    >
                      Cancelar
                    </button>
                    <button
                      className="btn filled sm"
                      onClick={async () => {
                        await save(
                          { instructions: draft },
                          'Instruções do modelo salvas',
                        );
                        setDraft(null);
                      }}
                    >
                      Salvar
                    </button>
                  </>
                )}
              </div>
              <div className="bb">
                {draft === null ? (
                  <div
                    className="txt"
                    style={{
                      fontSize: 13,
                      lineHeight: 1.6,
                      whiteSpace: 'pre-wrap',
                    }}
                  >
                    {template.instructions}
                  </div>
                ) : (
                  <textarea
                    className="editor"
                    style={{
                      minHeight: 200,
                      border: 'var(--line-3)',
                      width: '100%',
                    }}
                    spellCheck={false}
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                  />
                )}
              </div>
            </div>
            <div className="box">
              <div className="bh">
                <i className="ti ti-sparkles" />
                <b className="grow">Habilidades</b>
                <span className="muted">
                  em skills/, servem pra qualquer agente
                </span>
              </div>
              <div className="bb tpl-skills">
                {template.skills.length ? (
                  template.skills.map((skill) => (
                    <div className="sk" key={skill.name}>
                      <b className="mono">{skill.name}</b>
                      <p>{skill.whenToUse}</p>
                    </div>
                  ))
                ) : (
                  <p className="muted">Nenhuma.</p>
                )}
              </div>
            </div>
          </div>
          <div className="tpl-side">
            <div className="box">
              <div className="bh">
                <b className="grow">Como nasce</b>
              </div>
              <div className="bb">
                <div className="kv">
                  <span>Modelo e esforço</span>
                  <button
                    className="select"
                    title={`${model.label} · ${effort}`}
                    onClick={menu.open('brain')}
                  >
                    <span className="sel-text">
                      {model.label} · {effort}
                    </span>
                    <i className="ti ti-chevron-down" />
                  </button>
                </div>
                <p className="fine">
                  {home
                    ? 'Cada agente recebe uma cópia e pode mudar só pra ele. Mudar aqui vale pros próximos.'
                    : 'Nenhuma conta de IA tem esse modelo ligado: o agente nasce na primeira chave com modelos. Escolha um modelo das suas contas.'}
                </p>
              </div>
            </div>
            {template.when && (
              <div className="box">
                <div className="bh">
                  <i className="ti ti-clock-play" />
                  <b className="grow">Rotina sugerida</b>
                </div>
                <div className="bb">
                  <p className="tpl-when">{upper(template.when)}</p>
                  <p className="fine">
                    Liga nos ajustes de cada agente, na aba Quando.
                  </p>
                </div>
              </div>
            )}
            <div className="box">
              <div className="bh">
                <i className="ti ti-plug" />
                <b className="grow">Conexões</b>
              </div>
              <div className="bb">
                {template.uses.length ? (
                  template.uses.map((use) => (
                    <div className="kv" key={use.service}>
                      <b>{use.service}</b>
                      <span>{REACH[use.reach] || use.reach}</span>
                    </div>
                  ))
                ) : (
                  <p className="muted">Nenhuma.</p>
                )}
              </div>
            </div>
            <div className="box">
              <div className="bh">
                <i className="ti ti-shield" />
                <b className="grow">Sempre pergunta antes de</b>
              </div>
              <div className="bb">
                <p className="tpl-when">
                  {upper(template.asks || 'publicar, enviar, pagar ou apagar')}
                </p>
                <p className="fine">
                  Pagar e entrar numa conta sempre perguntam.
                </p>
              </div>
            </div>
            <div className="box">
              <div className="bh">
                <i className="ti ti-users-group" />
                <b className="grow">Agentes deste modelo</b>
              </div>
              <div className="bb">
                {mine.length ? (
                  mine.map((bot) => (
                    <button
                      key={bot.id}
                      className="tpl-agent"
                      onClick={() => onOpenAgent(bot.id)}
                    >
                      <b>{bot.name}</b>
                    </button>
                  ))
                ) : (
                  <p className="muted">Nenhum ainda.</p>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
      {menu.is('brain') && (
        <Menu
          anchor={menu.anchor}
          title="Conta e modelo"
          search
          width={340}
          onClose={menu.close}
        >
          {brains.length === 0 && (
            <p className="menu-note">
              Nenhuma conta de IA com modelos ligados ainda. Ligue a chave de um
              provedor em Configurações, Contas de IA.
            </p>
          )}
          {brains.map((group) => (
            <div key={group.account.id}>
              <div className="h label">{`${group.account.providerName}${group.account.name !== group.account.providerName ? ` · ${group.account.name}` : ''}`}</div>
              {group.models.map((item) => (
                <Opt
                  key={item.id}
                  mono
                  title={item.label}
                  isOn={
                    home?.account.id === group.account.id &&
                    template.model === item.id
                  }
                  onClick={() => {
                    menu.close();
                    save({ model: item.id }, `Modelo: ${item.label}`);
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
              isOn={template.effort === id}
              onClick={() => {
                menu.close();
                save({ effort: id }, `Esforço: ${label}`);
              }}
            />
          ))}
        </Menu>
      )}
    </div>
  );
}
