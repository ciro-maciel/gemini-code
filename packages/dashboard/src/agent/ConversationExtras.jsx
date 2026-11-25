import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  addBookmark,
  fetchBookmarks,
  fetchBranch,
  fetchBranches,
  removeBookmark,
} from '../services/api';
import { buildRows } from '../conversation/rows';
import { deliveredAt, resultsOf } from '../conversation/results';
import { RichText } from '../components/RichText';
import { notify } from '../components/zen';
import { Menu, Opt, useMenu } from '../ui/Menu';
import { Modal } from '../ui/Modal';
import { messageWhen } from '../labels';
import { Thread } from './Thread';

// A row of the conversation, found on screen and shown for a moment.
// The conversation holds its end while the agent writes; the thread lets go first
// (AgentTab listens), or a smooth scroll is pulled back down before it moves (04/11/2026).
export function showRow(rowId) {
  const node = document.querySelector(`[data-row="${CSS.escape(rowId)}"]`);
  if (!node) return false;
  node.closest('.thread')?.dispatchEvent(new Event('assistant:let-go'));
  node.scrollIntoView({ block: 'start' });
  node.classList.add('flash');
  setTimeout(() => node.classList.remove('flash'), 1600);
  return true;
}

/** The replies this person marked in this agent, and the mark that toggles one. */
export function useBookmarks(botId) {
  const [items, setItems] = useState([]);
  useEffect(() => {
    let isAlive = true;
    setItems([]);
    fetchBookmarks(botId)
      .then((found) => isAlive && setItems(found))
      .catch(() => {});
    return () => {
      isAlive = false;
    };
  }, [botId]);
  const ids = useMemo(
    () => new Set(items.map((item) => item.eventId)),
    [items],
  );
  const toggle = useCallback(
    async (eventId) => {
      try {
        setItems(
          ids.has(eventId)
            ? await removeBookmark(botId, eventId)
            : await addBookmark(botId, eventId),
        );
      } catch (error) {
        notify.error(
          'A marcação não ficou',
          `${error.message}. Tente de novo.`,
        );
      }
    },
    [botId, ids],
  );
  return { items, ids, toggle };
}

/** "Marcadas": the marked replies; one still in the conversation scrolls there, one cut opens here. */
export function MarkedButton({ bookmarks }) {
  const menu = useMenu();
  const [opened, setOpened] = useState(null);
  if (!bookmarks.items.length) return null;
  return (
    <>
      <button
        className="share"
        onClick={menu.open('bookmarks')}
        title="As respostas que você marcou"
      >
        <i className="ti ti-bookmark" />
        Marcadas {bookmarks.items.length}
      </button>
      {menu.is('bookmarks') && (
        <Menu
          anchor={menu.anchor}
          title="Respostas marcadas"
          width={360}
          onClose={menu.close}
        >
          {bookmarks.items.map((item) => (
            <Opt
              key={item.eventId}
              title={item.text.replace(/\s+/g, ' ').slice(0, 90)}
              note={messageWhen(item.createdAt)}
              onClick={() => {
                menu.close();
                if (!showRow(item.eventId)) setOpened(item);
              }}
            />
          ))}
        </Menu>
      )}
      {opened && (
        <Modal
          title="Resposta marcada"
          icon="ti-bookmark"
          onClose={() => setOpened(null)}
        >
          <p className="fine">
            Esta resposta saiu da conversa num “Voltar para aqui”; a marcação
            guardou o texto.
          </p>
          <div className="txt">
            <RichText text={opened.text} />
          </div>
        </Modal>
      )}
    </>
  );
}

