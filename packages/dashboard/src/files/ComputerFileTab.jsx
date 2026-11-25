import { useEffect, useState } from 'react';

import { fileUrl, readAgentFile, writeAgentFile } from '../services/api';
import { notify } from '../components/zen';
import { CodeEditor, languageOf } from './CodeEditor';
import { RichText } from '../components/RichText';
import { drawablePage } from '../components/FileGallery';
import { FileSkeleton } from './FileSkeleton';

const WORKSPACE = '/home/sprite/workspace/';

/**
 * A file of an agent's computer as a Mesa tab: Markdown rendered, a page drawn,
 * an image shown, anything else as its text. The path is "<botId>/<path in its workspace>".
 */
export function ComputerFileTab({ path }) {
  const slash = path.indexOf('/');
  const botId = path.slice(0, slash);
  const relative = path.slice(slash + 1);
  const url = fileUrl(botId, `${WORKSPACE}${relative}`);
  const isImage = /\.(png|jpe?g|webp|gif|svg)$/i.test(relative);
  const isPage = /\.html?$/i.test(relative);
  const [text, setText] = useState(null);
  const [view, setView] = useState('rendered');
  // Where the text came from: the agent's own folder can be edited and saved; a cloud computer's file is read-only.
  const [source, setSource] = useState(null);
  const [isDirty, setIsDirty] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  // Markdown and pages have a rendered view; every other text file opens straight in the editor.
  const isCode = !isImage && !isPage && languageOf(relative) !== 'markdown';

  useEffect(() => {
    if (isImage) return;
    setText(null);
    // The agent's own folder first (the files MCP's route); a cloud computer's workspace when it is not there.
    readAgentFile(botId, relative)
      .then((data) => {
        if (data.isBinary) throw new Error('binary');
        setSource('agent');
        setText(data.content);
      })
      .catch(() =>
        fetch(url)
          .then((response) =>
            response.ok
              ? response.text()
              : Promise.reject(new Error(`${response.status}`)),
          )
          .then((body) => {
            setSource('cloud');
            setText(body);
          })
          .catch(() => setText('')),
      );
  }, [url, isImage, botId, relative, reloadKey]);

  // The agent changed a file: read it again (the editor keeps unsaved edits).
  useEffect(() => {
    const onChange = (event) =>
      event.detail?.botId === botId && setReloadKey((key) => key + 1);
    window.addEventListener('gemini:files', onChange);
    return () => window.removeEventListener('gemini:files', onChange);
  }, [botId]);

  const save =
    source === 'agent'
      ? async (content) => {
          try {
            await writeAgentFile(botId, relative, content);
          } catch (failure) {
            notify.error(failure.message);
            throw failure;
          }
        }
      : null;

  return (
    <>
      <div className="sub">
        <span className="path" title={relative}>
          {relative}
        </span>
        {isDirty && <span className="unsaved">Not saved · ⌘S</span>}
        {source === 'cloud' && <span className="unsaved">Read only</span>}
        {!isImage && !isCode && (
          <span className="seg-sm tiny">
            <button
              className={view === 'rendered' ? 'on' : ''}
              onClick={() => setView('rendered')}
            >
              {isPage ? 'Page' : 'Leitura'}
            </button>
            <button
              className={view === 'original' ? 'on' : ''}
              onClick={() => setView('original')}
            >
              Original
            </button>
          </span>
        )}
        <a
          className="icon-btn"
          href={url}
          download={relative.split('/').pop()}
          title="Download"
          aria-label="Download"
        >
          <i className="ti ti-download" />
        </a>
      </div>
      <div className="file-body">
        <div className="scroll">
          {isImage ? (
            <img className="file-image" src={url} alt={relative} />
          ) : text === null ? (
            <FileSkeleton />
          ) : isCode || view === 'original' ? (
            <CodeEditor
              path={`${botId}/${relative}`}
              value={text}
              onSave={save}
              onDirty={setIsDirty}
            />
          ) : isPage ? (
            <iframe
              className="file-page"
              title={relative}
              sandbox="allow-scripts"
              srcDoc={drawablePage(text)}
            />
          ) : (
            <div className="paper">
              <RichText text={text} />
            </div>
          )}
        </div>
      </div>
    </>
  );
}
