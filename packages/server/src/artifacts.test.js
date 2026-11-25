import { describe, expect, test } from 'bun:test'
import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'

// A database of its own: config.js reads DATA_DIR when first imported (the
// test files share one process, so the first file's database wins).
process.env.DATA_DIR ||= mkdtempSync(path.join(tmpdir(), 'assistant-artifacts-'))
process.env.SPRITES_TOKEN ||= 'test'
process.env.ENCRYPTION_KEY ||= Buffer.alloc(32).toString('base64')

const { db, now } = await import('./db.js')
const artifacts = await import('./artifacts.js')

function seedBot(id) {
    db.query('INSERT INTO accounts (id, email, status, created_at, last_seen_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT DO NOTHING').run('acc-a', 'acc-a@exemplo.com', 'active', now(), now())
    db.query('INSERT INTO bots (id, name, sprite_name, status, model, created_at, updated_at, account_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)').run(id, `Bot ${id}`, `sprite-${id}`, 'idle', 'x/y', now(), now(), 'acc-a')
}

// The shape any bot can publish: nothing in it is about one bot's job.
const REPORT = {
    key: 'relatorio-do-dia',
    title: 'Relatório do dia',
    blocks: [
        { type: 'heading', title: 'Tudo em ordem', text: 'Duas coisas pedem você.' },
        {
            type: 'stats',
            items: [
                { label: 'Visitas', value: 220, delta: -12 },
                { label: 'Respostas', value: '0', note: 'Forms, 7 dias' },
            ],
        },
        { type: 'table', columns: ['Dia', 'Peça'], rows: [['Seg', 'Vídeo'], ['Ter']] },
        {
            type: 'items',
            items: [
                {
                    id: 'item-1',
                    title: 'Um teste venceu',
                    tag: 'Decidir',
                    tone: 'attention',
                    choices: [
                        { label: 'Eu resolvo', value: 'mine' },
                        { label: 'Ajustar', value: 'changes', needsNote: true },
                    ],
                },
                { id: 'item-2', title: 'Sitemap lido', tone: 'ok' },
            ],
        },
        { type: 'text', text: 'O **porquê**, curto.' },
    ],
    choices: [{ label: 'Aprovar', value: 'approved' }],
}

describe('what an artifact may hold', () => {
    test('generic blocks pass, and a short row is filled to the columns', () => {
        const clean = artifacts.validateArtifact(REPORT)
        expect(clean.blocks.map(block => block.type)).toEqual(['heading', 'stats', 'table', 'items', 'text'])
        expect(clean.blocks[1].items[0]).toEqual({ label: 'Visitas', value: '220', delta: -12 })
        expect(clean.blocks[2].rows[1]).toEqual(['Ter', ''])
    })

    test('pictures are shown by their https address, never by any other kind', () => {
        const capas = { key: 'capas', title: 'Qual capa?', blocks: [{ type: 'images', title: 'As opções', items: [{ src: 'https://cdn.example.com/x/1?sig=a', caption: 'Capa A' }, { src: 'https://cdn.example.com/x/2?sig=b' }] }] }
        expect(artifacts.validateArtifact(capas).blocks[0]).toEqual({ type: 'images', title: 'As opções', items: [{ src: 'https://cdn.example.com/x/1?sig=a', caption: 'Capa A' }, { src: 'https://cdn.example.com/x/2?sig=b' }] })
        const wrong = src => expect(() => artifacts.validateArtifact({ ...capas, blocks: [{ type: 'images', items: [{ src }] }] })).toThrow('https')
        wrong('http://exemplo.com/a.png')
        wrong('javascript:alert(1)')
        wrong('data:image/png;base64,AAAA')
        wrong('/home/sprite/capa.png')
        expect(() => artifacts.validateArtifact({ ...capas, blocks: [{ type: 'images', items: Array.from({ length: 13 }, () => ({ src: 'https://a.com/x.png' })) }] })).toThrow('passa de 12')
    })

    test('videos play by their https address, with an https poster or none, up to 4', () => {
        const video = { key: 'video', title: 'O vídeo', blocks: [{ type: 'videos', items: [{ src: 'https://cdn.example.com/x/9?sig=a', poster: 'https://cdn.example.com/x/9/preview?sig=b', caption: 'v2' }, { src: 'https://a.com/b.mp4' }] }] }
        expect(artifacts.validateArtifact(video).blocks[0].items).toEqual([{ src: 'https://cdn.example.com/x/9?sig=a', poster: 'https://cdn.example.com/x/9/preview?sig=b', caption: 'v2' }, { src: 'https://a.com/b.mp4' }])
        expect(() => artifacts.validateArtifact({ ...video, blocks: [{ type: 'videos', items: [{ src: 'javascript:alert(1)' }] }] })).toThrow('https')
        expect(() => artifacts.validateArtifact({ ...video, blocks: [{ type: 'videos', items: [{ src: 'https://a.com/b.mp4', poster: 'data:image/png;base64,AA' }] }] })).toThrow('https')
        expect(() => artifacts.validateArtifact({ ...video, blocks: [{ type: 'videos', items: Array.from({ length: 5 }, () => ({ src: 'https://a.com/b.mp4' })) }] })).toThrow('passa de 4')
    })

    test('a wrong artifact says exactly what is wrong', () => {
        const wrong = (change, message) => expect(() => artifacts.validateArtifact({ ...REPORT, ...change })).toThrow(message)
        wrong({ key: 'Com Espaço' }, 'key')
        wrong({ blocks: [{ type: 'chart' }] }, 'blocks[0].type')
        wrong(
            {
                blocks: [
                    {
                        type: 'items',
                        items: [
                            { id: 'a', title: 'x' },
                            { id: 'a', title: 'y' },
                        ],
                    },
                ],
            },
            'repete "a"'
        )
        wrong({ blocks: [{ type: 'items', items: [{ id: 'a', title: 'x', tone: 'red' }] }] }, 'tone')
        wrong({ blocks: [{ type: 'table', columns: ['a'], rows: [['1', '2']] }] }, 'passa de 1')
        wrong({ blocks: [{ type: 'text', text: 'x'.repeat(70_000) }] }, 'KB')
    })
})

