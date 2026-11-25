import {
  useCallback,
  useEffect,
  useImperativeHandle,
  useRef,
  useState,
} from 'react';

import { fetchSkills, transcribe, uploadAttachment } from '../services/api';
import { openMicrophone } from '../audio/microphone';
import { unlockVoiceAudio } from '../components/voice-audio';
import { notify } from '../components/zen';
import { Menu, Opt, useMenu } from '../ui/Menu';
import {
  formatSize,
  MAX_BYTES,
  MAX_FILES,
  pastedFiles,
  shrinkImage,
} from './attachments';

const DICTATION_SILENCE_MS = 2000;
const DICTATION_MAX_MS = 2 * 60 * 1000;

/** The level of the voice while dictating, speaking or narrating: five bars. */
export function LevelBars({ level, color = null }) {
  return (
    <span className="levels" aria-hidden>
      {[0.55, 0.8, 1, 0.8, 0.55].map((weight, index) => (
        <i
          key={index}
          style={{
            height: Math.max(
              3,
              Math.round(16 * Math.min(1, level * 1.6) * weight),
            ),
            ...(color ? { background: color } : {}),
          }}
        />
      ))}
    </span>
  );
}

/**
 * The box that writes to an agent, as the prototype draws it. `variant="start"`
 * is the big field that starts one (the command center, a new agent); the
 * default sits under a conversation. `build` is the row of setup chips.
 */
// The parts of a step, from the largest kind to the smallest, darkest first.
const CONTEXT_PARTS = [
  ['people', 'O que as pessoas escreveram'],
  ['answers', 'Respostas do agente'],
  ['results', 'Resultados das ferramentas'],
  ['tools', 'Ferramentas'],
  ['rules', 'Regras, memória e habilidades'],
  ['instructions', 'Instruções do agente'],
];
// 171.900 tokens read as "171,9k", a million as "1M".
const short = (value) =>
  value >= 1e6
    ? `${(value / 1e6).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}M`
    : value >= 1000
      ? `${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}k`
      : String(Math.round(value));
