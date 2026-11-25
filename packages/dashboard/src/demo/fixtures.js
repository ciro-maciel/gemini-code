// Example data for the public demo. Shapes copied from what the control
// server answers (packages/server/src/server.js); nothing here was measured: no usage,
// prices or customers, only what an empty install would show plus three agents.

import apps from './fixtures/apps.json'
import templates from './fixtures/templates.json'
import tools from './fixtures/tools.json'

export const REPO_URL = 'https://github.com/ciro-maciel/gemini-code'

export const ACCOUNT_IDS = { gemini: 'a1f0c0de-0000-4000-8000-000000000001', subscription: 'a1f0c0de-0000-4000-8000-000000000002' }
export const BOT_IDS = {
    engineer: 'b07a0001-5e1f-4c0d-9e00-00000000e001',
    reviewer: 'b07a0002-5e1f-4c0d-9e00-00000000e002',
    neon: 'b07a0003-5e1f-4c0d-9e00-00000000e003',
}

export const WORKSPACE = '/home/sprite/workspace'

export const GEMINI_MODELS = [
    { id: 'gemini-3.5-flash-lite', label: 'Gemini 3.5 Flash-Lite', note: 'Fastest: first answer in under a second on the free tier.', cost: 'Google Gemini' },
    { id: 'gemini-3.6-flash', label: 'Gemini 3.6 Flash', note: 'Stronger reasoning for multi-file work, about 2 s per step.', cost: 'Google Gemini' },
    { id: 'gemini-3.5-flash', label: 'Gemini 3.5 Flash', note: 'Balanced fallback when the others are busy.', cost: 'Google Gemini' },
]
export const SUBSCRIPTION_MODELS = [
    { id: 'gemini-4-neon-low', label: 'Gemini 4 Neon (Low)' },
    { id: 'gemini-4-neon-medium', label: 'Gemini 4 Neon (Medium)' },
    { id: 'gemini-4-neon-high', label: 'Gemini 4 Neon (High)' },
]

export const PROVIDERS = [
    { id: 'google', name: 'Google Gemini', base: 'https://generativelanguage.googleapis.com/v1beta/openai', keyHint: 'AIza…', keyUrl: 'https://aistudio.google.com/apikey' },
    { id: 'google-subscription', name: 'Assinatura Google (AI Pro e Ultra)', base: null, isSubscription: true, keyHint: 'entre uma vez no Antigravity CLI (agy)', keyUrl: 'https://antigravity.google/product/antigravity-cli' },
    { id: 'gemini-cli', name: 'Gemini CLI', base: null, keyHint: 'GEMINI_API_KEY (AIza…)', keyUrl: 'https://github.com/google-gemini/gemini-cli' },
]

/** The canned answer to anything a visitor sends: the demo says what it is instead of pretending to work. */
export const DEMO_REPLY = `Esta é uma demonstração com dados de exemplo: nenhum modelo foi chamado e nada rodou.\n\nPara ver um agente trabalhar de verdade no seu código, instale o Gemini Code (${REPO_URL}) e mande este pedido de novo.`

export const DEMO_REFUSAL = `Na demonstração isso não muda nada. Para usar de verdade, instale o Gemini Code: ${REPO_URL}`

const SOMA_JS = `export function soma(a, b) {
    return a + b
}
`

const SOMA_TEST_JS = `import { expect, test } from 'bun:test'
import { soma } from './soma.js'

test('soma dois positivos', () => {
    expect(soma(2, 3)).toBe(5)
})

test('soma com negativo', () => {
    expect(soma(-4, 1)).toBe(-3)
})

test('soma com zero', () => {
    expect(soma(0, 7)).toBe(7)
})
`

const BUN_TEST_OUTPUT = `bun test v1.4.0

soma.test.js:
(pass) soma dois positivos
(pass) soma com negativo
(pass) soma com zero

 3 pass
 0 fail
 3 expect() calls
Ran 3 tests across 1 file.`

/** What the agents' computers hold, by bot: served by /api/bots/:id/files and its content route. */
export function computerFiles(now) {
    return {
        [BOT_IDS.neon]: [
            { path: `${WORKSPACE}/soma.js`, name: 'soma.js', size: SOMA_JS.length, modifiedAt: now - 170, content: SOMA_JS },
            { path: `${WORKSPACE}/soma.test.js`, name: 'soma.test.js', size: SOMA_TEST_JS.length, modifiedAt: now - 160, content: SOMA_TEST_JS },
        ],
    }
}

