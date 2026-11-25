import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import {
  askSideQuestion,
  cancelTask,
  fetchConversation,
  fetchThread,
  markBotRead,
  previewRewind,
  removeQueued,
  rewindTask,
  sendBotMessage,
  sendNote,
  streamBot,
  writeNote,
} from '../services/api';
import { isActive } from '../labels';
import { buildRows } from '../conversation/rows';
import { botsChanged } from '../state/use-bots';
import { notify } from '../components/zen';
import { keepIfSame } from '../state/keep-if-same';
import { remember, remembered } from '../state/remembered';

const REFRESH_ON = new Set([
  'status',
  'approval_requested',
  'approval_resolved',
  'title',
]);
// A finished stream that no stored reply came for gives way when the work moves on.
const STREAM_RELEASED_BY = new Set(['tool_call', 'status', 'user_message']);

/**
 * One agent's conversation, live: its events and rows, the task in progress,
 * the answer being written, and what a person does to it (send, stop, rewind,
 * take over). Each agent tab on the Mesa holds its own.
 */
export function useAgentConversation(botId, { isVisible = true } = {}) {
  const [events, setEvents] = useState(null);
  const [thread, setThread] = useState(null);
  const [streaming, setStreaming] = useState(null);
  // The summary of what the model is thinking at this step, shown under "Pensando…".
  const [thinking, setThinking] = useState('');
  const [seeing, setSeeing] = useState([]);
  // What the person just sent, shown before the central confirms it: the stored message replaces it.
  const [pending, setPending] = useState([]);
  const [isSending, setIsSending] = useState(false);
  const [rewindPoint, setRewindPoint] = useState(null);
  const [loadKey, setLoadKey] = useState(0);
  const streamRef = useRef(null);
  const composerRef = useRef(null);

  const reloadThread = useCallback(() => {
    fetchThread(botId)
      .then(setThread)
      .catch(() => {});
  }, [botId]);

  useEffect(() => {
    let stream = null;
    let isAlive = true;
    let deltas = [];
    let frame = null;
    const flushDeltas = () => {
      if (frame !== null) cancelAnimationFrame(frame);
      frame = null;
      if (!deltas.length || !isAlive) return (deltas = []);
      const pieces = deltas;
      deltas = [];
      const words = pieces.filter((piece) => !piece.isThinking);
      const thought = pieces
        .filter((piece) => piece.isThinking)
        .map((piece) => piece.text)
        .join('');
      if (thought) setThinking((current) => (current + thought).slice(-600));
      if (words.length)
        setStreaming((current) =>
          words.reduce(
            (text, piece) =>
              text?.turnId === piece.turnId
                ? { ...text, text: text.text + piece.text }
                : { turnId: piece.turnId, text: piece.text },
            current,
          ),
        );
    };
    // An agent seen before shows its conversation at once; the central's answer replaces it.
    const known = remembered(`conversation:${botId}`);
    setEvents(known?.events ?? null);
    setThread(known?.thread ?? null);
    setStreaming(null);
    setThinking('');
    setPending([]);
    setSeeing([]);
    setRewindPoint(null);
    fetchConversation(botId)
      .then((data) => {
        if (!isAlive) return;
        setEvents(keepIfSame(data.items));
        setThread(keepIfSame(data.thread));
        stream = streamBot(botId, data.items.at(-1)?.seq ?? 0, (event) => {
          if (event.type === 'seeing') return setSeeing(event.data.people);
          // The pieces of a reply that arrive within one frame are drawn once, together.
          if (
            event.type === 'assistant_delta' ||
            event.type === 'thinking_delta'
          ) {
            deltas.push({
              ...event.data,
              isThinking: event.type === 'thinking_delta',
            });
            frame ??= requestAnimationFrame(flushDeltas);
            return;
          }
          flushDeltas();
          // A stored step (a tool call, a reply) ends the thinking that led to it.
          if (!event.isLive) setThinking('');
          if (event.isLive) {
            // Kept until the stored reply replaces it in the same render.
            if (event.type === 'assistant_end')
              setStreaming((current) =>
                current ? { ...current, isEnded: true } : null,
              );
            return;
          }
          // The spoken summary was removed on 10/11/2026; old summaries stay out of the thread.
          if (event.type === 'voice_summary') return;
          if (event.type === 'assistant') setStreaming(null);
          else if (STREAM_RELEASED_BY.has(event.type))
            setStreaming((current) => (current?.isEnded ? null : current));
          setEvents((current) =>
            current?.some((existing) => existing.id === event.id)
              ? current
              : [...(current ?? []), event],
          );
          if (event.type === 'user_message')
            setPending((current) =>
              current.filter(
                (item, index) =>
                  index !==
                  current.findIndex((each) => each.text === event.data.text),
              ),
            );
          if (REFRESH_ON.has(event.type)) {
            // The central sends the thread with the change; only an older central makes the panel ask.
            if (event.thread !== undefined) setThread(keepIfSame(event.thread));
            else reloadThread();
            botsChanged();
          }
        });
        streamRef.current = stream;
      })
      .catch(() => isAlive && setEvents([]));
    return () => {
      isAlive = false;
      if (frame !== null) cancelAnimationFrame(frame);
      stream?.close();
      streamRef.current = null;
    };
  }, [botId, reloadThread, loadKey]);

  // What is on screen has nothing new for the person looking at it.
  const eventCount = events?.length ?? 0;
  useEffect(() => {
    if (!isVisible || events === null) return;
    const markRead = () => {
      if (document.visibilityState !== 'visible') return;
      markBotRead(botId).catch(() => {});
      window.dispatchEvent(
        new CustomEvent('assistant:bot-read', { detail: { botId } }),
      );
    };
    const timer = setTimeout(markRead, 400);
    document.addEventListener('visibilitychange', markRead);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('visibilitychange', markRead);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- the count is what matters, not the array
  }, [botId, eventCount, isVisible, events === null]);

  useEffect(() => {
    if (events) remember(`conversation:${botId}`, { events, thread });
  }, [botId, events, thread]);

  const rows = useMemo(
    () => [
      ...buildRows(events ?? []),
      ...pending.map((item) => ({
        kind: 'user',
        id: item.id,
        text: item.text,
        context: item.context,
        isPending: true,
      })),
    ],
    [events, pending],
  );
  const isWorking = isActive(thread?.status) || pending.length > 0;

  const send = async (
    message,
    attachmentIds = [],
    { isQueued = false, context = [] } = {},
  ) => {
    if (!message && !attachmentIds.length && !context.length) return false;
    setIsSending(true);
    const stand = { id: `pending-${Date.now()}`, text: message, context };
    if (message && !rewindPoint) setPending((current) => [...current, stand]);
    try {
      if (rewindPoint) {
        await rewindTask(rewindPoint.taskId, rewindPoint.eventId);
        setRewindPoint(null);
        setLoadKey((key) => key + 1);
      }
      setThread(
        await sendBotMessage(botId, message, attachmentIds, {
          isQueued,
          context,
        }),
      );
      streamRef.current?.catchUp();
      botsChanged();
      // Should the stored message not come back on the stream, the stand-in leaves on its own.
      setTimeout(
        () =>
          setPending((current) =>
            current.filter((item) => item.id !== stand.id),
          ),
        15_000,
      );
      return true;
    } catch (error) {
      setPending((current) => current.filter((item) => item.id !== stand.id));
      notify.error(error.message);
      return false;
    } finally {
      setIsSending(false);
    }
  };

  // "Voltar para aqui" is an edit, not a cut: the message comes back to the box
  // and what followed fades; the central cuts only when it is sent again.
  // What the cut would take is counted at once, so the box says it before the send (04/11/2026).
  const startRewind = (point) => {
    setRewindPoint((current) => ({
      ...point,
      preview: undefined,
      draft: current ? current.draft : (composerRef.current?.getText() ?? ''),
    }));
    composerRef.current?.setText(point.text);
    previewRewind(point.taskId, point.eventId)
      .catch(() => null)
      .then((preview) =>
        setRewindPoint((current) =>
          current?.eventId === point.eventId
            ? { ...current, preview }
            : current,
        ),
      );
  };
  const cancelRewind = () => {
    composerRef.current?.setText(rewindPoint?.draft ?? '');
    setRewindPoint(null);
  };

  // "Pergunta": answered on the side; null when it did not come, with the reason said.
  const ask = async (question) => {
    try {
      return (
        (await askSideQuestion(botId, question)).answer ||
        'No answer right now. Ask again in a little while.'
      );
    } catch (error) {
      notify.error('No response received', error.message);
      return null;
    }
  };

  const unqueue = async (queuedId) => {
    try {
      setThread(await removeQueued(botId, queuedId));
    } catch (error) {
      notify.error(error.message);
    }
  };

  const stop = async () => {
    try {
      setThread(await cancelTask(thread.id));
    } catch (error) {
      notify.error(error.message);
    }
  };

  const note = async (text) => {
    try {
      await writeNote(botId, text);
      streamRef.current?.catchUp();
      return true;
    } catch (error) {
      notify.error(error.message);
      return false;
    }
  };
  const sendNoteToAgent = async (eventId) => {
    try {
      setThread(await sendNote(botId, eventId));
      streamRef.current?.catchUp();
    } catch (error) {
      notify.error(error.message);
    }
  };

  return {
    loadKey,
    ask,
    note,
    sendNoteToAgent,
    events,
    rows,
    thread,
    streaming,
    thinking,
    seeing,
    isSending,
    isWorking,
    rewindPoint,
    composerRef,
    send,
    unqueue,
    stop,
    startRewind,
    cancelRewind,
    reloadThread,
  };
}
