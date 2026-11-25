import { useState } from 'react'

import { fetchThread, sendBotMessage, takeOverTask } from '../services/api'
import { canWork, isActive } from '../labels'
import { LiveScreen } from '../components/LazyLiveScreen'
import { TakeoverScreen } from '../components/TakeoverScreen'
import { TeachScreen } from '../components/TeachScreen'
import { notify } from '../components/zen'

/** The agent's own computer, as a tab like any other: watch it, take it over, or teach it. */
export function ScreenTab({ bot }) {
    const [isTakenOver, setIsTakenOver] = useState(false)
    const [isTeaching, setIsTeaching] = useState(false)

    const takeOver = async () => {
        try {
            const thread = await fetchThread(bot.id)
            if (thread && (isActive(thread.status) || ['done', 'failed', 'cancelled'].includes(thread.status))) await takeOverTask(thread.id)
            setIsTakenOver(true)
        } catch (error) {
            notify.error(error.message)
        }
    }
    const giveBack = async note => {
        setIsTakenOver(false)
        try {
            const thread = await fetchThread(bot.id)
            if (thread?.status === 'waiting_user' && thread.waitingReason === 'takeover') await sendBotMessage(bot.id, note || 'Pronto, pode continuar.')
        } catch (error) {
            notify.error(error.message)
        }
    }

    if (!canWork(bot.status))
        return (
            <div className="pane-empty">
                <i className="ti ti-device-desktop" />
                <b>O computador ainda não está pronto</b>
                <span className="muted">Ele liga na primeira vez que o agente precisa de navegador ou terminal.</span>
            </div>
        )

    return (
        <div className="live-screen">
            <div className="ls-bar">
                <span className="live" />
                <b>Ao vivo · computador do {bot.name}</b>
                <span className="grow" />
                <button
                    className="btn outline sm"
                    onClick={() => setIsTeaching(true)}
                >
                    <i className="ti ti-hand-finger" />
                    Ensinar uma tarefa
                </button>
                <button
                    className="btn filled sm"
                    onClick={takeOver}
                >
                    Assumir a tela
                </button>
            </div>
            <div className="ls-frame">
                <LiveScreen
                    botId={bot.id}
                    isInteractive={false}
                    height="100%"
                />
            </div>
            <p
                className="fine"
                style={{ padding: '0 14px 12px' }}
            >
                O agente usa este computador sozinho. Assumir a tela deixa você usar; ensinar grava o que você faz e vira uma habilidade.
            </p>
            <TakeoverScreen
                bot={bot}
                opened={isTakenOver}
                onClose={() => setIsTakenOver(false)}
                onReturn={giveBack}
            />
            <TeachScreen
                bot={bot}
                opened={isTeaching}
                onClose={() => setIsTeaching(false)}
            />
        </div>
    )
}
