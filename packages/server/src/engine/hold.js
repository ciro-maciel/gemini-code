import { IS_IN_SPRITE } from '../config.js';

// A Sprite pauses about 30 s after the last activity, and a model call in
// flight is not activity. While any task runs, a Tasks API hold with a short
// expiry is refreshed every minute; when the last task stops, the hold is
// released and the Sprite may sleep. A crash lets the hold expire on its own.
const TASK_NAME = 'assistant-tasks';
const EXPIRE = '5m';
const REFRESH_MS = 60_000;

const running = new Set();
let timer = null;

async function callTasksApi(method, path, body) {
  if (!IS_IN_SPRITE) return;
  try {
    await fetch(`http://sprite${path}`, {
      method,
      unix: '/.sprite/api.sock',
      headers: { 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch (error) {
    console.error('tasks api', error.message);
  }
}

export function holdFor(taskId) {
  running.add(taskId);
  if (timer) return;
  const refresh = () =>
    callTasksApi('PUT', `/v1/tasks/${TASK_NAME}`, { expire: EXPIRE });
  refresh();
  timer = setInterval(refresh, REFRESH_MS);
}

export function releaseFor(taskId) {
  running.delete(taskId);
  if (running.size > 0 || !timer) return;
  clearInterval(timer);
  timer = null;
  callTasksApi('DELETE', `/v1/tasks/${TASK_NAME}`);
}
