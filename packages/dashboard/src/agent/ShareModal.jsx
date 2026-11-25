import { useEffect, useState } from 'react';

import { fetchPeople, shareAgent, unshareAgent } from '../services/api';
import { notify } from '../components/zen';
import { botsChanged } from '../state/use-bots';
import { Modal } from '../ui/Modal';
import { Menu, useMenu } from '../ui/Menu';

const ACCESS = [
  [
    'read',
    'Read only',
    'Follows the conversation live without sending messages.',
  ],
  [
    'enter',
    'Can join the chat',
    'Sends a message to the same agent, signed with its own name.',
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
        `Shared with ${address}. The agent shows up in their list.`,
      )
    )
      setEmail('');
  };

  return (
    <Modal title="Share agent" icon="ti-user-share" onClose={onClose}>
      <div className="fine">{bot.name}</div>
      <span className="label">With whom</span>
      <div className="share-who">
        <input
          className="input"
          type="email"
          placeholder="Person's email"
          aria-label="Person's email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          onKeyDown={(event) =>
            event.key === 'Enter' && email.trim() && share()
          }
        />
        {others.length > 0 && (
          <button className="select" onClick={menu.open('who')}>
            Team’s
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
        The agent keeps running as you, with your access and on your plan. Only
        you can answer the agent’s permission requests.
      </p>
      <div className="mf">
        <button
          className="btn filled"
          onClick={share}
          disabled={!email.trim() || isSaving}
        >
          <i className="ti ti-user-share" />
          Share
        </button>
      </div>
      {members.length > 0 && (
        <>
          <span className="label">Who already has it</span>
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
                    {id === 'read' ? 'Read only' : 'Can enter'}
                  </button>
                ))}
              </span>
              <button
                className="btn outline sm"
                onClick={() =>
                  run(
                    () => unshareAgent(bot.id, member.email),
                    `${member.name} left the agent`,
                  )
                }
              >
                Remove
              </button>
            </div>
          ))}
        </>
      )}
      {menu.is('who') && (
        <Menu
          anchor={menu.anchor}
          title="With whom"
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
