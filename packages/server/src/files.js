import { config } from './config.js';
import { listLocalFiles } from './local-runtime.js';

// What a bot made or downloaded: its workspace and its Downloads. One reader
// for the Library and for the file cards in the conversation, so the two never
// disagree about what exists.
export const FILE_ROOTS = ['/home/sprite/workspace', '/home/sprite/Downloads'];

export async function listBotFiles(
  _spriteName,
  { sinceSeconds = null, limit = 200 } = {},
) {
  return listLocalFiles({ sinceSeconds, limit });
}

export function isBotFilePath(filePath) {
  if (filePath.includes('..')) return false;
  const roots = [...FILE_ROOTS, config.localWorkspaceDir];
  return roots.some((root) => filePath.startsWith(`${root}/`));
}