const percent = (value, total) =>
  `${((value / total) * 100).toLocaleString('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

/** What the model read at the last step, opened on the ring: the window used, then each part and the space left. */
function ContextDetail({ context, share, releasable, onRelease }) {
  const window = context?.window;
  const parts =
    context?.parts && window
      ? CONTEXT_PARTS.map(([key, label]) => ({
          key,
          label,
          tokens: context.parts[key] ?? 0,
        })).filter((part) => part.tokens > 0)
      : [];
  const free = window ? Math.max(0, window - context.tokens) : 0;
  return (
    <span className="ctx-pop" role="tooltip">
      <span className="ctx-h">Contexto</span>
      <span className="ctx-n">
        <span className="grow">{Math.round(share * 100)}% usado</span>
        {window && (
          <span className="ctx-of">
            {short(context.tokens)} / {short(window)}
          </span>
        )}
      </span>
      <span className="ctx-bar">
        {parts.length ? (
          parts.map((part) => (
            <i
              key={part.key}
              className={`p-${part.key}`}
              style={{ width: `${(part.tokens / window) * 100}%` }}
            />
          ))
        ) : (
          <i className="p-people" style={{ width: `${share * 100}%` }} />
        )}
      </span>
      {parts.length > 0 && (
        <span className="ctx-rows">
          {parts.map((part) => (
            <span key={part.key} className="ctx-row">
              <i className={`p-${part.key}`} />
              <span className="grow">{part.label}</span>
              <span className="ctx-t">{short(part.tokens)}</span>
              <span className="ctx-p">{percent(part.tokens, window)}</span>
            </span>
          ))}
          <span className="ctx-row free">
            <i />
            <span className="grow">Espaço livre</span>
            <span className="ctx-t">{short(free)}</span>
            <span className="ctx-p">{percent(free, window)}</span>
          </span>
        </span>
      )}
      {context?.parts?.toolCount > 0 && (
        <span className="ctx-row ctx-count">
          <span className="grow">Ferramentas ativas</span>
          <span className="ctx-p">{context.parts.toolCount}</span>
        </span>
      )}
      {onRelease &&
        releasable &&
        (releasable.connected > 0 || releasable.isComputer) && (
          <span className="ctx-release">
            <span className="ctx-note">
              Sem uso nesta conversa:{' '}
              {[
                releasable.connected > 0 &&
                  `${releasable.connected} ${releasable.connected === 1 ? 'ferramenta de conexão' : 'ferramentas de conexões'}`,
                releasable.isComputer && 'o computador e o navegador',
              ]
                .filter(Boolean)
                .join(' e ')}
              . Liberar tira do contexto; o agente traz de volta se precisar.
            </span>
            <button className="btn outline sm" onClick={onRelease}>
              <i className="ti ti-eraser" />
              Liberar contexto
            </button>
          </span>
        )}
      {!parts.length && (
        <span className="ctx-note">
          O detalhe por parte aparece a partir do próximo passo do agente.
        </span>
      )}
      {context?.model && (
        <span className="ctx-note">
          No último passo, em {context.model.split('/').pop()}. Resultados e
          imagens antigas entram resumidos.
        </span>
      )}
    </span>
  );
}

// What "Voltar para aqui" undoes, counted before the cut (04/11/2026).
const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;
const clock = (seconds) =>
  new Date(seconds * 1000).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });
export function rewindSentence(preview) {
  if (preview === undefined)
    return 'Editando a partir desta mensagem. Contando o que sai…';
  if (preview === null)
    return 'Editando a partir desta mensagem. Ao enviar, o que veio depois sai da conversa e da memória do agente, e fica guardado em Versões.';
  const parts = [
    preview.messages &&
      plural(preview.messages, 'mensagem sua', 'mensagens suas'),
    preview.replies && plural(preview.replies, 'resposta', 'respostas'),
    preview.steps && plural(preview.steps, 'passo', 'passos'),
  ].filter(Boolean);
  const cut = parts.length
    ? `Ao enviar, saem ${parts.join(', ')}${preview.laterTasks ? ` (em ${plural(preview.laterTasks + 1, 'tarefa', 'tarefas')})` : ''}; ficam guardados em Versões.`
    : 'Ao enviar, nada mais sai além desta mensagem.';
  const disk = preview.diskAt
    ? ` O computador do agente volta para ${clock(preview.diskAt)}; o que já saiu para fora continua fora.`
    : preview.steps
      ? ' O computador do agente não volta: não há foto dele depois desta mensagem.'
      : '';
  return `${cut}${disk}`;
}

export function Composer({
  ref,
  botId,
  variant = 'thread',
  placeholder,
  build = null,
  canWrite = true,
  isSending = false,
  isWorking = false,
  queue = [],
  rewind = null,
  onCancelRewind,
  onSend,
  onAsk = null,
  onUnqueue,
  onStop,
  onTeach,
  onVoice,
  onNote = null,
  workSeconds = 0,
  contextShare = null,
  context = null,
  releasable = null,
  onReleaseContext = null,
  suggestions = [],
  extraTools = null,
}) {
  const isStart = variant === 'start';
  const [text, setText] = useState('');
  const [items, setItems] = useState([]);
  const [dictation, setDictation] = useState(null);
  const [level, setLevel] = useState(0);
  // While the agent works: "Agora" (it reads before its next step), "Fila" (when it finishes)
  // or "Pergunta" (answered on the side from what it is doing; it never stops nor reads it).
  const [sendMode, setSendMode] = useState('now');
  const isQueueMode = sendMode === 'queue';
  const isAsking = isWorking && sendMode === 'side' && Boolean(onAsk);
  const [side, setSide] = useState(null);
  // "Entre nós": with more people in the agent, a note they see and it never reads.
  const [isNoteMode, setIsNoteMode] = useState(false);
  const isNote = isNoteMode && Boolean(onNote);
  // The context row: what is open on the Mesa goes with the message on a click, and a folder cited from the tree too.
  const [chosen, setChosen] = useState([]);
  useEffect(() => {
    const onCite = (event) =>
      event.detail.botId === botId &&
      setChosen((current) =>
        current.some((item) => item.k === event.detail.item.k)
          ? current
          : [...current, event.detail.item],
      );
    addEventListener('assistant:cite', onCite);
    return () => removeEventListener('assistant:cite', onCite);
  }, [botId]);
  const offered = suggestions.filter(
    (item) => !chosen.some((each) => each.k === item.k),
  );
  const [skills, setSkills] = useState(null);
  const inputRef = useRef(null);
  const fileRef = useRef(null);
  const micRef = useRef(null);
  const menu = useMenu();

  useEffect(() => () => micRef.current?.close(), []);
  const focusBox = useCallback(
    () => requestAnimationFrame(() => inputRef.current?.focus()),
    [],
  );

  // The box grows with what is written, up to the prototype's limit.
  useEffect(() => {
    const box = inputRef.current;
    if (!box || isStart) return;
    box.style.height = 'auto';
    box.style.height = `${Math.min(160, box.scrollHeight)}px`;
  }, [text, isStart]);

  const addFiles = async (fileList) => {
    const files = [...fileList];
    if (!files.length || !botId) return;
    if (items.length + files.length > MAX_FILES)
      return notify.error(
        'Arquivos demais',
        `Cada mensagem leva até ${MAX_FILES} arquivos.`,
      );
    for (const original of files) {
      if (original.size > MAX_BYTES) {
        notify.error(
          `${original.name} é grande demais`,
          'Cada arquivo pode ter até 25 MB.',
        );
        continue;
      }
      const localId = crypto.randomUUID();
      const file = await shrinkImage(original);
      setItems((current) => [
        ...current,
        { localId, name: file.name, size: file.size, status: 'uploading' },
      ]);
      uploadAttachment(botId, file)
        .then((saved) =>
          setItems((current) =>
            current.map((item) =>
              item.localId === localId
                ? { ...item, id: saved.id, status: 'done' }
                : item,
            ),
          ),
        )
        .catch((error) => {
          setItems((current) =>
            current.map((item) =>
              item.localId === localId ? { ...item, status: 'error' } : item,
            ),
          );
          notify.error(`${file.name} não subiu`, error.message);
        });
    }
  };

  useImperativeHandle(ref, () => ({
    addFiles,
    focus: focusBox,
    setText: (value) => {
      setText(value);
      focusBox();
    },
    getText: () => text,
  }));

  const ready = items.filter((item) => item.status === 'done');
  const isUploading = items.some((item) => item.status === 'uploading');
  const hasContent =
    Boolean(text.trim()) || ready.length > 0 || chosen.length > 0;

  const clear = () => {
    setItems([]);
    setText('');
    focusBox();
  };

  const submit = async () => {
    if (!hasContent || !canWrite || isUploading || isSending) return;
    if (isNote) {
      if ((await onNote(text.trim())) !== false) clear();
      return;
    }
    if (isAsking) {
      const question = text.trim();
      if (!question) return;
      clear();
      setSide({ question, answer: null });
      const answer = await onAsk(question);
      setSide((current) =>
        current?.question === question
          ? answer === null
            ? null
            : { question, answer }
          : current,
      );
      if (answer === null) setText(question);
      return;
    }
    // The box empties at once, as the message shows in the conversation; a failure puts it back.
    const sent = { text, items, chosen };
    clear();
    setChosen([]);
    // In queue mode, while the agent works, the central holds the message until its task stops.
    if (
      (await onSend(
        sent.text.trim(),
        ready.map((item) => item.id),
        {
          isQueued: isWorking && isQueueMode,
          context: sent.chosen.map((item) => ({ path: item.path })),
        },
      )) !== false
    )
      return;
    setText(sent.text);
    setItems(sent.items);
    setChosen(sent.chosen);
  };

  const finishDictation = async () => {
    const mic = micRef.current;
    micRef.current = null;
    if (!mic) return;
    const wav = mic.hasSpoken() ? mic.takeRecording() : null;
    mic.close();
    setLevel(0);
    if (!wav) return setDictation(null);
    setDictation({ state: 'transcribing' });
    try {
      const { text: heard } = await transcribe(wav, botId);
      if (heard)
        setText((current) =>
          current.trim() ? `${current.trimEnd()} ${heard}` : heard,
        );
      focusBox();
    } catch (error) {
      notify.error('Não entendi o áudio', error.message);
    } finally {
      setDictation(null);
    }
  };

  const startDictation = async () => {
    try {
      const mic = await openMicrophone({
        onLevel: setLevel,
        silenceMs: DICTATION_SILENCE_MS,
        onSilence: () => finishDictation(),
      });
      micRef.current = mic;
      setDictation({ state: 'listening' });
      setTimeout(
        () => micRef.current === mic && finishDictation(),
        DICTATION_MAX_MS,
      );
    } catch {
      notify.error(
        'Sem acesso ao microfone',
        'Libere o microfone para este site nas permissões do navegador.',
      );
    }
  };

  const openSkills = (event) => {
    menu.open('skills')(event);
    if (botId)
      fetchSkills(botId)
        .then((data) => setSkills(data.items))
        .catch(() => setSkills([]));
  };
  const insertSkill = (name) => {
    setText((current) => `/${name} ${current}`);
    menu.close();
    focusBox();
  };

  const isDictating = dictation?.state === 'listening';
  const plus = (
    <button
      className="icon-btn"
      onClick={menu.open('plus')}
      title="Anexar, habilidade ou ensinar"
      aria-label="Anexar, habilidade ou ensinar"
    >
      <i className="ti ti-plus" />
    </button>
  );
  const mic = (
    <button
      className={`icon-btn${isDictating ? ' on' : ''}`}
      onClick={isDictating ? finishDictation : startDictation}
      disabled={dictation?.state === 'transcribing'}
      title={isDictating ? 'Parar o ditado' : 'Ditar'}
      aria-label={isDictating ? 'Parar o ditado' : 'Ditar'}
    >
      {isDictating ? (
        <LevelBars level={level} />
      ) : dictation?.state === 'transcribing' ? (
        <i className="ti ti-loader-2 spin" />
      ) : (
        <i className="ti ti-microphone" />
      )}
    </button>
  );
  const sendButton =
    isWorking && !hasContent ? (
      <button
        className="stop"
        onClick={onStop}
        title="Parar"
        aria-label="Parar"
      >
        <i />
      </button>
    ) : !hasContent && onVoice ? (
      <button
        className="send"
        onClick={() => {
          unlockVoiceAudio();
          onVoice();
        }}
        title="Falar com o agente"
        aria-label="Falar com o agente"
      >
        <i className="ti ti-wave-sine" />
      </button>
    ) : (
      <button
        className="send"
        onClick={submit}
        disabled={!hasContent || isUploading || isSending}
        aria-label="Enviar"
      >
        <i className="ti ti-arrow-up" />
      </button>
    );

  const attachments = items.length > 0 && (
    <div className="ctx">
      {items.map((item) => (
        <button
          key={item.localId}
          className="on"
          title="Tirar"
          onClick={() =>
            setItems((current) =>
              current.filter((candidate) => candidate.localId !== item.localId),
            )
          }
        >
          <i
            className={`ti ${item.status === 'uploading' ? 'ti-loader-2 spin' : item.status === 'error' ? 'ti-alert-triangle' : 'ti-paperclip'}`}
          />
          {item.name}
          <span className="muted">
            {item.status === 'uploading'
              ? 'enviando'
              : item.status === 'error'
                ? 'não subiu'
                : formatSize(item.size)}
          </span>
          <i className="ti ti-x" />
        </button>
      ))}
    </div>
  );

  const textarea = (
    <textarea
      ref={inputRef}
      rows={1}
      placeholder={
        isNote
          ? 'Nota pra quem está na conversa (o agente não vê)…'
          : isAsking
            ? 'Pergunte sobre o trabalho; ele não para…'
            : placeholder ||
              (isWorking ? 'Mandar mais uma coisa…' : 'Responder…')
      }
      aria-label="Mensagem"
      value={text}
      disabled={!canWrite}
      onChange={(event) => setText(event.target.value)}
      onKeyDown={(event) => {
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.nativeEvent.isComposing
        ) {
          event.preventDefault();
          submit();
        }
      }}
      onPaste={(event) => {
        const files = pastedFiles(event.clipboardData);
        if (files.length) {
          event.preventDefault();
          addFiles(files);
        }
      }}
    />
  );

  return (
    <>
      {isStart ? (
        <div className="home-comp">
          {attachments}
          {textarea}
          <div className="sel-row">
            {build}
            <span className="grow" />
            {plus}
            {mic}
            {sendButton}
          </div>
        </div>
      ) : (
        <div className={`composer${isNote ? ' note-on' : ''}`}>
          {rewind && (
            <div className="rewind">
              <i className="ti ti-arrow-back-up" />
              <span className="grow">{rewindSentence(rewind.preview)}</span>
              <button className="btn outline sm" onClick={onCancelRewind}>
                Cancelar
              </button>
            </div>
          )}
          {side && (
            <div className="side-answer">
              <div className="side-q">
                <i className="ti ti-message-question" />
                <span className="grow">{side.question}</span>
                <button
                  className="icon-btn"
                  onClick={() => setSide(null)}
                  title="Fechar a resposta"
                  aria-label="Fechar a resposta"
                >
                  <i className="ti ti-x" />
                </button>
              </div>
              {side.answer === null ? (
                <p className="muted">
                  <i className="ti ti-loader-2 spin" /> Lendo o que o agente fez
                  até aqui…
                </p>
              ) : (
                <p>{side.answer}</p>
              )}
              <small className="muted">
                Só você vê esta resposta; o agente seguiu trabalhando.
              </small>
            </div>
          )}
          {(chosen.length > 0 || offered.length > 0) && (
            <div className="ctx">
              {chosen.map((item) => (
                <button
                  key={item.k}
                  className="on"
                  title="Tirar do contexto"
                  onClick={() =>
                    setChosen((current) =>
                      current.filter((each) => each.k !== item.k),
                    )
                  }
                >
                  <i className={`ti ${item.icon}`} />
                  {item.name}
                  <i className="ti ti-x" />
                </button>
              ))}
              {offered.map((item) => (
                <button
                  key={item.k}
                  title="Levar pro contexto"
                  onClick={() => setChosen((current) => [...current, item])}
                >
                  <i className="ti ti-plus" />
                  {item.name}
                </button>
              ))}
            </div>
          )}
          {attachments}
          {queue.length > 0 && (
            <div className="queued">
              {queue.map((item) => (
                <div key={item.id}>
                  <i className="ti ti-list" />
                  <span className="grow">na fila: {item.text}</span>
                  <button
                    className="icon-btn"
                    onClick={() => onUnqueue?.(item.id)}
                    title="Tirar da fila"
                    aria-label="Tirar da fila"
                  >
                    <i className="ti ti-x" />
                  </button>
                </div>
              ))}
            </div>
          )}
          {textarea}
          <div className="ctools">
            {plus}
            {build}
            {extraTools}
            {onNote && (
              <button
                className={`pill${isNote ? ' on' : ''}`}
                onClick={() => {
                  setIsNoteMode(!isNoteMode);
                  focusBox();
                }}
                title="Nota que o agente não vê"
              >
                <i className="ti ti-lock" />
                Entre nós
              </button>
            )}
            {isWorking && !isNote && (
              <>
                <button
                  className={`pill${sendMode === 'now' ? ' on' : ''}`}
                  onClick={() => setSendMode('now')}
                  title="Manda já: o agente lê antes do próximo passo"
                >
                  <i className="ti ti-bolt" />
                  Agora
                </button>
                <button
                  className={`pill${isQueueMode ? ' on' : ''}`}
                  onClick={() => setSendMode('queue')}
                  title="Manda quando ele terminar"
                >
                  <i className="ti ti-list" />
                  Fila
                </button>
                {onAsk && (
                  <button
                    className={`pill${isAsking ? ' on' : ''}`}
                    onClick={() => {
                      setSendMode('side');
                      focusBox();
                    }}
                    title="Pergunte sobre o trabalho sem parar o agente; ele não lê a pergunta"
                  >
                    <i className="ti ti-message-question" />
                    Pergunta
                  </button>
                )}
              </>
            )}
            <span className="timer" title="Tempo deste agente">
              <i className="ti ti-clock" />
              {Math.round(workSeconds / 60)}m
            </span>
            {contextShare !== null && (
              <span
                className="ring"
                tabIndex={0}
                aria-label={`Contexto usado: ${Math.round(contextShare * 100)}%`}
              >
                <svg viewBox="0 0 18 18">
                  <circle
                    className="track"
                    cx="9"
                    cy="9"
                    r="7"
                    fill="none"
                    strokeWidth="2"
                  />
                  <circle
                    className="fill"
                    cx="9"
                    cy="9"
                    r="7"
                    fill="none"
                    strokeWidth="2"
                    transform="rotate(-90 9 9)"
                    strokeDasharray={`${(44 * contextShare).toFixed(1)} 44`}
                  />
                </svg>
                <ContextDetail
                  context={context}
                  share={contextShare}
                  releasable={releasable}
                  onRelease={onReleaseContext}
                />
              </span>
            )}
            {mic}
            {sendButton}
          </div>
        </div>
      )}
      <input
        ref={fileRef}
        type="file"
        multiple
        hidden
        onChange={(event) => {
          addFiles(event.target.files);
          event.target.value = '';
        }}
      />
      {menu.is('plus') && (
        <Menu anchor={menu.anchor} width={240} onClose={menu.close}>
          <button
            onClick={() => {
              menu.close();
              fileRef.current?.click();
            }}
            disabled={!botId}
          >
            <i className="ti ti-paperclip" />
            Anexar arquivo
          </button>
          <button onClick={openSkills} disabled={!botId}>
            <i className="ti ti-sparkles" />
            Usar uma habilidade
          </button>
          {onTeach && (
            <button
              onClick={() => {
                menu.close();
                onTeach();
              }}
            >
              <i className="ti ti-hand-finger" />
              Ensinar uma tarefa
            </button>
          )}
        </Menu>
      )}
      {menu.is('skills') && (
        <Menu
          anchor={menu.anchor}
          title="Habilidades deste agente"
          search
          width={360}
          onClose={menu.close}
        >
          {skills === null ? (
            <p className="menu-note">Carregando…</p>
          ) : skills.length ? (
            skills.map((skill) => (
              <Opt
                key={skill.id}
                mono
                title={`/${skill.name}`}
                note={skill.whenToUse}
                onClick={() => insertSkill(skill.name)}
              />
            ))
          ) : (
            <p className="menu-note">
              Nenhuma habilidade ainda. Ensine uma tarefa pelo mais.
            </p>
          )}
        </Menu>
      )}
    </>
  );
}
