// The panel's microphone: one piece for dictation, for the narration of a
// taught task and for the voice mode.
//
// It records raw samples and writes WAV itself (16 kHz, mono, 16-bit): every
// browser can, and both transcribers take it, which is not true of the
// MediaRecorder formats (Safari makes MP4, Chrome makes WebM).
//
// With `onUtterance` it also cuts the speech into utterances by loudness: a
// start when the level stays above the room's noise, an end after a silence.
// That is the voice mode's turn taking.

const TARGET_RATE = 16000;
const FRAME = 4096;

function downsample(samples, fromRate) {
  if (fromRate === TARGET_RATE) return samples;
  const ratio = fromRate / TARGET_RATE;
  const length = Math.floor(samples.length / ratio);
  const result = new Float32Array(length);
  for (let index = 0; index < length; index++) {
    const start = Math.floor(index * ratio);
    const end = Math.min(samples.length, Math.floor((index + 1) * ratio));
    let sum = 0;
    for (let cursor = start; cursor < end; cursor++) sum += samples[cursor];
    result[index] = sum / Math.max(1, end - start);
  }
  return result;
}

export function toWav(chunks) {
  const length = chunks.reduce((total, chunk) => total + chunk.length, 0);
  const buffer = new ArrayBuffer(44 + length * 2);
  const view = new DataView(buffer);
  const write = (offset, text) =>
    [...text].forEach((char, index) =>
      view.setUint8(offset + index, char.charCodeAt(0)),
    );
  write(0, 'RIFF');
  view.setUint32(4, 36 + length * 2, true);
  write(8, 'WAVE');
  write(12, 'fmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, TARGET_RATE, true);
  view.setUint32(28, TARGET_RATE * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  write(36, 'data');
  view.setUint32(40, length * 2, true);
  let offset = 44;
  for (const chunk of chunks) {
    for (const sample of chunk) {
      const clamped = Math.max(-1, Math.min(1, sample));
      view.setInt16(
        offset,
        clamped < 0 ? clamped * 0x8000 : clamped * 0x7fff,
        true,
      );
      offset += 2;
    }
  }
  return new Blob([buffer], { type: 'audio/wav' });
}

const rms = (samples) => {
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
};

/**
 * Opens the microphone. Options:
 *   onLevel(0..1)        the voice's level, for a meter
 *   onUtterance(wav)     each finished utterance (turns on the cutting)
 *   onSpeechStart()      someone started talking (to stop the bot's voice)
 *   silenceMs            how long a pause ends an utterance (default 800)
 *   onSilence()          with no onUtterance: called after speech and then
 *                        `silenceMs` of quiet (dictation stops by itself)
 */
export async function openMicrophone({
  onLevel,
  onUtterance,
  onSpeechStart,
  onSilence,
  silenceMs = 800,
} = {}) {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    },
  });
  const AudioContextClass = window.AudioContext || window.webkitAudioContext;
  const context = new AudioContextClass();
  const source = context.createMediaStreamSource(stream);
  const processor = context.createScriptProcessor(FRAME, 1, 1);
  const frameMs = (FRAME / context.sampleRate) * 1000;

  let recorded = [];
  let utterance = [];
  const preRoll = [];
  let isSpeaking = false;
  let hasSpoken = false;
  let loudFrames = 0;
  let quietMs = 0;
  let noiseFloor = 0.008;
  let isPaused = false;
  let threshold = 1;

  processor.onaudioprocess = (event) => {
    const input = event.inputBuffer.getChannelData(0);
    const samples = downsample(new Float32Array(input), context.sampleRate);
    const level = rms(input);
    onLevel?.(Math.min(1, level * 12));
    if (isPaused) return;
    if (!onUtterance) recorded.push(samples);

    // The room's noise, learned while nobody talks.
    if (!isSpeaking)
      noiseFloor = noiseFloor * 0.95 + Math.min(level, 0.05) * 0.05;
    const isLoud = level > Math.max(0.015, noiseFloor * 3) * threshold;

    if (isLoud) {
      loudFrames++;
      quietMs = 0;
      if (!isSpeaking && loudFrames >= 2) {
        isSpeaking = true;
        hasSpoken = true;
        onSpeechStart?.();
        utterance = [...preRoll];
      }
    } else {
      loudFrames = 0;
      if (isSpeaking || hasSpoken) quietMs += frameMs;
    }

    if (onUtterance) {
      if (isSpeaking) utterance.push(samples);
      else {
        preRoll.push(samples);
        if (preRoll.length > 4) preRoll.shift();
      }
      if (isSpeaking && quietMs >= silenceMs) {
        isSpeaking = false;
        const finished = utterance;
        utterance = [];
        // Under half a second is a cough or a click, not a sentence.
        if (finished.length * frameMs > 500) onUtterance(toWav(finished));
      }
    } else if (hasSpoken && quietMs >= silenceMs && !isSpeaking) {
      onSilence?.();
    } else if (isSpeaking && quietMs >= silenceMs) {
      isSpeaking = false;
    }
  };

  source.connect(processor);
  processor.connect(context.destination);

  return {
    /** Everything recorded so far, as WAV (dictation, narration). */
    takeRecording() {
      const wav = toWav(recorded);
      recorded = [];
      hasSpoken = false;
      return wav;
    },
    hasSpoken: () => hasSpoken,
    isSpeaking: () => isSpeaking,
    /** Louder speech is needed while the bot talks: its voice is not a turn. */
    setThreshold(value) {
      threshold = value;
    },
    setPaused(value) {
      isPaused = value;
    },
    close() {
      processor.disconnect();
      source.disconnect();
      stream.getTracks().forEach((track) => track.stop());
      context.close().catch(() => {});
    },
  };
}
