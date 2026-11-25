// What Gemini Code answers when an ACP agent asks before acting.
//
// The agent sends the tool call it wants to run: its kind (read, edit,
// delete, execute, search, fetch, think), its title, the paths it touches and
// its arguments. The answer keeps the agent inside its own folder and leaves
// deleting to the person, the same rules the files MCP enforces for Gemini
// Code's own agents.

import { existsSync, realpathSync } from 'node:fs';
import path from 'node:path';

const DELETING_COMMAND =
  /(^|[\s;&|(])(rm|rmdir|unlink|shred|git\s+clean)(\s|$)/;

/** Whether a path, once links are followed, is the root or inside it. */
export function isInside(root, target) {
  const realRoot = realpathSync(root);
  let probe = path.resolve(realRoot, String(target));
  while (!existsSync(probe) && probe !== path.dirname(probe))
    probe = path.dirname(probe);
  const real = realpathSync(probe);
  return real === realRoot || real.startsWith(realRoot + path.sep);
}

const pathsOf = (toolCall) => {
  const args = toolCall.args ?? toolCall.rawInput ?? {};
  const named = Object.entries(args)
    .filter(([key]) =>
      /^(path|file|filepath|directory|dir|target|source|cwd|absolutepath)$/i.test(
        key,
      ),
    )
    .map(([, value]) => value)
    .filter((value) => typeof value === 'string' && value);
  return [
    ...(toolCall.locations ?? [])
      .map((location) => location.path)
      .filter(Boolean),
    ...named,
  ];
};

const commandOf = (toolCall) => {
  const args = toolCall.args ?? toolCall.rawInput ?? {};
  return String(args.CommandLine ?? args.command ?? args.cmd ?? '');
};

/** Absolute or home paths a shell command names, which must stay inside the root too. */
const commandPaths = (command) =>
  [...command.matchAll(/(?:^|[\s=:'"])((?:~|\/)[^\s'";|&)]*)/g)]
    .map((match) => match[1])
    .filter((value) => value !== '/dev/null');

/**
 * The answer to one permission request: { isAllowed, reason }. `root` is the
 * agent's folder.
 */
export function decidePermission(toolCall, root) {
  const kind = toolCall.kind ?? 'other';
  const command = commandOf(toolCall);
  const touched = [
    ...pathsOf(toolCall),
    ...commandPaths(command).map((value) =>
      value.startsWith('~')
        ? path.join(process.env.HOME ?? '/', value.slice(1))
        : value,
    ),
  ];
  const outside = touched.find((value) => !isInside(root, value));
  if (outside)
    return {
      isAllowed: false,
      reason: `${outside} is outside the agent folder; work only inside it`,
    };
  if (kind === 'delete' || DELETING_COMMAND.test(command))
    return {
      isAllowed: false,
      reason:
        'deleting waits for the person: say what should be deleted and why, and the person deletes it',
    };
  return { isAllowed: true, reason: '' };
}

/** The ACP outcome for a decision, picked from the options the agent offered. */
export function outcomeFor(decision, options = []) {
  const wanted = decision.isAllowed
    ? ['allow_once', 'allow_always']
    : ['reject_once', 'reject_always'];
  const option =
    wanted
      .map((kind) => options.find((item) => item.kind === kind))
      .find(Boolean) ?? null;
  return option
    ? { outcome: { outcome: 'selected', optionId: option.optionId } }
    : { outcome: { outcome: 'cancelled' } };
}
