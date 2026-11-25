import { useCallback, useEffect, useMemo, useState } from 'react';

import {
  createBotDocument,
  deleteBotDocument,
  fetchBotDocuments,
  updateBot,
  uploadBotDocuments,
} from '../services/api';
import { DeleteModal, notify } from '../components/zen';
import { NameModal } from '../ui/NameModal';
import { botsChanged } from '../state/use-bots';

export const DOC_GROUPS = [
  { id: 'all', label: 'Todos' },
  { id: 'work', label: 'Trabalho' },
  { id: 'core', label: 'Instruções & Memória' },
  { id: 'skill', label: 'Habilidades' },
];

export const GROUP_BADGE = {
  work: { label: 'Trabalho', icon: 'ti-file-text' },
  instructions: { label: 'Instruções', icon: 'ti-file-description' },
  memory: { label: 'Memória', icon: 'ti-brain' },
  routine: { label: 'Rotina', icon: 'ti-clock-play' },
  skill: { label: 'Habilidade', icon: 'ti-sparkles' },
};

export function formatDocSize(bytes) {
  if (!bytes && bytes !== 0) return '';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024)
    return `${(bytes / 1024).toFixed(bytes < 10 * 1024 ? 1 : 0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function docIconOf(item) {
  if (item.group === 'instructions') return 'ti-file-description';
  if (item.group === 'memory') return 'ti-brain';
  if (item.group === 'routine') return 'ti-clock-play';
  if (item.group === 'skill') return 'ti-sparkles';
  const ext = (item.ext || '').toLowerCase();
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg'].includes(ext))
    return 'ti-photo';
  if (['html', 'htm'].includes(ext)) return 'ti-world';
  if (['md', 'markdown'].includes(ext)) return 'ti-markdown';
  if (['json', 'yml', 'yaml', 'toml'].includes(ext)) return 'ti-braces';
  if (
    ['js', 'jsx', 'ts', 'tsx', 'py', 'go', 'rs', 'sh', 'css', 'sql'].includes(
      ext,
    )
  )
    return 'ti-code';
  return 'ti-file-text';
}

export function filterAgentDocuments(
  items,
  { group = 'all', query = '' } = {},
) {
  const q = String(query || '')
    .trim()
    .toLowerCase();
  return (items ?? []).filter((item) => {
    if (group === 'core') {
      if (!['instructions', 'routine', 'memory'].includes(item.group))
        return false;
    } else if (group !== 'all' && item.group !== group) {
      return false;
    }
    if (
      q &&
      !item.name.toLowerCase().includes(q) &&
      !item.path.toLowerCase().includes(q)
    )
      return false;
    return true;
  });
}

const formatUpdated = (seconds) =>
  seconds
    ? new Date(seconds * 1000).toLocaleDateString('pt-BR', {
        day: '2-digit',
        month: '2-digit',
      })
    : null;

/**
 * Unified view of an agent's folder and all its documents:
 * work files in `bot.folder`, plus INSTRUCTIONS.md, routines, memory, and linked skills.
 */
export function AgentDocuments({
  bot,
  canWrite = true,
  isOwner = true,
  onOpenRepoFile,
  onCountChange = null,
}) {
  const [data, setData] = useState(null);
  const [group, setGroup] = useState('all');
  const [query, setQuery] = useState('');
  const [isCreating, setIsCreating] = useState(false);
  const [isEditingFolder, setIsEditingFolder] = useState(false);
  const [deleting, setDeleting] = useState(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isDropping, setIsDropping] = useState(false);

  const load = useCallback(() => {
    fetchBotDocuments(bot.id)
      .then((result) => {
        setData(result);
        onCountChange?.(result.counts?.all ?? result.items?.length ?? 0);
      })
      .catch(() =>
        setData({
          folder: bot.folder,
          defaultFolder: bot.agentDir ? `${bot.agentDir}/docs` : '',
          agentDir: bot.agentDir,
          mode: 'local',
          counts: { all: 0, work: 0, core: 0, skill: 0 },
          items: [],
        }),
      );
  }, [bot.id, bot.folder, bot.agentDir, onCountChange]);

  useEffect(() => {
    load();
    window.addEventListener('assistant:repo', load);
    return () => window.removeEventListener('assistant:repo', load);
  }, [load]);

  const visible = useMemo(
    () => filterAgentDocuments(data?.items, { group, query }),
    [data?.items, group, query],
  );
  const counts = data?.counts ?? { all: 0, work: 0, core: 0, skill: 0 };
  const activeFolder = data?.folder ?? bot.folder;

  const handleCreateDoc = async (name) => {
    setIsCreating(false);
    try {
      const title = name
        .split('/')
        .pop()
        .replace(/\.[^.]+$/, '');
      const initialContent = /\.md$/i.test(name) ? `# ${title}\n\n` : '';
      const created = await createBotDocument(bot.id, {
        name,
        content: initialContent,
      });
      notify.success(`Documento criado: ${name}`);
      load();
      window.dispatchEvent(new Event('assistant:repo'));
      if (created?.path) onOpenRepoFile?.(created.path);
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleUpload = async (fileList) => {
    const files = [...(fileList || [])];
    if (!files.length) return;
    try {
      const { paths } = await uploadBotDocuments(bot.id, '', files);
      notify.success(
        `${paths.length} ${paths.length === 1 ? 'documento enviado' : 'documentos enviados'} para a pasta de ${bot.name}`,
      );
      load();
      window.dispatchEvent(new Event('assistant:repo'));
    } catch (error) {
      notify.error(error.message);
    }
  };

  const openFilePicker = () => {
    const input = document.createElement('input');
    input.type = 'file';
    input.multiple = true;
    input.onchange = () => handleUpload(input.files);
    input.click();
  };

  const handleChangeFolder = async (nextFolder) => {
    setIsEditingFolder(false);
    const clean =
      nextFolder === '/' ? null : nextFolder.replace(/^\/+|\/+$/g, '') || null;
    try {
      await updateBot(bot.id, { folder: clean });
      botsChanged();
      notify.success(
        clean
          ? `Pasta atualizada para /${clean}/`
          : 'Pasta definida para a raiz do workspace',
      );
      load();
      window.dispatchEvent(new Event('assistant:repo'));
    } catch (error) {
      notify.error(error.message);
    }
  };

  const handleDelete = async () => {
    if (!deleting) return;
    setIsDeleting(true);
    try {
      await deleteBotDocument(bot.id, deleting.path);
      notify.success(`${deleting.name} apagado`);
      setDeleting(null);
      load();
      window.dispatchEvent(new Event('assistant:repo'));
    } catch (error) {
      notify.error(error.message);
    } finally {
      setIsDeleting(false);
    }
  };

  const citeInChat = (event, item) => {
    event.stopPropagation();
    window.dispatchEvent(
      new CustomEvent('assistant:cite', {
        detail: {
          botId: bot.id,
          item: {
            k: `file:${item.path}`,
            name: item.name,
            icon: docIconOf(item),
            path: item.path,
          },
        },
      }),
    );
    notify.success(`"${item.name}" adicionado ao contexto do chat`);
  };

  return (
    <div
      className={`agent-docs${isDropping ? ' dropping' : ''}`}
      onDragOver={(event) => {
        if (!canWrite || !event.dataTransfer.types.includes('Files')) return;
        event.preventDefault();
        event.stopPropagation();
        setIsDropping(true);
      }}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setIsDropping(false);
      }}
      onDrop={(event) => {
        if (!canWrite || !event.dataTransfer.files.length) return;
        event.preventDefault();
        event.stopPropagation();
        setIsDropping(false);
        handleUpload(event.dataTransfer.files);
      }}
    >
      <div className="doc-folder-card">
        <div className="doc-folder-icon">
          <i className="ti ti-folder-filled" />
        </div>
        <div className="doc-folder-meta grow">
          <div className="doc-folder-head">
            <b>Pasta do agente</b>
            <span className="tag">
              {data?.mode === 'github' ? 'GitHub' : 'Workspace local'}
            </span>
          </div>
          <div
            className="doc-folder-path mono"
            title={activeFolder ? `/${activeFolder}/` : '/ (raiz do workspace)'}
          >
            {activeFolder ? `/${activeFolder}/` : '/ (raiz do workspace)'}
          </div>
        </div>
        <div className="doc-folder-actions">
          {canWrite && (
            <>
              <button
                className="btn filled sm"
                onClick={() => setIsCreating(true)}
              >
                <i className="ti ti-file-plus" />
                Novo documento
              </button>
              <button className="btn outline sm" onClick={openFilePicker}>
                <i className="ti ti-upload" />
                Upload
              </button>
            </>
          )}
          {isOwner && (
            <button
              className="btn outline sm"
              onClick={() => setIsEditingFolder(true)}
              title="Alterar a pasta de trabalho deste agente"
            >
              <i className="ti ti-folder-cog" />
              Trocar pasta
            </button>
          )}
        </div>
      </div>

      <div className="doc-toolbar">
        <div className="tpl-q doc-search">
          <i className="ti ti-search" />
          <input
            placeholder="Buscar nos documentos deste agente…"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Buscar documentos"
          />
          {query && (
            <button
              className="icon-btn"
              onClick={() => setQuery('')}
              aria-label="Limpar busca"
            >
              <i className="ti ti-x" />
            </button>
          )}
        </div>
        <div className="filters">
          {DOC_GROUPS.map((item) => (
            <button
              key={item.id}
              className={group === item.id ? 'on' : ''}
              onClick={() => setGroup(item.id)}
            >
              {item.label}
              <span className="doc-chip-count">{counts[item.id] ?? 0}</span>
            </button>
          ))}
        </div>
      </div>

      {data === null ? (
        <p className="muted doc-state">Carregando documentos…</p>
      ) : visible.length === 0 ? (
        <div className="doc-empty">
          <i className="ti ti-files-off" />
          <b>
            {query
              ? 'Nenhum documento encontrado'
              : group === 'work'
                ? 'Nenhum documento de trabalho ainda'
                : 'Nenhum documento neste filtro'}
          </b>
          <p className="muted">
            {query
              ? `Nenhum arquivo corresponde a "${query}".`
              : 'Crie um documento ou arraste arquivos para esta área — o agente já lê e escreve aqui automaticamente.'}
          </p>
          {canWrite && !query && (
            <button
              className="btn filled sm"
              onClick={() => setIsCreating(true)}
            >
              <i className="ti ti-file-plus" />
              Criar primeiro documento
            </button>
          )}
        </div>
      ) : (
        <div className="doc-list">
          {visible.map((item) => {
            const badge = GROUP_BADGE[item.group] || GROUP_BADGE.work;
            const updated = formatUpdated(item.updatedAt);
            return (
              <div
                key={item.path}
                className="doc-row"
                role="button"
                tabIndex={0}
                onClick={() => onOpenRepoFile?.(item.path)}
                onKeyDown={(event) =>
                  event.key === 'Enter' && onOpenRepoFile?.(item.path)
                }
              >
                <span className={`doc-row-icon group-${item.group}`}>
                  <i className={`ti ${docIconOf(item)}`} />
                </span>
                <div className="doc-row-main grow">
                  <div className="doc-row-title">
                    <b>{item.name}</b>
                    <span className={`doc-badge group-${item.group}`}>
                      {badge.label}
                    </span>
                  </div>
                  <div className="doc-row-sub mono">
                    {item.relativePath}
                    {item.size ? ` · ${formatDocSize(item.size)}` : ''}
                    {updated ? ` · ${updated}` : ''}
                  </div>
                </div>
                <div
                  className="doc-row-actions"
                  onClick={(event) => event.stopPropagation()}
                >
                  <button
                    className="icon-btn"
                    title="Citar no chat"
                    aria-label={`Citar ${item.name} no chat`}
                    onClick={(event) => citeInChat(event, item)}
                  >
                    <i className="ti ti-quote" />
                  </button>
                  <button
                    className="icon-btn"
                    title="Abrir na Mesa"
                    aria-label={`Abrir ${item.name}`}
                    onClick={() => onOpenRepoFile?.(item.path)}
                  >
                    <i className="ti ti-arrow-up-right" />
                  </button>
                  {canWrite && item.isDeletable && (
                    <button
                      className="icon-btn"
                      title="Apagar documento"
                      aria-label={`Apagar ${item.name}`}
                      onClick={() => setDeleting(item)}
                    >
                      <i className="ti ti-trash" />
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {isCreating && (
        <NameModal
          title="Novo documento na pasta do agente"
          icon="ti-file-plus"
          initial="notas.md"
          action="Criar e abrir"
          onSave={handleCreateDoc}
          onClose={() => setIsCreating(false)}
        />
      )}
      {isEditingFolder && (
        <NameModal
          title="Pasta de trabalho do agente"
          icon="ti-folder-cog"
          initial={activeFolder || data?.defaultFolder || ''}
          action="Salvar pasta"
          onSave={handleChangeFolder}
          onClose={() => setIsEditingFolder(false)}
        />
      )}
      <DeleteModal
        opened={Boolean(deleting)}
        onClose={() => setDeleting(null)}
        onConfirm={handleDelete}
        target={deleting?.name ?? ''}
        context={`Documento · /${deleting?.path ?? ''}`}
        consequences={[
          'O documento será removido da pasta deste agente.',
          'O histórico de revisões continua disponível na central.',
        ]}
        confirmLabel="Apagar documento"
        loading={isDeleting}
      />
    </div>
  );
}
