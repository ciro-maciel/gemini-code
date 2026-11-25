// The quiet line a permission leaves once someone decided it.
export function decisionText(data) {
    const head = data.isApproved && data.note ? 'Permitido com a sua mudança' : data.isApproved ? (data.reach === 'always' ? 'Sempre permitido · vale 90 dias' : 'Permitido até o fim da tarefa') : data.isSuperseded ? 'Ficou sem decisão: você escreveu antes' : 'Recusado'
    return `${head}${data.summary ? ` · ${data.summary}` : ''}${data.note ? ` · "${data.note}"` : ''}`
}
