// The installed `gemini-code` command: one executable (bun build --compile)
// next to the dashboard's build. It sets where things live before the server
// reads its configuration, starts the server and opens the dashboard.
//
//   gemini-code [folder]   agents work in <folder> (default: ~/GeminiCode)
//   --port <n>             default 8787
//   --no-open              do not open the browser
//   --version, --help
//
// Everything stays under ~/.gemini-code: the database and the encryption key
// in data/, the API key, if any, in .env. Nothing is sent anywhere until the
// person connects an AI account.

import { existsSync, mkdirSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import path from 'node:path';

export const VERSION = process.env.GEMINI_CODE_VERSION || '0.0.0-dev';

const HELP = `Gemini Code ${VERSION}: a desk of coding agents built around Google Gemini.

Usage: gemini-code [folder] [--port <n>] [--no-open]

  folder      where the agents work (default: ~/GeminiCode)
  --port      the port of the dashboard (default: 8787)
  --no-open   do not open the browser
  --version   print the version
  --help      print this help

Data, keys and logs stay in ~/.gemini-code. Put GEMINI_API_KEY=... in
~/.gemini-code/.env, or add a key in the dashboard under Settings.`;

/** The options a command line asks for; pure, so it can be tested. */
export function parseArgs(argv) {
  const options = {
    folder: null,
    port: null,
    shouldOpen: true,
    isHelp: false,
    isVersion: false,
  };
  for (let index = 0; index < argv.length; index++) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') options.isHelp = true;
    else if (arg === '--version' || arg === '-v') options.isVersion = true;
    else if (arg === '--no-open') options.shouldOpen = false;
    else if (arg === '--port') options.port = Number(argv[++index]);
    else if (arg.startsWith('--port=')) options.port = Number(arg.slice(7));
    else if (!arg.startsWith('-') && !options.folder) options.folder = arg;
  }
  if (options.port !== null && !(options.port > 0 && options.port < 65536))
    throw new Error('--port needs a number between 1 and 65535');
  return options;
}

/** KEY=value lines, without overriding what the environment already has. */
export function readEnvFile(text) {
  const values = {};
  for (const line of String(text).split('\n')) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line);
    if (match) values[match[1]] = match[2].replace(/^(['"])(.*)\1$/, '$2');
  }
  return values;
}

/** Where everything lives for this run; also pure. */
export function placesFor({ home, executable, folder, cwd }) {
  const root = path.join(home, '.gemini-code');
  return {
    root,
    data: path.join(root, 'data'),
    envFile: path.join(root, '.env'),
    // The archive puts the dashboard's build next to the executable.
    dashboard: path.join(path.dirname(executable), 'dashboard'),
    // The cloud computer's code, small, shipped so cloud mode works from an install too.
    computer: path.join(path.dirname(executable), 'computer'),
    workspace: folder
      ? path.resolve(cwd, folder)
      : path.join(home, 'GeminiCode'),
  };
}

function openBrowser(url) {
  const command =
    process.platform === 'darwin'
      ? ['open', url]
      : process.platform === 'win32'
        ? ['cmd', '/c', 'start', '', url]
        : ['xdg-open', url];
  try {
    Bun.spawn(command, { stdout: 'ignore', stderr: 'ignore' });
  } catch {}
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.isHelp) return console.log(HELP);
  if (options.isVersion) return console.log(VERSION);

  const places = placesFor({
    home: homedir(),
    executable: process.execPath,
    folder: options.folder,
    cwd: process.cwd(),
  });
  mkdirSync(places.data, { recursive: true });
  mkdirSync(places.workspace, { recursive: true });
  if (existsSync(places.envFile)) {
    for (const [key, value] of Object.entries(
      readEnvFile(readFileSync(places.envFile, 'utf8')),
    ))
      process.env[key] ??= value;
  }
  process.env.DATA_DIR ??= places.data;
  process.env.WORKSPACE_DIR ??= places.workspace;
  if (existsSync(places.dashboard))
    process.env.DASHBOARD_DIR ??= places.dashboard;
  if (existsSync(places.computer)) process.env.COMPUTER_DIR ??= places.computer;
  if (options.port) process.env.PORT = String(options.port);

  // The configuration is read when the server module loads: only now.
  const { startServer } = await import('./server.js');
  const server = startServer();
  const url = `http://localhost:${server.port}`;
  console.log(
    `\n  Gemini Code ${VERSION} is running: ${url}\n  Agents work in ${places.workspace}\n  Press Ctrl+C to stop.\n`,
  );
  if (options.shouldOpen) openBrowser(url);
}

if (import.meta.main) {
  main().catch((error) => {
    console.error(`gemini-code: ${error.message}`);
    process.exit(1);
  });
}
