// Diagnostics: every part of Gemini Code checked for real, now, for the person
// who wants to know whether everything works, is connected and is allowed.
// Each check measures its own time and answers ok, warn, fail or off with the
// reason in words; one failing part never stops the others.

import { accessSync, constants, existsSync } from 'node:fs';
import path from 'node:path';

import { agentDirOf, listBots } from './bots.js';
import { config } from './config.js';
import { db } from './db.js';
import { listChatAccounts } from './ai-accounts.js';
import { listConnections } from './engine/catalog.js';
import { subscriptionState } from './engine/subscription/index.js';
import { answerFilesMcp } from './mcp-files.js';
import { ALWAYS_ASK_KINDS } from './engine/policy.js';
import { isOffered, listProviderModels, providerOf } from './providers.js';
import { userBrowserOf } from './user-browser.js';
import { listSecrets } from './vault.js';
import rootPackage from '../../../package.json' with { type: 'json' };

const startedAt = Date.now();

const timed = async (check) => {
  const start = performance.now();
  try {
    const result = await check.run();
    return {
      ...check.meta,
      ...result,
      ms: Math.round(performance.now() - start),
    };
  } catch (error) {
    return {
      ...check.meta,
      status: 'fail',
      detail: error.message.slice(0, 300),
      ms: Math.round(performance.now() - start),
    };
  }
};

const isWritable = (folder) => {
  try {
    accessSync(folder, constants.W_OK);
    return true;
  } catch {
    return false;
  }
};

const plural = (count, one, many) => `${count} ${count === 1 ? one : many}`;

