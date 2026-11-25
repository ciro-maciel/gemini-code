// The Mesa: panes of tabs, split in rows or columns, as in the prototype
// (business/editor/assistant). A tab is a string "<kind>:<ref>": agent:<botId>,
// settings:<botId>, screen:<botId>, file:<path>, template:<id>. Every function
// changes the board in place; the caller keeps a fresh copy for React.

let seq = 0
export const pane = (tabs = [], keep = false) => ({ t: 'pane', id: `p${++seq}`, tabs, active: tabs[0] || null, keep })
export const split = (dir, a, b) => ({ t: 'split', dir, a, b, r: 0.5 })
export const emptyBoard = () => ({ layout: pane() })

export function walk(node, fn, parent = null) {
    fn(node, parent)
    if (node.t === 'split') {
        walk(node.a, fn, node)
        walk(node.b, fn, node)
    }
}
export const panesOf = layout => {
    const out = []
    walk(layout, node => node.t === 'pane' && out.push(node))
    return out
}
export const paneById = (layout, id) => panesOf(layout).find(p => p.id === id)
export const paneOfTab = (layout, tab) => panesOf(layout).find(p => p.tabs.includes(tab))
export const isEmpty = layout => panesOf(layout).every(p => !p.tabs.length)
export const kindOf = tab => tab.slice(0, tab.indexOf(':'))
export const refOf = tab => tab.slice(tab.indexOf(':') + 1)

function parentOf(layout, target) {
    let found = null
    walk(layout, (node, parent) => {
        if (node === target) found = parent
    })
    return found
}

function replaceNode(board, target, replacement) {
    if (board.layout === target) {
        board.layout = replacement
        return
    }
    // Find the parent first: assigning while walking would descend into the replacement.
    const parent = parentOf(board.layout, target)
    if (parent.a === target) parent.a = replacement
    else parent.b = replacement
}

// An empty pane gives its place back to its sibling, unless it is the last one.
function collapse(board, p) {
    if (p.tabs.length || p.keep || board.layout === p) return
    const parent = parentOf(board.layout, p)
    replaceNode(board, parent, parent.a === p ? parent.b : parent.a)
}

function detach(board, tab) {
    const p = paneOfTab(board.layout, tab)
    if (!p) return null
    p.tabs = p.tabs.filter(t => t !== tab)
    if (p.active === tab) p.active = p.tabs.at(-1) || null
    return p
}

const isAgentTab = tab => kindOf(tab) === 'agent'

/**
 * Opens a tab where it reads best: where it already is; into the pane given;
 * an empty pane; beside a lone agent (anything that is not an agent opens to its
 * right); agents with agents, everything else in the last pane without agents.
 */
export function openTab(board, tab, { into } = {}) {
    const has = paneOfTab(board.layout, tab)
    if (has) {
        has.active = tab
        return
    }
    const panes = panesOf(board.layout)
    let target = into ? paneById(board.layout, into) : null
    if (!target) {
        const empty = panes.find(p => !p.tabs.length)
        if (empty) target = empty
        else if (panes.length === 1 && panes[0].tabs.some(isAgentTab) && !isAgentTab(tab)) {
            const side = pane([tab])
            replaceNode(board, panes[0], split('row', panes[0], side))
            return
        } else if (isAgentTab(tab)) target = panes.find(p => p.tabs.some(isAgentTab)) || panes[0]
        else target = [...panes].reverse().find(p => !p.tabs.some(isAgentTab)) || panes.at(-1)
    }
    target.tabs.push(tab)
    target.active = tab
    target.keep = false
}

export function closeTab(board, tab) {
    const p = detach(board, tab)
    if (p) collapse(board, p)
}

export function activate(board, paneId, tab) {
    const p = paneById(board.layout, paneId)
    if (p?.tabs.includes(tab)) p.active = tab
}

/** A tab dropped on a pane: in the middle it joins it; on an edge it splits it. */
export function placeTab(board, tab, paneId, zone) {
    const target = paneById(board.layout, paneId)
    if (!target) return
    const source = paneOfTab(board.layout, tab)
    if (zone === 'center') {
        if (source === target) {
            target.active = tab
            return
        }
        detach(board, tab)
        target.tabs.push(tab)
        target.active = tab
        target.keep = false
        if (source) collapse(board, source)
        return
    }
    if (source === target && target.tabs.length === 1) return
    detach(board, tab)
    const fresh = pane([tab])
    const isFirst = zone === 'left' || zone === 'top'
    replaceNode(board, target, split(zone === 'left' || zone === 'right' ? 'row' : 'col', isFirst ? fresh : target, isFirst ? target : fresh))
    if (source && source !== target) collapse(board, source)
    if (source === target) collapse(board, target)
}

export function closePane(board, paneId) {
    const p = paneById(board.layout, paneId)
    if (!p || board.layout === p) return
    p.tabs = []
    p.keep = false
    collapse(board, p)
}

export const closeAll = board => {
    board.layout = pane()
}

/** Removes every tab that points at a gone resource (a deleted agent). */
export function dropTabs(board, isGone) {
    for (const p of panesOf(board.layout)) for (const tab of [...p.tabs]) if (isGone(tab)) closeTab(board, tab)
}

/** "Fechar as outras": only this tab stays in its pane; it is in front. */
export function closeOtherTabs(board, tab) {
    const p = paneOfTab(board.layout, tab)
    if (!p) return
    for (const other of p.tabs.filter(each => each !== tab)) closeTab(board, other)
    const left = paneOfTab(board.layout, tab)
    if (left) left.active = tab
}

/** "Fechar as da direita": the tabs after this one in its pane close. */
export function closeTabsRight(board, tab) {
    const p = paneOfTab(board.layout, tab)
    if (!p) return
    const after = p.tabs.slice(p.tabs.indexOf(tab) + 1)
    for (const other of after) closeTab(board, other)
    const left = paneOfTab(board.layout, tab)
    if (left && !left.tabs.includes(left.active)) left.active = tab
}

export const cloneBoard = board => structuredClone(board)
