import path from 'node:path';

import { agentDirOf } from './bots.js';
import { isGithubReady } from './github.js';
import { listLocalTree } from './local-repo.js';
import {
  cleanRepoPath,
  listFiles,
  removePath,
  saveFile,
  syncAccount,
  syncedAtOf,
  uploadFiles,
} from './repo.js';
import { isOwned, slugOf } from './repo-files.js';
import { listSkills } from './skills.js';

// Per-agent document aggregation and management.
// Every agent owns a folder (`bot.folder`, defaulting to `agents/<slug>/docs`)
// plus its core Markdown documents (`INSTRUCTIONS.md`, `routines/*.md`,
// `memory/decisions.md`) and linked skills (`skills/<slug>/SKILL.md`).

const BINARY_EXTS = new Set([
  'png',
  'jpg',
  'jpeg',
  'gif',
  'webp',
  'ico',
  'pdf',
  'zip',
  'tar',
  'gz',
  'mp3',
  'mp4',
  'wav',
  'mov',
  'woff',
  'woff2',
  'ttf',
  'otf',
  'exe',
  'bin',
]);

const MIME_BY_EXT = {
  md: 'text/markdown',
  markdown: 'text/markdown',
  txt: 'text/plain',
  json: 'application/json',
  js: 'text/javascript',
  mjs: 'text/javascript',
  jsx: 'text/javascript',
  ts: 'text/typescript',
  tsx: 'text/typescript',
  py: 'text/x-python',
  html: 'text/html',
  htm: 'text/html',
  css: 'text/css',
  yml: 'text/yaml',
  yaml: 'text/yaml',
  toml: 'text/toml',
  csv: 'text/csv',
  xml: 'application/xml',
  svg: 'image/svg+xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  gif: 'image/gif',
  webp: 'image/webp',
  pdf: 'application/pdf',
};

function extOf(filePath) {
  const ext = path.posix.extname(filePath).slice(1).toLowerCase();
  return ext;
}

function isEditablePath(filePath) {
  return !BINARY_EXTS.has(extOf(filePath));
}

function mimeOf(filePath) {
  return MIME_BY_EXT[extOf(filePath)] || 'application/octet-stream';
}

function defaultFolderOf(agentDir) {
  return agentDir ? `${agentDir}/docs` : '';
}

function classifyTree(bot, tree) {
  const agentDir = bot.agentDir || agentDirOf(bot);
  const workFolder = bot.folder ? cleanRepoPath(bot.folder) : '';
  const defaultFolder = defaultFolderOf(agentDir);
  const skillPaths = new Set(
    listSkills(bot.id).map((skill) => `skills/${slugOf(skill.name)}/SKILL.md`),
  );
  const items = [];

  for (const entry of tree) {
    const filePath = entry.path;
    let group = null;
    let relativePath = filePath;
    let isDeletable = false;

    if (agentDir && filePath === `${agentDir}/INSTRUCTIONS.md`) {
      group = 'instructions';
      relativePath = 'INSTRUCTIONS.md';
    } else if (agentDir && filePath.startsWith(`${agentDir}/routines/`)) {
      group = 'routine';
      relativePath = filePath.slice(agentDir.length + 1);
    } else if (agentDir && filePath === `${agentDir}/memory/decisions.md`) {
      group = 'memory';
      relativePath = 'memory/decisions.md';
    } else if (skillPaths.has(filePath)) {
      group = 'skill';
      relativePath = filePath;
    } else if (!isOwned(filePath)) {
      const matchesWorkFolder = workFolder
        ? filePath.startsWith(`${workFolder}/`)
        : (!filePath.startsWith('agents/') &&
            !filePath.startsWith('skills/') &&
            !filePath.startsWith('templates/')) ||
          (defaultFolder && filePath.startsWith(`${defaultFolder}/`));
      if (matchesWorkFolder) {
        group = 'work';
        if (workFolder && filePath.startsWith(`${workFolder}/`)) {
          relativePath = filePath.slice(workFolder.length + 1);
        } else if (
          !workFolder &&
          defaultFolder &&
          filePath.startsWith(`${defaultFolder}/`)
        ) {
          relativePath = filePath.slice(defaultFolder.length + 1);
        } else {
          relativePath = filePath;
        }
        isDeletable = true;
      }
    }

    if (!group) continue;
    items.push({
      path: filePath,
      name: path.posix.basename(filePath),
      relativePath,
      group,
      size: entry.size ?? 0,
      sha: entry.sha ?? null,
      updatedAt: entry.updatedAt ?? null,
      ext: extOf(filePath),
      mimeType: mimeOf(filePath),
      isEditable: isEditablePath(filePath),
      isDeletable,
    });
  }

  const GROUP_ORDER = {
    work: 0,
    instructions: 1,
    memory: 2,
    routine: 3,
    skill: 4,
  };
  items.sort(
    (a, b) =>
      (GROUP_ORDER[a.group] ?? 9) - (GROUP_ORDER[b.group] ?? 9) ||
      a.relativePath.localeCompare(b.relativePath),
  );
  return { items, agentDir, workFolder: workFolder || null, defaultFolder };
}

