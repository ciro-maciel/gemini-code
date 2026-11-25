import { useEffect, useSyncExternalStore } from 'react'

import { fetchTemplates } from '../services/api'

// The templates the account can start from (the central's house ones and its
// own), held once for every screen: the avatars, the command center, the
// picker, the search.
let state = { items: [], areas: [], isLoaded: false }
const listeners = new Set()
const emit = () => listeners.forEach(listener => listener())

export function reloadTemplates() {
    return fetchTemplates()
        .then(data => {
            state = { items: data.items, areas: data.areas, isLoaded: true }
            emit()
        })
        .catch(() => {})
}

export function useTemplates() {
    const snapshot = useSyncExternalStore(
        listener => {
            listeners.add(listener)
            return () => listeners.delete(listener)
        },
        () => state
    )
    useEffect(() => {
        if (!state.isLoaded) reloadTemplates()
    }, [])
    return snapshot
}

export const templateById = id => (id ? state.items.find(template => template.id === id) || null : null)

const fold = text => (text || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')

/** The command center's search: name, area, what it owns, services and skills, without accents. */
export function findTemplates(templates, query = '', area = 'All') {
    const q = fold(query)
    const isAll = area === 'All' || area === 'Todas'
    return templates.filter(
        template =>
            (isAll || template.area === area) &&
            (!q || fold([template.name, template.area, template.owns, template.measure, ...(template.uses || []).map(use => use.service), ...(template.skills || []).map(skill => skill.name)].join(' ')).includes(q))
    )
}

/** Handoffs read both ways, so two templates always agree on who passes work to whom. */
export const fromOf = (template, templates) => [...new Set([...(template.from || []), ...templates.filter(other => (other.to || []).includes(template.id)).map(other => other.id)])]
export const toOf = (template, templates) => [...new Set([...(template.to || []), ...templates.filter(other => (other.from || []).includes(template.id)).map(other => other.id)])]
