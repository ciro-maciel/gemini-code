import { templateById } from '../state/templates'

/**
 * An agent's face, as the prototype draws it: the dark square with the glyph
 * of the template it came from (the Assistant's own when it started from zero).
 */
export function AgentAvatar({ bot, icon, size = 'md' }) {
    const glyph = icon || templateById(bot?.templateId)?.icon || 'ti-sparkles'
    return (
        <span className={`av agent${size === 'sm' ? ' sm' : ''}`}>
            <i className={`ti ${glyph}`} />
        </span>
    )
}
