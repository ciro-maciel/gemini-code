import { describe, expect, test } from 'bun:test'

import { languageOf } from './CodeEditor.jsx'

describe('the editor language of a file', () => {
    test('comes from the extension, case-blind, with plain text for the unknown', () => {
        expect(languageOf('src/soma.test.js')).toBe('javascript')
        expect(languageOf('App.TSX')).toBe('typescript')
        expect(languageOf('README.md')).toBe('markdown')
        expect(languageOf('config/app.yml')).toBe('yaml')
        expect(languageOf('main.py')).toBe('python')
        expect(languageOf('Dockerfile')).toBe('dockerfile')
        expect(languageOf('notes')).toBe('plaintext')
        expect(languageOf('archive.xyz')).toBe('plaintext')
    })
})
