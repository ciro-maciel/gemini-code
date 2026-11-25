import { useEffect, useRef, useState } from 'react';
import { Box, Button, Group, Paper, Text } from '@mantine/core';

import {
  resolveApproval,
  sendBotMessage,
  speak,
  transcribe,
} from '../services/api';
import { openMicrophone } from '../audio/microphone';
import { LevelBars } from '../agent/Composer';
import { notify } from './zen';
import { voiceAudio } from './voice-audio';

// A spoken "sim" approves a pending action, "não" refuses it. Anything else is
// a message like any other. The whole utterance must be the answer: "sim, mas
// manda só para o João" is a message, not an approval.
const YES =
  /^(sim|pode|pode sim|pode ir|aprovo|aprovado|ok|okay|manda|claro|confirmo|confirma|isso|positivo)$/;
const NO = /^(não|nao|não pode|recuso|recusa|cancela|negativo|para|pare)$/;
const normalize = (text) =>
  text
    .toLowerCase()
    .replace(/[.,!?;:…"]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

// Where a spoken answer can be cut into sentences without waiting for the end.
const SENTENCE_END = /[.!?…:;](\s|$)|\n/g;
const MIN_SENTENCE = 24;

// A voice reads prose, not code: a closed block becomes a pause, and an open
// one stops the reading where it starts. This text only grows as the answer
// streams, so a position in it stays valid.
function speakablePart(text) {
  const withoutBlocks = text.replace(/```[\s\S]*?```/g, ' ');
  const open = withoutBlocks.indexOf('```');
  return open === -1 ? withoutBlocks : withoutBlocks.slice(0, open);
}

// A long answer is read up to here; the rest stays on the screen.
const TURN_BUDGET = 500;

const BARGE_IN_MS = 450;

const wordsOf = (text) =>
  normalize(text)
    .split(' ')
    .filter((word) => word.length > 2);

// The microphone caught the bot's own sentence: most of its words were just said.
function isEcho(text, log) {
  const words = wordsOf(text);
  if (words.length < 4) return false;
  const said = new Set(log.flatMap((entry) => entry.words));
  return words.filter((word) => said.has(word)).length / words.length >= 0.7;
}

const STATUS_TEXT = {
  listening: 'Ouvindo',
  hearing: 'Listening',
  transcribing: 'Entendendo',
  thinking: 'Pensando',
  speaking: 'Falando',
};

/**
 * The voice mode, in place of the message box. The same bot and the same
 * conversation: what the person says goes as a message, and the bot's answer
 * is read aloud as it is written.
 */
export function VoiceMode({ bot, thread, events, streaming, onExit }) {
  const [status, setStatus] = useState('listening');
  const [level, setLevel] = useState(0);
  const [heard, setHeard] = useState('');
  // The browser refused to play: a tap on the page lets it.
  const [isBlocked, setIsBlocked] = useState(false);
  // What the bot said lately, to tell its own voice (picked up by the
  // microphone on speakers) from the person's.
  const spokenLogRef = useRef([]);
  const micRef = useRef(null);
  const queueRef = useRef([]);
  const audioRef = useRef(null);
  const spokenRef = useRef({ turnId: null, upTo: 0, said: 0, isCut: false });
  // Turns already read to the end: a late piece of one is never read again.
  const finishedRef = useRef(new Set());
  const seenRef = useRef(null);
  const threadRef = useRef(thread);
  const busyRef = useRef(Promise.resolve());

  threadRef.current = thread;

  // --- Speaking -------------------------------------------------------------

  // One sentence at a time, in order. The voice for each is asked for as
  // soon as the sentence is known, but only one plays: two once played at
  // the same time, because the next started while the first was still
  // being fetched.
  const playingRef = useRef(false);
  const generationRef = useRef(0);
  const endCurrentRef = useRef(null);

  const stopSpeaking = () => {
    generationRef.current++;
    queueRef.current = [];
    audioRef.current?.pause();
    endCurrentRef.current?.();
    micRef.current?.setThreshold(1);
  };

  const playNext = async () => {
    if (playingRef.current) return;
    const next = queueRef.current.shift();
    if (!next) {
      micRef.current?.setThreshold(1);
      setStatus((current) => (current === 'speaking' ? 'listening' : current));
      return;
    }
    playingRef.current = true;
    const generation = generationRef.current;
    try {
      const blob = await next.audio;
      if (generation !== generationRef.current) return;
      const audio = voiceAudio();
      const url = URL.createObjectURL(blob);
      audio.src = url;
      audioRef.current = audio;
      // Its own voice must not count as the person's turn.
      micRef.current?.setThreshold(3.5);
      setStatus('speaking');
      spokenLogRef.current = [
        ...spokenLogRef.current.filter(
          (entry) => entry.at > Date.now() - 60_000,
        ),
        { at: Date.now(), words: wordsOf(next.text) },
      ];
      await new Promise((resolve) => {
        endCurrentRef.current = resolve;
        audio.onended = resolve;
        audio.onerror = resolve;
        audio.play().catch(() => {
          // Refused (no tap yet on this page): the sentence waits for one.
          setIsBlocked(true);
          unblockRef.current = () =>
            audio
              .play()
              .then(() => setIsBlocked(false))
              .catch(resolve);
        });
      });
      URL.revokeObjectURL(url);
    } catch {
      // A sentence whose voice failed is skipped; the next one plays.
    } finally {
      audioRef.current = null;
      endCurrentRef.current = null;
      playingRef.current = false;
      playNext();
    }
  };

  const unblockRef = useRef(null);

  const say = (text) => {
    const clean = text.trim();
    if (!clean) return;
    // A voice that does not come in 20 s is skipped, never left holding the queue.
    const audio = Promise.race([
      speak(clean),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('the voice took too long')), 20_000),
      ),
    ]);
    queueRef.current.push({ audio, text: clean });
    playNext();
  };

  // --- Listening ------------------------------------------------------------

  const handleUtterance = (wav) => {
    busyRef.current = busyRef.current.then(async () => {
      setStatus('transcribing');
      try {
        const { text } = await transcribe(wav, bot.id);
        if (!text || isEcho(text, spokenLogRef.current))
          return setStatus('listening');
        setHeard(text);
        const answer = normalize(text);
        const current = threadRef.current;
        const pending =
          current?.status === 'waiting_approval'
            ? current.approvals?.find(
                (approval) => approval.status === 'pending',
              )
            : null;
        if (pending && (YES.test(answer) || NO.test(answer))) {
          const isApproved = YES.test(answer);
          await resolveApproval(current.id, pending.id, {
            isApproved,
            note: isApproved ? null : 'declined by voice',
          });
          say(isApproved ? 'Approved. Continuing.' : "Okay, I won't do it.");
        } else {
          await sendBotMessage(bot.id, text);
        }
        setStatus('thinking');
      } catch (error) {
        notify.error("Couldn't hear you", error.message);
        setStatus('listening');
      }
    });
  };

  useEffect(() => {
    let isOpen = true;
    openMicrophone({
      onLevel: setLevel,
      onUtterance: handleUtterance,
      // Talking over the bot stops its voice: the person has the turn. Only
      // speech that lasts: a cough, or the bot's own voice on speakers,
      // used to cut it after 170 ms.
      onSpeechStart: () => {
        if (!(audioRef.current || queueRef.current.length))
          return setStatus('hearing');
        setTimeout(() => {
          if (micRef.current?.isSpeaking()) {
            stopSpeaking();
            setStatus('hearing');
          }
        }, BARGE_IN_MS);
      },
    })
      .then((mic) => {
        if (!isOpen) return mic.close();
        micRef.current = mic;
      })
      .catch(() => {
        notify.error(
          'No microphone access',
          'Allow microphone access for this site in your browser permissions.',
        );
        onExit();
      });
    return () => {
      isOpen = false;
      micRef.current?.close();
      micRef.current = null;
      stopSpeaking();
    };
    // The microphone opens once per voice session.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // What the bot writes while the voice mode is on is read aloud: the
  // streaming answer sentence by sentence, then whatever is left at its end.
  // Reads a piece of the turn, within its budget.
  const sayPart = (text) => {
    const spoken = spokenRef.current;
    if (spoken.isCut || !text.trim()) return;
    if (spoken.said + text.length > TURN_BUDGET && spoken.said > 0) {
      spoken.isCut = true;
      say('The rest is on screen.');
      return;
    }
    spoken.said += text.length;
    say(text);
  };

  useEffect(() => {
    if (!streaming?.text || finishedRef.current.has(streaming.turnId)) return;
    if (spokenRef.current.turnId !== streaming.turnId)
      spokenRef.current = {
        turnId: streaming.turnId,
        upTo: 0,
        said: 0,
        isCut: false,
      };
    const pendingText = speakablePart(streaming.text).slice(
      spokenRef.current.upTo,
    );
    let cut = -1;
    for (const match of pendingText.matchAll(SENTENCE_END))
      if (match.index + 1 >= MIN_SENTENCE) cut = match.index + 1;
    if (cut > 0) {
      sayPart(pendingText.slice(0, cut));
      spokenRef.current.upTo += cut;
    }
    // Only new text speaks: say and sayPart are new on every render, and listing them would speak again.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streaming]);

  useEffect(() => {
    if (!events) return;
    // Only what happens from now on: the history is not read aloud.
    if (seenRef.current === null) {
      seenRef.current = events.at(-1)?.seq ?? 0;
      return;
    }
    for (const event of events) {
      if (!event.seq || event.seq <= seenRef.current) continue;
      seenRef.current = event.seq;
      if (event.type === 'assistant') {
        if (finishedRef.current.has(event.data.turnId)) continue;
        finishedRef.current.add(event.data.turnId);
        const spoken = spokenRef.current;
        if (spoken.turnId !== event.data.turnId)
          spokenRef.current = {
            turnId: event.data.turnId,
            upTo: 0,
            said: 0,
            isCut: false,
          };
        sayPart(speakablePart(event.data.text).slice(spokenRef.current.upTo));
        spokenRef.current = { turnId: null, upTo: 0, said: 0, isCut: false };
      } else if (event.type === 'tool_call' && event.data.name === 'ask_user') {
        say(event.data.arguments?.question || '');
      } else if (event.type === 'approval_requested') {
        say(
          `I need your approval to: ${event.data.summary}. Say yes to approve, or no to decline.`,
        );
      } else if (event.type === 'status' && event.data.status === 'failed') {
        say('I stopped with an error. Details are on screen.');
      }
    }
    // Only new events speak; see the effect above.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [events]);

  const isBotWorking =
    thread?.status === 'running' || thread?.status === 'queued';
  const shown = status === 'thinking' && !isBotWorking ? 'listening' : status;

  return (
    <Paper p={12} bg="var(--gm-surface)">
      <Group justify="space-between" wrap="nowrap" gap={16}>
        <Group gap={14} wrap="nowrap" miw={0}>
          <Box
            w={40}
            h={40}
            bg="var(--gm-primary)"
            style={{
              display: 'grid',
              placeItems: 'center',
              flex: 'none',
              borderRadius: 'var(--radius-pill)',
            }}
          >
            <LevelBars
              level={shown === 'speaking' ? 0.6 : level}
              color="var(--gm-on-primary)"
            />
          </Box>
          <Box miw={0}>
            <Text
              fz={12.5}
              fw={600}
              c="var(--gm-on-surface-variant)"
              className={
                shown === 'thinking' || shown === 'transcribing'
                  ? 'assistant-pulse'
                  : undefined
              }
            >
              Voice mode · {STATUS_TEXT[shown]}
            </Text>
            <Text fz={13} fw={500} c="var(--gm-on-surface-variant)" truncate>
              {heard
                ? `“${heard}”`
                : `Talk to ${bot.name}. To interrupt, just speak.`}
            </Text>
          </Box>
        </Group>
        <Group gap={8} wrap="nowrap">
          {isBlocked && (
            <Button size="xs" h={30} onClick={() => unblockRef.current?.()}>
              Tap to listen
            </Button>
          )}
          <Button variant="default" size="xs" h={30} onClick={onExit}>
            End
          </Button>
        </Group>
      </Group>
    </Paper>
  );
}
