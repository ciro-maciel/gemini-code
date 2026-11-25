import { existsSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';
import { createPlan } from './plan.js';
import { db, now, toApi } from './db.js';
import {
  countBots,
  createBot,
  createSection,
  deleteBot,
  ensureComputer,
  deleteSection,
  listSections,
  reorderSections,
  fetchBot,
  fetchComputerHealth,
  listBotCheckpoints,
  listBots,
  markBotRead,
  markBotUnread,
  onBotReady,
  provision,
  renameSection,
  reorderSection,
  recoverBots,
  restoreBotCheckpoint,
  updateBotSettings,
} from './bots.js';
import {
  addUsage,
  describeAccount,
  fetchAccount,
  listAccounts,
  setAccountStatus,
  setFirstWish,
} from './accounts.js';
import { designBot } from './designer.js';
import { authenticate } from './auth.js';
import {
  emitTaskEvent,
  listBotEvents,
  listTaskEvents,
  publishBot,
  subscribe,
} from './events.js';
import { enterBot } from './presence.js';
import { contextShare, contextWindow } from './engine/context.js';
import { takeNote, writeNote } from './notes.js';
import { callColleague, findMention } from './mentions.js';
import { handoffsOf } from './handoff.js';
import {
  countPushSubscriptions,
  isPushReady,
  removePushSubscription,
  savePushSubscription,
  startPush,
} from './push.js';
import {
  attachmentsOf,
  fetchAttachment,
  readAttachment,
  saveAttachment,
  readPageCapture,
} from './attachments.js';
import { synthesize, transcribe } from './speech.js';
import {
  cancelTeaching,
  deleteSkill,
  ensureAccountSkill,
  fetchSkill,
  finishTeaching,
  listAccountSkills,
  listSkills,
  setSkillUse,
  startTeaching,
  teachingSession,
  updateSkill,
} from './skills.js';
import {
  deleteTemplate,
  fetchTemplate,
  listTemplates,
  saveTemplate,
  TEMPLATE_AREAS,
  templateConnectionIds,
} from './templates.js';
import {
  connect,
  createConnection,
  deleteConnection,
  fetchConnection,
  finishAuthorization,
  listConnectedTools,
  listConnections,
  reauthorize,
  saveSecretHeader,
  searchRegistry,
  startToolRefresh,
} from './engine/catalog.js';
import { listBrowserToolDefinitions } from './engine/browser.js';
import {
  deleteMemory,
  listMemories,
  memoryKind,
  saveMemory,
  searchMemories,
  updateMemory,
} from './engine/memory.js';
import { POLICIES, setToolPolicy } from './engine/policy.js';
import {
  answerTask,
  cancelTask,
  interruptBot,
  findUserMessage,
  previewRewind,
  releasableOf,
  releaseContext,
  rewindTask,
  chargeAccount,
  continueTask,
  currentThreadId,
  fetchTask,
  isBotBusy,
  recoverTasks,
  resolveApproval,
  resumeTasksWaitingOn,
  retryTask,
  sendBotMessage,
  startQueuedTasks,
  takeOver,
} from './engine/run.js';
import { BASE_TOOLS } from './engine/tools.js';
import { openSpriteSocket, readFile as readSpriteFile } from './sprites.js';
import { isBotFilePath, listBotFiles } from './files.js';
import { listMascots, readMascotSvg } from './mascots.js';
import {
  APP_CATEGORIES,
  APPS,
  fetchAppIcon,
  refreshCatalogIfStale,
  startCatalog,
} from './apps.js';
import {
  createRoutine,
  DEFAULT_TIMEZONE,
  deleteRoutine,
  fetchRoutine,
  listRoutines,
  runDueRoutines,
  startRoutines,
  updateRoutine,
} from './routines.js';
import { buildHealthReport, startHealthReports } from './health.js';
import { createApiKey, listApiKeys, revokeApiKey } from './api-keys.js';
import { nextWakeAt, onRoutinesChanged } from './wake.js';
import {
  approvalRate,
  auditCsv,
  auditJson,
  listAudit,
  outcomeMetrics,
  recordFailure,
  recordOutcome,
  sweepTimedOutApprovals,
} from './trail.js';
import {
  collection,
  conflict,
  createRouter,
  fail,
  HttpError,
  invalid,
  json,
  notFound,
  readBody,
  readPage,
} from './http.js';
import {
  createSecret,
  deleteSecret,
  isVaultError,
  listSecrets,
  SecretNameTaken,
  updateSecret,
} from './vault.js';
import { ensureInbox, receiveAtInbox, rotateInbox } from './inbox.js';
import { enqueue, listQueue, removeQueued } from './queue.js';
import {
  accessOf,
  allows,
  knownPeople,
  listMembers,
  sharedWith,
  shareBot,
  unshareBot,
} from './members.js';
import {
  availableModels,
  brainForNewAgent,
  brainsFor,
  createAiAccount,
  deleteAiAccount,
  listAiAccounts,
  setAccountModels,
} from './ai-accounts.js';
import { isOffered, offeredProviders } from './providers.js';
import {
  linkUserBrowser,
  unlinkUserBrowser,
  userBrowserOf,
} from './user-browser.js';
import {
  diffOf,
  historyOf,
  isSignedByGithub,
  listFiles,
  onPush,
  openFile,
  removePath,
  renameFolder,
  repoInfoOf,
  saveFile,
  scheduleSync,
  startRepoSweep,
  syncAccount,
  syncedAtOf,
  uploadFiles,
} from './repo.js';
import {
  createAgentDocument,
  deleteAgentDocument,
  listAgentDocuments,
  saveAgentDocument,
  summarizeAgentDocuments,
  uploadAgentDocuments,
} from './agent-documents.js';
import { MAX_FILE_BYTES } from './workspace.js';
import { isGithubReady } from './github.js';
import {
  fetchArtifactVersion,
  isArtifactError,
  listArtifacts,
  listRecentDeliveries,
  recordChoice,
} from './artifacts.js';
import { addBookmark, listBookmarks, removeBookmark } from './bookmarks.js';
import { fetchBranch, listBranches } from './branches.js';
import { askSideQuestion } from './engine/side-question.js';
import {
  refreshSubscription,
  store as subscriptionStore,
  subscriptionState,
} from './engine/subscription/index.js';
import { ensureSubscriptionAccount } from './ai-accounts.js';
import {
  FilesError,
  onFilesChanged,
  runFileOperation,
  toolOf,
} from './agent-files.js';
import { answerFilesMcp } from './mcp-files.js';

// Exported for the tests, which call the routes without a port or a token.
export const router = createRouter();

// A person whose access is still being let in, but who was invited into a
// bot, reaches only what that bot needs: the lists the panel reads (its own,
// so empty) and the shared bots themselves (requireBot still checks each
// one). Running costs the owner.
const GUEST_LISTS = new Set([
  '/api/bots',
  '/api/stream',
  '/api/templates',
  '/api/deliveries',
  '/api/connections',
  '/api/ai-accounts',
  '/api/brains',
]);
const isGuestRoute = (method, pathname) =>
  (method === 'GET' && GUEST_LISTS.has(pathname)) ||
  /^\/api\/(bots|tasks)\/[^/]+\/./.test(pathname) ||
  (method === 'GET' && /^\/api\/(bots|tasks)\/[^/]+$/.test(pathname));

// Another account's bot answers exactly like one that does not exist: a 403
// would confirm the id. A member gets 403 only past what their access allows:
// 'read' follows, 'enter' also writes, and everything else is the owner's.
function requireBot(id, account, need = 'owner') {
  const bot = fetchBot(id);
  const access = accessOf(bot, account);
  if (!access) throw notFound('unknown bot');
  if (!allows(access, need))
    throw new HttpError(
      403,
      'FORBIDDEN',
      need === 'enter'
        ? 'you only follow this agent'
        : 'only whoever created the agent can change this',
    );
  return bot;
}

function requireTask(id, account, need = 'owner') {
  const task = fetchTask(id);
  if (!task) throw notFound('unknown task');
  requireBot(task.botId, account, need);
  return task;
}

function requireConnection(id, account) {
  const connection = fetchConnection(id);
  if (!connection || connection.accountId !== account.id)
    throw notFound('unknown connection');
  return connection;
}

function requireRoutine(id, account) {
  const routine = fetchRoutine(id);
  if (!routine) throw notFound('unknown routine');
  requireBot(routine.botId, account);
  return routine;
}

function requireOwner(account) {
  if (!account.isOwner)
    throw new HttpError(403, 'FORBIDDEN', 'only the owner sees this screen');
}

function withApprovals(task) {
  const approvals = db
    .query('SELECT * FROM approvals WHERE task_id = ? ORDER BY created_at')
    .all(task.id)
    .map((row) => toApi(row, ['arguments']));
  return { ...task, approvals };
}

// --- Overview: the first screen -------------------------------------------

router.get('/api/overview', ({ account }) => {
  const since = now() - 7 * 86400;
  const counts = db
    .query(
      `SELECT
                COALESCE(SUM(tasks.status IN ('running', 'queued')), 0) AS running,
                COALESCE(SUM(tasks.status IN ('waiting_approval', 'waiting_user')), 0) AS waiting,
                COALESCE(SUM(tasks.status = 'done' AND tasks.finished_at >= ?), 0) AS done_week,
                COALESCE(SUM(tasks.status = 'failed' AND tasks.finished_at >= ?), 0) AS failed_week,
                COALESCE(SUM(CASE WHEN tasks.created_at >= ? THEN tasks.cost END), 0) AS cost_week
             FROM tasks JOIN bots ON bots.id = tasks.bot_id WHERE bots.account_id = ?`,
    )
    .get(since, since, since, account.id);
  const attention = db
    .query(
      `SELECT tasks.id, tasks.bot_id, tasks.title, tasks.prompt, tasks.status, tasks.waiting_reason, tasks.updated_at, bots.name AS bot_name
             FROM tasks JOIN bots ON bots.id = tasks.bot_id
             WHERE bots.account_id = ? AND tasks.status IN ('waiting_approval', 'waiting_user', 'failed') AND tasks.updated_at >= ?
             ORDER BY tasks.updated_at DESC LIMIT 50`,
    )
    .all(account.id, since)
    .map((row) => toApi(row));
  return json({ ...toApi(counts), attention, bots: listBots(account.id) });
});

// --- Bots -----------------------------------------------------------------

// --- The plan: how many agents the account's plan in Payments includes ----------
//
// 1, 3, 9 or 99 agents (plan.js), counted on creation only. The owner is never held to it. Once the gate
// enforces, the plan's number is the only ceiling; while PLAN_LIMITS is "off" (or Payments is silent) the
// old one (config.limits.botsPerAccount) still holds, and the plan is still read and shown.
const plan = createPlan({ product: 'assistant' });
const AGENT = { one: 'agent', many: 'agents' };

async function requireRoomForAgent(account) {
  if (account.isOwner) return;
  const used = countBots(account.id);
  const gate = await plan.canCreate(process.env, account.id, used, AGENT);
  if (!gate.allowed)
    throw new HttpError(402, 'PLAN_LIMIT', gate.body.message, {
      limit: gate.body.limit,
      used,
      tier: gate.body.tier,
    });
  if (!gate.plan.isEnforced && used >= config.limits.botsPerAccount)
    throw new HttpError(
      409,
      'PLAN_LIMIT',
      `Each account has up to ${config.limits.botsPerAccount} bots. Delete one to create another.`,
    );
}

// --- Who is signed in, and the owner's Pessoas screen ----------------------

router.get('/api/me', async ({ account }) => {
  const current = await plan.planFor(process.env, account.id);
  return json({
    ...describeAccount(account),
    runtime: {
      computerMode: config.computerMode,
      authMode: config.authMode,
      workspaceDir:
        config.computerMode === 'local' ? config.localWorkspaceDir : null,
    },
    plan: {
      tier: current.tier,
      name: current.name,
      agents: current.limit,
      isEnforced: current.isEnforced && !account.isOwner,
      used: countBots(account.id),
    },
  });
});

// While it waits, an account says what its first bot should do.
// The account's health, the same report its directors get each morning (health.js), for whoever looks after it.
router.get('/api/health/report', ({ account }) =>
  json({ report: buildHealthReport(account.id) }),
);

// API keys: what a script or the house engineering uses instead of a browser's login (api-keys.js).
router.get('/api/keys', ({ account }) => {
  const items = listApiKeys(account.id);
  return json(
    collection(items, { limit: items.length, offset: 0 }, items.length),
  );
});

router.post('/api/keys', async ({ req, account }) => {
  try {
    return json(createApiKey(account.id, (await readBody(req)).name), 201);
  } catch (error) {
    throw invalid(error.message);
  }
});

router.delete('/api/keys/:id', ({ params, account }) =>
  json({ isRevoked: revokeApiKey(account.id, params.id) }),
);

router.put('/api/me/wish', async ({ req, account }) =>
  json(describeAccount(setFirstWish(account.id, (await readBody(req)).wish))),
);

router.get('/api/accounts', ({ account }) => {
  requireOwner(account);
  const items = listAccounts();
  return json(
    collection(items, { limit: items.length || 50, offset: 0 }, items.length),
  );
});

router.patch('/api/accounts/:id', async ({ req, params, account }) => {
  requireOwner(account);
  const { status } = await readBody(req);
  try {
    const before = fetchAccount(params.id);
    const updated = setAccountStatus(params.id, status);
    if (!updated) throw notFound('unknown account');
    if (before?.status === 'pending' && updated.status === 'active')
      buildFirstBot(updated);
    return json(updated);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw invalid(error.message);
  }
});

// Approvals, takeovers, restores and failures, counted. Kinds only: no
// account's text reaches this screen.
router.get('/api/metrics/outcomes', ({ url, account }) => {
  requireOwner(account);
  const days = Math.min(
    Math.max(Number(url.searchParams.get('days')) || 30, 1),
    365,
  );
  return json(outcomeMetrics({ days }));
});

router.get('/api/bots', ({ account }) => {
  const bots = listBots(account.id, account.email);
  return json(
    collection(bots, { limit: bots.length || 50, offset: 0 }, bots.length),
  );
});

// --- Phone notifications -------------------------------------------------------

router.get('/api/push', ({ account }) =>
  json({
    isReady: isPushReady(),
    publicKey: config.vapidPublicKey || null,
    devices: countPushSubscriptions(account.id),
  }),
);

router.put('/api/push', async ({ req, account }) => {
  if (!isPushReady())
    throw invalid('phone notifications are not set up on this server yet');
  if (!savePushSubscription(account.id, await readBody(req)))
    throw invalid('invalid subscription');
  return json({ devices: countPushSubscriptions(account.id) });
});

router.delete('/api/push', async ({ req, account }) => {
  removePushSubscription(account.id, (await readBody(req)).endpoint);
  return json({ devices: countPushSubscriptions(account.id) });
});

// --- Sharing: who else is in a bot ------------------------------------------

router.get('/api/people', ({ account }) =>
  json({ items: knownPeople(account.id) }),
);

// ⌘K: what the account's agents remember, by its words.
router.get('/api/memories', ({ url, account }) =>
  json({ items: searchMemories(account.id, url.searchParams.get('q')) }),
);

router.get('/api/bots/:id/handoffs', ({ params, account }) => {
  requireBot(params.id, account);
  return json(handoffsOf(params.id));
});

router.get('/api/bots/:id/members', ({ params, account }) => {
  requireBot(params.id, account, 'read');
  return json({ items: listMembers(params.id) });
});

router.put('/api/bots/:id/members', async ({ req, params, account }) => {
  const bot = requireBot(params.id, account);
  const { email, access } = await readBody(req);
  const error = shareBot(bot, email, access);
  if (error) throw invalid(error);
  publishBot(params.id, 'members', { email: email.trim().toLowerCase() });
  return json({ items: listMembers(params.id) });
});

router.delete('/api/bots/:id/members/:email', ({ params, account }) => {
  requireBot(params.id, account);
  if (!unshareBot(params.id, decodeURIComponent(params.email)))
    throw notFound('that person is no longer in the agent');
  publishBot(params.id, 'members', {
    email: decodeURIComponent(params.email).toLowerCase(),
  });
  return json({ items: listMembers(params.id) });
});

router.post('/api/bots', async ({ req, account }) => {
  const body = await readBody(req);
  await requireRoomForAgent(account);
  // From a template, the agent copies it: instructions, model, effort, connections and skills.
  const template = body.templateId
    ? fetchTemplate(account.id, body.templateId)
    : null;
  if (body.templateId && !template) throw invalid('unknown template');
  const bot = createBot({
    accountId: account.id,
    name: body.name || template?.name,
    model: body.model || template?.model,
    instructions: body.instructions ?? template?.instructions ?? '',
    folder: body.folder,
  });
  // It talks on the key the draft picked, else on the key that has the template's model, else the first key.
  const brain = body.aiAccount
    ? { aiAccount: body.aiAccount, model: body.model }
    : brainForNewAgent(account.id, body.model || template?.model);
  if (brain) {
    try {
      updateBotSettings(bot.id, brain);
    } catch (error) {
      throw invalid(error.message);
    }
  }
  if (template) {
    // It uses only the connections its template names, by title; the draft's own pick wins.
    updateBotSettings(bot.id, {
      templateId: template.id,
      effort: body.effort ?? template.effort,
      connectionIds: Array.isArray(body.connectionIds)
        ? body.connectionIds
        : templateConnectionIds(template, listConnections(account.id)),
    });
    for (const skill of template.skills)
      setSkillUse(bot.id, ensureAccountSkill(account.id, skill), true);
  }
  return json(fetchBot(bot.id), 201);
});

// --- Templates: where an agent starts (templates.js) -------------------------

router.get('/api/templates', ({ account }) => {
  const items = listTemplates(account.id);
  return json({
    ...collection(items, { limit: items.length, offset: 0 }, items.length),
    areas: TEMPLATE_AREAS,
  });
});

router.post('/api/templates', async ({ req, account }) => {
  const { id, ...fields } = await readBody(req);
  try {
    return json(saveTemplate(account.id, fields), 201);
  } catch (error) {
    throw invalid(error.message);
  }
});

// Editing a house template keeps the account's own copy under the same id.
router.patch('/api/templates/:id', async ({ req, params, account }) => {
  if (!fetchTemplate(account.id, params.id)) throw notFound('unknown template');
  try {
    return json(
      saveTemplate(account.id, { ...(await readBody(req)), id: params.id }),
    );
  } catch (error) {
    throw invalid(error.message);
  }
});

router.delete('/api/templates/:id', ({ params, account }) => {
  if (!deleteTemplate(account.id, params.id))
    throw notFound('unknown account template');
  return json({ id: params.id, isDeleted: true });
});

// "Criar com IA": one sentence becomes the bot, its routines and its first
// task, which starts at once (connecting what it needs, then doing the job).
router.post('/api/bots/design', async ({ req, account }) => {
  const { description } = await readBody(req);
  if (!String(description || '').trim())
    throw invalid('say what the bot should do');
  await requireRoomForAgent(account);
  try {
    return json(await buildDesignedBot(account.id, description), 201);
  } catch (error) {
    if (error.isDesignError) throw invalid(error.message);
    throw error;
  }
});

/** One sentence becomes the bot, its routines and the first task, which starts at once. */
async function buildDesignedBot(accountId, description) {
  let designed;
  try {
    designed = await designBot(description);
  } catch (error) {
    throw Object.assign(error, { isDesignError: true });
  }
  const { design, cost } = designed;
  addUsage(accountId, cost);
  const bot = createBot({
    accountId,
    name: design.name,
    instructions: design.instructions,
  });
  const routines = [];
  for (const routine of design.routines) {
    try {
      routines.push(
        createRoutine({
          botId: bot.id,
          name: routine.name || design.name,
          instruction: routine.instruction,
          when: { cron: routine.cron },
          timezone: DEFAULT_TIMEZONE,
        }),
      );
    } catch (error) {
      console.warn(
        `[design] rotina recusada (${routine.cron}): ${error.message}`,
      );
    }
  }
  if (routines.length) onRoutinesChanged();
  const routineLine = routines.length
    ? `\n\nJá deixei agendado: ${routines.map((routine) => `${routine.name} (${routine.scheduleLabel})`).join('; ')}.`
    : '';
  if (design.firstTask)
    sendBotMessage(bot.id, `${design.firstTask}${routineLine}`, {
      isSetup: true,
    });
  return { bot, routines, summary: design.summary };
}

/*
 * An account let in with a first wish and no bot gets that bot designed right
 * away, in the background: the owner's "Liberar" does not wait on the model,
 * and the person's screen opens onto a bot that is already setting itself up.
 */
function buildFirstBot(account) {
  if (!account?.firstWish || countBots(account.id) > 0) return;
  buildDesignedBot(account.id, account.firstWish).catch((error) =>
    console.warn(`[first-bot] ${account.id}: ${error.message}`),
  );
}

router.get('/api/bots/:id', ({ params, account }) => {
  const bot = requireBot(params.id, account, 'read');
  return json({ ...bot, documents: summarizeAgentDocuments(bot) });
});

// --- Agent documents: folder + files belonging to one agent ------------------

router.get('/api/bots/:id/documents', async ({ params, url, account }) => {
  const bot = requireBot(params.id, account, 'read');
  const group = url.searchParams.get('group') || 'all';
  const q = url.searchParams.get('q') || '';
  return json(await listAgentDocuments(bot, { group, q }));
});

router.post('/api/bots/:id/documents', async ({ req, params, account }) => {
  const bot = requireBot(params.id, account, 'enter');
  const { name, folder, content } = await readBody(req);
  try {
    return json(
      await createAgentDocument(bot, bot.accountId, { name, folder, content }),
      201,
    );
  } catch (error) {
    throw invalid(error.message);
  }
});

router.put('/api/bots/:id/documents', async ({ req, params, account }) => {
  const bot = requireBot(params.id, account, 'enter');
  const { path: docPath, content } = await readBody(req);
  if (!docPath || typeof content !== 'string')
    throw invalid('say the document and its content');
  try {
    return json(await saveAgentDocument(bot, bot.accountId, docPath, content));
  } catch (error) {
    throw invalid(error.message);
  }
});

router.post(
  '/api/bots/:id/documents/upload',
  async ({ req, params, account }) => {
    const bot = requireBot(params.id, account, 'enter');
    const form = await req.formData().catch(() => null);
    const files = form
      ? form.getAll('file').filter((file) => typeof file === 'object')
      : [];
    if (!files.length)
      throw invalid(
        'send the files as multipart/form-data, in the "file" field',
      );
    if (files.some((file) => file.size > MAX_FILE_BYTES))
      throw invalid('a file over 50 MB stays out of the repository');
    try {
      return json(
        await uploadAgentDocuments(
          bot,
          bot.accountId,
          form.get('folder') || '',
          await Promise.all(
            files.map(async (file) => ({
              name: file.name,
              bytes: Buffer.from(await file.arrayBuffer()),
            })),
          ),
        ),
        201,
      );
    } catch (error) {
      throw invalid(error.message);
    }
  },
);

router.delete('/api/bots/:id/documents', async ({ url, params, account }) => {
  const bot = requireBot(params.id, account, 'enter');
  try {
    return json(
      await deleteAgentDocument(
        bot,
        bot.accountId,
        url.searchParams.get('path') || '',
      ),
    );
  } catch (error) {
    throw invalid(error.message);
  }
});

// The owner is looking at this conversation: it has nothing new for them.
// A member looking leaves the owner's mark where it is.
router.post('/api/bots/:id/read', ({ params, account }) => {
  if (accessOf(requireBot(params.id, account, 'read'), account) === 'owner')
    markBotRead(params.id);
  return json({ isRead: true });
});

// "Marcar como não lida": the latest news comes back, to read later (04/11/2026).
router.delete('/api/bots/:id/read', ({ params, account }) => {
  if (accessOf(requireBot(params.id, account, 'read'), account) === 'owner')
    markBotUnread(params.id);
  return json({ isRead: false });
});

router.patch('/api/bots/:id', async ({ req, params, account }) => {
  const before = requireBot(params.id, account);
  try {
    const bot = updateBotSettings(params.id, await readBody(req));
    // A model or key changed mid-step takes over now, not after the old model answers.
    if (bot.model !== before.model || bot.aiAccount !== before.aiAccount)
      interruptBot(params.id);
    return json(bot);
  } catch (error) {
    throw invalid(error.message);
  }
});

// A section is addressed by its id; the name is only its label. An id the
// account does not have, its old name included, is "unknown section".
router.get('/api/sections', ({ account }) => {
  const items = listSections(account.id);
  return json(
    collection(items, { limit: items.length || 50, offset: 0 }, items.length),
  );
});

router.post('/api/sections', async ({ req, account }) => {
  const { name } = await readBody(req);
  try {
    return json(createSection(account.id, name), 201);
  } catch (error) {
    throw invalid(error.message);
  }
});

router.put('/api/sections', async ({ req, account }) => {
  const { sectionIds } = await readBody(req);
  if (
    !Array.isArray(sectionIds) ||
    sectionIds.some((id) => typeof id !== 'string')
  )
    throw invalid('send the list of sections in order');
  reorderSections(account.id, sectionIds);
  return json({ sectionIds });
});

router.put('/api/sections/order', async ({ req, account }) => {
  const { sectionId = null, botIds } = await readBody(req);
  if (!Array.isArray(botIds) || botIds.some((id) => typeof id !== 'string'))
    throw invalid('send the list of bots in order');
  for (const id of botIds) requireBot(id, account);
  if (!reorderSection(account.id, sectionId, botIds))
    throw notFound('unknown section');
  return json({ sectionId, botIds });
});

router.patch('/api/sections/:sectionId', async ({ req, params, account }) => {
  const { name } = await readBody(req);
  let section;
  try {
    section = renameSection(account.id, params.sectionId, name);
  } catch (error) {
    throw invalid(error.message);
  }
  if (!section) throw notFound('unknown section');
  return json(section);
});

router.delete('/api/sections/:sectionId', ({ params, account }) => {
  if (!deleteSection(account.id, params.sectionId))
    throw notFound('unknown section');
  return json({ id: params.sectionId, deleted: true });
});

// --- Routines ------------------------------------------------------------

/** A routine's time came: its instruction goes into the bot's conversation, with who made it (run.js keepMandate). */
export function sendRoutineRun(routine) {
  const at = new Intl.DateTimeFormat('pt-BR', {
    timeZone: routine.timezone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(new Date());
  return sendBotMessage(routine.botId, routine.instruction, {
    routine: {
      id: routine.id,
      name: routine.name,
      createdBy: routine.createdBy,
    },
    modelText: `[Tarefa agendada "${routine.name}", executando agora (${at}, ${routine.timezone}). O usuário pode não estar olhando: faça o que der sem perguntar; o que precisar de aprovação fica esperando por ele.]\n\n${routine.instruction}`,
  });
}

router.get('/api/bots/:id/routines', ({ params, account }) => {
  requireBot(params.id, account);
  const items = listRoutines(params.id);
  return json(
    collection(items, { limit: items.length || 50, offset: 0 }, items.length),
  );
});

router.post('/api/bots/:id/routines', async ({ req, params, account }) => {
  requireBot(params.id, account);
  const { name, instruction, at, cron, timezone } = await readBody(req);
  if (listRoutines(params.id).length >= config.limits.routinesPerBot)
    throw new HttpError(
      409,
      'PLAN_LIMIT',
      `Each bot has up to ${config.limits.routinesPerBot} routines.`,
    );
  try {
    // The owner's route (panel or API key): the routine is their order at every run.
    const routine = createRoutine({
      botId: params.id,
      name,
      instruction,
      when: { at, cron },
      timezone: timezone || DEFAULT_TIMEZONE,
      createdBy: 'person',
    });
    onRoutinesChanged();
    return json(routine, 201);
  } catch (error) {
    throw invalid(error.message);
  }
});

router.patch('/api/routines/:id', async ({ req, params, account }) => {
  requireRoutine(params.id, account);
  let routine;
  try {
    routine = updateRoutine(params.id, await readBody(req));
  } catch (error) {
    throw invalid(error.message);
  }
  onRoutinesChanged();
  return json(routine);
});

router.delete('/api/routines/:id', ({ params, account }) => {
  requireRoutine(params.id, account);
  deleteRoutine(params.id);
  onRoutinesChanged();
  return json({ id: params.id, deleted: true });
});

// The alarm's call (wake/worker.js). The request itself wakes the Sprite; this
// runs what is due and answers with the next time, so the alarm stays right
// even if an update from here was lost.
router.post('/api/wake', ({ req }) => {
  if (
    !config.wakeSecret ||
    req.headers.get('x-wake-secret') !== config.wakeSecret
  )
    throw new HttpError(401, 'UNAUTHORIZED', 'only the alarm wakes the server');
  const ran = runDueRoutines();
  const nextRunAt = nextWakeAt();
  console.log(
    `[wake] ran ${ran}, next ${nextRunAt ? new Date(nextRunAt * 1000).toISOString() : 'none'}`,
  );
  return json({ ran, nextRunAt });
});

router.get('/api/models', () =>
  json(
    collection(
      config.models,
      { limit: config.models.length, offset: 0 },
      config.models.length,
    ),
  ),
);

router.get('/api/mascots', () => {
  const items = listMascots();
  return json(
    collection(items, { limit: items.length, offset: 0 }, items.length),
  );
});

router.delete('/api/bots/:id', async ({ params, account }) => {
  requireBot(params.id, account);
  // Its work stops first: a task left running would go on calling the model
  // for a bot that no longer exists.
  for (const { id } of db
    .query(
      "SELECT id FROM tasks WHERE bot_id = ? AND status NOT IN ('done', 'failed', 'cancelled')",
    )
    .all(params.id)) {
    try {
      cancelTask(id);
    } catch {}
  }
  await deleteBot(params.id);
  return json({ id: params.id, deleted: true });
});

router.post('/api/bots/:id/provision', ({ params, account }) => {
  const bot = requireBot(params.id, account);
  if (bot.status === 'provisioning')
    throw conflict('the computer is already being set up');
  if (bot.status === 'ready') return json(bot);
  provision(params.id);
  return json(fetchBot(params.id), 202);
});

router.get('/api/bots/:id/health', async ({ params, account }) => {
  requireBot(params.id, account);
  return json(await fetchComputerHealth(params.id));
});

router.get('/api/bots/:id/tasks', ({ params, url, account }) => {
  requireBot(params.id, account, 'read');
  const page = readPage(url);
  const items = db
    .query(
      'SELECT * FROM tasks WHERE bot_id = ? ORDER BY created_at DESC, id LIMIT ? OFFSET ?',
    )
    .all(params.id, page.limit, page.offset)
    .map((row) => toApi(row, ['enabled_tools', 'waiting_detail']));
  const { total } = db
    .query('SELECT COUNT(*) AS total FROM tasks WHERE bot_id = ?')
    .get(params.id);
  return json(collection(items, page, total));
});

// --- Conversation: everything a bot does is one thread -------------------

// The events after which the panel used to read the thread again (dashboard REFRESH_ON).
const THREAD_CHANGES = new Set([
  'status',
  'approval_requested',
  'approval_resolved',
  'title',
]);

function currentThread(botId) {
  const row = db
    .query(
      'SELECT id FROM tasks WHERE bot_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .get(botId);
  // The messages waiting "for when it finishes" travel with the task.
  if (!row) return null;
  const task = withApprovals(fetchTask(row.id));
  // The composer's clock and ring travel with the task, like the queue.
  const model = fetchBot(botId)?.model;
  const window = contextWindow(model);
  return {
    ...task,
    queue: listQueue(botId),
    contextShare: contextShare(model, task.contextTokens),
    releasable: (({ connected, isComputer }) => ({
      connected: connected.length,
      isComputer,
    }))(releasableOf(task.id)),
    // The detail under the ring: what the model read at the last step, by part.
    context: task.contextTokens
      ? {
          model,
          tokens: task.contextTokens,
          window,
          parts: task.contextParts ? JSON.parse(task.contextParts) : null,
        }
      : null,
    // Each step's times: the first word, the model, the tools and what came from cache.
    stepTimings: task.stepTimings ? JSON.parse(task.stepTimings) : [],
  };
}

router.get('/api/bots/:id/conversation', ({ params, url, account }) => {
  requireBot(params.id, account, 'read');
  // before and after are places in the conversation (an event's seq), not addresses.
  const beforeSeq = Number(url.searchParams.get('before')) || null;
  const afterSeq = Number(url.searchParams.get('after')) || 0;
  const limit = Math.min(Number(url.searchParams.get('limit')) || 400, 1000);
  const items = listBotEvents(params.id, { beforeSeq, afterSeq, limit });
  return json({
    items,
    hasMore: items.length === limit,
    thread: currentThread(params.id),
  });
});

router.get('/api/bots/:id/thread', ({ params, account }) => {
  requireBot(params.id, account, 'read');
  return json(currentThread(params.id));
});

router.get('/api/bots/:id/stream', ({ params, url, req, account }) => {
  requireBot(params.id, account, 'read');
  const afterSeq = Number(url.searchParams.get('after')) || 0;
  // A change of state carries the thread as it now is: the panel does not ask for it again.
  const withThread = (write) => (event) =>
    write(
      THREAD_CHANGES.has(event.type) && !event.isLive
        ? { ...event, thread: currentThread(params.id) }
        : event,
    );
  return eventStream(
    req,
    afterSeq ? listBotEvents(params.id, { afterSeq }) : [],
    `bot:${params.id}`,
    { onOpen: () => enterBot(params.id, account), filter: withThread },
  );
});

// The account's one stream: a short "this agent changed" for every agent it
// sees, at most once a second each, so the list follows without being polled.
router.get('/api/stream', ({ req, account }) => {
  const canSee = new Map();
  const sees = (botId) => {
    const known = canSee.get(botId);
    if (known && Date.now() - known.at < 30_000) return known.value;
    const value = Boolean(accessOf(fetchBot(botId), account));
    canSee.set(botId, { value, at: Date.now() });
    return value;
  };
  let waiting = new Set();
  let timer = null;
  const filter = (write) => (event) => {
    // The account's repository got a commit: the panel reads its files now.
    if (event.type === 'repo') return write({ type: 'repo' });
    // Who is in the bot just changed: ask again whether this account sees it.
    if (event.type === 'members') canSee.delete(event.botId);
    if (!event.botId || !sees(event.botId)) return;
    // A file changed in an agent folder: its open tree reads itself again.
    if (event.type === 'files_changed')
      return write({ type: 'files_changed', botId: event.botId });
    if (event.isLive && !['seeing', 'members'].includes(event.type)) return;
    waiting.add(event.botId);
    timer ??= setTimeout(() => {
      timer = null;
      const botIds = [...waiting];
      waiting = new Set();
      write({ type: 'changed', botIds });
    }, 1000);
  };
  return eventStream(req, [], ['*', 'changes', `account:${account.id}`], {
    filter,
  });
});

router.post('/api/bots/:id/messages', async ({ req, params, account }) => {
  const bot = requireBot(params.id, account, 'enter');
  const { text, attachmentIds, isQueued, context } = await readBody(req);
  // What the person took from the Mesa into the message: repository paths
  // (in the bot's workspace) and files of its computer, named for the model.
  const cited = (Array.isArray(context) ? context : [])
    .slice(0, 10)
    .map((item) => String(item?.path || ''))
    .filter((item) => item && !item.includes('..'));
  const where = (item) =>
    item.startsWith('/home/sprite/') ? item : `/home/sprite/workspace/${item}`;
  const modelText = cited.length
    ? `${(text || '').trim()}\n\n[A pessoa levou pro contexto: ${cited.map(where).join(', ')}]`
    : undefined;
  const ids = Array.isArray(attachmentIds) ? attachmentIds : [];
  const attachments = attachmentsOf(params.id, ids);
  if (!text?.trim() && attachments.length === 0 && !cited.length)
    throw invalid('write the message');
  // "Fila": while the bot works, the message waits for its task to stop.
  const thread = currentThread(params.id);
  // In a shared bot every message reaches it signed with who sent it.
  const author = listMembers(params.id).length
    ? account.name || account.email
    : null;
  if (
    isQueued &&
    thread &&
    ['running', 'queued', 'waiting_approval', 'waiting_user'].includes(
      thread.status,
    )
  ) {
    if (!enqueue(params.id, modelText ?? (text || '').trim(), ids, author))
      throw invalid("this agent's queue is full");
    return json(currentThread(params.id));
  }
  // "@Nome": a colleague answers this one, here, instead of this agent.
  const colleague = attachments.length ? null : findMention(bot, text);
  if (
    !colleague ||
    !callColleague(bot, colleague, (text || '').trim(), author, {
      deliver: sendBotMessage,
    })
  )
    sendBotMessage(params.id, (text || '').trim(), {
      attachments,
      author,
      ...(cited.length ? { modelText, context: cited } : {}),
    });
  return json(currentThread(params.id));
});

// "Entre nós": a note the people in the bot see and the bot never reads.
router.post('/api/bots/:id/notes', async ({ req, params, account }) => {
  requireBot(params.id, account, 'enter');
  const { error, event } = writeNote(
    params.id,
    account,
    (await readBody(req)).text,
  );
  if (error) throw invalid(error);
  return json(event);
});

// "Mandar pro agente": the note becomes a message, signed by who wrote it.
router.post('/api/bots/:id/notes/:eventId/send', ({ params, account }) => {
  requireBot(params.id, account, 'enter');
  const note = takeNote(params.id, account, params.eventId);
  if (!note) throw notFound('that note was already sent or is not yours');
  sendBotMessage(params.id, note.text, {
    author: listMembers(params.id).length ? note.author : null,
    fromNote: note.id,
  });
  return json(currentThread(params.id));
});

router.delete('/api/bots/:id/queue/:queuedId', ({ params, account }) => {
  requireBot(params.id, account, 'enter');
  if (!removeQueued(params.id, params.queuedId))
    throw notFound('that message already left the queue');
  return json(currentThread(params.id));
});

// --- Attachments: files sent with a message ---------------------------------

router.post('/api/bots/:id/attachments', async ({ req, params, account }) => {
  requireBot(params.id, account, 'enter');
  let form;
  try {
    form = await req.formData();
  } catch {
    throw invalid('send the file as multipart/form-data, in the "file" field');
  }
  try {
    return json(await saveAttachment(params.id, form.get('file')), 201);
  } catch (error) {
    throw invalid(error.message);
  }
});

router.get('/api/bots/:id/attachments/:attachmentId', ({ params, account }) => {
  requireBot(params.id, account, 'read');
  const attachment = fetchAttachment(params.attachmentId);
  if (!attachment || attachment.botId !== params.id)
    throw notFound('unknown attachment');
  const { content, mimeType, name } = readAttachment(params.attachmentId);
  return new Response(content, {
    headers: {
      'Content-Type': mimeType,
      'Content-Disposition': `inline; filename="${encodeURIComponent(name)}"`,
      'Cache-Control': 'private, max-age=86400',
    },
  });
});

// A page the bot saw, as captured at the time.
router.get('/api/bots/:id/pages/:captureId', ({ params, account }) => {
  requireBot(params.id, account, 'read');
  const capture = readPageCapture(params.id, params.captureId);
  if (!capture) throw notFound('unknown capture');
  return new Response(capture.content, {
    headers: {
      'Content-Type': capture.mimeType,
      'Cache-Control': 'private, max-age=86400',
    },
  });
});

// --- Voice: dictation, narration and voice mode ------------------------------

// Each account gets a budget of voice calls; a loop in a panel cannot run up
// the bill.
const voiceCalls = new Map();
function countVoiceCall(account) {
  const recent = (voiceCalls.get(account.id) ?? []).filter(
    (at) => at > Date.now() - 10 * 60 * 1000,
  );
  if (recent.length >= 300)
    throw new HttpError(
      429,
      'TOO_MANY_REQUESTS',
      'Too much speech in a short time. Wait a few minutes.',
    );
  recent.push(Date.now());
  voiceCalls.set(account.id, recent);
}

router.post('/api/transcribe', async ({ req, url, account }) => {
  countVoiceCall(account);
  const audio = await req.arrayBuffer();
  if (audio.byteLength === 0)
    throw invalid('send the audio in the request body');
  if (audio.byteLength > 20 * 1024 * 1024)
    throw invalid('the audio can be up to 20 MB (about 10 minutes)');
  const bot = url.searchParams.get('botId')
    ? requireBot(url.searchParams.get('botId'), account)
    : null;
  const hints = [account.name, account.email, bot?.name];
  const { text, cost } = await transcribe(
    Buffer.from(audio),
    req.headers.get('content-type') || 'audio/wav',
    hints,
  );
  if (cost) addUsage(account.id, cost);
  return json({ text });
});

router.post('/api/speech', async ({ req, account }) => {
  countVoiceCall(account);
  const { text } = await readBody(req);
  if (!text?.trim()) throw invalid('send the text to speak');
  const voice = await synthesize(text);
  return new Response(voice.body, {
    headers: { 'Content-Type': 'audio/mpeg', 'Cache-Control': 'no-store' },
  });
});

// --- Teaching a task, and the skills it makes --------------------------------

router.post('/api/bots/:id/teach/start', async ({ req, params, account }) => {
  requireBot(params.id, account);
  if (isBotBusy(params.id))
    throw conflict(
      'the bot is working right now; wait for it to finish or stop the task before teaching',
    );
  const { name } = await readBody(req);
  const bot = await ensureComputer(params.id);
  return json(await startTeaching(bot, name), 201);
});

router.post('/api/bots/:id/teach/cancel', async ({ params, account }) => {
  const bot = requireBot(params.id, account);
  await cancelTeaching(bot);
  return json({ isCancelled: true });
});

router.post('/api/bots/:id/teach/stop', async ({ req, params, account }) => {
  const bot = requireBot(params.id, account);
  if (!teachingSession(params.id))
    throw conflict('there is no recording in progress on this bot');
  let narration = '';
  const form = await req.formData().catch(() => null);
  const audio = form?.get('narration');
  if (audio && audio.size > 0) {
    const heard = await transcribe(
      Buffer.from(await audio.arrayBuffer()),
      audio.type || 'audio/wav',
      [account.name, account.email, bot.name],
    );
    narration = heard.text;
    if (heard.cost) addUsage(account.id, heard.cost);
  }
  try {
    const { skill, cost, stepCount } = await finishTeaching(bot, { narration });
    chargeAccount(bot.id, cost);
    emitTaskEvent(currentThreadId(bot.id), 'skill_learned', {
      skillId: skill.id,
      name: skill.name,
      whenToUse: skill.whenToUse,
      steps: skill.steps,
      stepCount,
    });
    return json(skill, 201);
  } catch (error) {
    throw invalid(error.message);
  }
});

router.get('/api/bots/:id/skills', ({ params, account }) => {
  requireBot(params.id, account, 'enter');
  const items = listSkills(params.id);
  return json(
    collection(items, { limit: items.length || 50, offset: 0 }, items.length),
  );
});

// A skill is the account's: whoever the account is may change it, whatever agent wrote it.
function requireSkill(id, account) {
  const skill = fetchSkill(id);
  if (!skill || skill.accountId !== account.id) throw notFound('unknown skill');
  return skill;
}

router.get('/api/skills', ({ account }) => {
  const items = listAccountSkills(account.id);
  return json(
    collection(items, { limit: items.length || 50, offset: 0 }, items.length),
  );
});

router.put(
  '/api/bots/:id/skills/:skillId',
  async ({ req, params, account }) => {
    requireBot(params.id, account);
    const { isUsed } = await readBody(req);
    try {
      setSkillUse(params.id, params.skillId, isUsed !== false);
    } catch (error) {
      throw notFound(error.message);
    }
    const items = listSkills(params.id);
    return json(
      collection(items, { limit: items.length || 50, offset: 0 }, items.length),
    );
  },
);

router.patch('/api/skills/:id', async ({ req, params, account }) => {
  requireSkill(params.id, account);
  return json(updateSkill(params.id, await readBody(req)));
});

router.delete('/api/skills/:id', ({ params, account }) => {
  requireSkill(params.id, account);
  deleteSkill(params.id);
  return json({ id: params.id, deleted: true });
});

// The Library: what the bot made or downloaded in its workspace.
router.get('/api/bots/:id/files', async ({ params, account }) => {
  const bot = requireBot(params.id, account, 'read');
  if (bot.status !== 'ready')
    return json(collection([], { limit: 0, offset: 0 }, 0));
  const items = await listBotFiles(bot.spriteName);
  return json(collection(items, { limit: 200, offset: 0 }, items.length));
});

router.get('/api/bots/:id/files/content', async ({ params, url, account }) => {
  const bot = requireBot(params.id, account, 'read');
  const filePath = url.searchParams.get('path') || '';
  if (!isBotFilePath(filePath))
    throw invalid('only files in the workspace and in Downloads');
  const content = await readSpriteFile(bot.spriteName, filePath);
  return new Response(content, {
    headers: {
      'Content-Type': Bun.file(filePath).type || 'application/octet-stream',
      'Content-Disposition': `inline; filename="${path.basename(filePath)}"`,
    },
  });
});

// --- The agent folder (agent-files.js): the dashboard tree and the files MCP share these ---

const FILES_STATUS = {
  NOT_FOUND: 404,
  EXISTS: 409,
  AMBIGUOUS: 409,
  IS_FOLDER: 409,
  OUTSIDE_ROOT: 403,
  TOO_LARGE: 413,
};
function runFiles(bot, op, args) {
  try {
    return json(runFileOperation(bot, op, args));
  } catch (error) {
    if (error instanceof FilesError)
      throw new HttpError(
        FILES_STATUS[error.code] ?? 400,
        error.code,
        error.message,
      );
    throw error;
  }
}
const queryArgs = (url) => {
  const args = Object.fromEntries(url.searchParams);
  if (args.paths) args.paths = args.paths.split(',');
  return args;
};

router.get('/api/bots/:id/fs/:op', ({ params, url, account }) => {
  if (toolOf(params.op) !== 'read') throw invalid('unknown read operation');
  return runFiles(
    requireBot(params.id, account, 'read'),
    params.op,
    queryArgs(url),
  );
});
router.post('/api/bots/:id/fs/:op', async ({ req, params, account }) => {
  if (toolOf(params.op) !== 'write') throw invalid('unknown write operation');
  return runFiles(
    requireBot(params.id, account, 'enter'),
    params.op,
    await readBody(req),
  );
});
router.delete('/api/bots/:id/fs', async ({ req, params, account }) =>
  runFiles(
    requireBot(params.id, account, 'enter'),
    'delete',
    await readBody(req),
  ),
);

// The files MCP for any client (Antigravity CLI, Gemini CLI, Claude Code): stateless JSON-RPC over HTTP.
router.post('/api/bots/:id/mcp/files', async ({ req, params, account }) => {
  const bot = requireBot(params.id, account, 'enter');
  const body = await readBody(req);
  const answers = (Array.isArray(body) ? body : [body])
    .map((message) => answerFilesMcp(bot, message))
    .filter(Boolean);
  if (!answers.length) return new Response(null, { status: 202 });
  return json(Array.isArray(body) ? answers : answers[0]);
});

// A change on disk reaches the dashboard and every open stream of the agent, at most every 300 ms per agent.
const filesPending = new Map();
onFilesChanged((botId) => {
  if (filesPending.has(botId)) return;
  filesPending.set(
    botId,
    setTimeout(() => {
      filesPending.delete(botId);
      publishBot(botId, 'files_changed', {});
    }, 300),
  );
});

// --- Tools, policies, services --------------------------------------------

router.get('/api/bots/:id/tools', async ({ params, account }) => {
  const bot = requireBot(params.id, account);
  const policies = Object.fromEntries(
    db
      .query('SELECT tool_name, policy FROM tool_policies WHERE bot_id = ?')
      .all(params.id)
      .map((row) => [row.tool_name, row.policy]),
  );
  let browser = [];
  try {
    browser = (await listBrowserToolDefinitions()).map((tool) => ({
      name: tool.name,
      description: tool.description,
      group: 'Navegador',
    }));
  } catch {}
  const base = BASE_TOOLS.map((tool) => ({
    name: tool.function.name,
    description: tool.function.description,
    group: 'Computer and catalog',
  }));
  const connected = listConnectedTools(bot.accountId).map((tool) => ({
    name: tool.exposedName,
    description: tool.description,
    group: tool.serviceTitle,
    annotations: tool.annotations,
  }));
  const items = [...base, ...browser, ...connected].map((tool) => ({
    ...tool,
    policy: policies[tool.name] ?? null,
  }));
  return json(
    collection(items, { limit: items.length, offset: 0 }, items.length),
  );
});

router.put('/api/bots/:id/tools/:name', async ({ req, params, account }) => {
  requireBot(params.id, account);
  const { policy } = await readBody(req);
  if (policy === null) {
    db.query(
      'DELETE FROM tool_policies WHERE bot_id = ? AND tool_name = ?',
    ).run(params.id, params.name);
  } else {
    if (!POLICIES.includes(policy))
      throw invalid('invalid policy', { allowed: POLICIES });
    setToolPolicy(params.id, params.name, policy);
  }
  return json({ name: params.name, policy });
});

router.get('/api/registry', async ({ url }) => {
  const query = url.searchParams.get('query') || '';
  if (!query.trim()) throw invalid('say what to look for');
  const items = await searchRegistry(query, 20);
  return json(collection(items, { limit: 20, offset: 0 }, items.length));
});

// The catalog with each app's state, so the screen needs one call.
router.get('/api/apps', async ({ account }) => {
  await refreshCatalogIfStale();
  const connections = listConnections(account.id);
  const items = APPS.map((app) => {
    const connection = connections.find(
      (candidate) =>
        candidate.url === app.url ||
        candidate.serverName === app.serverName ||
        (app.addressPrefix && candidate.url.startsWith(app.addressPrefix)),
    );
    return {
      ...app,
      icon: app.icon || `/api/app-icons/${app.domain}`,
      connection: connection ?? null,
    };
  });
  return json({
    ...collection(items, { limit: items.length, offset: 0 }, items.length),
    categories: APP_CATEGORIES,
  });
});

router.get('/api/connections', ({ account }) => {
  const items = listConnections(account.id);
  return json(
    collection(items, { limit: items.length || 50, offset: 0 }, items.length),
  );
});

router.post('/api/connections', async ({ req, account }) => {
  const { botId, serverName, title, url, transport } = await readBody(req);
  if (!url) throw invalid('the server URL is missing');
  const anyBot = botId
    ? requireBot(botId, account)
    : db
        .query(
          'SELECT id FROM bots WHERE account_id = ? ORDER BY created_at LIMIT 1',
        )
        .get(account.id);
  if (!anyBot) throw conflict('create a bot before connecting apps');
  const created = await createConnection({
    accountId: account.id,
    botId: anyBot.id,
    serverName: serverName || url,
    title: title || serverName || new URL(url).hostname,
    url,
    transport: transport === 'sse' ? 'sse' : 'streamable',
  });
  return json(await connect(created.id), 201);
});

// The sign-in window was closed without finishing: a connection that never worked goes away, so the list
// holds only what completed. One that was connected before (a new sign-in) stays as it was.
router.post('/api/connections/:id/abandon', async ({ params, account }) => {
  const connection = requireConnection(params.id, account);
  if (connection.status === 'pending_auth' && !connection.tools?.length)
    await deleteConnection(params.id);
  return json({
    isRemoved:
      connection.status === 'pending_auth' && !connection.tools?.length,
  });
});

// The person's own Chrome, shared by Playwriter's Remote control (user-browser.js).
router.get('/api/user-browser', ({ account }) =>
  json(userBrowserOf(account.id)),
);

router.put('/api/user-browser', async ({ req, account }) => {
  try {
    return json(
      await linkUserBrowser(account.id, (await readBody(req)).pasted),
    );
  } catch (error) {
    throw invalid(error.message);
  }
});

router.delete('/api/user-browser', ({ account }) =>
  json({ isUnlinked: unlinkUserBrowser(account.id) }),
);

// "Liberar contexto": the conversation in progress drops what it is not using.
router.post('/api/bots/:id/context/release', ({ params, account }) => {
  requireBot(params.id, account, 'enter');
  const row = db
    .query(
      'SELECT id FROM tasks WHERE bot_id = ? ORDER BY created_at DESC LIMIT 1',
    )
    .get(params.id);
  if (!row) throw notFound('this agent has no conversation yet');
  return json(releaseContext(row.id));
});

router.post('/api/connections/:id/connect', async ({ params, account }) => {
  requireConnection(params.id, account);
  const connection = await connect(params.id);
  if (connection.status === 'connected') resumeTasksWaitingOn(params.id);
  return json(connection);
});

router.post('/api/connections/:id/secret', async ({ req, params, account }) => {
  requireConnection(params.id, account);
  const { headerName, value } = await readBody(req);
  if (!value?.trim()) throw invalid('paste the token');
  const connection = await saveSecretHeader(params.id, {
    headerName,
    value: value.trim(),
  });
  if (connection.status === 'connected') resumeTasksWaitingOn(params.id);
  return json(connection);
});

// Sign in again: forget the stored access and start a new OAuth consent —
// another account, other permissions, or a token the service revoked.
router.post('/api/connections/:id/reauthorize', async ({ params, account }) => {
  requireConnection(params.id, account);
  return json(await reauthorize(params.id));
});

router.delete('/api/connections/:id', async ({ params, account }) => {
  requireConnection(params.id, account);
  await deleteConnection(params.id);
  return json({ id: params.id, deleted: true });
});

// --- Memory and checkpoints -----------------------------------------------

router.get('/api/bots/:id/memories', ({ params, account }) => {
  requireBot(params.id, account);
  const items = listMemories(params.id);
  return json(
    collection(items, { limit: items.length || 50, offset: 0 }, items.length),
  );
});

router.post('/api/bots/:id/memories', async ({ req, params, account }) => {
  requireBot(params.id, account);
  const { content, kind } = await readBody(req);
  if (!content?.trim()) throw invalid('write what the agent should remember');
  const id = saveMemory({
    botId: params.id,
    kind: memoryKind(kind),
    content: content.trim(),
  });
  return json({ id, kind: memoryKind(kind), content: content.trim() }, 201);
});

router.patch(
  '/api/bots/:id/memories/:memoryId',
  async ({ req, params, account }) => {
    requireBot(params.id, account);
    const { content } = await readBody(req);
    if (!content?.trim()) throw invalid('write what the agent should remember');
    if (!updateMemory(params.id, params.memoryId, content.trim()))
      throw notFound('unknown memory');
    return json({ id: params.memoryId, content: content.trim() });
  },
);

router.delete('/api/bots/:id/memories/:memoryId', ({ params, account }) => {
  requireBot(params.id, account);
  deleteMemory(params.id, params.memoryId);
  return json({ id: params.memoryId, deleted: true });
});

router.get('/api/bots/:id/checkpoints', async ({ params, account }) => {
  requireBot(params.id, account);
  const items = await listBotCheckpoints(params.id);
  return json(
    collection(items, { limit: items.length || 50, offset: 0 }, items.length),
  );
});

router.post(
  '/api/bots/:id/checkpoints/:checkpointId/restore',
  async ({ params, account }) => {
    requireBot(params.id, account);
    const busy = db
      .query(
        "SELECT COUNT(*) AS count FROM tasks WHERE bot_id = ? AND status IN ('running', 'queued')",
      )
      .get(params.id).count;
    if (busy)
      throw conflict('wait for the running task to stop before undoing');
    await restoreBotCheckpoint(params.id, params.checkpointId);
    // The task whose approval took this photo, when one did.
    const taskId =
      db
        .query(
          'SELECT approvals.task_id FROM approvals JOIN tasks ON tasks.id = approvals.task_id WHERE approvals.checkpoint_id = ? AND tasks.bot_id = ?',
        )
        .get(params.checkpointId, params.id)?.task_id ?? null;
    recordOutcome({ botId: params.id, taskId, kind: 'checkpoint_restored' });
    recordFailure({
      botId: params.id,
      taskId,
      kind: 'checkpoint_restored',
      context: `ponto ${params.checkpointId}`,
    });
    return json({ id: params.checkpointId, isRestoring: true }, 202);
  },
);

// --- Trail: what the bot did that went through a judgment ------------------

router.get('/api/bots/:id/audit', ({ params, url, account }) => {
  const bot = requireBot(params.id, account);
  const format = url.searchParams.get('format');
  const day = new Date().toISOString().slice(0, 10);
  const fileName = `registro-${bot.name
    .normalize('NFD')
    .replace(/[^\w-]+/g, '-')
    .replace(/-+/g, '-')
    .toLowerCase()}-${day}`;
  if (format === 'csv')
    return new Response(auditCsv(params.id), {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}.csv"`,
        'Cache-Control': 'no-store',
      },
    });
  if (format === 'json') {
    const body = JSON.stringify(
      {
        bot: { id: bot.id, name: bot.name },
        exportedAt: new Date().toISOString(),
        items: auditJson(params.id),
      },
      null,
      2,
    );
    return new Response(body, {
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Content-Disposition': `attachment; filename="${fileName}.json"`,
        'Cache-Control': 'no-store',
      },
    });
  }
  const page = readPage(url);
  const beforeSeq = Number(url.searchParams.get('before')) || null;
  const { items, total } = listAudit(params.id, {
    limit: page.limit,
    beforeSeq,
  });
  return json(collection(items, { limit: page.limit, offset: 0 }, total));
});

// How many of the bot's approvals the person said yes to, week by week.
router.get('/api/bots/:id/approval-rate', ({ params, account }) => {
  requireBot(params.id, account);
  return json(approvalRate(params.id));
});

// --- Tasks ----------------------------------------------------------------

router.get('/api/tasks/:id', ({ params, account }) =>
  json(withApprovals(requireTask(params.id, account, 'read'))),
);

router.get('/api/tasks/:id/events', ({ params, url, account }) => {
  requireTask(params.id, account, 'read');
  const items = listTaskEvents(
    params.id,
    Number(url.searchParams.get('after')) || 0,
  );
  return json(
    collection(items, { limit: items.length || 50, offset: 0 }, items.length),
  );
});

function eventStream(
  req,
  backlog,
  key,
  { onOpen = null, filter = (send) => send } = {},
) {
  const encoder = new TextEncoder();
  let unsubscribe;
  let heartbeat;
  const stream = new ReadableStream({
    start(controller) {
      // A write can come after the panel left (the account stream's one-second batch): it goes nowhere.
      const write = (event) => {
        try {
          controller.enqueue(
            encoder.encode(
              `${event.seq ? `id: ${event.seq}\n` : ''}data: ${JSON.stringify(event)}\n\n`,
            ),
          );
        } catch {}
      };
      const send = filter(write);
      // Bun sends the response headers with the first chunk; without this
      // line the stream looks connected to nobody until the first event.
      controller.enqueue(encoder.encode(': connected\n\n'));
      for (const event of backlog) send(event);
      const keys = [key].flat();
      const offs = keys.map((each) => subscribe(each, send));
      const close = onOpen?.() ?? null;
      unsubscribe = () => {
        offs.forEach((off) => off());
        close?.();
      };
      // A named event, not a comment: EventSource hides comments, and the panel
      // needs to see the heartbeat to notice a connection that died silently.
      heartbeat = setInterval(
        () => controller.enqueue(encoder.encode('event: ping\ndata: {}\n\n')),
        10_000,
      );
      req.signal.addEventListener('abort', () => {
        unsubscribe();
        clearInterval(heartbeat);
        try {
          controller.close();
        } catch {}
      });
    },
    cancel() {
      unsubscribe?.();
      clearInterval(heartbeat);
    },
  });
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
    },
  });
}

