// The browser tools, run here in the bot's computer and not in the control
// server: each Playwright session holds a CDP connection and page snapshots,
// and a hundred of them in one control process was the first thing to give out.
// Here it costs the bot's own machine, and Chrome is one hop away on localhost.

import { createRequire } from 'node:module'
import { mkdirSync, readFileSync } from 'node:fs'
import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createConnection } from '@playwright/mcp'

// Playwright MCP checks the objects it receives against its own Playwright
// build, so the browser must come from the copy it depends on.
const requireFromMcp = createRequire(import.meta.resolve('@playwright/mcp'))
const { chromium } = requireFromMcp('playwright')

const CDP_URL = `http://127.0.0.1:${process.env.CDP_PORT || 9222}`
const OUTPUT_DIR = '/home/sprite/.browser-output'
const MAX_SNAPSHOT_CHARS = 30_000

// Element refs belong to a session: a new one numbers the page again. It
// outlives a long approval, and closing it never closes Chrome.
const IDLE_CLOSE_MS = 10 * 60 * 1000

let session = null
let idleTimer = null
let queue = Promise.resolve()

async function openSession() {
    mkdirSync(OUTPUT_DIR, { recursive: true })
    const browser = await chromium.connectOverCDP(CDP_URL, { timeout: 60_000 })
    const server = await createConnection(
        {
            capabilities: ['vision'],
            snapshot: { mode: 'full' },
            outputDir: OUTPUT_DIR,
            filePaths: 'absolute',
            imageResponses: 'allow',
        },
        async () => browser.contexts()[0] ?? (await browser.newContext())
    )
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
    await server.connect(serverSide)
    const client = new Client({ name: 'assistant-computer', version: '0.2.0' })
    await client.connect(clientSide)
    return { browser, client }
}

export async function closeSession() {
    clearTimeout(idleTimer)
    const current = session
    session = null
    try {
        await current?.client.close()
    } catch {}
}

async function ensureSession() {
    if (session?.browser.isConnected()) return session
    await closeSession()
    session = await openSession()
    return session
}

// Action tools write the page snapshot to a file and link it; the model needs
// it inline to pick the next element.
function formatResult(result) {
    const texts = []
    const images = []
    for (const part of result.content ?? []) {
        if (part.type === 'image') {
            images.push({ data: part.data, mimeType: part.mimeType || 'image/png' })
            continue
        }
        if (part.type !== 'text') continue
        texts.push(
            part.text.replace(/- \[Snapshot\]\(([^)]+)\)/g, (match, filePath) => {
                try {
                    const snapshot = readFileSync(filePath, 'utf8')
                    const cut = snapshot.length > MAX_SNAPSHOT_CHARS ? `${snapshot.slice(0, MAX_SNAPSHOT_CHARS)}\n[... página cortada; use browser_find para procurar o resto]` : snapshot
                    return '```yaml\n' + cut + '\n```'
                } catch {
                    return match
                }
            })
        )
    }
    return { text: texts.join('\n'), images, isError: Boolean(result.isError) }
}

/** One tool call at a time: the page is one, and refs depend on order. */
export function callBrowserTool(name, args) {
    const run = queue.then(async () => {
        clearTimeout(idleTimer)
        const { client } = await ensureSession()
        try {
            return formatResult(await client.callTool({ name, arguments: args ?? {} }))
        } finally {
            idleTimer = setTimeout(closeSession, IDLE_CLOSE_MS)
        }
    })
    queue = run.catch(() => {})
    return run
}

// --- Teaching: a person does the task once, the steps are written down -------
//
// The person drives Chrome through the live screen (VNC), so the page sees
// ordinary clicks and keys. A script in every page reports each one, with the
// element's role and visible name; secrets are masked here, in the page, and
// never leave the bot's computer in clear.

const RECORDER = `(() => {
    if (window.__assistantRecorder) return
    window.__assistantRecorder = true
    const report = step => { try { window.__assistantRecord(step) } catch {} }
    const SECRET = /pass|senha|otp|one-time|token|cvv|cvc|card|cartao|cartão|pin|code|codigo|código/i
    const text = value => String(value || '').replace(/\\s+/g, ' ').trim().slice(0, 80)
    const labelOf = el => {
        if (!el) return ''
        if (el.labels && el.labels[0]) return text(el.labels[0].innerText)
        return text(el.getAttribute('aria-label') || el.getAttribute('placeholder') || el.getAttribute('title') || el.name || el.id)
    }
    const isSecret = el => el.type === 'password' || SECRET.test([el.autocomplete, el.name, el.id, el.getAttribute('aria-label'), el.placeholder].join(' '))
    const interactive = 'a,button,input,select,textarea,summary,label,[role],[onclick],[tabindex]'
    addEventListener('click', event => {
        const el = event.target.closest(interactive) || event.target
        report({ type: 'click', tag: el.tagName.toLowerCase(), role: el.getAttribute('role') || '', name: text(el.getAttribute('aria-label') || el.innerText || el.value || el.title || el.alt) || labelOf(el), href: el.href || '', url: location.href })
    }, true)
    addEventListener('change', event => {
        const el = event.target
        if (!el.matches || !el.matches('input,textarea,select')) return
        const secret = isSecret(el)
        report({ type: 'fill', field: labelOf(el), value: secret ? '' : text(el.value), isSecret: secret, url: location.href })
    }, true)
    addEventListener('keydown', event => {
        if (event.key === 'Enter' || event.key === 'Tab' || event.key === 'Escape') report({ type: 'press', key: event.key, url: location.href })
    }, true)
})()`

const MAX_SHOTS = 15
const SHOT_EVERY_MS = 1500

let recording = null

async function onStep(page, step) {
    if (!recording) return
    const at = Date.now() - recording.startedAt
    recording.steps.push({ ...step, at })
    // A picture after the step, at most every second and a half.
    if (recording.shots.length < MAX_SHOTS && Date.now() - recording.lastShotAt > SHOT_EVERY_MS) {
        recording.lastShotAt = Date.now()
        try {
            await new Promise(resolve => setTimeout(resolve, 400))
            const shot = await page.screenshot({ type: 'jpeg', quality: 50 })
            recording.shots.push({ at, data: shot.toString('base64') })
        } catch {}
    }
}

function watchNavigation(page) {
    if (page.__assistantWatched) return
    page.__assistantWatched = true
    page.on('framenavigated', frame => {
        if (!recording || frame !== page.mainFrame()) return
        const url = frame.url()
        const last = recording.steps.findLast(step => step.type === 'navigate')
        if (last?.url === url || url === 'about:blank') return
        page.title()
            .catch(() => '')
            .then(title => onStep(page, { type: 'navigate', url, title }))
    })
}

export async function startRecording() {
    clearTimeout(idleTimer)
    const { browser } = await ensureSession()
    const context = browser.contexts()[0]
    if (!context.__assistantRecorder) {
        context.__assistantRecorder = true
        await context.exposeBinding('__assistantRecord', ({ page }, step) => onStep(page, step))
        await context.addInitScript(RECORDER)
        context.on('page', watchNavigation)
    }
    recording = { startedAt: Date.now(), steps: [], shots: [], lastShotAt: 0 }
    for (const page of context.pages()) {
        watchNavigation(page)
        await page.evaluate(RECORDER).catch(() => {})
    }
    return { startedAt: recording.startedAt }
}

export function stopRecording() {
    const done = recording
    recording = null
    idleTimer = setTimeout(closeSession, IDLE_CLOSE_MS)
    if (!done) return { steps: [], shots: [], durationMs: 0 }
    return { steps: done.steps, shots: done.shots, durationMs: Date.now() - done.startedAt }
}