export function aiAccounts(now) {
    return [
        {
            id: ACCOUNT_IDS.gemini,
            name: 'Google Gemini',
            provider: 'google',
            providerName: 'Google Gemini',
            models: GEMINI_MODELS.map(model => model.id),
            createdAt: now - 3 * 86400,
            usage: { today: 0, last30Days: 0 },
            agents: 2,
        },
        {
            id: ACCOUNT_IDS.subscription,
            name: 'Assinatura Google',
            provider: 'google-subscription',
            providerName: 'Assinatura Google (AI Pro e Ultra)',
            models: SUBSCRIPTION_MODELS.map(model => model.id),
            createdAt: now - 2 * 86400,
            usage: { today: 0, last30Days: 0 },
            agents: 1,
        },
    ]
}

function bot(now, fields) {
    const slug = fields.name.toLowerCase().replace(/\s+/g, '-')
    return {
        spriteName: null,
        spriteUrl: null,
        status: 'idle',
        statusDetail: null,
        instructions: '',
        createdAt: now - 86400,
        updatedAt: now - 3600,
        mascot: null,
        position: null,
        accountId: 'demo-account',
        computerVersion: null,
        sectionId: null,
        effort: 'high',
        folder: `agents/${slug}/docs`,
        templateId: null,
        connectionIds: [],
        runningCount: 0,
        waitingCount: 0,
        lastActivityAt: null,
        lastMessage: null,
        hasNews: false,
        needsYou: null,
        agentDir: `agents/${slug}`,
        instructionsPath: `agents/${slug}/INSTRUCTIONS.md`,
        access: 'owner',
        sharedBy: null,
        members: [],
        pendingChoices: 0,
        spendToday: 0,
        ...fields,
    }
}

const templateOf = id => templates.items.find(item => item.id === id)

export function bots(now) {
    return [
        bot(now, {
            id: BOT_IDS.engineer,
            name: 'Software Engineer',
            templateId: 'software-engineer',
            instructions: templateOf('software-engineer')?.instructions ?? '',
            model: 'gemini-3.6-flash',
            aiAccount: ACCOUNT_IDS.gemini,
            status: 'ready',
            runningCount: 1,
            lastActivityAt: now - 20,
            lastMessage: 'Achei onde a data é formatada; vou ajustar e rodar os testes.',
        }),
        bot(now, {
            id: BOT_IDS.reviewer,
            name: 'Code Reviewer',
            templateId: 'code-reviewer',
            instructions: templateOf('code-reviewer')?.instructions ?? '',
            model: 'gemini-3.5-flash-lite',
            aiAccount: ACCOUNT_IDS.gemini,
            lastActivityAt: now - 2 * 3600,
            lastMessage: 'Revisão feita: nada bloqueia o merge.',
        }),
        bot(now, {
            id: BOT_IDS.neon,
            name: 'Neon Engineer',
            model: 'gemini-4-neon-low',
            aiAccount: ACCOUNT_IDS.subscription,
            effort: 'medium',
            instructions: 'Você escreve código pequeno e testado. Rode os testes antes de dizer que terminou e mostre o resultado exato.',
            status: 'ready',
            hasNews: true,
            lastActivityAt: now - 150,
            lastMessage: 'Pronto: soma.js e soma.test.js criados, 3 pass.',
        }),
    ]
}

/**
 * Each bot's conversation as the server stores it: tasks and their events.
 * `seq` is filled by the fake API, in order.
 */
