import { describe, expect, test } from 'bun:test'
import { closeAll, closeOtherTabs, closePane, closeTab, closeTabsRight, dropTabs, emptyBoard, isEmpty, openTab, pane, panesOf, placeTab } from './layout.js'

const tabsOf = board => panesOf(board.layout).map(p => p.tabs)

describe('openTab', () => {
    test('the first tab goes into the empty pane', () => {
        const board = emptyBoard()
        openTab(board, 'agent:a')
        expect(tabsOf(board)).toEqual([['agent:a']])
    })

    test('a file opens beside a lone agent, in a new pane on the right', () => {
        const board = emptyBoard()
        openTab(board, 'agent:a')
        openTab(board, 'file:notes.md')
        expect(board.layout.t).toBe('split')
        expect(board.layout.dir).toBe('row')
        expect(tabsOf(board)).toEqual([['agent:a'], ['file:notes.md']])
    })

    test('agents join the pane with agents; others the last pane without agents', () => {
        const board = emptyBoard()
        openTab(board, 'agent:a')
        openTab(board, 'settings:a')
        openTab(board, 'agent:b')
        openTab(board, 'file:x.md')
        expect(tabsOf(board)).toEqual([['agent:a', 'agent:b'], ['settings:a', 'file:x.md']])
    })

    test('an open tab is only activated, never duplicated', () => {
        const board = emptyBoard()
        openTab(board, 'agent:a')
        openTab(board, 'agent:b')
        openTab(board, 'agent:a')
        const [p] = panesOf(board.layout)
        expect(p.tabs).toEqual(['agent:a', 'agent:b'])
        expect(p.active).toBe('agent:a')
    })
})

describe('closing', () => {
    test('closing the last tab of a pane gives its place back', () => {
        const board = emptyBoard()
        openTab(board, 'agent:a')
        openTab(board, 'file:x.md')
        closeTab(board, 'file:x.md')
        expect(board.layout.t).toBe('pane')
        expect(tabsOf(board)).toEqual([['agent:a']])
    })

    test('the last pane stays, empty, and the board reads as empty', () => {
        const board = emptyBoard()
        openTab(board, 'agent:a')
        closeTab(board, 'agent:a')
        expect(isEmpty(board.layout)).toBe(true)
    })

    test('closing a pane and closing all', () => {
        const board = emptyBoard()
        openTab(board, 'agent:a')
        openTab(board, 'file:x.md')
        closePane(board, panesOf(board.layout)[1].id)
        expect(tabsOf(board)).toEqual([['agent:a']])
        closeAll(board)
        expect(isEmpty(board.layout)).toBe(true)
    })

    test('tabs of a deleted agent leave the board', () => {
        const board = emptyBoard()
        openTab(board, 'agent:a')
        openTab(board, 'settings:a')
        openTab(board, 'agent:b')
        dropTabs(board, tab => tab.endsWith(':a'))
        expect(tabsOf(board)).toEqual([['agent:b']])
    })
})

describe('placeTab', () => {
    test('dropping on an edge splits the target pane', () => {
        const board = { layout: pane(['agent:a', 'agent:b']) }
        placeTab(board, 'agent:b', board.layout.id, 'bottom')
        expect(board.layout.dir).toBe('col')
        expect(tabsOf(board)).toEqual([['agent:a'], ['agent:b']])
    })

    test('dropping in the middle moves the tab and the emptied pane collapses', () => {
        const board = emptyBoard()
        openTab(board, 'agent:a')
        openTab(board, 'file:x.md')
        const [left] = panesOf(board.layout)
        placeTab(board, 'file:x.md', left.id, 'center')
        expect(board.layout.t).toBe('pane')
        expect(board.layout.tabs).toEqual(['agent:a', 'file:x.md'])
    })

    test('a lone tab dropped on the edge of its own pane stays where it is', () => {
        const board = { layout: pane(['agent:a']) }
        placeTab(board, 'agent:a', board.layout.id, 'right')
        expect(board.layout.t).toBe('pane')
    })
})

describe('the tab menu', () => {
    const three = () => {
        const board = emptyBoard()
        for (const tab of ['agent:a', 'agent:b', 'agent:c']) openTab(board, tab, { into: panesOf(board.layout)[0].id })
        return board
    }

    test('closing the others leaves only this tab, in front', () => {
        const board = three()
        closeOtherTabs(board, 'agent:b')
        expect(tabsOf(board)).toEqual([['agent:b']])
        expect(panesOf(board.layout)[0].active).toBe('agent:b')
    })

    test('closing the ones to the right keeps this tab and those before it', () => {
        const board = three()
        panesOf(board.layout)[0].active = 'agent:c'
        closeTabsRight(board, 'agent:a')
        expect(tabsOf(board)).toEqual([['agent:a']])
        expect(panesOf(board.layout)[0].active).toBe('agent:a')
        const again = three()
        closeTabsRight(again, 'agent:b')
        expect(tabsOf(again)).toEqual([['agent:a', 'agent:b']])
    })

    test('splitting to the right puts the tab in a new pane beside', () => {
        const board = three()
        placeTab(board, 'agent:b', panesOf(board.layout)[0].id, 'right')
        expect(tabsOf(board)).toEqual([['agent:a', 'agent:c'], ['agent:b']])
    })
})
