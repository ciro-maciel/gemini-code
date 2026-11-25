import { TOKEN_STORAGE_KEY } from '../auth/AuthContext';

// The only door from the panel to the control server. In production the API
// is VITE_API_URL (for example the optional worker in front of a cloud
// control server); in development it is empty and Vite's proxy forwards /api.
export const API_URL = (import.meta.env.VITE_API_URL || '').replace(/\/+$/, '');

/**
 * Auth's token, read at request time: the AuthProvider writes and clears it,
 * and reading it once would keep a signed-out session's token alive.
 */
export function authToken() {
  try {
    return localStorage.getItem(TOKEN_STORAGE_KEY);
  } catch {
    return null;
  }
}

// What a browser loads by itself (an event stream, a socket, a link) cannot
// carry a header, so the token rides in the address.
function withToken(path) {
  const token = authToken();
  if (!token) return `${API_URL}${path}`;
  return `${API_URL}${path}${path.includes('?') ? '&' : '?'}token=${encodeURIComponent(token)}`;
}

const unauthorizedListeners = new Set();

/** The panel signs out when the server stops accepting the session. */
export function onUnauthorized(listener) {
  unauthorizedListeners.add(listener);
  return () => unauthorizedListeners.delete(listener);
}

// Every failure says what to do next (04/11/2026): the central's own words when
// it gave them; otherwise what the status means and the next step. The browser's
// "Failed to fetch" never reaches the screen.
export function failureText(status) {
  if (status === 413)
    return 'The file is too large. Send a smaller one or split it into parts.';
  if (status === 429)
    return 'Too many requests in a row. Wait a few seconds and try again.';
  if (status >= 500)
    return `The server failed to respond (error ${status}). Try again in a moment; if it happens again, reload the page.`;
  return `The server rejected the request (error ${status}). Reload the page and try again.`;
}

export async function reach(url, init) {
  try {
    return await fetch(url, init);
  } catch (error) {
    if (error?.name === 'AbortError') throw error;
    throw Object.assign(
      new Error(
        "Can't reach the server. Check your internet connection; you can try again once it's back.",
      ),
      { code: 'OFFLINE', status: 0 },
    );
  }
}

