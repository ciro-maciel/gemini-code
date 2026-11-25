import { chmodSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { randomBytes } from 'node:crypto'
import path from 'node:path'

// Inside a Fly Sprite the management socket exists; on a local machine it does not.
export const IS_IN_SPRITE = existsSync('/.sprite/api.sock')

const dataDir = process.env.DATA_DIR || path.resolve(import.meta.dir, '../data')

/**
 * Encryption key for local secrets & OAuth tokens.
 * Uses ENCRYPTION_KEY from env if provided; otherwise auto-generates and persists
 * a local 32-byte key inside DATA_DIR so `bun run dev` works with zero setup.
 */
function resolveEncryptionKey() {
    if (process.env.ENCRYPTION_KEY) return process.env.ENCRYPTION_KEY
    mkdirSync(dataDir, { recursive: true })
    const keyFile = path.join(dataDir, '.encryption-key')
    if (existsSync(keyFile)) return readFileSync(keyFile, 'utf8').trim()
    const generated = randomBytes(32).toString('base64')
    writeFileSync(keyFile, `${generated}\n`, { mode: 0o600 })
    try {
        chmodSync(keyFile, 0o600)
    } catch {}
    return generated
}

const spritesToken = (process.env.SPRITES_TOKEN || '').trim()
const authUrl = (process.env.AUTH_API_URL || '').replace(/\/$/, '')

export const config = {
    port: Number(process.env.PORT || 8787),
    publicUrl: (process.env.PUBLIC_URL || `http://localhost:${process.env.PORT || 8787}`).replace(/\/$/, ''),
    dataDir,
    dashboardDir: process.env.DASHBOARD_DIR || path.resolve(import.meta.dir, '../../dashboard/dist'),
    computerDir: process.env.COMPUTER_DIR || path.resolve(import.meta.dir, '../../computer'),
    // Local workspace directory used when running in local/hybrid mode without Sprites.
    localWorkspaceDir: path.resolve(process.env.WORKSPACE_DIR || path.resolve(import.meta.dir, '../../workspace')),
    // Optional custom illustration directory for agent avatars.
    assetsDir: process.env.ASSETS_DIR || path.resolve(import.meta.dir, '../../assets/illustrations'),
    // Hybrid mode: 'local' (default when SPRITES_TOKEN is unset) or 'sprites' (cloud computers).
    computerMode: process.env.COMPUTER_MODE || (spritesToken ? 'sprites' : 'local'),
    spritesToken,
    spritesOrg: process.env.SPRITES_ORG || '',
    spritesApi: process.env.SPRITES_API_URL || 'https://api.sprites.dev',
    openrouterConnectorId: process.env.OPENROUTER_CONNECTOR_ID || '',
    openrouterApiKey: process.env.OPENROUTER_API_KEY || '',
    // Primary Gemini API key for house calls (titles, risk judge, designer) and default local agent brain.
    geminiApiKey: process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '',
    // Optional Anthropic key for house fallback or Claude models.
    anthropicApiKey: process.env.ANTHROPIC_API_KEY || '',
    encryptionKey: resolveEncryptionKey(),
    defaultModel: process.env.DEFAULT_MODEL || 'gemini-3.5-flash-lite',
    riskModel: process.env.RISK_MODEL || 'gemini-3.5-flash-lite',
    botPrefix: 'gemini-code-bot-',
    // Pre-warmed cloud computers when running in Sprites mode (0 in local mode).
    spareComputers: Number(process.env.SPARE_COMPUTERS ?? (spritesToken ? 1 : 0)),
    spareComputersMax: Number(process.env.SPARE_COMPUTERS_MAX ?? 6),
    // Auth: 'local' (single-user open-source default, no login required) or 'jwt' (external JWKS server).
    authMode: process.env.AUTH_MODE || (authUrl ? 'jwt' : 'local'),
    authUrl,
    authIssuer: process.env.AUTH_ISSUER || 'gemini-code-auth',
    ownerEmail: (process.env.OWNER_EMAIL || '').trim().toLowerCase(),
    accessMode: process.env.ACCESS_MODE === 'invite' ? 'invite' : authUrl ? 'invite' : 'open',
    testEmail: (process.env.TEST_EMAIL || '').trim().toLowerCase(),
    limits: {
        botsPerAccount: Number(process.env.LIMIT_BOTS ?? 50),
        runningTasksPerAccount: Number(process.env.LIMIT_RUNNING_TASKS ?? 4),
        runningTasks: Number(process.env.LIMIT_RUNNING_TASKS_TOTAL ?? 150),
        routinesPerBot: Number(process.env.LIMIT_ROUTINES ?? 20),
    },
    // Optional Cloudflare Worker alarm URL for scheduled routines when running in sleeping cloud Sprites.
    wakeUrl: (process.env.WAKE_URL || '').replace(/\/$/, ''),
    wakeSecret: process.env.WAKE_SECRET || '',
    // Optional custom MCP catalog URL (leave empty to use the built-in open catalog + official MCP registry).
    mcpCatalogUrl: (process.env.MCP_CATALOG_URL || '').trim(),
    // Optional Fish Audio key for voice mode / speech synthesis.
    fishApiKey: process.env.FISH_API_KEY || '',
    // Optional GitHub OAuth app credentials for GitHub MCP server.
    githubClientId: process.env.GITHUB_CLIENT_ID || '',
    githubClientSecret: process.env.GITHUB_CLIENT_SECRET || '',
    // Optional GitHub App for per-account workspace sync.
    githubOrg: process.env.GITHUB_ORG || '',
    githubApi: (process.env.GITHUB_API_URL || 'https://api.github.com').replace(/\/$/, ''),
    githubAppId: process.env.GITHUB_APP_ID || '',
    githubAppKey: process.env.GITHUB_APP_PRIVATE_KEY || '',
    githubWebhookSecret: process.env.GITHUB_WEBHOOK_SECRET || '',
    // Optional Web Push VAPID keys for mobile/desktop notifications.
    vapidPublicKey: process.env.VAPID_PUBLIC_KEY || '',
    vapidPrivateKey: process.env.VAPID_PRIVATE_KEY || '',
    vapidSubject: process.env.VAPID_SUBJECT || 'mailto:noreply@localhost',
    get fishTtsModel() {
        return process.env.FISH_TTS_MODEL || 's2.1-pro'
    },
    fishVoiceId: process.env.FISH_VOICE_ID || '',
    transcribeModel: process.env.TRANSCRIBE_MODEL || 'gemini-3.5-flash-lite',
    attachmentMaxBytes: 25 * 1024 * 1024,
    attachmentsPerMessage: 10,
    // Default Gemini-first model lineup. Users can enable any additional models from their connected providers.
    models: [
        { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'Fastest: first answer in under a second on the free tier.', cost: 'Google Gemini' },
        { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', note: 'Stronger reasoning for multi-file work, about 2 s per step.', cost: 'Google Gemini' },
        { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', note: 'Balanced fallback when the others are busy.', cost: 'Google Gemini' },
    ],
}
