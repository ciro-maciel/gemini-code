import { config } from './config.js';
import {
  isLocalMode,
  readLocalFile,
  runLocalCommand,
  writeLocalFile,
} from './local-runtime.js';

const RETRYABLE = new Set([502, 503, 504]);
const useLocal = (name) =>
  isLocalMode() || name === 'local' || String(name || '').startsWith('local-');

// The organization's plan caps how many Sprites run at once and how many are
// created per minute (10 and 10 on agents-641's pay-as-you-go tier, measured
// 21/10/2026). Past either, Sprites answers 429 concurrent_sprite_limit_exceeded
// or sprite_creation_rate_limited: the caller waits for a slot.
export class SpriteLimitError extends Error {
  constructor(text) {
    super(
      `limite de computadores ligados ao mesmo tempo: ${text.slice(0, 200)}`,
    );
    this.code = 'SPRITE_LIMIT';
  }
}

const isLimit = (status, text) =>
  status === 429 &&
  /concurrent_sprite_limit|sprite_creation_rate_limited/.test(text);

async function fetchSprites(path, init = {}, attempt = 0) {
  const response = await fetch(`${config.spritesApi}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.spritesToken}`,
      ...init.headers,
    },
  });
  if (RETRYABLE.has(response.status) && attempt < 4) {
    await Bun.sleep(500 * 2 ** attempt);
    return fetchSprites(path, init, attempt + 1);
  }
  if (!response.ok) {
    const text = await response.text();
    if (isLimit(response.status, text)) throw new SpriteLimitError(text);
    const error = new Error(
      `Sprites ${init.method || 'GET'} ${path}: ${response.status} ${text.slice(0, 300)}`,
    );
    error.status = response.status;
    throw error;
  }
  return response;
}

// Checkpoint and restore answer with an NDJSON stream; the last "complete" or
// "error" line is the outcome.
async function readNdjsonOutcome(response) {
  const lines = (await response.text())
    .split('\n')
    .filter(Boolean)
    .map((line) => JSON.parse(line));
  const failure = lines.find((line) => line.type === 'error');
  if (failure) throw new Error(failure.error || 'falha sem descrição');
  return lines;
}

export async function createSprite(name) {
  const response = await fetchSprites('/v1/sprites', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name }),
  });
  return response.json();
}

export async function fetchSprite(name) {
  const response = await fetchSprites(`/v1/sprites/${name}`);
  return response.json();
}

export async function deleteSprite(name) {
  if (useLocal(name)) return;
  try {
    await fetchSprites(`/v1/sprites/${name}`, { method: 'DELETE' });
  } catch (error) {
    if (error.status !== 404) throw error;
  }
}

export async function writeFile(name, filePath, content) {
  if (useLocal(name)) return writeLocalFile(filePath, content);
  await fetchSprites(
    `/v1/sprites/${name}/fs/write?path=${encodeURIComponent(filePath)}&mkdir=true`,
    {
      method: 'PUT',
      body: content,
    },
  );
}

export async function readFile(name, filePath) {
  if (useLocal(name)) return readLocalFile(filePath);
  const response = await fetchSprites(
    `/v1/sprites/${name}/fs/read?path=${encodeURIComponent(filePath)}`,
  );
  return Buffer.from(await response.arrayBuffer());
}

const END_MARK = '@@ASSISTANT-END@@';

// The exec endpoint frames stdout, stderr and the exit code with one marker
// byte per write and no lengths, so its stream cannot be split reliably. The
// command runs inside a wrapper that prints the exit code and base64 of the
// combined output; base64 never contains the marker bytes, which are dropped.
//
// The vault's keys (vault.js) come the same way, never in the URL: with
// ASSISTANT_SECRETS=1, the first line of stdin is base64 of the exports, read
// before the command, so they are in its environment and in no argument list.
const WRAPPER = `
if [ "\${ASSISTANT_SECRETS:-0}" = 1 ]; then IFS= read -r secrets; eval "$(printf '%s' "$secrets" | base64 -d)"; unset secrets; fi
cmd=$(cat)
cd "\${ASSISTANT_CWD:-/home/sprite/workspace}" 2>/dev/null || cd /home/sprite
out=$(timeout --kill-after=5 "\${ASSISTANT_TIMEOUT:-120}" bash -lc "$cmd" 2>&1 </dev/null)
code=$?
printf '%s\\n' "$code"
printf '%s' "$out" | head -c "\${ASSISTANT_MAX_BYTES:-60000}" | base64 -w0
printf '\\n%s' '${END_MARK}'
`;

