import { useEffect, useRef, useState } from 'react';

import { saveTemplate } from '../services/api';
import { notify } from '../components/zen';
import { reloadTemplates } from '../state/templates';
import { AgentAvatar } from '../shell/AgentAvatar';
import { IDEAS, nameFromOwns, QUESTIONS, servicesFrom } from './new-template';

/**
 * "Novo modelo", as the prototype has it: a short conversation with the
 * Assistant (what it owns, what it talks to), then the card to create it.
 */
export function NewTemplateTab({ onCreated }) {
  const [answers, setAnswers] = useState([]);
  const [text, setText] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef(null);
  useEffect(() => inputRef.current?.focus(), [answers.length]);

  const step = answers.length;
  const answer = (value) => {
    if (!value.trim()) return;
    setAnswers((current) => [...current, value.trim()]);
    setText('');
  };
  const name = answers[0] ? nameFromOwns(answers[0]) : '';
  const create = async () => {
    setIsSaving(true);
    try {
      const template = await saveTemplate({
        name,
        owns: answers[0],
        area: 'Outros',
        uses: servicesFrom(answers[1] || ''),
        instructions: `What's yours: ${answers[0]}.`,
      });
      await reloadTemplates();
      notify.success(
        `Template ${template.name} created`,
        "It's already in the Command center; every agent created from it gets a copy.",
      );
      onCreated(template.id);
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsSaving(false);
    }
  };

  const assistant = (key, children) => (
    <div className="m" key={key}>
      <AgentAvatar bot={null} icon="ti-sparkles" />
      <div className="body">
        <div className="who">
          Assistant<small>create a template</small>
        </div>
        {children}
      </div>
    </div>
  );
  const mine = (key, value) => (
    <div className="m person mine" key={key}>
      <span className="av">EU</span>
      <div className="body">
        <div className="me-label">You</div>
        <div className="txt">{value}</div>
      </div>
    </div>
  );

  return (
    <div className="conv">
      <div className="thread">
        <div className="thread-inner">
          {assistant(
            'q0',
            <>
              <div className="txt">{QUESTIONS[0]}</div>
              {step === 0 && (
                <div className="quick wrap">
                  {IDEAS.map((idea) => (
                    <button
                      key={idea}
                      className="btn outline sm"
                      onClick={() => answer(idea)}
                    >
                      {idea}
                    </button>
                  ))}
                </div>
              )}
            </>,
          )}
          {answers[0] && mine('a0', answers[0])}
          {step >= 1 &&
            assistant('q1', <div className="txt">{QUESTIONS[1]}</div>)}
          {answers[1] && mine('a1', answers[1])}
          {step >= 2 &&
            assistant(
              'card',
              <>
                <div className="txt">
                  Montei a ficha. Confere e cria; dá pra mudar tudo depois, na
                  ficha do modelo.
                </div>
                <div className="art">
                  <div className="ah">
                    <span className="label">Profile</span>
                    <b>Profile of {name}</b>
                  </div>
                  <div className="aitems">
                    <div className="ai">
                      <span className="pill-st">takes care of</span>
                      <b>{answers[0]}</b>
                    </div>
                    <div className="ai">
                      <span className="pill-st">usa</span>
                      <b>{answers[1]}</b>
                      <span className="muted">
                        each asks for permission the first time
                      </span>
                    </div>
                  </div>
                  <div className="quick wrap">
                    <button
                      className="btn filled sm"
                      onClick={create}
                      disabled={isSaving}
                    >
                      Create template
                    </button>
                    <button
                      className="btn outline sm"
                      onClick={() => setAnswers([])}
                    >
                      Change something
                    </button>
                  </div>
                </div>
              </>,
            )}
        </div>
      </div>
      {step < 2 && (
        <div className="composer">
          <textarea
            ref={inputRef}
            rows={1}
            placeholder="Reply…"
            aria-label="Resposta"
            value={text}
            onChange={(event) => setText(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault();
                answer(text);
              }
            }}
          />
          <div className="ctools">
            <span className="grow" />
            <button
              className="send"
              onClick={() => answer(text)}
              disabled={!text.trim()}
              aria-label="Send"
            >
              <i className="ti ti-arrow-up" />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