describe('versions and choices', () => {
    test('the same key makes the next version, and only the latest takes a choice, once', () => {
        seedBot('art1')
        const first = artifacts.publishArtifact('art1', null, REPORT)
        const second = artifacts.publishArtifact('art1', null, { ...REPORT, title: 'Relatório do dia, refeito' })
        expect([first.version, second.version, second.id]).toEqual([1, 2, first.id])
        expect(artifacts.listArtifacts('art1')).toHaveLength(1)

        expect(() => artifacts.recordChoice('art1', first.id, first.versionId, { itemId: 'item-1', value: 'mine' })).toThrow('versão mais nova')
        const told = artifacts.recordChoice('art1', first.id, second.versionId, { itemId: 'item-1', value: 'mine' })
        expect(told.shown).toBe('Eu resolvo')
        expect(told.choice).toEqual({ artifactId: first.id, versionId: second.versionId, version: 2, title: 'Relatório do dia, refeito', item: 'Um teste venceu' })
        expect(told.modelText).toContain('id item-1')
        expect(told.modelText).toContain('value mine')
        expect(() => artifacts.recordChoice('art1', first.id, second.versionId, { itemId: 'item-1', value: 'mine' })).toThrow('já foi respondido')
        expect(artifacts.fetchArtifactVersion('art1', first.id, second.versionId).choices['item-1'].label).toBe('Eu resolvo')
    })

    test('a version is addressed by its UUID; its number is only the label and finds nothing', () => {
        seedBot('art3')
        const first = artifacts.publishArtifact('art3', null, { ...REPORT, key: 'por-uuid' })
        const second = artifacts.publishArtifact('art3', null, { ...REPORT, key: 'por-uuid' })
        expect(first.versionId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
        expect(second.versionId).not.toBe(first.versionId)
        const found = artifacts.fetchArtifactVersion('art3', first.id, first.versionId)
        expect([found.versionId, found.version, found.isLatest, found.latestVersion]).toEqual([first.versionId, 1, false, 2])
        // The number, as a route param or a number, is the same as an unknown version: not found.
        expect(artifacts.fetchArtifactVersion('art3', first.id, '1')).toBeNull()
        expect(artifacts.fetchArtifactVersion('art3', first.id, 2)).toBeNull()
        expect(artifacts.fetchArtifactVersion('art3', first.id, crypto.randomUUID())).toBeNull()
        expect(() => artifacts.recordChoice('art3', first.id, '2', { itemId: 'item-1', value: 'mine' })).toThrow('desconhecido')
        // Another artifact's version does not open through this one.
        const other = artifacts.publishArtifact('art3', null, { ...REPORT, key: 'outro' })
        expect(artifacts.fetchArtifactVersion('art3', first.id, other.versionId)).toBeNull()
    })

    test('a choice that asks for a note needs one; an unknown choice or another bot gets nothing', () => {
        seedBot('art2')
        const { id, versionId } = artifacts.publishArtifact('art2', null, { ...REPORT, key: 'outro' })
        expect(() => artifacts.recordChoice('art2', id, versionId, { itemId: 'item-1', value: 'changes' })).toThrow('pede um recado')
        expect(artifacts.recordChoice('art2', id, versionId, { itemId: 'item-1', value: 'changes', note: 'menos técnico' }).shown).toBe('Ajustar: menos técnico')
        expect(() => artifacts.recordChoice('art2', id, versionId, { itemId: 'item-2', value: 'mine' })).toThrow('não existe')
        expect(() => artifacts.recordChoice('art1', id, versionId, { itemId: 'item-1', value: 'mine' })).toThrow('desconhecido')
        expect(artifacts.recordChoice('art2', id, versionId, { itemId: artifacts.ARTIFACT_ITEM, value: 'approved' }).choice.item).toBeNull()
    })
})

describe('what still waits for a person', () => {
    test('open choices count per bot and show on the account deliveries', () => {
        seedBot('bot-pending')
        const published = artifacts.publishArtifact('bot-pending', null, REPORT)
        expect(artifacts.countPendingChoices('bot-pending')).toBe(2)
        artifacts.recordChoice('bot-pending', published.id, published.versionId, { itemId: 'item-1', value: 'mine' })
        expect(artifacts.countPendingChoices('bot-pending')).toBe(1)
        const [delivery] = artifacts.listRecentDeliveries('acc-a').filter(each => each.botId === 'bot-pending')
        expect(delivery).toMatchObject({ title: 'Relatório do dia', verdict: 'Duas coisas pedem você.', pendingChoices: 1, botName: 'Bot bot-pending' })
    })

    test('a new version starts with all its choices open again', () => {
        seedBot('bot-again')
        const first = artifacts.publishArtifact('bot-again', null, REPORT)
        artifacts.recordChoice('bot-again', first.id, first.versionId, { itemId: '_artifact', value: 'approved' })
        expect(artifacts.countPendingChoices('bot-again')).toBe(1)
        artifacts.publishArtifact('bot-again', null, REPORT)
        expect(artifacts.countPendingChoices('bot-again')).toBe(2)
    })

    test('a choice the conversation left behind stops waiting and leaves the deliveries; one already made stays', () => {
        seedBot('bot-moved')
        const said = (text, at, extra = {}) => {
            db.query("INSERT OR IGNORE INTO tasks (id, bot_id, prompt, status, created_at, updated_at) VALUES ('t-moved', 'bot-moved', 'x', 'done', ?, ?)").run(at, at)
            db.query("INSERT INTO task_events (task_id, type, data, created_at) VALUES ('t-moved', 'user_message', ?, ?)").run(JSON.stringify({ text, ...extra }), at)
        }
        const old = artifacts.publishArtifact('bot-moved', null, { ...REPORT, key: 'capas-a' })
        db.query('UPDATE artifacts SET updated_at = ? WHERE id = ?').run(now() - 100, old.id)
        const titles = () => artifacts.listRecentDeliveries('acc-a', 40).filter(each => each.botId === 'bot-moved').map(each => each.title)
        expect(artifacts.countPendingChoices('bot-moved')).toBe(2)
        // A routine writing on its own is not the person moving on.
        said('rotina das 9h', now() - 50, { routine: 'Pauta' })
        expect(artifacts.countPendingChoices('bot-moved')).toBe(2)
        // The person wrote after it: the options were left behind.
        said('faz outra opção', now() - 40)
        expect(artifacts.countPendingChoices('bot-moved')).toBe(0)
        expect(titles()).toEqual([])
        // A newer choice waits; the older one, left behind, stays out.
        const fresh = artifacts.publishArtifact('bot-moved', null, { ...REPORT, key: 'capas-b', title: 'Capa nova' })
        expect(artifacts.countPendingChoices('bot-moved')).toBe(2)
        expect(titles()).toEqual(['Capa nova'])
        // Chosen, then left behind: it stays, as seen.
        artifacts.recordChoice('bot-moved', fresh.id, fresh.versionId, { itemId: 'item-1', value: 'mine' })
        said('ok, finalizamos', now() + 5)
        expect(titles()).toEqual(['Capa nova'])
        expect(artifacts.countPendingChoices('bot-moved')).toBe(0)
    })
})

