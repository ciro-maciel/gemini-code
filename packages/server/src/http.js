// The house API contract: the resource at the root, collections as
// {items, page}, errors as {error:{code,message}} and never with a 200.
// → infrastructure/docs/2026-09-09-api-contract.md

export class HttpError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export const notFound = (message = 'not found') =>
  new HttpError(404, 'NOT_FOUND', message);
export const invalid = (message, details) =>
  new HttpError(400, 'VALIDATION_ERROR', message, details);
export const conflict = (message) => new HttpError(409, 'CONFLICT', message);

export function json(body, status = 200) {
  return Response.json(body, { status });
}

export function fail(error) {
  if (error instanceof HttpError) {
    return Response.json(
      {
        error: {
          code: error.code,
          message: error.message,
          ...(error.details ? { details: error.details } : {}),
        },
      },
      { status: error.status },
    );
  }
  console.error(error);
  return Response.json(
    {
      error: {
        code: 'INTERNAL_ERROR',
        message: 'internal error; the details are in the log',
      },
    },
    { status: 500 },
  );
}

export function readPage(url, fallbackLimit = 50) {
  const limit = Math.min(
    Math.max(Number(url.searchParams.get('limit')) || fallbackLimit, 1),
    200,
  );
  const offset = Math.max(Number(url.searchParams.get('offset')) || 0, 0);
  return { limit, offset };
}

export function collection(items, { limit, offset }, total) {
  return {
    items,
    page: { limit, offset, total, hasMore: offset + items.length < total },
  };
}

export async function readBody(req) {
  try {
    return await req.json();
  } catch {
    throw invalid('the body must be JSON');
  }
}

/** Tiny router: '/api/bots/:id/tasks' → { id }. */
export function createRouter() {
  const routes = [];
  const add = (method) => (pattern, handler) => {
    const keys = [];
    const regex = new RegExp(
      '^' +
        pattern.replace(/:([a-zA-Z]+)/g, (_, key) => {
          keys.push(key);
          return '([^/]+)';
        }) +
        '$',
    );
    routes.push({ method, regex, keys, handler });
  };
  return {
    get: add('GET'),
    post: add('POST'),
    patch: add('PATCH'),
    put: add('PUT'),
    delete: add('DELETE'),
    match(method, pathname) {
      for (const route of routes) {
        if (route.method !== method) continue;
        const found = pathname.match(route.regex);
        if (!found) continue;
        const params = Object.fromEntries(
          route.keys.map((key, index) => [
            key,
            decodeURIComponent(found[index + 1]),
          ]),
        );
        return { handler: route.handler, params };
      }
      return null;
    },
  };
}