/** The checks for one account, as { id, group, title, run }. */
export function checksFor(account, deps = {}) {
  const {
    listModels = listProviderModels,
    chatAccounts = listChatAccounts,
    connections = listConnections,
    bots = listBots,
    subscription = subscriptionState,
    filesMcp = answerFilesMcp,
    browser = userBrowserOf,
  } = deps;
  const checks = [];
  const add = (group, id, title, run) =>
    checks.push({ meta: { group, id, title }, run });

  // --- System
  add('System', 'server', 'Control server', () => {
    const minutes = Math.round((Date.now() - startedAt) / 60_000);
    return {
      status: 'ok',
      detail: `Gemini Code ${rootPackage.version} on Bun ${Bun.version}, up ${minutes < 60 ? `${minutes} min` : `${Math.round(minutes / 60)} h`}`,
    };
  });
  add('System', 'database', 'Database', () => {
    const check = db.query('PRAGMA quick_check').get();
    const mode = db.query('PRAGMA journal_mode').get();
    const isOk = Object.values(check ?? {})[0] === 'ok';
    return {
      status: isOk ? 'ok' : 'fail',
      detail: isOk
        ? `SQLite, ${Object.values(mode ?? {})[0]} journal, integrity ok`
        : `SQLite integrity check: ${Object.values(check ?? {})[0]}`,
    };
  });
  add('System', 'workspace', 'Workspace folder', () => {
    const folder = config.localWorkspaceDir;
    if (!existsSync(folder))
      return { status: 'fail', detail: `${folder} does not exist` };
    return isWritable(folder)
      ? { status: 'ok', detail: `${folder}, writable` }
      : { status: 'fail', detail: `${folder} is not writable` };
  });

  add('System', 'voice', 'Voice', () => {
    if (config.fishApiKey)
      return {
        status: 'ok',
        detail: 'Fish Audio transcribes dictation and speaks in voice mode',
      };
    if (config.openrouterApiKey)
      return {
        status: 'warn',
        detail:
          'A Gemini model through OpenRouter transcribes dictation; nothing speaks voice mode (FISH_API_KEY is not set)',
      };
    return {
      status: 'off',
      detail:
        'No voice service: set FISH_API_KEY on the server for dictation and voice mode',
    };
  });

  // --- Gemini
  add('Gemini', 'gemini-key', 'Gemini API key', async () => {
    const keys = (await chatAccounts(account.id)).filter(
      (item) => item.provider === 'google',
    );
    if (!keys.length)
      return {
        status: 'fail',
        detail: 'No Gemini API key: add one in Settings › AI accounts',
      };
    const answers = await Promise.allSettled(
      keys.map((item) => listModels('google', item.key)),
    );
    const working = answers.filter((answer) => answer.status === 'fulfilled');
    if (!working.length)
      return {
        status: 'fail',
        detail: `Google refused every key: ${answers[0].reason?.message ?? 'no answer'}`,
      };
    const models = working[0].value.length;
    return {
      status: working.length === keys.length ? 'ok' : 'warn',
      detail: `${working.length} of ${plural(keys.length, 'key', 'keys')} answered; ${plural(models, 'chat model', 'chat models')} open`,
    };
  });
  add(
    'Gemini',
    'subscription',
    'Google subscription (AI Pro and Ultra)',
    () => {
      if (!isOffered('google-subscription'))
        return {
          status: 'off',
          detail: 'Waiting for Google’s official path for third-party tools',
        };
      const state = subscription();
      return {
        status: state.status === 'ready' ? 'ok' : 'warn',
        detail: state.error || `Status ${state.status}`,
      };
    },
  );

  // --- Agents
  const agents = bots(account.id);
  add('Agents', 'agents', 'Agents', () => ({
    status: agents.length ? 'ok' : 'warn',
    detail: agents.length
      ? plural(agents.length, 'agent', 'agents')
      : 'No agent yet: describe one in the command center',
  }));
  for (const bot of agents) {
    add('Agents', `agent:${bot.id}`, bot.name, () => {
      const problems = [];
      const dir = agentDirOf(bot);
      const folder = dir ? path.join(config.localWorkspaceDir, dir) : null;
      if (folder) {
        if (!existsSync(folder)) problems.push('its folder is not created yet');
        else if (!isWritable(folder))
          problems.push('its folder is not writable');
      }
      const answer = filesMcp(bot, {
        jsonrpc: '2.0',
        id: 1,
        method: 'tools/list',
      });
      const tools = answer?.result?.tools?.length ?? 0;
      if (!tools) problems.push('the files MCP did not list its tools');
      const brain = bot.aiAccount
        ? db
            .query('SELECT provider FROM ai_accounts WHERE id = ?')
            .get(bot.aiAccount)
        : null;
      if (!brain) problems.push('no AI account picked: choose a Gemini model');
      else if (!isOffered(brain.provider))
        problems.push(
          `its AI account (${providerOf(brain.provider)?.name ?? brain.provider}) is off: choose a Gemini model`,
        );
      return {
        status: problems.length ? 'warn' : 'ok',
        detail: problems.length
          ? problems.join('; ')
          : `${bot.model} · ${dir ?? 'no folder'}/ · files MCP ${plural(tools, 'tool', 'tools')}`,
      };
    });
  }

  // --- Connectors
  const linked = connections(account.id);
  if (!linked.length)
    add('Connectors', 'connectors', 'Connectors', () => ({
      status: 'off',
      detail: 'None connected: Connectors lists GitHub, Linear and others',
    }));
  for (const connection of linked)
    add('Connectors', `connection:${connection.id}`, connection.title, () => {
      if (connection.status === 'connected')
        return {
          status: 'ok',
          detail: `Connected, ${plural(connection.tools?.length ?? 0, 'tool', 'tools')}`,
        };
      if (
        connection.status === 'pending_auth' ||
        connection.status === 'needs_device' ||
        connection.status === 'needs_secret'
      )
        return {
          status: 'warn',
          detail:
            connection.status === 'needs_secret'
              ? 'Waiting for its token'
              : 'Waiting for you to sign in',
        };
      return { status: 'fail', detail: connection.statusDetail || 'Failed' };
    });
  add('Connectors', 'chrome', 'Your Chrome', () => {
    const state = browser(account.id);
    return state.isLinked
      ? { status: 'ok', detail: 'Linked: agents can use it when you allow' }
      : { status: 'off', detail: 'Not linked (Settings › Meu Chrome)' };
  });

  // --- Permissions
  add('Permissions', 'sign-in', 'Who reaches it', () => ({
    status: 'ok',
    detail:
      'Only this machine: the server answers on 127.0.0.1, so nothing else on the network reaches it',
  }));
  add('Permissions', 'always-ask', 'Payments and sign-ins', () => ({
    status:
      ALWAYS_ASK_KINDS.has('pay') && ALWAYS_ASK_KINDS.has('auth')
        ? 'ok'
        : 'fail',
    detail: 'Always ask you, every time',
  }));
  add('Permissions', 'grants', 'Standing permissions', () => {
    const ids = agents.map((bot) => bot.id);
    const rows = ids.length
      ? db
          .query(
            `SELECT COUNT(*) AS count FROM tool_policies WHERE policy = 'free' AND bot_id IN (${ids.map(() => '?').join(',')})`,
          )
          .get(...ids)
      : { count: 0 };
    return {
      status: 'ok',
      detail: rows.count
        ? `${plural(rows.count, 'action', 'actions')} allowed to run without asking, set by you`
        : 'No action set to run without asking; the risk judge decides each one',
    };
  });
  add('Permissions', 'vault', 'Secrets vault', () => {
    const total = agents.reduce(
      (sum, bot) => sum + listSecrets(bot.id).length,
      0,
    );
    return {
      status: 'ok',
      detail: total
        ? `${plural(total, 'secret', 'secrets')}, encrypted, out of what the model reads`
        : 'No secrets stored',
    };
  });

  return checks;
}

/** Runs every check at once. Resolves with { checkedAt, summary, items }. */
export async function runDiagnostics(account, deps = {}) {
  const items = await Promise.all(checksFor(account, deps).map(timed));
  const summary = { ok: 0, warn: 0, fail: 0, off: 0 };
  for (const item of items) summary[item.status] += 1;
  return { checkedAt: Date.now(), summary, items };
}
