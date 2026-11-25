import { expect, test } from 'bun:test'
import { findTemplates, fromOf, toOf } from './templates.js'

const list = [
    { id: 'finance', name: 'Financeiro', area: 'Finanças', owns: 'o caixa', uses: [{ service: 'Stripe' }], skills: [{ name: 'fluxo-de-caixa' }], to: ['director'] },
    { id: 'sdr', name: 'SDR', area: 'Vendas', owns: 'reuniões marcadas', uses: [{ service: 'Gmail' }], skills: [], to: ['closer'] },
    { id: 'closer', name: 'Closer', area: 'Vendas', owns: 'propostas', uses: [], skills: [], from: ['sdr'] },
    { id: 'director', name: 'Diretor', area: 'Direção', owns: 'a empresa', uses: [], skills: [], from: [], to: ['finance'] },
]

test('the search reads name, area, services and skills, without accents or case', () => {
    expect(findTemplates(list, 'REUNIOES').map(t => t.id)).toEqual(['sdr'])
    expect(findTemplates(list, 'gmail').map(t => t.id)).toEqual(['sdr'])
    expect(findTemplates(list, 'fluxo').map(t => t.id)).toEqual(['finance'])
    expect(findTemplates(list, '', 'Vendas').map(t => t.id)).toEqual(['sdr', 'closer'])
    expect(findTemplates(list, 'caixa', 'Vendas')).toEqual([])
})

test('handoffs read both ways', () => {
    expect(fromOf(list[0], list)).toEqual(['director'])
    expect(toOf(list[0], list)).toEqual(['director'])
    expect(fromOf(list[2], list)).toEqual(['sdr'])
    expect(toOf(list[1], list)).toEqual(['closer'])
})
