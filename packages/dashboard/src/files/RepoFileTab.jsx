import { useCallback, useEffect, useState } from 'react';

import {
  fetchRepoDiff,
  fetchRepoFile,
  fetchRepoHistory,
  saveRepoFile,
} from '../services/api';
import { RichText } from '../components/RichText';
import { drawablePage } from '../components/FileGallery';
import { notify } from '../components/zen';
import { Menu, useMenu } from '../ui/Menu';
import { pathOf } from '../mesa/routes';
import { FileSkeleton } from './FileSkeleton';

const when = (iso) =>
  new Date(iso).toLocaleString('pt-BR', {
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  });

function History({ path, onClose }) {
  const [items, setItems] = useState(null);
  const [open, setOpen] = useState(null);
  const [patch, setPatch] = useState(null);
  useEffect(() => {
    setItems(null);
    fetchRepoHistory(path)
      .then((data) => setItems(data.items))
      .catch(() => setItems(false));
  }, [path]);
  const select = (item) => {
    if (open === item.sha) return setOpen(null);
    setOpen(item.sha);
    setPatch(null);
    fetchRepoDiff(item.sha, path)
      .then((data) => setPatch(data.patch || ''))
      .catch(() => setPatch(false));
  };
  return (
    <div className="hist">
      <div className="hh">
        <span className="grow">History</span>
        <button className="icon-btn" onClick={onClose} aria-label="Close">
          <i className="ti ti-x" />
        </button>
      </div>
      <div className="hb" aria-busy={items === null}>
        {items === null &&
          [0, 1, 2].map((index) => (
            <div key={index} className="hv sk" aria-hidden>
              <div className="grow">
                <i style={{ width: '55%' }} />
                <i style={{ width: '85%' }} />
              </div>
            </div>
          ))}
        {items === false && (
          <p className="hist-note">
            Couldn’t load the history right now. Close and reopen it.
          </p>
        )}
        {items?.length === 0 && (
          <p className="hist-note">
            No versions yet: the first one appears when someone saves this file.
          </p>
        )}
        {items?.map((item) => (
          <div key={item.sha}>
            <button
              className={`hv${open === item.sha ? ' on' : ''}`}
              onClick={() => select(item)}
            >
              <div className="grow">
                <b>{item.author}</b>
                <p>
                  {when(item.at)} · {item.message}
                </p>
              </div>
            </button>
            {open === item.sha &&
              (patch === null ? (
                <div className="diff sk" aria-hidden>
                  <i style={{ width: '70%' }} />
                  <i style={{ width: '90%' }} />
                  <i style={{ width: '45%' }} />
                </div>
              ) : patch === false ? (
                <p className="hist-note">
                  Couldn’t open the changes in this version.
                </p>
              ) : (
                <pre className="diff">
                  {patch
                    ? patch.split('\n').map((row, index) => (
                        <span
                          key={index}
                          className={
                            row.startsWith('+')
                              ? 'add'
                              : row.startsWith('-')
                                ? 'del'
                                : ''
                          }
                        >
                          {row}
                          {'\n'}
                        </span>
                      ))
                    : 'No text changes in this version.'}
                </pre>
              ))}
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * A file of the person's repository as a Mesa tab, as the prototype draws it:
 * read rendered or as the original, edit and save (one commit in the person's
 * name), and its history with what each commit changed.
 */
export function RepoFileTab({ path, onDelete, repoMode = 'local' }) {
  const [file, setFile] = useState(null);
  const [draft, setDraft] = useState(null);
  const [view, setView] = useState('rendered');
  const [isHistory, setIsHistory] = useState(false);
  const menu = useMenu();
  const isPage = /\.html?$/i.test(path);
  const isMarkdown = /\.md$/i.test(path);

  const load = useCallback(() => {
    fetchRepoFile(path)
      .then(setFile)
      .catch(() => setFile({ content: '', isMissing: true }));
  }, [path]);
  useEffect(load, [load]);

  const save = async () => {
    try {
      await saveRepoFile(path, draft);
      setDraft(null);
      load();
      window.dispatchEvent(new Event('assistant:repo'));
      notify.success(
        repoMode === 'github'
          ? 'Saved as a commit under your name'
          : 'Saved in the workspace',
      );
    } catch (error) {
      notify.error(error.message);
    }
  };
  const link = `${location.origin}${pathOf(`file:${path}`)}`;
  const download = () => {
    const anchor = document.createElement('a');
    anchor.href = URL.createObjectURL(
      new Blob([file?.content ?? ''], { type: 'text/plain' }),
    );
    anchor.download = path.split('/').pop();
    anchor.click();
  };

  return (
    <>
      <div className="sub">
        <span className="path" title={path}>
          {path}
        </span>
        {!isPage &&
          (draft === null ? (
            <button
              className="pill"
              onClick={() => setDraft(file?.content ?? '')}
              disabled={!file}
            >
              <i className="ti ti-pencil" />
              Edit
            </button>
          ) : (
            <>
              <button className="btn outline sm" onClick={() => setDraft(null)}>
                Cancel
              </button>
              <button className="btn filled sm" onClick={save}>
                Save
              </button>
            </>
          ))}
        <button
          className={`pill${isHistory ? ' on' : ''}`}
          onClick={() => setIsHistory(!isHistory)}
        >
          <i className="ti ti-history" />
          History
        </button>
        <button
          className="icon-btn"
          onClick={menu.open('more')}
          title="More"
          aria-label="More file actions"
        >
          <i className="ti ti-dots" />
        </button>
      </div>
      <div className="file-body">
        <div
          className="grow"
          style={{ display: 'flex', flexDirection: 'column', minHeight: 0 }}
        >
          {draft !== null ? (
            <textarea
              className="editor"
              spellCheck={false}
              aria-label="File contents"
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
            />
          ) : (
            <div className="scroll">
              {file === null ? (
                <FileSkeleton />
              ) : file.isMissing ? (
                <p className="muted">
                  This file is no longer in the repository.
                </p>
              ) : isPage && view === 'rendered' ? (
                <iframe
                  className="file-page"
                  title={path}
                  sandbox="allow-scripts"
                  srcDoc={drawablePage(file.content)}
                />
              ) : view === 'original' || !isMarkdown ? (
                <pre className="src">{file.content}</pre>
              ) : (
                <div className="paper">
                  <RichText
                    text={file.content.replace(/^---\n[\s\S]*?\n---\n/, '')}
                  />
                </div>
              )}
            </div>
          )}
        </div>
        {isHistory && (
          <History path={path} onClose={() => setIsHistory(false)} />
        )}
      </div>
      {menu.is('more') && (
        <Menu anchor={menu.anchor} width={240} onClose={menu.close}>
          {(isMarkdown || isPage) && (
            <button
              onClick={() => {
                menu.close();
                setView(view === 'original' ? 'rendered' : 'original');
              }}
            >
              <i className="ti ti-code" />
              {view === 'original' ? 'View rendered' : 'View original'}
            </button>
          )}
          <button
            onClick={() => {
              menu.close();
              load();
            }}
          >
            <i className="ti ti-refresh" />
            Reload
          </button>
          <button
            onClick={() => {
              menu.close();
              navigator.clipboard?.writeText(link);
              notify.success('File link copied');
            }}
          >
            <i className="ti ti-link" />
            Copy link
          </button>
          <button
            onClick={() => {
              menu.close();
              download();
            }}
          >
            <i className="ti ti-download" />
            Download
          </button>
          {onDelete && (
            <>
              <hr />
              <button
                onClick={() => {
                  menu.close();
                  onDelete();
                }}
              >
                <i className="ti ti-trash" />
                Delete file…
              </button>
            </>
          )}
        </Menu>
      )}
    </>
  );
}
