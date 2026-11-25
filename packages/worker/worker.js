// The Assistant's public door and its alarm clock.
//
// The door: the worker's public address forwards /api/*, /oauth/callback
// and the bots' doors (/in/<address>) to the control server's Sprite. The Sprite URL stays private to the Fly
// organization; this Worker is the only holder of the org token outside it,
// and it moves the person's Auth token to X-Assistant-Authorization, because
// the Sprite takes the org token in Authorization. The control server checks
// the person's token itself — the Worker decides nothing about who gets in.
//
// The alarm: the control server sleeps with its Sprite when idle, and a
// sleeping process keeps no time. Every minute this Worker reads the next
// routine time the server left here (PUT /alarm/next) and, when it comes,
// calls the server's /api/wake. The call itself wakes the Sprite; the answer
// brings the time after that. A failed call is tried again the next minute: a
// routine is late by a minute, never lost.

const KEY = 'next'

const CLIENT_DOCUMENT_PATH = '/oauth/client.json'

const clientDocument = origin => ({
    client_id: `${origin}${CLIENT_DOCUMENT_PATH}`,
    client_name: 'Gemini Code',
    client_uri: origin,
    redirect_uris: [`${origin}/oauth/callback`],
    grant_types: ['authorization_code', 'refresh_token'],
    response_types: ['code'],
    token_endpoint_auth_method: 'none',
})

const json = (body, status = 200, headers = {}) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } })

const fail = (status, code, message, headers) => json({ error: { code, message } }, status, headers)

function corsHeaders(request, env) {
    const origin = request.headers.get('Origin')
    const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(entry => entry.trim())
    if (!origin || !allowed.includes(origin)) return {}
    return {
        'Access-Control-Allow-Origin': origin,
        'Access-Control-Allow-Credentials': 'true',
        'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type',
        'Access-Control-Max-Age': '86400',
        Vary: 'Origin',
    }
}

// `/in/<address>` is a bot's door (packages/server/src/inbox.js): another system posts
// there, and the address itself is the key, checked by the control server.
function isForwarded(pathname) {
    return pathname.startsWith('/api/') || pathname === '/oauth/callback' || /^\/in\/[^/]+$/.test(pathname)
}

function upstreamHeaders(request, env) {
    const headers = new Headers(request.headers)
    const personal = headers.get('Authorization')
    headers.delete('Authorization')
    headers.delete('X-Assistant-Authorization')
    // Only the alarm below may carry the wake secret.
    headers.delete('X-Wake-Secret')
    headers.delete('Host')
    if (personal) headers.set('X-Assistant-Authorization', personal)
    headers.set('Authorization', `Bearer ${env.SPRITES_TOKEN}`)
    return headers
}

async function forward(request, env, url) {
    const target = `${env.CONTROL_URL}${url.pathname}${url.search}`
    const headers = upstreamHeaders(request, env)

    // The live screen: the upstream socket's response is handed back as is.
    if (request.headers.get('Upgrade')?.toLowerCase() === 'websocket') {
        return fetch(target, { headers })
    }

    const upstream = await fetch(target, {
        method: request.method,
        headers,
        body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
        redirect: 'manual',
    })
    // The body streams through untouched: the event stream of a conversation
    // stays open for as long as the panel watches it.
    const response = new Response(upstream.body, upstream)
    for (const [name, value] of Object.entries(corsHeaders(request, env))) response.headers.set(name, value)
    return response
}

async function wakeControl(env) {
    const response = await fetch(`${env.CONTROL_URL}/api/wake`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${env.SPRITES_TOKEN}`, 'X-Wake-Secret': env.WAKE_SECRET },
    })
    if (!response.ok) throw new Error(`a central respondeu ${response.status}`)
    const { nextRunAt } = await response.json()
    if (nextRunAt) await env.ALARM.put(KEY, String(nextRunAt))
    else await env.ALARM.delete(KEY)
    return nextRunAt
}

export default {
    async fetch(request, env) {
        const url = new URL(request.url)
        const cors = corsHeaders(request, env)

        if (request.method === 'OPTIONS') return new Response(null, { status: 204, headers: cors })

        if (url.pathname === '/alarm/health') {
            const next = await env.ALARM.get(KEY)
            return json({ nextRunAt: next ? Number(next) : null })
        }
        if (url.pathname === '/alarm/next' && request.method === 'PUT') {
            if (request.headers.get('Authorization') !== `Bearer ${env.WAKE_SECRET}`) return fail(401, 'UNAUTHORIZED', 'token inválido')
            const { at } = await request.json()
            if (at) await env.ALARM.put(KEY, String(at))
            else await env.ALARM.delete(KEY)
            return json({ nextRunAt: at ?? null })
        }

        // Who the Assistant is to an MCP authorization server that takes a URL
        // as the client id (CIMD) instead of a registration, like the line's
        // Auth. Served here, so it answers while the control server sleeps.
        if (url.pathname === CLIENT_DOCUMENT_PATH && request.method === 'GET') {
            return json(clientDocument(url.origin), 200, { 'Cache-Control': 'public, max-age=3600' })
        }

        // The panel's Suporte measures `GET /`: it answers with the control
        // server's health, so the whole way (worker, Sprite, server) is measured.
        if (url.pathname === '/' && request.method === 'GET') url.pathname = '/api/health'

        if (!isForwarded(url.pathname)) return fail(404, 'NOT_FOUND', 'rota desconhecida', cors)
        try {
            return await forward(request, env, url)
        } catch (error) {
            console.error('forward', error.message)
            return fail(502, 'BAD_GATEWAY', 'a central não respondeu; tente de novo em instantes', cors)
        }
    },

    async scheduled(controller, env) {
        const next = Number(await env.ALARM.get(KEY))
        if (!next || Date.now() / 1000 < next) return
        try {
            const after = await wakeControl(env)
            console.log(`woke the control server; next ${after ?? 'none'}`)
        } catch (error) {
            console.error('wake', error.message)
        }
    },
}
