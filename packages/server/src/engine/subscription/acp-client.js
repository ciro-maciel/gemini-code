// A small Agent Client Protocol (ACP) client: JSON-RPC 2.0, one message per
// line, over a child process's stdin and stdout.
//
// ACP is the protocol editors use to drive coding agents
// (agentclientprotocol.com). The agent streams `session/update`
// notifications and asks the client before acting (`session/request_permission`),
// which is how Gemini Code keeps the last word over what an agent does.

/**
 * Wraps a spawned agent process. Returns { request, notify, onRequest,
 * onNotification, close }.
 */
export function createAcpClient(child) {
  let buffer = '';
  let nextId = 0;
  const pending = new Map();
  const requestHandlers = new Map();
  const notificationHandlers = new Map();
  let closedError = null;

  const write = (message) =>
    child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', ...message })}\n`);

  const handle = async (message) => {
    if (message.id !== undefined && !message.method) {
      const waiter = pending.get(message.id);
      if (!waiter) return;
      pending.delete(message.id);
      if (message.error)
        waiter.reject(
          Object.assign(new Error(message.error.message || 'ACP error'), {
            code: message.error.code,
            data: message.error.data,
          }),
        );
      else waiter.resolve(message.result);
      return;
    }
    if (message.method && message.id !== undefined) {
      const handler = requestHandlers.get(message.method);
      if (!handler) {
        write({
          id: message.id,
          error: {
            code: -32601,
            message: `method not found: ${message.method}`,
          },
        });
        return;
      }
      try {
        write({
          id: message.id,
          result: (await handler(message.params)) ?? null,
        });
      } catch (error) {
        write({
          id: message.id,
          error: { code: -32603, message: error.message },
        });
      }
      return;
    }
    if (message.method)
      notificationHandlers.get(message.method)?.(message.params);
  };

  child.stdout.on('data', (chunk) => {
    buffer += chunk;
    const lines = buffer.split('\n');
    buffer = lines.pop();
    for (const line of lines) {
      if (!line.trim()) continue;
      let message;
      try {
        message = JSON.parse(line);
      } catch {
        continue;
      }
      handle(message);
    }
  });

  const failAll = (error) => {
    closedError = error;
    for (const waiter of pending.values()) waiter.reject(error);
    pending.clear();
  };
  child.on('close', (code) =>
    failAll(new Error(`the agent process exited (${code})`)),
  );
  child.on('error', (error) => failAll(error));

  return {
    request(method, params) {
      if (closedError) return Promise.reject(closedError);
      const id = ++nextId;
      return new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject });
        write({ id, method, params });
      });
    },
    notify(method, params) {
      write({ method, params });
    },
    onRequest(method, handler) {
      requestHandlers.set(method, handler);
    },
    onNotification(method, handler) {
      notificationHandlers.set(method, handler);
    },
    close() {
      child.kill('SIGTERM');
    },
  };
}
