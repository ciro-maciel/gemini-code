import { useEffect, useRef, useState } from 'react'

import { activate, closeTab, placeTab } from './layout'

// A tab dropped near a pane's edge splits it; in the middle (or on the tab bar) it joins.
function zoneAt(rect, x, y) {
    const fx = (x - rect.left) / rect.width
    const fy = (y - rect.top) / rect.height
    if (y - rect.top < 44) return 'center'
    return fx < 0.25 ? 'left' : fx > 0.75 ? 'right' : fy < 0.25 ? 'top' : fy > 0.75 ? 'bottom' : 'center'
}

function dropRect(rect, zone, origin) {
    let [left, top, width, height] = [rect.left - origin.left, rect.top - origin.top, rect.width, rect.height]
    if (zone === 'right') {
        left += width / 2
        width /= 2
    } else if (zone === 'left') width /= 2
    else if (zone === 'bottom') {
        top += height / 2
        height /= 2
    } else if (zone === 'top') height /= 2
    return { left, top, width, height }
}

// A finger held on a tab opens its menu, as the right button does with a mouse.
const HOLD_MS = 550

function Pane({ pane, tabInfo, renderTab, tools, onTab, onClose, onDragStart, onFocus, onTabMenu = null }) {
    const holdRef = useRef(null)
    const openMenu = (tab, x, y) => onTabMenu?.({ x, y, pane, tab })
    // An agent at work in this pane: its edge carries the working glow (neural-expressive.css).
    const isLive = pane.tabs.some(tab => tabInfo(tab).live)
    return (
        <section
            className={`pane${isLive ? ' is-live' : ''}`}
            data-pane={pane.id}
            // A click anywhere in a pane puts its tab in front: the column follows the pane in use (30/10).
            onPointerDownCapture={() => pane.active && onFocus?.(pane.active)}
        >
            <div className="pane-bar">
                <div className="ptabs">
                    {pane.tabs.map(tab => {
                        const info = tabInfo(tab)
                        return (
                            <div
                                key={tab}
                                className={`ptab${tab === pane.active ? ' on' : ''}`}
                                role="tab"
                                tabIndex={0}
                                aria-selected={tab === pane.active}
                                aria-haspopup={onTabMenu ? 'menu' : undefined}
                                onPointerDown={event => {
                                    if (event.pointerType === 'touch' && onTabMenu) {
                                        const { clientX, clientY } = event
                                        holdRef.current = setTimeout(() => openMenu(tab, clientX, clientY), HOLD_MS)
                                    }
                                    onDragStart(event, tab)
                                }}
                                onPointerUp={() => clearTimeout(holdRef.current)}
                                onPointerMove={() => clearTimeout(holdRef.current)}
                                onPointerCancel={() => clearTimeout(holdRef.current)}
                                onContextMenu={event => {
                                    if (!onTabMenu) return
                                    event.preventDefault()
                                    clearTimeout(holdRef.current)
                                    openMenu(tab, event.clientX, event.clientY)
                                }}
                                onKeyDown={event => {
                                    if (event.key === 'Enter' || event.key === ' ') {
                                        event.preventDefault()
                                        onTab(pane, tab)
                                    }
                                    if (onTabMenu && (event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10'))) {
                                        event.preventDefault()
                                        const box = event.currentTarget.getBoundingClientRect()
                                        openMenu(tab, box.left, box.bottom)
                                    }
                                }}
                                onClick={() => onTab(pane, tab)}
                            >
                                <i className={`ti ${info.icon}`} />
                                <span className="n">{info.name}</span>
                                {info.live && <span className="live" />}
                                <button
                                    className="x"
                                    aria-label="Fechar"
                                    onPointerDown={event => event.stopPropagation()}
                                    onClick={event => {
                                        event.stopPropagation()
                                        onClose(tab)
                                    }}
                                >
                                    <i className="ti ti-x" />
                                </button>
                            </div>
                        )
                    })}
                </div>
                {tools(pane)}
            </div>
            <div className="pane-body">
                {pane.active ? (
                    renderTab(pane.active, pane)
                ) : (
                    <div className="pane-empty">
                        <i className="ti ti-layout-grid" />
                        <b>Painel vazio</b>
                        <span className="muted">arraste uma aba ou um arquivo pra cá</span>
                    </div>
                )}
            </div>
        </section>
    )
}

function Node({ node, path, ...rest }) {
    if (node.t === 'pane')
        return (
            <Pane
                pane={node}
                {...rest}
            />
        )
    return (
        <div className={`split${node.dir === 'col' ? ' col' : ''}`}>
            <div
                className="cell"
                style={{ flex: `${node.r ?? 0.5} 1 0` }}
            >
                <Node
                    node={node.a}
                    path={[...path, 'a']}
                    {...rest}
                />
            </div>
            <div
                className="gutter"
                onPointerDown={event => rest.onGutter(event, path, node.dir)}
            />
            <div
                className="cell"
                style={{ flex: `${1 - (node.r ?? 0.5)} 1 0` }}
            >
                <Node
                    node={node.b}
                    path={[...path, 'b']}
                    {...rest}
                />
            </div>
        </div>
    )
}

const nodeAt = (layout, path) => path.reduce((node, key) => node[key], layout)

/**
 * The Mesa: panes of tabs that drag, split and resize. `change` receives a
 * function that edits a copy of the board; `remove` does the same for what
 * closes a tab, so the address can follow.
 */
export function Mesa({ board, change, remove = change, tabInfo, renderTab, tools, onActivate, onFocus, onTabMenu = null }) {
    const rootRef = useRef(null)
    const ghostRef = useRef(null)
    const [drop, setDrop] = useState(null)
    const dragRef = useRef(null)

    const onTab = (pane, tab) => {
        if (dragRef.current?.moved) return
        change(next => activate(next, pane.id, tab))
        onActivate?.(tab)
    }

    const onDragStart = (event, tab) => {
        if (event.button !== 0) return
        dragRef.current = { tab, x: event.clientX, y: event.clientY, moved: false, target: null }
    }

    useEffect(() => {
        const move = event => {
            const drag = dragRef.current
            if (!drag) return
            if (!drag.moved) {
                if (Math.hypot(event.clientX - drag.x, event.clientY - drag.y) < 6) return
                drag.moved = true
                ghostRef.current.textContent = tabInfo(drag.tab).name
                ghostRef.current.classList.add('on')
            }
            ghostRef.current.style.transform = `translate(${event.clientX + 14}px,${event.clientY + 16}px)`
            const paneEl = document.elementFromPoint(event.clientX, event.clientY)?.closest('.pane')
            if (!paneEl || !rootRef.current.contains(paneEl)) {
                drag.target = null
                setDrop(null)
                return
            }
            const rect = paneEl.getBoundingClientRect()
            const zone = zoneAt(rect, event.clientX, event.clientY)
            drag.target = { pane: paneEl.dataset.pane, zone }
            setDrop(dropRect(rect, zone, rootRef.current.getBoundingClientRect()))
        }
        const up = () => {
            const drag = dragRef.current
            if (!drag) return
            ghostRef.current.classList.remove('on')
            setDrop(null)
            if (drag.moved && drag.target) change(next => placeTab(next, drag.tab, drag.target.pane, drag.target.zone))
            // The click that follows a drag must not activate the tab under the pointer.
            setTimeout(() => (dragRef.current = null), 0)
        }
        addEventListener('pointermove', move)
        addEventListener('pointerup', up)
        return () => {
            removeEventListener('pointermove', move)
            removeEventListener('pointerup', up)
        }
    }, [change, tabInfo])

    const onGutter = (event, path, dir) => {
        event.preventDefault()
        const box = event.currentTarget.parentElement
        const isCol = dir === 'col'
        const move = ev => {
            const rect = box.getBoundingClientRect()
            const ratio = Math.min(0.85, Math.max(0.15, isCol ? (ev.clientY - rect.top) / rect.height : (ev.clientX - rect.left) / rect.width))
            change(next => {
                nodeAt(next.layout, path).r = ratio
            })
        }
        const up = () => {
            removeEventListener('pointermove', move)
            removeEventListener('pointerup', up)
        }
        addEventListener('pointermove', move)
        addEventListener('pointerup', up)
    }

    return (
        <main
            className="mesa"
            ref={rootRef}
            aria-label="Mesa"
        >
            <Node
                node={board.layout}
                path={[]}
                tabInfo={tabInfo}
                renderTab={renderTab}
                tools={tools}
                onTab={onTab}
                onClose={tab => remove(next => closeTab(next, tab))}
                onDragStart={onDragStart}
                onGutter={onGutter}
                onFocus={onFocus}
                onTabMenu={onTabMenu}
            />
            <div
                className={`drop${drop ? ' on' : ''}`}
                style={drop || undefined}
            />
            <div
                className="ghost"
                ref={ghostRef}
            />
        </main>
    )
}
