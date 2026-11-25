// Words a person reads, in one place, so a status is named the same on every screen.

export const BOT_STATUS = {
    idle: 'Computador desligado',
    provisioning: 'Preparando o computador',
    ready: 'Pronto',
    failed: 'Falhou ao preparar',
}

export const POLICY_LABEL = {
    free: 'Livre',
    confirm: 'Confirma',
    human: 'Só humano',
}

// What a bot can be, in one sentence: "Criar com IA" and the waiting screen offer these.
export const AI_EXAMPLES = ['Um agente que lê todos os dias o Google Search Console e me entrega um relatório', 'Toda segunda, resume os e-mails da semana que ainda pedem resposta', 'Acompanha o preço de um produto em três lojas e me avisa quando baixar']

export const isActive = status => status === 'running' || status === 'queued'

// A bot without a computer yet ('idle') works like a ready one: it talks now
// and gets its computer the first time it needs a screen or a shell.
export const canWork = status => status === 'ready' || status === 'idle'

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez']
const clockOf = date => `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`

/**
 * When a message was sent (30/10): "agora", "há 12 min" within the hour, then
 * the day and the hour, "hoje, 14:32", "ontem, 09:05", "28 out, 14:32", with
 * the year when it is another one.
 */
export function messageWhen(seconds, nowSeconds = Date.now() / 1000) {
    if (!seconds) return ''
    const minutes = Math.floor((nowSeconds - seconds) / 60)
    if (minutes < 1) return 'agora'
    if (minutes < 60) return `há ${minutes} min`
    const date = new Date(seconds * 1000)
    const today = new Date(nowSeconds * 1000)
    const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
    const isSameDay = (first, second) => first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate()
    if (isSameDay(date, today)) return `hoje, ${clockOf(date)}`
    if (isSameDay(date, yesterday)) return `ontem, ${clockOf(date)}`
    const year = date.getFullYear() === today.getFullYear() ? '' : ` ${date.getFullYear()}`
    return `${date.getDate()} ${MONTHS[date.getMonth()]}${year}, ${clockOf(date)}`
}

export function formatWhen(seconds) {
    if (!seconds) return '—'
    const diff = Date.now() / 1000 - seconds
    if (diff < 60) return 'agora'
    if (diff < 3600) return `há ${Math.floor(diff / 60)} min`
    if (diff < 86400) return `há ${Math.floor(diff / 3600)} h`
    return new Date(seconds * 1000).toLocaleDateString('pt-BR', { day: '2-digit', month: 'short' })
}

