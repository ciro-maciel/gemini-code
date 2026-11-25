/**
 * Everything is a conversation. The raw event list becomes what a person reads:
 * their messages on the right, the bot's answers on the left, and between them
 * the work of each turn as one block (see the proposal "Trabalho e resposta"):
 * what the bot said while working, in order, each with the steps it took.
 */

// What a turn's text is: an answer, or the bot thinking aloud between steps.
// Newer events say it (`isFinal`); older ones are read from what came next: a
// text followed by a step was said on the way, not as the answer.
const SKIPPED_WHEN_READING_AHEAD = new Set([
  'tool_result',
  'status',
  'warning',
  'computer',
]);
function isThinkingAloud(events, index) {
  const { isFinal } = events[index].data;
  if (isFinal === false) return true;
  if (isFinal === true) return false;
  for (let next = index + 1; next < events.length; next++) {
    if (events[next].type === 'tool_call')
      return events[next].data.name !== 'ask_user';
    if (!SKIPPED_WHEN_READING_AHEAD.has(events[next].type)) return false;
  }
  return false;
}

export function buildRows(events) {
  const rows = [];
  const steps = new Map();
  let work = null;

  const closeWork = () => {
    work = null;
  };
  const workFor = (event) => {
    if (!work) {
      work = {
        kind: 'work',
        id: event.id,
        seq: event.seq,
        entries: [],
        startedAt: event.createdAt,
        endedAt: event.createdAt,
      };
      rows.push(work);
    }
    work.endedAt = event.createdAt;
    return work;
  };

  events.forEach((event, index) => {
    const { type, data } = event;
    if (type === 'user_message') {
      closeWork();
      rows.push({
        kind: 'user',
        id: event.id,
        seq: event.seq,
        taskId: event.taskId,
        text: data.text,
        author: data.author,
        fromNote: data.fromNote,
        mention: data.mention,
        context: data.context ?? [],
        routine: data.routine,
        inbound: data.inbound,
        handoff: data.handoff,
        choice: data.choice,
        isSetup: data.isSetup,
        attachments: data.attachments,
        botId: event.botId,
        isQueued: data.isQueued === true,
        createdAt: event.createdAt,
      });
    } else if (type === 'assistant') {
      if (isThinkingAloud(events, index)) {
        workFor(event).entries.push({
          id: event.id,
          seq: event.seq,
          thought: data.text,
          steps: [],
        });
      } else {
        closeWork();
        rows.push({
          kind: 'bot',
          id: event.id,
          seq: event.seq,
          text: data.text,
          memories: data.memories ?? [],
          createdAt: event.createdAt,
        });
      }
    } else if (type === 'tool_call' && data.name === 'ask_user') {
      closeWork();
      rows.push({
        kind: 'bot',
        id: event.id,
        seq: event.seq,
        text: data.arguments?.question,
        memories: [],
        createdAt: event.createdAt,
        isQuestion: true,
      });
    } else if (type === 'tool_call') {
      const step = {
        id: event.id,
        seq: event.seq,
        name: data.name,
        args: data.arguments,
      };
      steps.set(data.toolCallId, step);
      const block = workFor(event);
      if (!block.entries.length)
        block.entries.push({
          id: event.id,
          seq: event.seq,
          thought: null,
          steps: [],
        });
      block.entries.at(-1).steps.push(step);
    } else if (type === 'tool_result') {
      const step = steps.get(data.toolCallId);
      if (step) {
        step.result = data.preview;
        step.isError = data.preview?.startsWith('erro');
      }
    } else if (type === 'approval_resolved') {
      closeWork();
      rows.push({ kind: 'decision', id: event.id, seq: event.seq, data });
    } else if (type === 'approval_requested') {
      closeWork();
      rows.push({
        kind: 'request',
        id: event.id,
        seq: event.seq,
        taskId: event.taskId,
        data,
      });
    } else if (type === 'takeover_requested') {
      closeWork();
      rows.push({
        kind: 'takeover',
        id: event.id,
        seq: event.seq,
        taskId: event.taskId,
      });
    } else if (type === 'status' && data.status === 'failed') {
      closeWork();
      rows.push({
        kind: 'failure',
        id: event.id,
        seq: event.seq,
        taskId: event.taskId,
        text: data.error,
      });
    } else if (type === 'artifact') {
      closeWork();
      rows.push({
        kind: 'artifact',
        id: event.id,
        seq: event.seq,
        data,
        botId: event.botId,
        createdAt: event.createdAt,
      });
    } else if (type === 'page') {
      // Pages seen in a row stay together, as one strip; the work block closes around them.
      closeWork();
      const last = rows.at(-1);
      if (last?.kind === 'pages')
        last.pages.push({ id: event.id, seq: event.seq, ...data });
      else
        rows.push({
          kind: 'pages',
          id: event.id,
          seq: event.seq,
          pages: [{ id: event.id, seq: event.seq, ...data }],
          botId: event.botId,
        });
    } else if (type === 'files') {
      closeWork();
      rows.push({
        kind: 'files',
        id: event.id,
        seq: event.seq,
        files: data.files,
        botId: event.botId,
        createdAt: event.createdAt,
      });
    } else if (type === 'trust_earned') {
      // An action approved again and again, never refused, stopped asking (engine/run.js).
      rows.push({
        kind: 'failure',
        id: event.id,
        seq: event.seq,
        text: `Approved ${data.approvals} times in ${data.days} days, never declined: "${data.summary}" now runs without asking for 90 days.`,
        isMinor: true,
      });
    } else if (type === 'warning') {
      rows.push({
        kind: 'failure',
        id: event.id,
        seq: event.seq,
        text: data.message,
        isMinor: true,
      });
    } else if (type === 'connection_requested') {
      closeWork();
      rows.push({
        kind: 'connect',
        id: event.id,
        seq: event.seq,
        connectionId: data.connectionId,
        title: data.title,
        reason: data.reason,
      });
    } else if (type === 'connection_ready') {
      closeWork();
      rows.push({
        kind: 'connected',
        id: event.id,
        seq: event.seq,
        connectionId: data.connectionId,
        title: data.title,
      });
    } else if (type === 'colleague') {
      // Another agent called here with @ answered.
      closeWork();
      rows.push({
        kind: 'colleague',
        id: event.id,
        seq: event.seq,
        botId: data.botId,
        name: data.name,
        text: data.text,
        createdAt: event.createdAt,
      });
    } else if (type === 'note') {
      // "Entre nós": between the people only; a note sent to the bot leaves (below).
      rows.push({
        kind: 'note',
        id: event.id,
        seq: event.seq,
        text: data.text,
        author: data.author,
        accountId: data.accountId,
      });
    } else if (type === 'skill_learned') {
      closeWork();
      rows.push({ kind: 'skill', id: event.id, seq: event.seq, data });
    } else if (type === 'computer') {
      // The bot waits for its computer: a spare handed over, or one prepared.
      rows.push({
        kind: 'failure',
        id: event.id,
        seq: event.seq,
        text: data.text,
        isMinor: true,
        icon: 'computer',
      });
    }
  });

  // A connection asked for and then made: its card shrinks to the line that says so.
  const ready = new Set(
    rows
      .filter((row) => row.kind === 'connected')
      .map((row) => row.connectionId),
  );
  for (const row of rows)
    if (row.kind === 'connect') row.isReady = ready.has(row.connectionId);

  const sent = new Set(
    rows
      .filter((row) => row.kind === 'user' && row.fromNote)
      .map((row) => row.fromNote),
  );
  const kept = rows.filter((row) => row.kind !== 'note' || !sent.has(row.id));
  kept.forEach((row, index) => {
    if (row.kind === 'work') summarizeWork(row, kept[index + 1]);
  });
  return kept;
}

/**
 * What the folded work says about itself (10/11/2026, "Trabalho e resposta"): how many steps, where,
 * how long, and what is still broken. A step that failed and was done again by the same tool later in
 * the block is `recovered` ("refeito"): part of the work, not a problem for the person. Only what was
 * never redone counts as `unresolved` and shows in red. `hasAnswer` says whether an answer follows;
 * without one, the last thing the bot said is what the person reads.
 */
function summarizeWork(work, next) {
  const steps = work.entries.flatMap((entry) => entry.steps);
  steps.forEach((step, index) => {
    if (step.isError)
      step.recovered = steps
        .slice(index + 1)
        .some(
          (later) =>
            later.name === step.name &&
            later.result !== undefined &&
            !later.isError,
        );
  });
  work.stepCount = steps.length;
  work.unresolved = steps.filter(
    (step) => step.isError && !step.recovered,
  ).length;
  work.recovered = steps.filter(
    (step) => step.isError && step.recovered,
  ).length;
  work.seconds = Math.max(
    0,
    Math.round((work.endedAt ?? 0) - (work.startedAt ?? 0)),
  );
  work.hasAnswer = next?.kind === 'bot';
}