/** "Versões": what each "Voltar para aqui" cut, kept to read. */
export function VersionsButton({ bot, account, modelLabel, refreshKey }) {
  const menu = useMenu();
  const [items, setItems] = useState([]);
  const [opened, setOpened] = useState(null);
  useEffect(() => {
    let isAlive = true;
    fetchBranches(bot.id)
      .then((found) => isAlive && setItems(found))
      .catch(() => {});
    return () => {
      isAlive = false;
    };
  }, [bot.id, refreshKey]);
  if (!items.length) return null;
  const open = async (branch) => {
    menu.close();
    try {
      setOpened(await fetchBranch(bot.id, branch.id));
    } catch (error) {
      notify.error('A versão não abriu', `${error.message}. Tente de novo.`);
    }
  };
  return (
    <>
      <button
        className="share"
        onClick={menu.open('versions')}
        title="O que um Voltar para aqui tirou da conversa, guardado para ler"
      >
        <i className="ti ti-git-branch" />
        Versões {items.length}
      </button>
      {menu.is('versions') && (
        <Menu
          anchor={menu.anchor}
          title="Versões guardadas"
          width={360}
          onClose={menu.close}
        >
          {items.map((item) => (
            <Opt
              key={item.id}
              title={`A partir de: ${item.title.replace(/\s+/g, ' ').slice(0, 70)}`}
              note={`${messageWhen(item.createdAt)} · ${item.size} ${item.size === 1 ? 'passo' : 'passos'}`}
              onClick={() => open(item)}
            />
          ))}
        </Menu>
      )}
      {opened && (
        <Modal
          title="Versão guardada"
          icon="ti-git-branch"
          onClose={() => setOpened(null)}
        >
          <p className="fine">
            Como a conversa seguia antes de voltar para “
            {opened.title.slice(0, 80)}”. Só para ler: o agente seguiu pelo
            outro caminho.
          </p>
          <div className="thread-inner version">
            <Thread
              bot={bot}
              account={account}
              modelLabel={modelLabel}
              rows={buildRows(opened.events)}
              thread={null}
              isWorking={false}
              streamingText=""
              rewindFromSeq={null}
              onOpenScreen={() => {}}
              onOpenTakeover={() => {}}
              onOpenFile={() => {}}
            />
          </div>
        </Modal>
      )}
    </>
  );
}

const RESULT_ICONS = {
  pull: 'ti-git-pull-request',
  link: 'ti-external-link',
  artifact: 'ti-presentation',
  file: 'ti-file-text',
};
// One line under the box (04/11/2026): the latest two in sight, the rest behind "+N".
const RESULTS_IN_SIGHT = 2;

/** What the agent delivered, at hand in the footer line, beside the cost. */
export function ResultsBar({ rows, onOpenFile }) {
  const results = useMemo(() => resultsOf(rows), [rows]);
  const menu = useMenu();
  if (!results.length) return null;
  const openResult = (item) => {
    if (item.url) return window.open(item.url, '_blank', 'noopener,noreferrer');
    if (item.kind === 'file')
      return onOpenFile?.(
        `${item.botId}/${item.path.replace(/^\/home\/sprite\/workspace\/?/, '')}`,
      );
    showRow(item.rowId);
  };
  const rest = results.slice(RESULTS_IN_SIGHT);
  return (
    <span className="results" aria-label="O que o agente entregou">
      <span className="results-label">Entregue</span>
      {results.slice(0, RESULTS_IN_SIGHT).map((item) => (
        <button
          key={item.key}
          className="result"
          title={[item.label, deliveredAt(item.at), item.detail]
            .filter(Boolean)
            .join(' · ')}
          onClick={() => openResult(item)}
        >
          <i className={`ti ${RESULT_ICONS[item.kind]}`} />
          <span>{item.label}</span>
        </button>
      ))}
      {rest.length > 0 && (
        <button
          className="result more"
          onClick={menu.open('results')}
          title="Tudo o que o agente entregou"
        >
          +{rest.length}
        </button>
      )}
      {menu.is('results') && (
        <Menu
          anchor={menu.anchor}
          title="Entregue"
          width={340}
          onClose={menu.close}
        >
          {results.map((item) => (
            <button
              key={item.key}
              className="res-opt"
              title={item.url || item.path || item.label}
              onClick={() => {
                menu.close();
                openResult(item);
              }}
            >
              <i className={`ti ${RESULT_ICONS[item.kind]}`} />
              <span className="res-txt">
                <span>{item.label}</span>
                <small>
                  {[deliveredAt(item.at), item.detail]
                    .filter(Boolean)
                    .join(' · ')}
                </small>
              </span>
            </button>
          ))}
        </Menu>
      )}
    </span>
  );
}
