import { expect, test } from 'bun:test'
import { buildTree, syncLineOf } from './tree.js'

test('flat paths become folders first, by name, with their files', () => {
    const tree = buildTree(['skills/b/SKILL.md', 'README.md', 'agents/pauta/INSTRUCTIONS.md', 'agents/pauta/routines/radar.md', 'agents/a/INSTRUCTIONS.md'])
    expect(tree.dirs.map(d => d.name)).toEqual(['agents', 'skills'])
    expect(tree.files).toEqual(['README.md'])
    const [a, pauta] = tree.dirs[0].dirs
    expect([a.path, pauta.path]).toEqual(['agents/a', 'agents/pauta'])
    expect(pauta.dirs[0]).toMatchObject({ name: 'routines', files: ['agents/pauta/routines/radar.md'] })
})

test('the sync line says when the repository last matched, as the prototype does', () => {
    const now = 10_000
    expect(syncLineOf(null, now)).toBeNull()
    expect(syncLineOf({ syncedAt: null }, now)).toBe('Sincronizando com o GitHub…')
    expect(syncLineOf({ syncedAt: now - 20 }, now)).toBe('GitHub sincronizado agora')
    expect(syncLineOf({ syncedAt: now - 60 }, now)).toBe('GitHub sincronizado há 1 min')
    expect(syncLineOf({ syncedAt: now - 3 * 3600 }, now)).toBe('GitHub sincronizado há 3 h')
    expect(syncLineOf({ syncedAt: now - 30 * 3600 }, now)).toBe('GitHub sincronizado ontem')
})

test('the sync line adapts cleanly to local workspace mode', () => {
    const now = 10_000
    expect(syncLineOf({ mode: 'local', syncedAt: null }, now)).toBe('Workspace local · pronto')
    expect(syncLineOf({ mode: 'local', syncedAt: now - 15 }, now)).toBe('Workspace local · atualizado agora')
    expect(syncLineOf({ mode: 'local', syncedAt: now - 120 }, now)).toBe('Workspace local · há 2 min')
    expect(syncLineOf({ mode: 'local', syncedAt: now - 2 * 3600 }, now)).toBe('Workspace local · há 2 h')
})