router.get('/api/tasks/:id/stream', ({ params, url, req, account }) => {
  requireTask(params.id, account, 'read');
  return eventStream(
    req,
    listTaskEvents(params.id, Number(url.searchParams.get('after')) || 0),
    params.id,
  );
});

// "Voltar para aqui": the conversation goes back to before this message of the person's.
router.post('/api/tasks/:id/rewind', async ({ req, params, account }) => {
  requireTask(params.id, account);
  // The message is named by its event's UUID; its number (seq) is the same as an unknown one.
  const { eventId } = await readBody(req);
  if (eventId === undefined || eventId === null || eventId === '')
    throw invalid('say which message to go back to');
  if (!findUserMessage(params.id, eventId))
    throw notFound('this message is not in this conversation');
  try {
    const { text, isDiskRestored } = await rewindTask(params.id, eventId);
    return json({
      text,
      isDiskRestored,
      thread: withApprovals(fetchTask(params.id)),
    });
  } catch (error) {
    throw conflict(error.message);
  }
});

// What "Voltar para aqui" would undo, before it does (04/11/2026).
router.get('/api/tasks/:id/rewind-preview', ({ params, url, account }) => {
  requireTask(params.id, account);
  const eventId = url.searchParams.get('eventId');
  if (!eventId || !findUserMessage(params.id, eventId))
    throw notFound('this message is not in this conversation');
  return json(previewRewind(params.id, eventId));
});

