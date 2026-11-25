import { kindOf, refOf } from './layout.js'

// The address of a tab, so a reload or a pasted link opens the same view.
//
// A file's path goes in the query (`/files?path=README.md`), never in the
// route: a static host serves the panel's index.html only for a route without a
// dot, and answers 404 for "/files/README.md" as a missing static file.
export function pathOf(tab) {
    const kind = kindOf(tab)
    const ref = refOf(tab)
    if (kind === 'agent') return `/agents/${ref}`
    if (kind === 'settings') return `/agents/${ref}/settings`
    if (kind === 'screen') return `/agents/${ref}/screen`
    if (kind === 'template') return `/templates/${ref}`
    if (kind === 'file') return `/files?path=${encodeURIComponent(ref)}`
    // A file of an agent's computer: "<botId>/<path in its workspace>".
    if (kind === 'cfile') return `/agents/${ref.slice(0, ref.indexOf('/'))}/files?path=${encodeURIComponent(ref.slice(ref.indexOf('/') + 1))}`
    return '/'
}

// The tab an address (route and query) opens, or null for the command center and the settings.
export function tabOf(address) {
    const [pathname, query = ''] = address.split('?')
    const parts = pathname.split('/').filter(Boolean)
    const file = new URLSearchParams(query).get('path')
    if (parts[0] === 'agents' && parts[1] && parts[2] === 'files') return file ? `cfile:${parts[1]}/${file}` : `agent:${parts[1]}`
    if (parts[0] === 'agents' && parts[1]) return parts[2] === 'settings' ? `settings:${parts[1]}` : parts[2] === 'screen' ? `screen:${parts[1]}` : `agent:${parts[1]}`
    if (parts[0] === 'templates' && parts[1]) return `template:${parts[1]}`
    if (parts[0] === 'files' && file) return `file:${file}`
    return null
}
