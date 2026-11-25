import { toWav } from '../audio/microphone'

// One audio element for the voice mode, started inside the click that opens it.
// Safari (and Chrome without a recent gesture) refuses sound from a page that
// did not get a tap first; an element that played once from a tap may play
// again. Every sentence plays through this same element.

let element = null
let silenceUrl = null

export function voiceAudio() {
    if (!element) element = new Audio()
    return element
}

export function unlockVoiceAudio() {
    const audio = voiceAudio()
    // A tenth of a second of silence, made here: a real file, so the play counts.
    silenceUrl ??= URL.createObjectURL(toWav([new Float32Array(1600)]))
    audio.src = silenceUrl
    audio.play().catch(() => {})
}