// The versions a rewind cut, kept to read.
router.get('/api/bots/:id/branches', ({ params, account }) => {
  requireBot(params.id, account, 'read');
  const items = listBranches(params.id);
  return json(
    collection(items, { limit: items.length, offset: 0 }, items.length),
  );
});
router.get('/api/bots/:id/branches/:branchId', ({ params, account }) => {
  requireBot(params.id, account, 'read');
  const branch = fetchBranch(params.id, params.branchId);
  if (!branch) throw notFound('this version no longer exists');
  return json(branch);
});

// The replies this person marked in this agent.
router.get('/api/bots/:id/bookmarks', ({ params, account }) => {
  requireBot(params.id, account, 'read');
  const items = listBookmarks(account.id, params.id);
  return json(
    collection(items, { limit: items.length, offset: 0 }, items.length),
  );
});
router.put('/api/bots/:id/bookmarks/:eventId', ({ params, account }) => {
  requireBot(params.id, account, 'read');
  const items = addBookmark(account.id, params.id, params.eventId);
  if (!items) throw notFound('only an answer from the agent can be marked');
  return json(
    collection(items, { limit: items.length, offset: 0 }, items.length),
  );
});
router.delete('/api/bots/:id/bookmarks/:eventId', ({ params, account }) => {
  requireBot(params.id, account, 'read');
  const items = removeBookmark(account.id, params.id, params.eventId);
  return json(
    collection(items, { limit: items.length, offset: 0 }, items.length),
  );
});