export function conversations(now) {
    const engineerTask = 'c0a5e001-0000-4000-8000-0000000000a1'
    const reviewerTask = 'c0a5e002-0000-4000-8000-0000000000a2'
    const neonTask = 'c0a5e003-0000-4000-8000-0000000000a3'
    return {
        [BOT_IDS.engineer]: {
            tasks: [{ id: engineerTask, prompt: 'A data do relatório aparece no formato americano. Deixe em dd/mm/aaaa e rode os testes.', title: 'Data do relatório em dd/mm/aaaa', status: 'running', createdAt: now - 90 }],
            events: [
                { taskId: engineerTask, type: 'user_message', data: { text: 'A data do relatório aparece no formato americano. Deixe em dd/mm/aaaa e rode os testes.', messageSeq: 0 }, createdAt: now - 90 },
                { taskId: engineerTask, type: 'status', data: { status: 'running' }, createdAt: now - 89 },
                { taskId: engineerTask, type: 'title', data: { title: 'Data do relatório em dd/mm/aaaa' }, createdAt: now - 88 },
                { taskId: engineerTask, type: 'assistant', data: { text: 'Vou procurar onde a data é formatada.', isFinal: false, turnId: 'demo-turn-e1' }, createdAt: now - 80 },
                { taskId: engineerTask, type: 'tool_call', data: { toolCallId: 'demo-e1', name: 'computer_shell', arguments: { command: "grep -rn 'toLocaleDateString' src" } }, createdAt: now - 70 },
                { taskId: engineerTask, type: 'tool_result', data: { toolCallId: 'demo-e1', name: 'computer_shell', preview: "src/report.js:12:    return date.toLocaleDateString('en-US')", hasImage: false }, createdAt: now - 68 },
                { taskId: engineerTask, type: 'tool_call', data: { toolCallId: 'demo-e2', name: 'computer_read_file', arguments: { path: `${WORKSPACE}/src/report.js` } }, createdAt: now - 50 },
                {
                    taskId: engineerTask,
                    type: 'tool_result',
                    data: { toolCallId: 'demo-e2', name: 'computer_read_file', preview: "export function formatDate(date) {\n    return date.toLocaleDateString('en-US')\n}", hasImage: false },
                    createdAt: now - 48,
                },
                { taskId: engineerTask, type: 'assistant', data: { text: 'Achei onde a data é formatada; vou ajustar e rodar os testes.', isFinal: false, turnId: 'demo-turn-e2' }, createdAt: now - 30 },
                { taskId: engineerTask, type: 'tool_call', data: { toolCallId: 'demo-e3', name: 'computer_write_file', arguments: { path: `${WORKSPACE}/src/report.js` } }, createdAt: now - 20 },
            ],
        },
        [BOT_IDS.reviewer]: {
            tasks: [{ id: reviewerTask, prompt: 'Revise a mudança em src/report.js antes do merge.', title: 'Revisão de src/report.js', status: 'done', createdAt: now - 2 * 3600 - 300, finishedAt: now - 2 * 3600 }],
            events: [
                { taskId: reviewerTask, type: 'user_message', data: { text: 'Revise a mudança em src/report.js antes do merge.', messageSeq: 0 }, createdAt: now - 2 * 3600 - 300 },
                { taskId: reviewerTask, type: 'status', data: { status: 'running' }, createdAt: now - 2 * 3600 - 299 },
                { taskId: reviewerTask, type: 'tool_call', data: { toolCallId: 'demo-r1', name: 'computer_shell', arguments: { command: 'git diff main -- src/report.js' } }, createdAt: now - 2 * 3600 - 200 },
                {
                    taskId: reviewerTask,
                    type: 'tool_result',
                    data: { toolCallId: 'demo-r1', name: 'computer_shell', preview: "-    return date.toLocaleDateString('en-US')\n+    return date.toLocaleDateString('pt-BR')", hasImage: false },
                    createdAt: now - 2 * 3600 - 198,
                },
                {
                    taskId: reviewerTask,
                    type: 'assistant',
                    data: { text: '**Revisão feita: nada bloqueia o merge.**\n\n- A troca de `en-US` para `pt-BR` resolve o formato.\n- Sugestão: um teste com uma data fixa, para o formato não voltar sem ninguém ver.', isFinal: true, turnId: 'demo-turn-r1' },
                    createdAt: now - 2 * 3600 - 10,
                },
                { taskId: reviewerTask, type: 'status', data: { status: 'done' }, createdAt: now - 2 * 3600 },
            ],
        },
        [BOT_IDS.neon]: {
            tasks: [{ id: neonTask, prompt: 'Crie soma.js com uma função soma(a, b) e testes em soma.test.js. Rode os testes.', title: 'soma.js com testes', status: 'done', createdAt: now - 240, finishedAt: now - 150 }],
            events: [
                { taskId: neonTask, type: 'user_message', data: { text: 'Crie soma.js com uma função soma(a, b) e testes em soma.test.js. Rode os testes.', messageSeq: 0 }, createdAt: now - 240 },
                { taskId: neonTask, type: 'status', data: { status: 'running' }, createdAt: now - 239 },
                { taskId: neonTask, type: 'title', data: { title: 'soma.js com testes' }, createdAt: now - 238 },
                { taskId: neonTask, type: 'assistant', data: { text: 'Vou escrever a função, os testes, e rodar com o bun.', isFinal: false, turnId: 'demo-turn-n1' }, createdAt: now - 200 },
                { taskId: neonTask, type: 'tool_call', data: { toolCallId: 'demo-n1', name: 'computer_write_file', arguments: { path: `${WORKSPACE}/soma.js`, content: SOMA_JS } }, createdAt: now - 175 },
                { taskId: neonTask, type: 'tool_result', data: { toolCallId: 'demo-n1', name: 'computer_write_file', preview: `arquivo gravado: ${WORKSPACE}/soma.js (${SOMA_JS.length} caracteres)`, hasImage: false }, createdAt: now - 170 },
                { taskId: neonTask, type: 'tool_call', data: { toolCallId: 'demo-n2', name: 'computer_write_file', arguments: { path: `${WORKSPACE}/soma.test.js`, content: SOMA_TEST_JS } }, createdAt: now - 165 },
                { taskId: neonTask, type: 'tool_result', data: { toolCallId: 'demo-n2', name: 'computer_write_file', preview: `arquivo gravado: ${WORKSPACE}/soma.test.js (${SOMA_TEST_JS.length} caracteres)`, hasImage: false }, createdAt: now - 160 },
                { taskId: neonTask, type: 'tool_call', data: { toolCallId: 'demo-n3', name: 'computer_shell', arguments: { command: 'bun test soma.test.js' } }, createdAt: now - 158 },
                { taskId: neonTask, type: 'tool_result', data: { toolCallId: 'demo-n3', name: 'computer_shell', preview: BUN_TEST_OUTPUT, hasImage: false }, createdAt: now - 155 },
                {
                    taskId: neonTask,
                    type: 'assistant',
                    data: { text: '**Pronto: soma.js e soma.test.js criados, 3 pass.**\n\n`bun test soma.test.js` rodou os três testes (positivos, negativo e zero) e nenhum falhou.', isFinal: true, turnId: 'demo-turn-n2' },
                    createdAt: now - 152,
                },
                { taskId: neonTask, type: 'files', data: { files: computerFiles(now)[BOT_IDS.neon].map(({ content, ...file }) => file) }, createdAt: now - 151 },
                { taskId: neonTask, type: 'status', data: { status: 'done' }, createdAt: now - 150 },
            ],
        },
    }
}

