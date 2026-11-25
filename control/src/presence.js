import { publishBot } from './events.js'

// Who has a bot open right now ("vendo agora"): an open conversation stream
// counts, so two tabs of the same person are one person, and the last one
// closed takes them out. Kept in memory; a restart starts it empty and the
// panels' reconnection fills it again.

const open = new Map()

export const listSeeing = botId => [...(open.get(botId)?.values() ?? [])].map(person => ({ accountId: person.accountId, name: person.name, windows: person.count }))

function changed(botId) {
    publishBot(botId, 'seeing', { people: listSeeing(botId) })
}

/** A stream of this bot opened by an account; the returned function closes it. */
export function enterBot(botId, account) {
    if (!open.has(botId)) open.set(botId, new Map())
    const people = open.get(botId)
    const person = people.get(account.id) ?? { accountId: account.id, name: account.name || account.email || 'Pessoa', count: 0 }
    person.count++
    people.set(account.id, person)
    // A second window of the same person is news too: each one says "aberta também em outra janela".
    changed(botId)
    let isGone = false
    return () => {
        if (isGone) return
        isGone = true
        if (--person.count === 0) people.delete(account.id)
        if (!people.size) open.delete(botId)
        changed(botId)
    }
}