// "Perguntar sem parar": answered from the conversation, while the agent goes on (04/11/2026).
router.post('/api/bots/:id/side-question', async ({ req, params, account }) => {
  const bot = requireBot(params.id, account, 'enter');
  const question = String((await readBody(req)).question || '').trim();
  if (!question) throw invalid('write the question');
  try {
    return json(await askSideQuestion(bot, question.slice(0, 2000)));
  } catch (error) {
    throw new HttpError(
      502,
      'MODEL_FAILED',
      `the answer did not come: ${error.message}. Try again in a moment.`,
    );
  }
});

router.post(
  '/api/tasks/:id/approvals/:approvalId',
  async ({ req, params, account }) => {
    requireTask(params.id, account);
    const { isApproved, note, shouldRemember, scope } = await readBody(req);
    if (typeof isApproved !== 'boolean')
      throw invalid('say whether you approve or decline');
    try {
      await resolveApproval(params.id, params.approvalId, {
        isApproved,
        note,
        shouldRemember,
        scope,
        resolvedBy: account.id,
      });
    } catch (error) {
      throw conflict(error.message);
    }
    return json(withApprovals(fetchTask(params.id)));
  },
);

const taskAction =
  (action) =>
  async ({ req, params, account }) => {
    requireTask(params.id, account);
    const body =
      req.headers.get('content-length') === '0'
        ? {}
        : await readBody(req).catch(() => ({}));
    try {
      await action(params.id, body);
    } catch (error) {
      throw conflict(error.message);
    }
    return json(withApprovals(fetchTask(params.id)));
  };