async function request(method, path, body) {
  const token = authToken();
  const headers = {};
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;
  const response = await reach(`${API_URL}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await response.json().catch(() => null);
  if (!response.ok) {
    if (response.status === 401)
      for (const listener of unauthorizedListeners) listener();
    const error = new Error(
      data?.error?.message || failureText(response.status),
    );
    error.code = data?.error?.code;
    error.status = response.status;
    throw error;
  }
  return data;
}

// A body that is not JSON: a file, an audio recording.
async function send(method, path, body, headers = {}) {
  const token = authToken();
  const response = await reach(`${API_URL}${path}`, {
    method,
    headers: {
      ...headers,
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body,
  });
  if (!response.ok) {
    const data = await response.json().catch(() => null);
    if (response.status === 401)
      for (const listener of unauthorizedListeners) listener();
    const error = new Error(
      data?.error?.message || failureText(response.status),
    );
    error.code = data?.error?.code;
    error.status = response.status;
    throw error;
  }
  return response;
}

export const fetchMe = () => request('GET', '/api/me');
export const saveFirstWish = (wish) => request('PUT', '/api/me/wish', { wish });
export const fetchAccounts = () => request('GET', '/api/accounts');
export const updateAccount = (id, fields) =>
  request('PATCH', `/api/accounts/${id}`, fields);

export const fetchBots = () => request('GET', '/api/bots');
export const markBotRead = (id) => request('POST', `/api/bots/${id}/read`, {});
export const markBotUnread = (id) => request('DELETE', `/api/bots/${id}/read`);
export const askSideQuestion = (id, question) =>
  request('POST', `/api/bots/${id}/side-question`, { question });
export const fetchBookmarks = (id) =>
  request('GET', `/api/bots/${id}/bookmarks`).then((data) => data.items);
export const addBookmark = (id, eventId) =>
  request('PUT', `/api/bots/${id}/bookmarks/${eventId}`, {}).then(
    (data) => data.items,
  );
export const removeBookmark = (id, eventId) =>
  request('DELETE', `/api/bots/${id}/bookmarks/${eventId}`).then(
    (data) => data.items,
  );
export const fetchBranches = (id) =>
  request('GET', `/api/bots/${id}/branches`).then((data) => data.items);
export const fetchBranch = (id, branchId) =>
  request('GET', `/api/bots/${id}/branches/${branchId}`);
export const createBot = (fields) => request('POST', '/api/bots', fields);
export const designBot = (description) =>
  request('POST', '/api/bots/design', { description });
export const updateBot = (id, fields) =>
  request('PATCH', `/api/bots/${id}`, fields);
export const deleteBot = (id) => request('DELETE', `/api/bots/${id}`);
export const fetchSections = () => request('GET', '/api/sections');
export const createSection = (name) =>
  request('POST', '/api/sections', { name });
// A section is addressed by its id; its name is only the label.
export const reorderSections = (sectionIds) =>
  request('PUT', '/api/sections', { sectionIds });
export const reorderSection = (sectionId, botIds) =>
  request('PUT', '/api/sections/order', { sectionId, botIds });
export const renameSection = (sectionId, name) =>
  request('PATCH', `/api/sections/${sectionId}`, { name });
export const deleteSection = (sectionId) =>
  request('DELETE', `/api/sections/${sectionId}`);
export const provisionBot = (id) =>
  request('POST', `/api/bots/${id}/provision`);

export const fetchConversation = (botId, { before, after } = {}) =>
  request(
    'GET',
    `/api/bots/${botId}/conversation${before ? `?before=${before}` : after ? `?after=${after}` : ''}`,
  );
export const fetchThread = (botId) =>
  request('GET', `/api/bots/${botId}/thread`);
export const sendBotMessage = (
  botId,
  text,
  attachmentIds = [],
  { isQueued = false, context = [] } = {},
) =>
  request('POST', `/api/bots/${botId}/messages`, {
    text,
    ...(attachmentIds.length ? { attachmentIds } : {}),
    ...(isQueued ? { isQueued } : {}),
    ...(context.length ? { context } : {}),
  });
export const removeQueued = (botId, queuedId) =>
  request('DELETE', `/api/bots/${botId}/queue/${queuedId}`);

/** The account's stream: calls back with the ids of the agents that changed; reopens by itself. */
export function streamAccount(onChange) {
  let source = null;
  let isClosed = false;
  const open = () => {
    source = new EventSource(withToken('/api/stream'));
    source.onmessage = (message) => {
      const event = JSON.parse(message.data);
      // A commit on the account's repository: the files are read again, the agents are not.
      if (event.type === 'repo')
        return window.dispatchEvent(new Event('assistant:repo'));
      // A file changed in an agent folder: the tree of that agent reads itself again.
      if (event.type === 'files_changed')
        return window.dispatchEvent(
          new CustomEvent('gemini:files', { detail: { botId: event.botId } }),
        );
      onChange(event.botIds ?? []);
    };
    source.onerror = () => {
      source.close();
      if (!isClosed) setTimeout(open, 3000);
    };
  };
  open();
  return () => {
    isClosed = true;
    source?.close();
  };
}

export const writeNote = (botId, text) =>
  request('POST', `/api/bots/${botId}/notes`, { text });
export const sendNote = (botId, eventId) =>
  request('POST', `/api/bots/${botId}/notes/${eventId}/send`);
export const fetchPush = () => request('GET', '/api/push');
export const savePush = (subscription) =>
  request('PUT', '/api/push', subscription);
export const removePush = (endpoint) =>
  request('DELETE', '/api/push', { endpoint });
export const fetchPeople = () => request('GET', '/api/people');
export const fetchHandoffs = (botId) =>
  request('GET', `/api/bots/${botId}/handoffs`);
export const searchMemories = (query) =>
  request('GET', `/api/memories?q=${encodeURIComponent(query)}`);
export const shareAgent = (botId, email, access) =>
  request('PUT', `/api/bots/${botId}/members`, { email, access });
export const unshareAgent = (botId, email) =>
  request('DELETE', `/api/bots/${botId}/members/${encodeURIComponent(email)}`);

export function uploadAttachment(botId, file) {
  const form = new FormData();
  form.append('file', file, file.name);
  return send('POST', `/api/bots/${botId}/attachments`, form).then((response) =>
    response.json(),
  );
}
/** Files sent into a folder of the person's repository: one commit. */
export function uploadRepoFiles(folder, files) {
  const form = new FormData();
  form.append('folder', folder || '');
  for (const file of files) form.append('file', file, file.name);
  return send('POST', '/api/files/upload', form).then((response) =>
    response.json(),
  );
}
export const renameRepoFolder = (from, to) =>
  request('POST', '/api/files/rename', { from, to });
export const attachmentUrl = (botId, attachmentId) =>
  withToken(`/api/bots/${botId}/attachments/${attachmentId}`);

// While the control server restarts (a deploy), the worker answers 502 for a
// few seconds: voice calls try again instead of losing what was said.
async function sendWithRetry(...args) {
  for (let attempt = 0; ; attempt++) {
    try {
      return await send(...args);
    } catch (error) {
      if (attempt >= 4 || ![502, 503, 504].includes(error.status)) throw error;
      await new Promise((resolve) => setTimeout(resolve, 1500 * (attempt + 1)));
    }
  }
}

// With the bot, the names it may hear (the person's, the bot's) go along as hints.
export const transcribe = (wav, botId) =>
  sendWithRetry(
    'POST',
    `/api/transcribe${botId ? `?botId=${botId}` : ''}`,
    wav,
    { 'Content-Type': 'audio/wav' },
  ).then((response) => response.json());
export const fetchUserBrowser = () => request('GET', '/api/user-browser');
export const linkUserBrowser = (pasted) =>
  request('PUT', '/api/user-browser', { pasted });
export const unlinkUserBrowser = () => request('DELETE', '/api/user-browser');
export const releaseContext = (botId) =>
  request('POST', `/api/bots/${botId}/context/release`);
export const speak = (text) =>
  sendWithRetry('POST', '/api/speech', JSON.stringify({ text }), {
    'Content-Type': 'application/json',
  }).then((response) => response.blob());

export const startTeaching = (botId, name) =>
  request('POST', `/api/bots/${botId}/teach/start`, { name });
export const cancelTeaching = (botId) =>
  request('POST', `/api/bots/${botId}/teach/cancel`, {});
export function finishTeaching(botId, narration) {
  const form = new FormData();
  if (narration) form.append('narration', narration, 'narracao.wav');
  return send('POST', `/api/bots/${botId}/teach/stop`, form).then((response) =>
    response.json(),
  );
}
export const fetchSkills = (botId) =>
  request('GET', `/api/bots/${botId}/skills`);
export const updateSkill = (id, fields) =>
  request('PATCH', `/api/skills/${id}`, fields);
export const deleteSkill = (id) => request('DELETE', `/api/skills/${id}`);
export const resolveApproval = (taskId, approvalId, fields) =>
  request('POST', `/api/tasks/${taskId}/approvals/${approvalId}`, fields);
export const takeOverTask = (taskId) =>
  request('POST', `/api/tasks/${taskId}/takeover`, {});
export const answerTask = (taskId, text) =>
  request('POST', `/api/tasks/${taskId}/answer`, { text });
export const cancelTask = (taskId) =>
  request('POST', `/api/tasks/${taskId}/cancel`, {});
export const rewindTask = (taskId, eventId) =>
  request('POST', `/api/tasks/${taskId}/rewind`, { eventId });
export const previewRewind = (taskId, eventId) =>
  request(
    'GET',
    `/api/tasks/${taskId}/rewind-preview?eventId=${encodeURIComponent(eventId)}`,
  );
export const retryTask = (taskId) =>
  request('POST', `/api/tasks/${taskId}/retry`, {});

// The icons come from the API's host, which in production is not the panel's.
export const fetchApps = () =>
  request('GET', '/api/apps').then((data) => ({
    ...data,
    items: data.items.map((app) => ({
      ...app,
      icon: /^https?:/.test(app.icon) ? app.icon : `${API_URL}${app.icon}`,
    })),
  }));
export const fetchConnections = () => request('GET', '/api/connections');
export const searchRegistry = (query) =>
  request('GET', `/api/registry?query=${encodeURIComponent(query)}`);
export const createConnection = (fields) =>
  request('POST', '/api/connections', fields);
export const retryConnection = (id) =>
  request('POST', `/api/connections/${id}/connect`);
export const saveConnectionSecret = (id, fields) =>
  request('POST', `/api/connections/${id}/secret`, fields);
export const reauthorizeConnection = (id) =>
  request('POST', `/api/connections/${id}/reauthorize`);
export const abandonConnection = (id) =>
  request('POST', `/api/connections/${id}/abandon`);
export const deleteConnection = (id) =>
  request('DELETE', `/api/connections/${id}`);

export const fetchModels = () => request('GET', '/api/models');
export const fetchMascots = () => request('GET', '/api/mascots');
export const mascotUrl = (id) =>
  `${API_URL}/api/mascots/${encodeURIComponent(id)}`;

export const fetchRoutines = (botId) =>
  request('GET', `/api/bots/${botId}/routines`);
export const createRoutine = (botId, fields) =>
  request('POST', `/api/bots/${botId}/routines`, fields);
export const updateRoutine = (id, fields) =>
  request('PATCH', `/api/routines/${id}`, fields);
export const deleteRoutine = (id) => request('DELETE', `/api/routines/${id}`);

export const fetchFiles = (botId) => request('GET', `/api/bots/${botId}/files`);
// The agent folder, through the same routes as the files MCP (packages/server/src/agent-files.js).
export const fetchAgentTree = (botId, depth = 6) =>
  request('GET', `/api/bots/${botId}/fs/tree?depth=${depth}`);
export const readAgentFile = (botId, path) =>
  request('GET', `/api/bots/${botId}/fs/read?path=${encodeURIComponent(path)}`);
export const writeAgentFile = (botId, path, content) =>
  request('POST', `/api/bots/${botId}/fs/write`, {
    path,
    content,
    overwrite: true,
  });
export const makeAgentFolder = (botId, path) =>
  request('POST', `/api/bots/${botId}/fs/mkdir`, { path });
export const askDeleteAgentPath = (botId, path) =>
  request('DELETE', `/api/bots/${botId}/fs`, { path });
export const deleteAgentPath = (botId, path, code) =>
  request('DELETE', `/api/bots/${botId}/fs`, { path, confirm: true, code });

export const fileUrl = (botId, path) =>
  withToken(
    `/api/bots/${botId}/files/content?path=${encodeURIComponent(path)}`,
  );
export const pageCaptureUrl = (botId, captureId) =>
  withToken(`/api/bots/${botId}/pages/${captureId}`);

export const fetchTools = (botId) => request('GET', `/api/bots/${botId}/tools`);
export const setToolPolicy = (botId, name, policy) =>
  request('PUT', `/api/bots/${botId}/tools/${encodeURIComponent(name)}`, {
    policy,
  });

export const fetchMemories = (botId) =>
  request('GET', `/api/bots/${botId}/memories`);
export const createMemory = (botId, content) =>
  request('POST', `/api/bots/${botId}/memories`, { content });
export const updateMemory = (botId, memoryId, content) =>
  request('PATCH', `/api/bots/${botId}/memories/${memoryId}`, { content });
export const deleteMemory = (botId, memoryId) =>
  request('DELETE', `/api/bots/${botId}/memories/${memoryId}`);

// The vault: a bot's keys for its terminal. Only ids and names come back; a
// secret is changed and removed by its id, and its name is what commands read.
export const fetchSecrets = (botId) =>
  request('GET', `/api/bots/${botId}/secrets`);
export const createSecret = (botId, name, value) =>
  request('POST', `/api/bots/${botId}/secrets`, { name, value });
export const updateSecret = (botId, secretId, value) =>
  request('PATCH', `/api/bots/${botId}/secrets/${secretId}`, { value });
export const deleteSecret = (botId, secretId) =>
  request('DELETE', `/api/bots/${botId}/secrets/${secretId}`);

// The door: the address other systems post to.
export const fetchArtifactVersion = (botId, artifactId, versionId) =>
  request(
    'GET',
    `/api/bots/${botId}/artifacts/${artifactId}/versions/${versionId}`,
  );
export const chooseInArtifact = (botId, artifactId, versionId, choice) =>
  request(
    'POST',
    `/api/bots/${botId}/artifacts/${artifactId}/versions/${versionId}/choices`,
    choice,
  );
export const fetchInbox = (botId) => request('GET', `/api/bots/${botId}/inbox`);
export const rotateInbox = (botId) =>
  request('POST', `/api/bots/${botId}/inbox/rotate`);

export const fetchAiAccounts = () => request('GET', '/api/ai-accounts');
export const createAiAccount = ({ provider, name, token }) =>
  request('POST', '/api/ai-accounts', { provider, name, token });
export const fetchAiProviders = () => request('GET', '/api/ai-providers');
/** Every part of the system checked now (Settings › Diagnostics). */
export const fetchDiagnostics = () => request('GET', '/api/diagnostics');
export const fetchAvailableModels = (id) =>
  request('GET', `/api/ai-accounts/${id}/available-models`);
export const setAiAccountModels = (id, models) =>
  request('PATCH', `/api/ai-accounts/${id}`, { models });
export const fetchBrains = () => request('GET', '/api/brains');
export const deleteAiAccount = (id) =>
  request('DELETE', `/api/ai-accounts/${id}`);
export const fetchTemplates = () => request('GET', '/api/templates');
export const saveTemplate = (fields) =>
  request('POST', '/api/templates', fields);
export const updateTemplate = (id, fields) =>
  request('PATCH', `/api/templates/${id}`, fields);
export const fetchSkillLibrary = () => request('GET', '/api/skills');
export const setSkillUse = (botId, skillId, isUsed) =>
  request('PUT', `/api/bots/${botId}/skills/${skillId}`, { isUsed });
export const fetchRepoFiles = () => request('GET', '/api/files');
export const fetchRepoFile = (path) =>
  request('GET', `/api/files/content?path=${encodeURIComponent(path)}`);
export const fetchRepoHistory = (path) =>
  request('GET', `/api/files/history?path=${encodeURIComponent(path)}`);
export const fetchRepoDiff = (sha, path) =>
  request('GET', `/api/files/diff?sha=${sha}&path=${encodeURIComponent(path)}`);
export const saveRepoFile = (path, content) =>
  request('PUT', '/api/files', { path, content });
export const deleteRepoPath = (path) =>
  request('DELETE', `/api/files?path=${encodeURIComponent(path)}`);

// Agent documents: folder + files belonging to a specific agent.
export const fetchBotDocuments = (botId, { group, q } = {}) => {
  const params = new URLSearchParams();
  if (group && group !== 'all') params.set('group', group);
  if (q) params.set('q', q);
  const qs = params.toString();
  return request('GET', `/api/bots/${botId}/documents${qs ? `?${qs}` : ''}`);
};
export const createBotDocument = (botId, fields) =>
  request('POST', `/api/bots/${botId}/documents`, fields);
export const saveBotDocument = (botId, path, content) =>
  request('PUT', `/api/bots/${botId}/documents`, { path, content });
export function uploadBotDocuments(botId, folder, files) {
  const form = new FormData();
  if (folder) form.append('folder', folder);
  for (const file of files) form.append('file', file, file.name);
  return send('POST', `/api/bots/${botId}/documents/upload`, form).then(
    (response) => response.json(),
  );
}
export const deleteBotDocument = (botId, path) =>
  request(
    'DELETE',
    `/api/bots/${botId}/documents?path=${encodeURIComponent(path)}`,
  );
export const fetchDeliveries = () => request('GET', '/api/deliveries');
export const fetchCheckpoints = (botId) =>
  request('GET', `/api/bots/${botId}/checkpoints`);

// The trail of what the bot did that went through a judgment, and its export.
export const fetchAudit = (botId) =>
  request('GET', `/api/bots/${botId}/audit?limit=50`);
export async function downloadAudit(botId, format) {
  const response = await send(
    'GET',
    `/api/bots/${botId}/audit?format=${format}`,
  );
  const fileName =
    response.headers
      .get('content-disposition')
      ?.match(/filename="([^"]+)"/)?.[1] || `registro.${format}`;
  return { blob: await response.blob(), fileName };
}

// How many of the bot's approvals the person said yes to, in 7-day windows.
export const fetchApprovalRate = (botId) =>
  request('GET', `/api/bots/${botId}/approval-rate`);

// The owner's counts: approvals, takeovers, restores and failures.
export const fetchOutcomeMetrics = (days = 30) =>
  request('GET', `/api/metrics/outcomes?days=${days}`);
export const restoreCheckpoint = (botId, checkpointId) =>
  request('POST', `/api/bots/${botId}/checkpoints/${checkpointId}/restore`);

// A stream can die without an error: a proxy that keeps the browser's side open
// after the server went away, a laptop waking up. The server sends a ping every
// 10 s; 25 s of silence reopens the stream, and every reopening first asks the
// server for what was missed.
const SILENCE_MS = 25_000;

/**
 * Live events of a bot's conversation. Reconnects and catches up on its own.
 * An event's id is its UUID; `seq` is only its place, which is what "what came
 * after the last one I saw" asks for.
 */
export function streamBot(botId, afterSeq, onEvent) {
  let lastSeq = afterSeq;
  let source;
  let isClosed = false;
  let lastHeard = Date.now();

  const deliver = (event) => {
    if (event.seq && event.seq <= lastSeq) return;
    if (event.seq) lastSeq = event.seq;
    onEvent(event);
  };

  const catchUp = async () => {
    try {
      const { items } = await fetchConversation(botId, { after: lastSeq });
      items.forEach(deliver);
    } catch {}
  };

  const open = () => {
    source?.close();
    lastHeard = Date.now();
    source = new EventSource(
      withToken(`/api/bots/${botId}/stream?after=${lastSeq}`),
    );
    source.onmessage = (message) => {
      lastHeard = Date.now();
      deliver(JSON.parse(message.data));
    };
    source.addEventListener('ping', () => {
      lastHeard = Date.now();
    });
    source.onerror = () => {
      source.close();
      if (!isClosed) setTimeout(reopen, 2000);
    };
  };

  const reopen = () => {
    if (isClosed) return;
    open();
    catchUp();
  };

  const watchdog = setInterval(() => {
    if (Date.now() - lastHeard > SILENCE_MS) reopen();
  }, 5000);

  const onVisible = () => {
    if (document.visibilityState === 'visible') catchUp();
  };
  document.addEventListener('visibilitychange', onVisible);

  open();
  return {
    catchUp,
    close() {
      isClosed = true;
      clearInterval(watchdog);
      document.removeEventListener('visibilitychange', onVisible);
      source?.close();
    },
  };
}

export function screenSocketUrl(botId) {
  const base =
    API_URL || `${window.location.protocol}//${window.location.host}`;
  const path = withToken(`/api/bots/${botId}/screen`).slice(API_URL.length);
  return `${base.replace(/^http/, 'ws')}${path}`;
}
