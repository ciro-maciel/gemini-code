import { Client } from '@modelcontextprotocol/sdk/client/index.js'
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js'
import { createConnection } from '@playwright/mcp'
import { fetchSpriteHttp } from '../sprites.js'

// The browser runs in the bot's own computer (packages/computer/browser.js): the
// control server only sends each tool call there. Holding a Playwright session
// per bot here was the control server's first ceiling.

// The browser tools the model sees. The rest of Playwright MCP's list either
// breaks the shared browser (close, resize) or runs arbitrary code outside the
// page (run_code_unsafe).
const EXPOSED_TOOLS = new Set([
    'browser_navigate',
    'browser_navigate_back',
    'browser_snapshot',
    'browser_click',
    'browser_type',
    'browser_press_key',
    'browser_hover',
    'browser_select_option',
    'browser_fill_form',
    'browser_file_upload',
    'browser_drag',
    'browser_handle_dialog',
    'browser_tabs',
    'browser_wait_for',
    'browser_take_screenshot',
    'browser_find',
    'browser_mouse_click_xy',
    'browser_mouse_wheel',
    'browser_evaluate',
    'browser_console_messages',
])

const CALL_TIMEOUT_MS = 180_000

/** One browser tool, run in the bot's computer. Returns { text, images, isError }. */
export async function callBrowserTool(bot, name, args) {
    if (!EXPOSED_TOOLS.has(name)) return { text: `ferramenta de navegador desconhecida: ${name}`, images: [], isError: true }
    const response = await fetchSpriteHttp(bot.spriteUrl, '/browser/call', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, arguments: args }),
        signal: AbortSignal.timeout(CALL_TIMEOUT_MS),
    })
    if (!response.ok) throw new Error(`o computador respondeu ${response.status}`)
    return response.json()
}

/** Lets go of the page refs without closing Chrome (before a restore). */
export async function closeBrowserSession(bot) {
    if (!bot?.spriteUrl || bot.status !== 'ready') return
    try {
        await fetchSpriteHttp(bot.spriteUrl, '/browser/close', { method: 'POST', signal: AbortSignal.timeout(10_000) })
    } catch {}
}

/**
 * Tool definitions for the model. Listing tools never touches a browser, so
 * they come from a server whose browser is never opened — asking for them
 * wakes no computer.
 */
let cachedDefinitions = null
export async function listBrowserToolDefinitions() {
    if (cachedDefinitions) return cachedDefinitions
    const server = await createConnection({ capabilities: ['vision'] }, async () => {
        throw new Error('só para listar ferramentas')
    })
    const [serverSide, clientSide] = InMemoryTransport.createLinkedPair()
    await server.connect(serverSide)
    const client = new Client({ name: 'assistant-tools', version: '0.2.0' })
    await client.connect(clientSide)
    const { tools } = await client.listTools()
    await client.close()
    cachedDefinitions = tools.filter(tool => EXPOSED_TOOLS.has(tool.name))
    return cachedDefinitions
}
