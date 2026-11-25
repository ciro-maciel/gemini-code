import { describe, expect, test } from 'bun:test'

import { parsePath, pick, viewFile, WINDOW_CHARS } from './file-view.js'

// The shape of the Forja 52 program of 31/10/2026: 12 cycles, 52 weeks, each with 12 microcommitments, about 90 KB.
const program = {
    takenAt: '2026-10-31',
    cycles: Array.from({ length: 12 }, (_, index) => ({ number: index + 1, name: `Ciclo ${index + 1}`, purpose: 'Propósito do ciclo. '.repeat(8) })),
    weeks: Array.from({ length: 52 }, (_, index) => ({
        number: index + 1,
        cycle: Math.floor(index / 4.34) + 1,
        idea: `A ideia da semana ${index + 1}`,
        quote: '“Eu não dependo de vontade. Eu construo sistemas.”',
        materials: { book: 'Hábitos Atômicos', model: 'Uma vida modelo', film: 'Um filme' },
        microcommitments: Array.from({ length: 12 }, (_, item) => `Semana ${index + 1}, microcompromisso ${item + 1}: um passo pequeno e concreto para o dia, escrito para caber numa manhã comum.`),
    })),
}
const text = JSON.stringify(program, null, 1)
const at = '/acme-studio/conteudo/programa-forja-52.json'

describe('a big file read in parts, never cut in silence', () => {
    test('the program is bigger than one read', () => {
        expect(text.length).toBeGreaterThan(80_000)
    })

    test('a small file comes whole and as it is', () => {
        expect(viewFile('/a.md', '# ep39')).toBe('# ep39')
        expect(viewFile('/a.md', '')).toBe('(vazio)')
    })

    test('the first read says it cut, at which line, how to go on, and what the JSON holds', () => {
        const first = viewFile(at, text)
        expect(first.length).toBeLessThan(WINDOW_CHARS + 2000)
        const shown = Number(/mostrei as linhas 1 a (\d+) de (\d+)/.exec(first)[1])
        expect(first).toContain(`[cortado: mostrei as linhas 1 a ${shown} de `)
        expect(first).toContain(`startLine ${shown + 1}`)
        expect(first).toContain('- weeks: lista de 52; cada item tem number, cycle, idea, quote, materials, microcommitments')
        expect(first).toContain('jsonPath')
    })

    test('following the notes reads the whole file, line by line, to its end', () => {
        const parts = []
        let startLine
        for (let reads = 0; reads < 20; reads++) {
            const part = viewFile(at, text, startLine ? { startLine } : {})
            const note = /\n\[(cortado|fim do arquivo): mostrei as linhas (\d+) a (\d+) de (\d+)/.exec(part)
            parts.push(part.slice(0, note.index))
            if (note[1] === 'fim do arquivo') break
            startLine = Number(note[3]) + 1
        }
        expect(parts.length).toBeGreaterThan(3)
        expect(parts.join('\n')).toBe(text.replace(/\n$/, ''))
    })

    test('a JSON path brings week 2 whole, with its twelve microcommitments', () => {
        const week = viewFile(at, text, { jsonPath: 'weeks[number=2]' })
        expect(week).toStartWith(`${at}, weeks[number=2]:\n`)
        const value = JSON.parse(week.slice(week.indexOf('\n') + 1))
        expect(value.number).toBe(2)
        expect(value.microcommitments).toHaveLength(12)
        expect(value.microcommitments[11]).toContain('microcompromisso 12')
        expect(JSON.parse(viewFile(at, text, { jsonPath: 'weeks.1.microcommitments' }).split('\n').slice(1).join('\n'))).toEqual(program.weeks[1].microcommitments)
        expect(viewFile(at, text, { jsonPath: '$.cycles[-1].number' })).toEndWith('\n12')
    })

    test('a path that is not there says what is', () => {
        expect(viewFile(at, text, { jsonPath: 'weeks[number=99]' })).toContain('nenhum item de weeks tem number = 99 (lista de 52')
        expect(viewFile(at, text, { jsonPath: 'semanas' })).toContain('não há "semanas" em a raiz')
        expect(viewFile(at, text, { jsonPath: 'weeks[60]' })).toContain('weeks tem 52 itens')
        expect(viewFile('/a.md', '# não é json', { jsonPath: 'x' })).toContain('não é um JSON válido')
    })

    test('a part of a JSON bigger than one read comes in parts too', () => {
        const weeks = viewFile(at, text, { jsonPath: 'weeks' })
        expect(weeks).toContain('[cortado: mostrei as linhas 1 a ')
        expect(weeks).toContain('com o mesmo path e jsonPath e startLine')
    })

    test('search lists the lines with a word and their numbers', () => {
        const found = viewFile(at, text, { search: 'semana 2, microcompromisso 1' })
        // "1" also matches 10, 11 and 12: four lines, each with its number.
        expect(found).toStartWith(`4 linhas de ${at} com "semana 2, microcompromisso 1"`)
        const number = Number(/\n(\d+): /.exec(found)[1])
        expect(text.split('\n')[number - 1]).toContain('Semana 2, microcompromisso 1:')
        expect(viewFile(at, text, { search: 'inexistente' })).toContain('nenhuma linha')
    })

    test('a file of one long line is read by characters', () => {
        const flat = JSON.stringify(program)
        const first = viewFile(at, flat)
        expect(first).toContain(`a linha 1 sozinha tem`)
        expect(first).toContain('offset')
        const second = viewFile(at, flat, { offset: WINDOW_CHARS, length: 100 })
        expect(second).toStartWith(flat.slice(WINDOW_CHARS, WINDOW_CHARS + 100))
        expect(second).toContain(`offset ${WINDOW_CHARS + 100}`)
        expect(viewFile(at, flat, { offset: flat.length - 10 })).toContain('[fim do arquivo')
    })

    test('paths read as written', () => {
        expect(parsePath('weeks[number=2].materials')).toEqual([{ key: 'weeks' }, { field: 'number', value: '2' }, { key: 'materials' }])
        expect(pick({ a: [{ b: 1 }] }, 'a.0.b')).toEqual({ value: 1 })
        expect(viewFile(at, text, { startLine: 'x' })).toContain('números inteiros')
    })
})