const shellQuote = (value) => `'${String(value).replace(/'/g, `'\\''`)}'`;

/** The vault as the wrapper's first line: base64 of `export NAME='value'` lines. */
export function secretsLine(secrets) {
  const exports = Object.entries(secrets)
    .filter(([key]) => /^[A-Z][A-Z0-9_]*$/.test(key))
    .map(([key, value]) => `export ${key}=${shellQuote(value)}`)
    .join('\n');
  return Buffer.from(exports).toString('base64');
}

export async function runCommand(
  name,
  command,
  { timeoutSeconds = 120, cwd, maxBytes = 60000, secrets = null } = {},
) {
  if (useLocal(name))
    return runLocalCommand(command, { timeoutSeconds, cwd, maxBytes, secrets });
  const params = new URLSearchParams();
  for (const part of ['bash', '-c', WRAPPER]) params.append('cmd', part);
  params.set('stdin', 'true');
  params.append('env', `ASSISTANT_TIMEOUT=${timeoutSeconds}`);
  params.append('env', `ASSISTANT_MAX_BYTES=${maxBytes}`);
  if (cwd) params.append('env', `ASSISTANT_CWD=${cwd}`);
  const hasSecrets = secrets && Object.keys(secrets).length > 0;
  if (hasSecrets) params.append('env', 'ASSISTANT_SECRETS=1');

  // Bun's fetch gives up after 300 seconds by default, which cut computer_job_wait
  // (up to 840) in half; the command's own limit, plus slack, is the one that counts.
  const response = await fetchSprites(`/v1/sprites/${name}/exec?${params}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/octet-stream' },
    body: hasSecrets ? `${secretsLine(secrets)}\n${command}` : command,
    timeout: false,
    signal: AbortSignal.timeout((timeoutSeconds + 90) * 1000),
  });
  const raw = Buffer.from(await response.arrayBuffer()).toString('latin1');
  // The terminal's control bytes are stripped on purpose.
  // eslint-disable-next-line no-control-regex
  const clean = raw.replace(/[\x00-\x08]/g, '');
  const endIndex = clean.lastIndexOf(END_MARK);
  if (endIndex === -1)
    throw new Error('o computador não devolveu o resultado do comando');

  const lines = clean.slice(0, endIndex).split('\n');
  // bash -l on the Sprite prints readline warnings to stderr before the
  // wrapper starts; the exit code is the second-to-last line.
  const encoded = lines.at(-2) ?? '';
  const exitCode = Number(lines.at(-3));
  const output = Buffer.from(encoded.trim(), 'base64')
    .toString('utf8')
    .replace(
      /^.*\.bashrc: line \d+: bind: warning: line editing not enabled\n?/gm,
      '',
    );
  return { exitCode, output, isTimedOut: exitCode === 124 || exitCode === 137 };
}

export async function createCheckpoint(name, comment) {
  if (useLocal(name)) return null;
  const response = await fetchSprites(`/v1/sprites/${name}/checkpoint`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ comment }),
  });
  const lines = await readNdjsonOutcome(response);
  const idLine = lines
    .map((line) => line.data || '')
    .find((text) => /ID:\s*\S+/.test(text));
  return idLine?.match(/ID:\s*(\S+)/)?.[1] ?? null;
}

export async function listCheckpoints(name) {
  if (useLocal(name)) return [];
  const response = await fetchSprites(`/v1/sprites/${name}/checkpoints`);
  const list = await response.json();
  return list.filter((checkpoint) => checkpoint.id !== 'Current');
}

export async function restoreCheckpoint(name, checkpointId) {
  if (useLocal(name)) return;
  const response = await fetchSprites(
    `/v1/sprites/${name}/checkpoints/${checkpointId}/restore`,
    { method: 'POST' },
  );
  await readNdjsonOutcome(response);
}

// Opens a websocket to a path served by the bot's computer service. The org
// token goes in a header, which Bun's WebSocket accepts.
export function openSpriteSocket(spriteUrl, path) {
  const socket = new WebSocket(`${spriteUrl.replace(/^http/, 'ws')}${path}`, {
    headers: { Authorization: `Bearer ${config.spritesToken}` },
  });
  socket.binaryType = 'arraybuffer';
  return socket;
}

export async function fetchSpriteHttp(spriteUrl, path, init = {}) {
  const response = await fetch(`${spriteUrl}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${config.spritesToken}`,
      ...init.headers,
    },
  });
  if (response.status === 429) {
    const text = await response.clone().text();
    if (isLimit(429, text)) throw new SpriteLimitError(text);
  }
  return response;
}
