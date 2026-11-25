import { describe, expect, test } from 'bun:test'

import { cleanFolder, foldersOf } from './BuildRow'

describe('working folder', () => {
    test('every folder that holds a file, parents included', () => {
        expect(foldersOf(['README.md', 'empresas/clinic/LEIA.md', 'agents/x.md'])).toEqual(['agents', 'empresas', 'empresas/clinic'])
    })
    test('what was typed becomes a clean folder, never a way up', () => {
        expect(cleanFolder(' /empresas/ acme/ ')).toBe('empresas/acme')
        expect(cleanFolder('a/../b')).toBe(null)
        expect(cleanFolder('  ')).toBe(null)
    })
})
