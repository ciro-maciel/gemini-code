// Runs inside every bot's Sprite. It is the only HTTP service there: the Sprite
// URL routes here, and the Sprites proxy has already checked the org token before
// a request arrives. It bridges two sockets that only listen on localhost —
// Chrome's DevTools protocol (/cdp) and the VNC server of the virtual screen
// (/vnc) — and runs the browser tools (/browser/call, see browser.js).

import {
  callBrowserTool,
  closeSession,
  startRecording,
  stopRecording,
} from './browser.js';

const PORT = Number(process.env.PORT || 8080);
const CDP_PORT = Number(process.env.CDP_PORT || 9222);
const VNC_PORT = Number(process.env.VNC_PORT || 5900);

async function fetchBrowserSocketUrl() {
  const response = await fetch(`http://127.0.0.1:${CDP_PORT}/json/version`);
  if (!response.ok) throw new Error(`chrome answered ${response.status}`);
  const { webSocketDebuggerUrl } = await response.json();
  return webSocketDebuggerUrl;
}

async function isChromeReady() {
  try {
    await fetchBrowserSocketUrl();
    return true;
  } catch {
    return false;
  }
}

const server = Bun.serve({
  port: PORT,
  idleTimeout: 0,
  async fetch(req, server) {
    const { pathname } = new URL(req.url);

    if (pathname === '/health') {
      return Response.json({ isChromeReady: await isChromeReady() });
    }

    if (pathname === '/browser/call' && req.method === 'POST') {
      try {
        const { name, arguments: args } = await req.json();
        return Response.json(await callBrowserTool(name, args));
      } catch (error) {
        return Response.json({
          text: `erro no navegador: ${error.message}`,
          images: [],
          isError: true,
        });
      }
    }

    if (pathname === '/teach/start' && req.method === 'POST') {
      try {
        return Response.json(await startRecording());
      } catch (error) {
        return new Response(`não consegui gravar: ${error.message}`, {
          status: 500,
        });
      }
    }

    if (pathname === '/teach/stop' && req.method === 'POST') {
      return Response.json(stopRecording());
    }

    if (pathname === '/browser/close' && req.method === 'POST') {
      await closeSession();
      return Response.json({ isClosed: true });
    }

    if (pathname === '/cdp') {
      let target;
      try {
        target = await fetchBrowserSocketUrl();
      } catch (error) {
        return new Response(`navegador indisponível: ${error.message}`, {
          status: 503,
        });
      }
      if (server.upgrade(req, { data: { kind: 'cdp', target, queue: [] } }))
        return;
      return new Response('esperava websocket', { status: 426 });
    }

    if (pathname === '/vnc') {
      if (server.upgrade(req, { data: { kind: 'vnc', queue: [] } })) return;
      return new Response('esperava websocket', { status: 426 });
    }

    return new Response('não encontrado', { status: 404 });
  },
  websocket: {
    maxPayloadLength: 256 * 1024 * 1024,
    open(ws) {
      if (ws.data.kind === 'cdp') openCdp(ws);
      else openVnc(ws);
    },
    message(ws, message) {
      const upstream = ws.data.upstream;
      if (!upstream) {
        ws.data.queue.push(message);
        return;
      }
      if (ws.data.kind === 'cdp') upstream.send(message);
      else
        upstream.write(
          typeof message === 'string' ? Buffer.from(message) : message,
        );
    },
    close(ws) {
      const upstream = ws.data.upstream;
      if (!upstream) return;
      if (ws.data.kind === 'cdp') upstream.close();
      else upstream.end();
    },
  },
});

function openCdp(ws) {
  const upstream = new WebSocket(ws.data.target);
  upstream.binaryType = 'arraybuffer';
  upstream.onopen = () => {
    ws.data.upstream = upstream;
    for (const message of ws.data.queue) upstream.send(message);
    ws.data.queue = [];
  };
  upstream.onmessage = (event) => ws.send(event.data);
  upstream.onclose = () => ws.close();
  upstream.onerror = () => ws.close();
}

// The VNC server speaks raw TCP; noVNC speaks it over binary websocket frames.
async function openVnc(ws) {
  try {
    const upstream = await Bun.connect({
      hostname: '127.0.0.1',
      port: VNC_PORT,
      socket: {
        data(_socket, chunk) {
          ws.sendBinary(chunk);
        },
        close() {
          ws.close();
        },
        error() {
          ws.close();
        },
      },
    });
    ws.data.upstream = upstream;
    for (const message of ws.data.queue) upstream.write(message);
    ws.data.queue = [];
  } catch {
    ws.close();
  }
}

console.log(`computer listening on ${server.port}`);