/** The account the visitor is: the one local install has, under a neutral name. */
export function me(botCount) {
    return {
        id: 'demo-account',
        email: '',
        name: 'Visitante',
        status: 'active',
        isOwner: true,
        limits: { botsPerAccount: 50, runningTasksPerAccount: 4, runningTasks: 150, routinesPerBot: 20 },
        usageToday: { cost: 0 },
        firstWish: null,
        isGuest: false,
        runtime: { computerMode: 'local', authMode: 'local', workspaceDir: null },
        plan: { tier: 'free', name: 'Grátis', agents: 50, isEnforced: false, used: botCount },
    }
}

/** The connector catalog with a lettered tile in place of each icon, so no image leaves for another host. */
export function appCatalog() {
    return {
        items: apps.items.map(app => ({ ...app, icon: letterIcon(app.title), connection: null })),
        categories: apps.categories,
    }
}

function letterIcon(title) {
    const letter = (title.match(/[A-Za-z0-9]/)?.[0] ?? '?').toUpperCase()
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64"><rect width="64" height="64" rx="16" fill="#E8EEF7"/><text x="32" y="41" font-family="sans-serif" font-size="28" font-weight="700" text-anchor="middle" fill="#1F3A60">${letter}</text></svg>`
    return `data:image/svg+xml,${encodeURIComponent(svg)}`
}

export { templates, tools }
