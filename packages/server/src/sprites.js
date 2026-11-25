// The agent's computer is this machine (25/11/2026: Gemini Code runs as one
// executable on the person's own computer, with no cloud computers). These
// are the calls the engine makes on it: run a command, read and write a file.
// The name stays from the cloud days so the engine's imports did not move.

import {
  readLocalFile,
  runLocalCommand,
  writeLocalFile,
} from './local-runtime.js';

export const writeFile = (_name, filePath, content) =>
  writeLocalFile(filePath, content);

export const readFile = (_name, filePath) => readLocalFile(filePath);

export const runCommand = (
  _name,
  command,
  { timeoutSeconds = 120, cwd, maxBytes = 60000, secrets = null } = {},
) => runLocalCommand(command, { timeoutSeconds, cwd, maxBytes, secrets });

// This machine has no snapshots of its disk: before a risky step there is no
// restore point, and the conversation says so.
export const createCheckpoint = async () => null;
export const listCheckpoints = async () => [];
