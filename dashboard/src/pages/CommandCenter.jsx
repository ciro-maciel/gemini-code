import { useEffect, useRef, useState } from 'react'
import { useLocation } from 'react-router-dom'

import { createBot, fetchDeliveries, sendBotMessage, updateBot } from '../services/api'
import { notify } from '../components/zen'
import { Composer } from '../agent/Composer'
import { BuildRow } from '../agent/BuildRow'
import { AgentAvatar } from '../shell/AgentAvatar'
import { SEARCH_ICON } from '../shell/Column'
import { botsChanged } from '../state/use-bots'
import { waitsOn } from '../state/agents'
import { findTemplates } from '../state/templates'

// An agent is named after what it was asked, as a conversation title.
export const nameFrom = text => {
    const line = text.trim().split('\n')[0]
    return line.length > 34 ? `${line.slice(0, 34).trimEnd()}…` : line || 'New agent'
}

const greeting = (hour = new Date().getHours()) => (hour < 12 ? 'Good morning' : hour < 18 ? 'Good afternoon' : 'Good evening')

/**
 * The command center: the Mesa with nothing open. The request that starts an
 * agent, where to continue, the latest deliveries and the templates.
 */
export function CommandCenter({ account, bots, templates, onOpenAgent, onOpenTemplate, onNewTemplate }) {
    const [draft, setDraft] = useState({ templateId: null, model: null, effort: null, instructions: null })
    const [isSending, setIsSending] = useState(false)
    const [deliveries, setDeliveries] = useState(null)
    const [query, setQuery] = useState('')
    const [area, setArea] = useState('All')
    const composerRef = useRef(null)

    // A request typed in the search arrives here, ready to send.
    const location = useLocation()
    useEffect(() => {
        if (location.state?.draft) composerRef.current?.setText(location.state.draft)
        // "Novo agente nesta pasta": the folder chip starts on it.
        if (location.state?.folder) setDraft(current => ({ ...current, folder: location.state.folder }))
        // "Novo agente neste grupo": the agent is born inside it.
        if (location.state?.sectionId) setDraft(current => ({ ...current, sectionId: location.state.sectionId }))
    }, [location.state])

    useEffect(() => {
        fetchDeliveries()
            .then(data => setDeliveries(data.items))
            .catch(() => setDeliveries([]))
    }, [])

    const template = templates.find(item => item.id === draft.templateId) || null
    const list = bots ?? []
    const running = list.filter(bot => bot.runningCount).length
    const waiting = list.filter(bot => waitsOn(bot)).length
    const last = [...list].sort((a, b) => (b.lastActivityAt || 0) - (a.lastActivityAt || 0))[0]
    const used = id => list.filter(bot => bot.templateId === id).length
    const found = findTemplates(templates, query, area)
    const areas = ['All', ...new Set(templates.map(item => item.area))]

    const start = async text => {
        setIsSending(true)
        try {
            // The central copies the template (instructions, model, effort, skills); the draft's own choices win.
            const chosen = Object.fromEntries(Object.entries({ templateId: draft.templateId, aiAccount: draft.aiAccount, model: draft.model, effort: draft.effort, instructions: draft.instructions }).filter(([, value]) => value !== undefined && value !== null))
            const bot = await createBot({ name: nameFrom(text), ...chosen })
            const extra = Object.fromEntries(Object.entries({ folder: draft.folder, connectionIds: draft.connectionIds, sectionId: draft.sectionId }).filter(([, value]) => value !== undefined && value !== null))
            if (Object.keys(extra).length) await updateBot(bot.id, extra).catch(() => {})
            await sendBotMessage(bot.id, text)
            botsChanged()
            setDraft({ templateId: null, aiAccount: null, model: null, effort: null, instructions: null })
            onOpenAgent(bot.id)
            return true
        } catch (error) {
            notify.error(error.message)
            return false
        } finally {
            setIsSending(false)
        }
    }

    return (
        <div className="page">
            <div className="page-in">
                <div>
                    <h1>
                        <span className="gm-greeting">
                            {greeting()}, {account?.name || 'Developer'}
                        </span>
                    </h1>
                    <p
                        className="lead"
                        style={{ marginTop: 6 }}
                    >
                        {running ? `${running} ${running === 1 ? 'agent running' : 'agents running'}.` : 'Ready to code with Google Gemini.'} {waiting ? `${waiting} ${waiting === 1 ? 'agent waiting' : 'agents waiting'} for your review.` : ''}
                    </p>
                </div>
                <Composer
                    ref={composerRef}
                    variant="start"
                    placeholder="What should we build, debug, or review today?"
                    isSending={isSending}
                    onSend={start}
                    build={
                        <BuildRow
                            bot={{ model: draft.model ?? template?.model, effort: draft.effort ?? template?.effort, instructions: draft.instructions ?? template?.instructions ?? '', folder: draft.folder, aiAccount: draft.aiAccount, connectionIds: draft.connectionIds }}
                            templates={templates}
                            template={template}
                            onPickTemplate={item => setDraft(current => ({ ...current, templateId: item.id, instructions: null }))}
                            onNewTemplate={onNewTemplate}
                            onChange={fields => setDraft(current => ({ ...current, ...fields }))}
                        />
                    }
                />
                {last && (
                    <button
                        className="chip-btn"
                        onClick={() => onOpenAgent(last.id)}
                    >
                        Continuar "{last.name}"
                    </button>
                )}
                <div
                    className="box"
                    data-box="deliveries"
                >
                    <div className="bh">
                        <i className="ti ti-package" />
                        <b className="grow">Últimas entregas</b>
                    </div>
                    <div className="bb">
                        {deliveries === null ? (
                            <p className="muted">Carregando…</p>
                        ) : deliveries.length ? (
                            deliveries.map(item => (
                                <div
                                    key={item.id}
                                    className="row link"
                                    role="button"
                                    tabIndex={0}
                                    onClick={() => onOpenAgent(item.botId)}
                                >
                                    <AgentAvatar
                                        bot={list.find(bot => bot.id === item.botId) || { name: item.botName }}
                                        size="sm"
                                    />
                                    <div className="grow">
                                        <b>{item.title}</b>
                                        <div className="muted">{item.verdict || item.botName}</div>
                                    </div>
                                    {item.pendingChoices ? <span className="pill-st dash">escolher</span> : <span className="pill-st">vista</span>}
                                </div>
                            ))
                        ) : (
                            <p className="muted">Nenhuma entrega ainda.</p>
                        )}
                    </div>
                </div>
                <div
                    className="box"
                    data-box="templates"
                >
                    <div className="bh">
                        <i className="ti ti-template" />
                        <b className="grow">Modelos</b>
                        <span className="muted">{templates.length} modelos · de onde um agente nasce</span>
                        {onNewTemplate && (
                            <button
                                className="btn outline sm"
                                onClick={onNewTemplate}
                            >
                                <i className="ti ti-plus" />
                                Novo modelo
                            </button>
                        )}
                    </div>
                    <div className="bb tpl-find">
                        <label className="tpl-q">
                            {SEARCH_ICON}
                            <input
                                placeholder="Buscar por nome, área, serviço ou habilidade…"
                                aria-label="Buscar modelos"
                                value={query}
                                onChange={event => setQuery(event.target.value)}
                            />
                        </label>
                        <div className="filters">
                            {areas.map(name => (
                                <button
                                    key={name}
                                    className={area === name ? 'on' : ''}
                                    onClick={() => setArea(name)}
                                >
                                    {name}
                                </button>
                            ))}
                        </div>
                        {found.length ? (
                            <div className="grid3">
                                {found.map(item => (
                                    <div
                                        key={item.id}
                                        className="tile link"
                                        role="button"
                                        tabIndex={0}
                                        onClick={() => onOpenTemplate(item.id)}
                                    >
                                        <span className="nm">
                                            <AgentAvatar
                                                bot={null}
                                                icon={item.icon}
                                            />
                                            <span className="grow">{item.name}</span>
                                            {used(item.id) > 0 && (
                                                <span className="pill-st">
                                                    {used(item.id)} {used(item.id) === 1 ? 'agente' : 'agentes'}
                                                </span>
                                            )}
                                        </span>
                                        <p>{item.owns.charAt(0).toUpperCase() + item.owns.slice(1)}.</p>
                                        <span className="ft">
                                            <span className="tpl-area">{item.area}</span>
                                            <span className="grow" />
                                            <i className="ti ti-plug" />
                                            {item.uses?.length ?? 0}
                                            <i
                                                className="ti ti-sparkles"
                                                style={{ marginLeft: 8 }}
                                            />
                                            {item.skills?.length ?? 0}
                                        </span>
                                    </div>
                                ))}
                            </div>
                        ) : (
                            <p
                                className="muted"
                                style={{ padding: '8px 0' }}
                            >
                                Nenhum modelo com "{query}".
                            </p>
                        )}
                    </div>
                </div>
            </div>
        </div>
    )
}
