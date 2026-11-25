import { expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-browser-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { db } = await import('./db.js')
const browser = await import('./user-browser.js')

const ID = 'a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6'
const CODE = `wss://tunnel.example.com/tunnel/${ID}/extension`

test('only a Assistant Navigation connection code over TLS is accepted', () => {
    expect(browser.tunnelOf(` ${CODE} `)).toBe(CODE)
    expect(browser.tunnelOf(`wss://my-own.workers.dev/tunnel/${ID}/extension`)).toBe(`wss://my-own.workers.dev/tunnel/${ID}/extension`)
    expect(browser.tunnelOf(`ws://localhost:8787/tunnel/${ID}/extension`)).toBeNull()
    expect(browser.tunnelOf('npx playwriter session new --remote abc')).toBeNull()
})

test('linking pings the Chrome first, keeps the tunnel encrypted, and each call carries its method', async () => {
    const sent = []
    browser.useDial(async (url, request) => {
        sent.push({ url, ...request })
        if (request.method === 'ping') return { isOn: true }
        if (request.method === 'read') return { title: 'Search Console', elements: [{ ref: 1 }] }
        throw new Error('pedido desconhecido')
    })
    expect(await browser.linkUserBrowser('acc-b', CODE)).toMatchObject({ isLinked: true })
    expect(db.query('SELECT tunnel FROM user_browsers WHERE account_id = ?').get('acc-b').tunnel).not.toContain(ID)
    expect(await browser.callUserBrowser('acc-b', 'read', { tabId: 7 })).toEqual({ title: 'Search Console', elements: [{ ref: 1 }] })
    expect(sent.map(item => [item.method, item.url === CODE, item.params])).toEqual([
        ['ping', true, {}],
        ['read', true, { tabId: 7 }],
    ])
    expect(browser.unlinkUserBrowser('acc-b')).toBe(true)
})

test('a Chrome that does not answer is not linked', async () => {
    browser.useDial(async () => {
        throw new Error('o Chrome desta conta está fechado ou a extensão Assistant no Chrome está desligada')
    })
    await expect(browser.linkUserBrowser('acc-c', CODE)).rejects.toThrow('fechado')
    expect(browser.userBrowserOf('acc-c')).toEqual({ isLinked: false })
    await expect(browser.callUserBrowser('acc-c', 'tabs')).rejects.toThrow('não está ligado')
})