router.post(
  '/api/tasks/:id/answer',
  taskAction((id, body) => answerTask(id, (body.text || '').trim())),
);
router.post(
  '/api/tasks/:id/messages',
  taskAction((id, body) => {
    if (!body.text?.trim()) throw new Error('write the message');
    continueTask(id, body.text.trim());
  }),
);
router.post(
  '/api/tasks/:id/takeover',
  taskAction((id) => takeOver(id)),
);
router.post(
  '/api/tasks/:id/cancel',
  taskAction((id) => cancelTask(id)),
);
router.post(
  '/api/tasks/:id/retry',
  taskAction((id) => retryTask(id)),
);

// --- OAuth return ---------------------------------------------------------

const escapeHtml = (value) =>
  String(value ?? '').replace(/[&<>"']/g, (char) => `&#${char.charCodeAt(0)};`);

const CALLBACK_CLOSE_SECONDS = 4;

/**
 * The page the browser lands on after signing in to a service. In the house's
 * look (Montserrat, the gray ramp, no radius, no shadow), light and dark. On
 * success it counts down and closes itself; a browser only lets a page close
 * a tab a script opened, so when it refuses, the button back to the panel
 * stays. A failure does not close: the person needs to read why.
 * Everything that came from the address is escaped.
 */
function callbackPage(title, text, { isOk = false } = {}) {
  const panel = config.publicUrl;
  return new Response(
    `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)} · Gemini Code</title>
<link rel="preconnect" href="https://fonts.googleapis.com"><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Montserrat:wght@500;700;800;900&display=swap">
<style>
:root { --g0:#fff; --g1:#F9FAFB; --g2:#F3F4F6; --g4:#9CA3AF; --g6:#4B5563; --g9:#11181C; --ok:#2F9E44; --bad:#E03131; color-scheme: light }
@media (prefers-color-scheme: dark) { :root { --g0:#0B0F12; --g1:#12171B; --g2:#1E252B; --g4:#6B7480; --g6:#B4BCC5; --g9:#F3F5F7; color-scheme: dark } }
* { box-sizing: border-box }
html, body { height: 100% }
body { margin: 0; background: var(--g1); color: var(--g6); font: 500 15px/1.7 Montserrat, 'Helvetica Neue', Arial, sans-serif; display: flex; align-items: center; justify-content: center; padding: 24px 16px }
main { width: 100%; max-width: 480px; background: var(--g0); border: 1px solid var(--g2); padding: 40px 36px }
.mark { width: 44px; height: 44px; display: flex; align-items: center; justify-content: center; border: 1px solid var(--g2); margin-bottom: 28px }
.label { font-size: 10px; font-weight: 800; letter-spacing: 1.5px; text-transform: uppercase; color: var(--g4); margin: 0 0 10px }
h1 { font-size: clamp(1.75rem, 4vw + 1rem, 2.25rem); font-weight: 900; letter-spacing: -0.04em; line-height: 1.1; color: var(--g9); margin: 0 0 14px }
p { margin: 0 }
.actions { display: flex; align-items: center; justify-content: space-between; gap: 16px; flex-wrap: wrap; margin-top: 32px; padding-top: 24px; border-top: 1px solid var(--g2) }
.note { font-size: 13px; color: var(--g4) }
a.button { font: 800 12px Montserrat, Arial, sans-serif; letter-spacing: 1px; text-transform: uppercase; padding: 13px 20px; background: var(--g9); color: var(--g0); text-decoration: none; border: 1px solid var(--g9) }
a.button:hover { transform: translateY(-1px); filter: brightness(1.1) }
</style></head><body><main>
<div class="mark" aria-hidden="true">${
      isOk
        ? '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--ok)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12l5 5l10 -10"/></svg>'
        : '<svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--bad)" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6l-12 12M6 6l12 12"/></svg>'
    }</div>
<p class="label">Gemini Code · Connection</p>
<h1>${escapeHtml(title)}</h1>
<p>${escapeHtml(text)}</p>
<div class="actions"><span class="note" id="note">${isOk ? `This tab closes in <span id="count">${CALLBACK_CLOSE_SECONDS}</span> s.` : 'Go back to the dashboard to try again.'}</span><a class="button" href="${panel}">Voltar ao Assistant</a></div>
</main>${
      isOk
        ? `<script>
let left = ${CALLBACK_CLOSE_SECONDS}
const count = document.getElementById('count')
const timer = setInterval(() => {
  left -= 1
  if (left > 0) { count.textContent = left; return }
  clearInterval(timer)
  window.close()
  // Still here: the browser keeps tabs it did not open by script.
  setTimeout(() => { document.getElementById('note').textContent = 'You can close this tab.' }, 300)
}, 1000)
</script>`
        : ''
    }</body></html>`,
    {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Cache-Control': 'no-store',
      },
    },
  );
}

async function handleOAuthCallback(url) {
  const error = url.searchParams.get('error');
  // "Cancelar" on the provider's screen is a choice, not a failure: a connection that never worked is
  // dropped, so the list holds only what finished, and the window just closes.
  if (error === 'access_denied') {
    const connection = fetchConnection(
      String(url.searchParams.get('state') || '').split('.')[0],
    );
    if (
      connection &&
      connection.status === 'pending_auth' &&
      !connection.tools?.length
    )
      await deleteConnection(connection.id);
    return new Response(
      '<!doctype html><meta charset="utf-8"><title>Gemini Code</title><script>window.close()</script><p style="font:15px sans-serif;padding:24px">You can close this window.</p>',
      { headers: { 'Content-Type': 'text/html; charset=utf-8' } },
    );
  }
  if (error)
    return callbackPage(
      'Sign-in not completed',
      `The service answered: ${url.searchParams.get('error_description') || error}. Try again from the dashboard.`,
    );
  try {
    const connection = await finishAuthorization({
      code: url.searchParams.get('code'),
      state: url.searchParams.get('state'),
    });
    if (connection.status === 'connected') {
      resumeTasksWaitingOn(connection.id);
      return callbackPage(
        `${connection.title} connected`,
        'Your bots can use this app now. If a task was waiting for it, it has already continued.',
        { isOk: true },
      );
    }
    return callbackPage(
      'Almost there',
      `The connection is "${connection.status}": ${connection.statusDetail || ''}`,
    );
  } catch (failure) {
    console.error('oauth callback', failure);
    return callbackPage(
      'Sign-in not completed',
      'I could not exchange the code for access. Try again from the dashboard.',
    );
  }
}

// --- Live screen: dashboard ⇄ control ⇄ bot's VNC -------------------------

const screenSocket = {
  open(ws) {
    const upstream = openSpriteSocket(ws.data.spriteUrl, '/vnc');
    upstream.onopen = () => {
      ws.data.upstream = upstream;
      for (const message of ws.data.queue) upstream.send(message);
      ws.data.queue = [];
    };
    upstream.onmessage = (event) => ws.sendBinary(new Uint8Array(event.data));
    upstream.onclose = () => ws.close();
    upstream.onerror = () => ws.close();
  },
  message(ws, message) {
    if (ws.data.upstream) ws.data.upstream.send(message);
    else ws.data.queue.push(message);
  },
  close(ws) {
    ws.data.upstream?.close();
  },
};

// --- Static dashboard -----------------------------------------------------

function serveDashboard(pathname) {
  const filePath = path.join(config.dashboardDir, pathname);
  if (
    pathname !== '/' &&
    filePath.startsWith(config.dashboardDir) &&
    existsSync(filePath)
  ) {
    const isHashed = pathname.startsWith('/assets/');
    return new Response(Bun.file(filePath), {
      headers: isHashed
        ? { 'Cache-Control': 'public, max-age=31536000, immutable' }
        : {},
    });
  }
  const index = path.join(config.dashboardDir, 'index.html');
  if (existsSync(index))
    return new Response(Bun.file(index), {
      headers: { 'Cache-Control': 'no-cache' },
    });
  return new Response(
    'dashboard not built: run bun run build in packages/dashboard/',
    { status: 404 },
  );
}

// --- Server ---------------------------------------------------------------

// Last line of defense: an error nobody caught is logged, never the end of the
// server. Deleting a bot while it worked once took the whole control server down.
process.on('unhandledRejection', (error) =>
  console.error('[unhandled]', error),
);
process.on('uncaughtException', (error) => console.error('[uncaught]', error));

// --- The vault: a bot's keys for its terminal (vault.js); only names leave --

// A secret is addressed by its id; its name is the variable its commands read.
// An id the bot does not have, its name included, is "there is no such key in the vault".
router.get('/api/bots/:id/secrets', ({ params, account }) => {
  requireBot(params.id, account);
  const items = listSecrets(params.id);
  return json(
    collection(items, { limit: items.length, offset: 0 }, items.length),
  );
});

router.post('/api/bots/:id/secrets', async ({ req, params, account }) => {
  requireBot(params.id, account);
  const { name, value } = await readBody(req);
  try {
    return json(await createSecret(params.id, name, value), 201);
  } catch (error) {
    if (error instanceof SecretNameTaken) throw conflict(error.message);
    if (isVaultError(error)) throw invalid(error.message);
    throw error;
  }
});

router.patch(
  '/api/bots/:id/secrets/:secretId',
  async ({ req, params, account }) => {
    requireBot(params.id, account);
    let secret;
    try {
      secret = await updateSecret(
        params.id,
        params.secretId,
        (await readBody(req)).value,
      );
    } catch (error) {
      if (isVaultError(error)) throw invalid(error.message);
      throw error;
    }
    if (!secret) throw notFound('there is no such key in the vault');
    return json(secret);
  },
);

router.delete('/api/bots/:id/secrets/:secretId', ({ params, account }) => {
  requireBot(params.id, account);
  if (!deleteSecret(params.id, params.secretId))
    throw notFound('there is no such key in the vault');
  return json({ id: params.secretId, deleted: true });
});

// --- Artifacts: what a bot hands over to be looked at (artifacts.js) --------

// --- Files: local workspace or GitHub repository (repo.js) -------------------

router.get('/api/files', async ({ account }) => {
  if (!isGithubReady() && !syncedAtOf(account.id)) {
    await syncAccount(account.id);
  }
  const items = await listFiles(account.id);
  return json({
    ...collection(
      items,
      { limit: items.length || 50, offset: 0 },
      items.length,
    ),
    repo: repoInfoOf(account.id),
  });
});

router.get('/api/files/content', async ({ url, account }) => {
  const file = await openFile(account.id, url.searchParams.get('path') || '');
  if (!file) throw notFound('unknown file');
  return json(file);
});

router.get('/api/files/history', async ({ url, account }) => {
  const items = await historyOf(account.id, url.searchParams.get('path') || '');
  return json(
    collection(items, { limit: items.length || 20, offset: 0 }, items.length),
  );
});

router.get('/api/files/diff', async ({ url, account }) =>
  json({
    patch: await diffOf(
      account.id,
      url.searchParams.get('sha') || '',
      url.searchParams.get('path') || '',
    ),
  }),
);

router.post('/api/files/upload', async ({ req, account }) => {
  const form = await req.formData().catch(() => null);
  const files = form
    ? form.getAll('file').filter((file) => typeof file === 'object')
    : [];
  if (!files.length)
    throw invalid('send the files as multipart/form-data, in the "file" field');
  if (files.some((file) => file.size > MAX_FILE_BYTES))
    throw invalid('a file over 50 MB stays out of the repository');
  try {
    return json(
      await uploadFiles(
        account.id,
        form.get('folder') || '',
        await Promise.all(
          files.map(async (file) => ({
            name: file.name,
            bytes: Buffer.from(await file.arrayBuffer()),
          })),
        ),
      ),
    );
  } catch (error) {
    throw invalid(error.message);
  }
});

router.post('/api/files/rename', async ({ req, account }) => {
  const { from, to } = await readBody(req);
  try {
    return json(await renameFolder(account.id, from, to));
  } catch (error) {
    throw invalid(error.message);
  }
});

router.delete('/api/files', async ({ url, account }) => {
  try {
    return json(
      await removePath(account.id, url.searchParams.get('path') || ''),
    );
  } catch (error) {
    throw invalid(error.message);
  }
});

router.put('/api/files', async ({ req, account }) => {
  const { path, content } = await readBody(req);
  if (!path || typeof content !== 'string' || path.includes('..'))
    throw invalid('say the file and its content');
  try {
    return json(await saveFile(account.id, path, content));
  } catch (error) {
    throw invalid(error.message);
  }
});

// GitHub tells the central about a push it did not make (an edit on github.com).
router.post('/api/github/webhook', async ({ req }) => {
  const raw = await req.text();
  if (!isSignedByGithub(raw, req.headers.get('x-hub-signature-256')))
    throw new HttpError(401, 'UNAUTHORIZED', 'invalid GitHub signature');
  if (req.headers.get('x-github-event') !== 'push') return json({ applied: 0 });
  return json({ applied: await onPush(JSON.parse(raw)) });
});

// --- AI accounts: one per provider key, plus the Claude Code tokens for long jobs ---

router.get('/api/ai-accounts', ({ account }) => {
  // The dashboard shows only the accounts of what it offers (Gemini).
  const items = listAiAccounts(account.id).filter((item) =>
    isOffered(item.provider),
  );
  return json(
    collection(items, { limit: items.length || 50, offset: 0 }, items.length),
  );
});

router.post('/api/ai-accounts', async ({ req, account }) => {
  const { provider, name, token } = await readBody(req);
  if (!isOffered(provider))
    throw invalid(
      'Gemini Code works only with Google Gemini: add a Gemini API key',
    );
  try {
    return json(
      await createAiAccount(account.id, { provider, name, token }),
      201,
    );
  } catch (error) {
    throw invalid(error.message);
  }
});

router.get('/api/ai-providers', () => {
  const items = offeredProviders();
  return json(
    collection(items, { limit: items.length, offset: 0 }, items.length),
  );
});

// Every chat model the account's key opens, live, to turn on the ones its agents use.
router.get(
  '/api/ai-accounts/:id/available-models',
  async ({ params, account }) => {
    try {
      const items = await availableModels(account.id, params.id);
      if (!items) throw notFound('unknown AI account');
      return json(
        collection(
          items,
          { limit: items.length || 50, offset: 0 },
          items.length,
        ),
      );
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw invalid(error.message);
    }
  },
);

router.patch('/api/ai-accounts/:id', async ({ req, params, account }) => {
  const { models } = await readBody(req);
  try {
    const item = setAccountModels(account.id, params.id, models);
    if (!item) throw notFound('unknown AI account');
    return json(item);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw invalid(error.message);
  }
});

// What an agent can talk with: the Assistant's models, then each key's models turned on.
router.get('/api/brains', ({ account }) => {
  const items = brainsFor(account.id);
  return json(
    collection(items, { limit: items.length, offset: 0 }, items.length),
  );
});

router.delete('/api/ai-accounts/:id', ({ params, account }) => {
  if (!deleteAiAccount(account.id, params.id))
    throw notFound('unknown AI account');
  return json({ id: params.id, isDeleted: true });
});

// The account's latest deliveries, for the command center.
router.get('/api/deliveries', ({ account }) => {
  const items = listRecentDeliveries(account.id);
  return json(
    collection(items, { limit: items.length, offset: 0 }, items.length),
  );
});

router.get('/api/bots/:id/artifacts', ({ params, account }) => {
  requireBot(params.id, account, 'read');
  const items = listArtifacts(params.id);
  return json(
    collection(items, { limit: items.length, offset: 0 }, items.length),
  );
});

router.get(
  '/api/bots/:id/artifacts/:artifactId/versions/:versionId',
  ({ params, account }) => {
    requireBot(params.id, account, 'read');
    const artifact = fetchArtifactVersion(
      params.id,
      params.artifactId,
      params.versionId,
    );
    if (!artifact) throw notFound('unknown artifact');
    return json(artifact);
  },
);

// A choice is the person's own message to the bot, marked with where it was made.
router.post(
  '/api/bots/:id/artifacts/:artifactId/versions/:versionId/choices',
  async ({ req, params, account }) => {
    requireBot(params.id, account, 'enter');
    const { itemId, value, note } = await readBody(req);
    let told;
    try {
      told = recordChoice(params.id, params.artifactId, params.versionId, {
        itemId: String(itemId ?? ''),
        value: String(value ?? ''),
        note,
      });
    } catch (error) {
      if (isArtifactError(error)) throw invalid(error.message);
      throw error;
    }
    sendBotMessage(params.id, told.shown, {
      choice: told.choice,
      modelText: told.modelText,
    });
    return json(
      fetchArtifactVersion(params.id, params.artifactId, params.versionId),
    );
  },
);

// --- The door: the address other systems post to (inbox.js) ----------------

router.get('/api/bots/:id/inbox', ({ params, account }) => {
  requireBot(params.id, account);
  return json(ensureInbox(params.id));
});

router.post('/api/bots/:id/inbox/rotate', ({ params, account }) => {
  requireBot(params.id, account);
  return json(rotateInbox(params.id));
});

const PUBLIC_ROUTES = new Set([
  '/api/models',
  '/api/mascots',
  '/api/wake',
  '/api/health',
  '/api/github/webhook',
]);

router.get('/api/health', () => json({ isOk: true }));

// The Google subscription's state tree (engine/subscription/state.js), and a fresh look at it.
router.get('/api/subscription', () => json(subscriptionState()));
router.post('/api/subscription/refresh', async () =>
  json(await refreshSubscription()),
);

// Only when run (bun src/server.js): a test imports the routes and nothing starts.
/** Starts the server: what `bun src/server.js` and the installed `gemini-code` command (cli.js) both run. */
export function startServer() {
  // In local mode the subscription, once it answers, becomes an AI account the agents can pick.
  if (config.authMode === 'local') {
    subscriptionStore.subscribe((state) => {
      if (state.status === 'ready')
        ensureSubscriptionAccount('local-developer', state.models).catch(
          (error) => console.error(`[subscription] ${error.message}`),
        );
    });
  }
  refreshSubscription().then((state) =>
    console.log(
      `[subscription] ${state.status}${state.models?.length ? ` (${state.models.length} models)` : ''}${state.error ? `: ${state.error}` : ''}`,
    ),
  );
  const server = Bun.serve({
    port: config.port,
    idleTimeout: 0,
    async fetch(req, server) {
      const url = new URL(req.url);
      const { pathname } = url;

      const screen = pathname.match(/^\/api\/bots\/([^/]+)\/screen$/);
      if (screen) {
        try {
          const bot = requireBot(screen[1], await authenticate(req, url));
          if (bot.status !== 'ready' || !bot.spriteUrl)
            throw conflict("this bot's computer is not on yet");
          if (
            server.upgrade(req, {
              data: { kind: 'screen', spriteUrl: bot.spriteUrl, queue: [] },
            })
          )
            return;
          throw invalid('esperava websocket');
        } catch (error) {
          return fail(error);
        }
      }

      if (pathname === '/oauth/callback') return handleOAuthCallback(url);

      const door = pathname.match(/^\/in\/([^/]+)$/);
      if (door) {
        try {
          return await receiveAtInbox(req, door[1], {
            deliver: (botId, text, meta) => sendBotMessage(botId, text, meta),
          });
        } catch (error) {
          return fail(error);
        }
      }

      const appIcon = pathname.match(/^\/api\/app-icons\/([a-z0-9.-]+)$/);
      if (appIcon) {
        const icon = await fetchAppIcon(appIcon[1]).catch(() => null);
        if (!icon) return fail(notFound('unknown icon'));
        return new Response(icon.body, {
          headers: {
            'Content-Type': icon.type,
            'Cache-Control': 'public, max-age=604800',
          },
        });
      }

      const mascot = pathname.match(/^\/api\/mascots\/([^/]+\.svg)$/);
      if (mascot) {
        const svg = readMascotSvg(decodeURIComponent(mascot[1]));
        if (!svg) return fail(notFound('unknown illustration'));
        return new Response(svg, {
          headers: {
            'Content-Type': 'image/svg+xml',
            'Cache-Control': 'public, max-age=86400',
          },
        });
      }

      if (pathname.startsWith('/api/')) {
        const match = router.match(req.method, pathname);
        if (!match) return fail(notFound('unknown route'));
        try {
          // Public: what an <img> loads, the model list and the alarm
          // (which carries its own secret). Everything else is someone's.
          const account = PUBLIC_ROUTES.has(pathname)
            ? null
            : await authenticate(req, url, {
                allowPending:
                  pathname === '/api/me' ||
                  pathname === '/api/me/wish' ||
                  isGuestRoute(req.method, pathname),
              });
          if (
            account?.status === 'pending' &&
            !['/api/me', '/api/me/wish'].includes(pathname) &&
            !sharedWith(account.email).length
          )
            throw new HttpError(
              403,
              'ACCESS_PENDING',
              'Your access is still being granted.',
            );
          const response = await match.handler({
            req,
            url,
            params: match.params,
            account,
          });
          // A change made in the panel reaches the person's repository in a moment.
          if (account && req.method !== 'GET') scheduleSync(account.id);
          return response;
        } catch (error) {
          return fail(error);
        }
      }

      return serveDashboard(pathname);
    },
    websocket: { maxPayloadLength: 64 * 1024 * 1024, ...screenSocket },
  });

  onBotReady(startQueuedTasks);
  startCatalog();
  startRepoSweep();
  startToolRefresh();
  startPush();
  startRoutines(sendRoutineRun, onRoutinesChanged);
  onRoutinesChanged();
  recoverBots();
  recoverTasks();
  sweepTimedOutApprovals();
  setInterval(sweepTimedOutApprovals, 15 * 60 * 1000).unref?.();
  // The director hears every morning what failed, stopped or waits (health.js).
  startHealthReports((botId, text) =>
    sendBotMessage(botId, text, {
      routine: { id: null, name: 'Saúde do Assistant' },
    }),
  );

  console.log(`Gemini Code server on ${server.port} (${config.publicUrl})`);
  return server;
}

if (import.meta.main) startServer();
