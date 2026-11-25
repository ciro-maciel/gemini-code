import { db, now } from './db.js'
import { decrypt, encrypt } from './secrets.js'
import { call, codeOf } from 'assistant-navigation/client'

// The person's own Chrome, driven by their agents (30/10/2026), through Assistant Navigation
// (open-source/assistant-navigation, github.com/ciro-maciel/assistant-navigation): the extension holds a tunnel under an id
// it made once, and its connection code, pasted once in Meu Chrome, is kept here encrypted. Each
// call dials that code and waits for the answer. No debugger, so Chrome shows no bar.

// One request through the tunnel; tests hand a fake.
// Assistant Navigation answers in English; the person reads Portuguese.
const IN_PORTUGUESE = [
    [/^the browser is closed or Assistant Navigation is turned off$/, 'o Chrome está fechado ou o Assistant Navigation está desligado (recarregue a extensão em chrome://extensions se ela mostra Conectado)'],
    [/^the browser did not answer in (\d+) s$/, 'o Chrome não respondeu em $1 s'],
    [/^the tunnel closed/, 'a conexão com o Chrome caiu'],
]
const inPortuguese = error => {
    for (const [pattern, text] of IN_PORTUGUESE) if (pattern.test(error.message)) return new Error(error.message.replace(pattern, text))
    return error
}

let dial = (url, request, timeoutMs) =>
    call(url, request.method, request.params, timeoutMs).catch(error => {
        throw inPortuguese(error)
    })

export function useDial(fake) {
    dial = fake
}

/** A Assistant Navigation connection code, over TLS only, or null. */
export const tunnelOf = text => {
    const code = codeOf(text)
    return code?.startsWith('wss://') ? code : null
}

const rowOf = accountId => db.query('SELECT * FROM user_browsers WHERE account_id = ?').get(accountId)

export function userBrowserOf(accountId) {
    const row = rowOf(accountId)
    return row ? { isLinked: true, linkedAt: row.created_at } : { isLinked: false }
}

/** Asks the person's Chrome for something (chrome-tools.js lists what). */
export async function callUserBrowser(accountId, method, params = {}, { timeoutMs = 45_000 } = {}) {
    const row = rowOf(accountId)
    if (!row) throw new Error('o Chrome desta conta não está ligado: ligue em Configurações, Meu Chrome')
    return dial(await decrypt(row.tunnel), { id: crypto.randomUUID(), method, params }, timeoutMs)
}

/** Keeps the tunnel URL (encrypted) once the extension answers through it. */
export async function linkUserBrowser(accountId, pasted) {
    const tunnel = tunnelOf(pasted)
    if (!tunnel) throw new Error('isso não é um código de conexão do Assistant Navigation: copie o código na janela da extensão (começa com wss:// e termina com /extension)')
    await dial(tunnel, { id: crypto.randomUUID(), method: 'ping', params: {} }, 15_000)
    db.query('INSERT INTO user_browsers (account_id, tunnel, session_id, created_at) VALUES (?, ?, NULL, ?) ON CONFLICT (account_id) DO UPDATE SET tunnel = excluded.tunnel, created_at = excluded.created_at').run(accountId, await encrypt(tunnel), now())
    return userBrowserOf(accountId)
}

export function unlinkUserBrowser(accountId) {
    return db.query('DELETE FROM user_browsers WHERE account_id = ?').run(accountId).changes > 0
}
