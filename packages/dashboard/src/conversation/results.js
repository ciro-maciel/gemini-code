// What the agent delivered, pinned under the conversation (04/11/2026): the
// links it gave, the pull requests it opened, the artifacts and files it
// handed over. Newest first, a few at most, each once.

const MAX_RESULTS = 8;
const URL_PATTERN = /https?:\/\/[^\s<>()[\]"'`]+/g;

// A link at the end of a sentence keeps no punctuation.
const cleanUrl = (url) => url.replace(/[.,;:!?*_]+$/, '');

// An id in an address (a UUID, a long token) says nothing to a person: it is shortened and never the name.
const isId = (segment) =>
  /^[0-9a-f]{8}-[0-9a-f-]{8,}$/i.test(segment) ||
  (segment.length >= 16 &&
    /\d/.test(segment) &&
    /^[A-Za-z0-9_-]+$/.test(segment));

/** A link as a person reads it: a short name, and where it is (host and path, ids shortened). */
export function describeUrl(url) {
  try {
    const { hostname, pathname } = new URL(url);
    const host = hostname.replace(/^www\./, '');
    const pull = pathname.match(/^\/([^/]+)\/([^/]+)\/pull\/(\d+)/);
    if (host === 'github.com' && pull)
      return { label: `PR #${pull[3]}`, detail: `${pull[1]}/${pull[2]}` };
    const segments = pathname
      .split('/')
      .filter(Boolean)
      .map((segment) => {
        try {
          return decodeURIComponent(segment);
        } catch {
          return segment;
        }
      });
    const shown = segments.map((segment) =>
      isId(segment) ? `${segment.slice(0, 8)}…` : segment,
    );
    const detail = `${host}${shown.length ? `/${shown.join('/')}` : ''}`;
    const named = segments.findLast((segment) => !isId(segment));
    const last = segments.at(-1);
    if (!last) return { label: host, detail: '' };
    if (isId(last))
      return { label: `${named ?? host} ${last.slice(0, 8)}`, detail };
    return { label: last, detail };
  } catch {
    return { label: url.slice(0, 40), detail: '' };
  }
}

// The same address written another way (www, a final slash, http) is the same result.
const sameAddress = (url) => {
  try {
    const { hostname, pathname, search } = new URL(url);
    return `${hostname.replace(/^www\./, '').toLowerCase()}${pathname.replace(/\/+$/, '')}${search}`;
  } catch {
    return url;
  }
};

// When it was delivered: the hour today, the day and the hour before (04/11/2026).
const twoDigits = (value) => String(value).padStart(2, '0');
export function deliveredAt(seconds, nowSeconds = Date.now() / 1000) {
  if (!seconds) return '';
  const date = new Date(seconds * 1000);
  const today = new Date(nowSeconds * 1000);
  const hour = `${twoDigits(date.getHours())}:${twoDigits(date.getMinutes())}`;
  const isToday = date.toDateString() === today.toDateString();
  return isToday
    ? hour
    : `${twoDigits(date.getDate())}/${twoDigits(date.getMonth() + 1)} ${hour}`;
}

const folderOf = (path) =>
  path
    .replace(/^\/home\/sprite\/workspace\/?/, '')
    .split('/')
    .slice(0, -1)
    .join('/') || 'workspace';

export function resultsOf(rows) {
  const found = [];
  const seen = new Set();
  const add = (item) => {
    if (seen.has(item.key) || found.length >= MAX_RESULTS) return;
    seen.add(item.key);
    found.push(item);
  };
  for (const row of [...rows].reverse()) {
    if (row.isPending) continue;
    if (row.kind === 'bot') {
      const urls = [...String(row.text || '').matchAll(URL_PATTERN)].map(
        (match) => cleanUrl(match[0]),
      );
      for (const url of urls.reverse())
        add({
          key: `link:${sameAddress(url)}`,
          kind: /github\.com\/[^/]+\/[^/]+\/pull\/\d+/.test(url)
            ? 'pull'
            : 'link',
          ...describeUrl(url),
          url,
          rowId: row.id,
          at: row.createdAt ?? null,
        });
    } else if (row.kind === 'artifact' && row.data?.artifactId) {
      add({
        key: `artifact:${row.data.artifactId}`,
        kind: 'artifact',
        label: row.data.title || 'Material',
        detail: 'Material na conversa',
        rowId: row.id,
        at: row.createdAt ?? null,
      });
    } else if (row.kind === 'files') {
      for (const file of row.files ?? [])
        add({
          key: `file:${file.path}`,
          kind: 'file',
          label: file.name || file.path.split('/').pop(),
          detail: `${folderOf(file.path)}/`,
          path: file.path,
          botId: row.botId,
          rowId: row.id,
          at: row.createdAt ?? null,
        });
    }
  }
  return found;
}
