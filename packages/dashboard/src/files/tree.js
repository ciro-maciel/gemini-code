// The repository's flat list of paths as folders and files, folders first, by name.
export function buildTree(paths) {
  const root = { name: '', path: '', dirs: {}, files: [] };
  for (const full of paths) {
    const parts = full.split('/');
    let node = root;
    parts.slice(0, -1).forEach((part, index) => {
      node.dirs[part] ||= {
        name: part,
        path: parts.slice(0, index + 1).join('/'),
        dirs: {},
        files: [],
      };
      node = node.dirs[part];
    });
    node.files.push(full);
  }
  const sort = (node) => ({
    ...node,
    dirs: Object.values(node.dirs)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map(sort),
    files: node.files.sort(),
  });
  return sort(root);
}

export const iconOf = (path) =>
  /\.(png|jpe?g|webp|gif|svg)$/i.test(path)
    ? 'ti-photo'
    : /\.html?$/i.test(path)
      ? 'ti-world'
      : /\.md$/i.test(path)
        ? 'ti-markdown'
        : 'ti-file';

// The repository's own folders carry their meaning in the glyph.
export const FOLDER_ICON = {
  agents: 'ti-users-group',
  templates: 'ti-template',
  skills: 'ti-sparkles',
};

/** The line over the tree: local workspace status or GitHub sync age. */
export function syncLineOf(repo, nowSeconds = Date.now() / 1000) {
  if (!repo) return null;
  if (repo.mode === 'local') {
    if (!repo.syncedAt) return 'Workspace local · pronto';
    const minutes = Math.floor((nowSeconds - repo.syncedAt) / 60);
    if (minutes < 1) return 'Workspace local · atualizado agora';
    if (minutes < 60) return `Workspace local · há ${minutes} min`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `Workspace local · há ${hours} h`;
    return Math.floor(hours / 24) === 1
      ? 'Workspace local · ontem'
      : `Workspace local · há ${Math.floor(hours / 24)} dias`;
  }
  if (!repo.syncedAt) return 'Sincronizando com o GitHub…';
  const minutes = Math.floor((nowSeconds - repo.syncedAt) / 60);
  if (minutes < 1) return 'GitHub sincronizado agora';
  if (minutes < 60) return `GitHub sincronizado há ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `GitHub sincronizado há ${hours} h`;
  return Math.floor(hours / 24) === 1
    ? 'GitHub sincronizado ontem'
    : `GitHub sincronizado há ${Math.floor(hours / 24)} dias`;
}
