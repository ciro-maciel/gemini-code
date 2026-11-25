import { useEffect, useState } from 'react';

import { fetchPeople, shareAgent, unshareAgent } from '../services/api';
import { notify } from '../components/zen';
import { botsChanged } from '../state/use-bots';
import { Modal } from '../ui/Modal';
import { Menu, useMenu } from '../ui/Menu';

const ACCESS = [
  ['read', 'Só ler', 'Acompanha a conversa ao vivo, sem mandar mensagem.'],
  [
    'enter',
    'Pode entrar na conversa',
    'Manda mensagem pro mesmo agente, assinada com o próprio nome.',
  ],
];

function Radio({ isOn, title, text, onClick }) {
  return (
    <div
      className={`radio${isOn ? ' on' : ''}`}
      role="radio"
      aria-checked={isOn}
      tabIndex={0}
      onClick={onClick}
    >
      <span className="dot" />
      <div>
        <b>{title}</b>
        <p>{text}</p>
      </div>
    </div>
  );
}

/**
 * Sharing an agent, as the prototype draws it: with whom (someone already in
 * one of your agents, or an e-mail), read only or enter, and who is in it now.
 */
export function ShareModal({ bot, onClose }) {
  const [people, setPeople] = useState([]);
  const [email, setEmail] = useState('');
  const [access, setAccess] = useState('read');
  const [isSaving, setIsSaving] = useState(false);
  const menu = useMenu();
  const members = bot.members ?? [];
  useEffect(() => {
    fetchPeople()
      .then((data) => setPeople(data.items))
      .catch(() => {});
  }, []);
  const others = people.filter(
    (person) => !members.some((member) => member.email === person.email),
  );

  const run = async (action, message) => {
    setIsSaving(true);
    try {
      await action();
      botsChanged();
      if (message) notify.success(message);
      return true;
    } catch (error) {
      notify.error(error.message);
      return false;
    } finally {
      setIsSaving(false);
    }
  };
  const share = async () => {
    const address = email.trim();
    if (
      await run(
        () => shareAgent(bot.id, address, access),
        `Compartilhada com ${address}. O agente aparece na lista da pessoa.`,
      )
    )
      setEmail('');
  };

  return (
    <Modal title="Compartilhar agente" icon="ti-user-share" onClose={onClose}>
      <div className="fine">{bot.name}</div>
      <span className="label">Com quem</span>
      <div className="share-who">
        <input
          className="input"
          type="email"
          placeholder="E-mail da pessoa"
          aria-label="E-mail da pessoa"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) =>
            event.key === 'Enter' && email.trim() && share()
          }
        />
        {others.length > 0 && (
          <button className="select" onClick={menu.open('who')}>
            Do time
            <i className="ti ti-chevron-down" />
          </button>
        )}
      </div>
      {ACCESS.map(([id, title, text]) => (
        <Radio
          key={id}
          isOn={access === id}
          title={title}
          text={text}
          onClick={() => setAccess(id)}
        />
      ))}
      <p className="fine">
        O agente continua rodando como você, com o seu acesso e no seu plano.
        Pedido de permissão do agente, só você responde.
      </p>
      <div className="mf">
        <button
          className="btn filled"
          onClick={share}
          disabled={!email.trim() || isSaving}
        >
          <i className="ti ti-user-share" />
          Compartilhar
        </button>
      </div>
      {members.length > 0 && (
        <>
          <span className="label">Com quem já está</span>
          {members.map((member) => (
            <div className="row" key={member.email}>
              <span className="av sm">
                {member.name.slice(0, 2).toUpperCase()}
              </span>
              <b title={member.email}>{member.name}</b>
              <span className="grow" />
              <span className="seg-sm">
                {ACCESS.map(([id]) => (
                  <button
                    key={id}
                    className={member.access === id ? 'on' : ''}
                    onClick={() =>
                      member.access !== id &&
                      run(() => shareAgent(bot.id, member.email, id))
                    }
                  >
                    {id === 'read' ? 'Só ler' : 'Pode entrar'}
                  </button>
                ))}
              </span>
              <button
                className="btn outline sm"
                onClick={() =>
                  run(
                    () => unshareAgent(bot.id, member.email),
                    `${member.name} saiu do agente`,
                  )
                }
              >
                Tirar
              </button>
            </div>
          ))}
        </>
      )}
      {menu.is('who') && (
        <Menu
          anchor={menu.anchor}
          title="Com quem"
          width={260}
          onClose={menu.close}
        >
          {others.map((person) => (
            <button
              key={person.email}
              onClick={() => {
                menu.close();
                setEmail(person.email);
              }}
            >
              <span className="av sm">
                {person.name.slice(0, 2).toUpperCase()}
              </span>
              {person.name}
            </button>
          ))}
        </Menu>
      )}
    </Modal>
  );
}