/** Lists all documents belonging to an agent (work docs, instructions, routines, memory, linked skills). */
export async function listAgentDocuments(bot, { group = 'all', q = '' } = {}) {
  if (!isGithubReady() && !syncedAtOf(bot.accountId)) {
    await syncAccount(bot.accountId);
  }
  const tree = await listFiles(bot.accountId);
  const {
    items: allItems,
    agentDir,
    workFolder,
    defaultFolder,
  } = classifyTree(bot, tree);

  const counts = {
    all: allItems.length,
    work: 0,
    core: 0,
    instructions: 0,
    routine: 0,
    memory: 0,
    skill: 0,
  };
  for (const item of allItems) {
    counts[item.group] = (counts[item.group] || 0) + 1;
    if (
      item.group === 'instructions' ||
      item.group === 'routine' ||
      item.group === 'memory'
    )
      counts.core++;
  }

  const query = String(q || '')
    .trim()
    .toLowerCase();
  const filtered = allItems.filter((item) => {
    if (group && group !== 'all') {
      if (group === 'core') {
        if (!['instructions', 'routine', 'memory'].includes(item.group))
          return false;
      } else if (item.group !== group) {
        return false;
      }
    }
    if (
      query &&
      !item.path.toLowerCase().includes(query) &&
      !item.name.toLowerCase().includes(query)
    )
      return false;
    return true;
  });

  return {
    folder: workFolder,
    defaultFolder,
    agentDir,
    mode: isGithubReady() ? 'github' : 'local',
    counts,
    items: filtered,
  };
}

/** Fast synchronous summary of an agent's documents for bot detail payloads and system prompts (local mode). */
export function summarizeAgentDocuments(bot, { maxRecent = 20 } = {}) {
  const agentDir = bot.agentDir || agentDirOf(bot);
  const folder = bot.folder ? cleanRepoPath(bot.folder) : null;
  if (isGithubReady()) {
    return { count: null, workCount: null, folder, agentDir, recent: [] };
  }
  const { items } = classifyTree(bot, listLocalTree());
  const workItems = items.filter((item) => item.group === 'work');
  const sortedRecent = [...workItems].sort(
    (a, b) =>
      (b.updatedAt || 0) - (a.updatedAt || 0) || a.path.localeCompare(b.path),
  );
  return {
    count: items.length,
    workCount: workItems.length,
    folder,
    agentDir,
    recent: sortedRecent.slice(0, maxRecent).map((item) => ({
      path: item.path,
      relativePath: item.relativePath,
      size: item.size,
      group: item.group,
    })),
  };
}

function targetFolderFor(bot, subFolder = '') {
  const agentDir = bot.agentDir || agentDirOf(bot);
  const base = bot.folder
    ? cleanRepoPath(bot.folder)
    : defaultFolderOf(agentDir);
  const sub = cleanRepoPath(subFolder);
  if (sub && sub.split('/').some((part) => part === '.' || part === '..'))
    throw new Error('invalid path');
  if (!sub) return base;
  if (!base) return sub;
  // If caller already prefixed with base, keep it; otherwise join under base.
  if (sub === base || sub.startsWith(`${base}/`)) return sub;
  return `${base}/${sub}`;
}

function isWorkPathOf(bot, cleanPath) {
  const agentDir = bot.agentDir || agentDirOf(bot);
  const workFolder = bot.folder ? cleanRepoPath(bot.folder) : '';
  const defaultFolder = defaultFolderOf(agentDir);
  if (isOwned(cleanPath)) return false;
  if (workFolder) return cleanPath.startsWith(`${workFolder}/`);
  if (defaultFolder && cleanPath.startsWith(`${defaultFolder}/`)) return true;
  return (
    !cleanPath.startsWith('agents/') &&
    !cleanPath.startsWith('skills/') &&
    !cleanPath.startsWith('templates/')
  );
}

function isAgentEditablePath(bot, cleanPath) {
  const agentDir = bot.agentDir || agentDirOf(bot);
  if (
    agentDir &&
    (cleanPath === `${agentDir}/INSTRUCTIONS.md` ||
      cleanPath === `${agentDir}/memory/decisions.md` ||
      cleanPath.startsWith(`${agentDir}/routines/`))
  ) {
    return true;
  }
  const skillPaths = new Set(
    listSkills(bot.id).map((skill) => `skills/${slugOf(skill.name)}/SKILL.md`),
  );
  if (skillPaths.has(cleanPath)) return true;
  return isWorkPathOf(bot, cleanPath);
}

/** Creates a new work document inside the agent's folder. */
export async function createAgentDocument(
  bot,
  accountId,
  { name, folder = '', content = '' },
) {
  const cleanName = cleanRepoPath(name);
  if (
    !cleanName ||
    cleanName.split('/').some((part) => !part || part === '.' || part === '..')
  ) {
    throw new Error('give the document a valid name');
  }
  const targetDir = targetFolderFor(bot, folder);
  const fullPath = targetDir ? `${targetDir}/${cleanName}` : cleanName;
  if (isOwned(fullPath)) throw new Error('that name is reserved by the server');
  return saveFile(accountId, fullPath, String(content ?? ''));
}

/** Saves an existing document belonging to the agent (work file, instructions, memory, routine, or linked skill). */
export async function saveAgentDocument(bot, accountId, relPath, content) {
  const clean = cleanRepoPath(relPath);
  if (!clean || clean.includes('..')) throw new Error('invalid path');
  if (!isAgentEditablePath(bot, clean))
    throw new Error("this document is not in this agent's folder");
  return saveFile(accountId, clean, String(content ?? ''));
}

/** Uploads one or more files directly into the agent's folder (or subfolder). */
export async function uploadAgentDocuments(bot, accountId, subFolder, files) {
  const targetDir = targetFolderFor(bot, subFolder);
  return uploadFiles(accountId, targetDir, files);
}

/** Deletes a work document inside the agent's folder (central metadata files cannot be deleted here). */
export async function deleteAgentDocument(bot, accountId, relPath) {
  const clean = cleanRepoPath(relPath);
  if (!clean || clean.includes('..')) throw new Error('invalid path');
  if (isOwned(clean))
    throw new Error(
      "the agent's configuration documents are managed in its settings",
    );
  if (!isWorkPathOf(bot, clean))
    throw new Error("this document is not in this agent's folder");
  return removePath(accountId, clean);
}
