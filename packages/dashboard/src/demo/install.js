// Puts the fake control server between the panel and the network: every
// fetch, EventSource and WebSocket to /api is answered here, in the browser.
// Anything else (the page's own files, fonts) goes through untouched.

import { createFakeApi } from './fake-api.js'

const PING_MS = 10_000

/** Whether a URL is one of the control server's routes. */
export function isApiUrl(url, origin = globalThis.location?.origin ?? 'http://demo.invalid') {
    try {
        return new URL(String(url), origin).pathname.startsWith('/api/')
    } catch {
        return false
    }
}

async function readBody(init) {
    const body = init?.body
    if (body === undefined || body === null) return undefined
    if (typeof body !== 'string') return undefined
    try {
        return JSON.parse(body)
    } catch {
        return undefined
    }
}

export function installDemo(target = window) {
    const api = createFakeApi()
    const realFetch = target.fetch.bind(target)
    const origin = target.location.origin

    target.fetch = async (input, init = {}) => {
        const url = typeof input === 'string' || input instanceof URL ? String(input) : input.url
        if (!isApiUrl(url, origin)) return realFetch(input, init)
        const method = init.method || (typeof input === 'object' && 'method' in input ? input.method : 'GET')
        const answer = api.handle(method, new URL(url, origin).href, await readBody(init))
        const isText = typeof answer.body === 'string'
        // A short wait, as a real round trip has: the loading states get their moment.
        await new Promise(resolve => setTimeout(resolve, 60))
        return new Response(isText ? answer.body : JSON.stringify(answer.body), {
            status: answer.status,
            headers: { 'Content-Type': answer.type || 'application/json' },
        })
    }

    const RealEventSource = target.EventSource
    class DemoEventSource extends EventTarget {
        constructor(url, options) {
            if (!isApiUrl(url, origin)) return new RealEventSource(url, options)
            super()
            this.url = String(url)
            this.readyState = 1
            this.onmessage = null
            this.onerror = null
            this.onopen = null
            const { pathname, searchParams } = new URL(this.url, origin)
            const deliver = event => {
                if (this.readyState === 2) return
                const message = new MessageEvent('message', { data: JSON.stringify(event) })
                this.onmessage?.(message)
                this.dispatchEvent(message)
            }
            const bot = pathname.match(/^\/api\/bots\/([^/]+)\/stream$/)
            const channel = bot ? `bot:${bot[1]}` : pathname === '/api/stream' ? 'account' : null
            this.unsubscribe = channel ? api.subscribe(channel, deliver) : () => {}
            if (bot) {
                const missed = api.eventsAfter(bot[1], Number(searchParams.get('after')) || 0)
                setTimeout(() => missed.forEach(deliver), 0)
            }
            this.ping = setInterval(() => this.dispatchEvent(new Event('ping')), PING_MS)
            setTimeout(() => this.onopen?.(new Event('open')), 0)
        }
        close() {
            this.readyState = 2
            this.unsubscribe?.()
            clearInterval(this.ping)
        }
    }
    target.EventSource = DemoEventSource

    // The live screen of an agent's computer is a socket; in the demo there is no computer, so it closes at once.
    const RealWebSocket = target.WebSocket
    class DemoWebSocket extends EventTarget {
        constructor(url, protocols) {
            const isApi = (() => {
                try {
                    return new URL(String(url)).pathname.startsWith('/api/')
                } catch {
                    return false
                }
            })()
            if (!isApi) return new RealWebSocket(url, protocols)
            super()
            this.url = String(url)
            this.readyState = 3
            this.binaryType = 'blob'
            this.protocol = ''
            this.bufferedAmount = 0
            setTimeout(() => {
                const closed = new CloseEvent('close', { code: 1000, reason: 'demonstração sem computador', wasClean: true })
                this.onclose?.(closed)
                this.dispatchEvent(closed)
            }, 0)
        }
        send() {}
        close() {}
    }
    Object.assign(DemoWebSocket, { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 })
    target.WebSocket = DemoWebSocket

    return api
}
