import { Cron } from 'croner';
import { db, newId, now, toApi } from './db.js';

// Routines live in the control server, never in a bot's computer: the computer
// sleeps when idle, and a cron inside it would never fire. At the time, the
// instruction goes into the bot's conversation like a message, and the bot
// works as always — with the same approvals.

export const DEFAULT_TIMEZONE = 'America/Sao_Paulo';
const TICK_MS = 20_000;

const WEEKDAYS = [
  'domingo',
  'segunda',
  'terça',
  'quarta',
  'quinta',
  'sexta',
  'sábado',
];

/** The UTC instant of a wall-clock time in a time zone ("2026-10-21T06:00" in São Paulo). */
export function zonedToInstant(local, timezone = DEFAULT_TIMEZONE) {
  const match = String(local).match(
    /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2})/,
  );
  if (!match) throw new Error('horário inválido; use AAAA-MM-DDTHH:MM');
  const [, year, month, day, hour, minute] = match.map(Number);
  const guess = Date.UTC(year, month - 1, day, hour, minute);
  // The zone's offset at that moment, read back through Intl.
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-US', {
      timeZone: timezone,
      hourCycle: 'h23',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    })
      .formatToParts(new Date(guess))
      .map((part) => [part.type, part.value]),
  );
  const asZone = Date.UTC(
    Number(parts.year),
    Number(parts.month) - 1,
    Number(parts.day),
    Number(parts.hour),
    Number(parts.minute),
  );
  return Math.floor((guess - (asZone - guess)) / 1000);
}

function formatInZone(seconds, timezone) {
  const date = new Date(seconds * 1000);
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('pt-BR', {
      timeZone: timezone,
      weekday: 'long',
      day: '2-digit',
      month: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(date)
      .map((part) => [part.type, part.value]),
  );
  return `${parts.weekday}, ${parts.day}/${parts.month} às ${parts.hour}:${parts.minute}`;
}

/** How a person would say the schedule: "Todo dia útil às 06:00". */
export function describeSchedule(routine) {
  if (!routine.cron)
    return routine.runAt
      ? `Uma vez, ${formatInZone(routine.runAt, routine.timezone)}`
      : 'Sem horário';
  const fields = routine.cron.trim().split(/\s+/);
  if (fields.length === 5) {
    const [minute, hour, dayOfMonth, month, weekday] = fields;
    const time =
      /^\d+$/.test(minute) && /^\d+$/.test(hour)
        ? `${hour.padStart(2, '0')}:${minute.padStart(2, '0')}`
        : null;
    if (time && dayOfMonth === '*' && month === '*') {
      if (weekday === '*') return `Todo dia às ${time}`;
      if (weekday === '1-5') return `Todo dia útil às ${time}`;
      if (weekday === '0,6' || weekday === '6,0')
        return `Todo fim de semana às ${time}`;
      if (/^[0-6]$/.test(weekday))
        return `Toda ${WEEKDAYS[Number(weekday)]} às ${time}`;
    }
    if (time && /^\d+$/.test(dayOfMonth) && month === '*' && weekday === '*')
      return `Todo dia ${dayOfMonth} do mês às ${time}`;
  }
  return `Cron ${routine.cron}`;
}

function nextRunFor({ cron, runAt, timezone }, fromSeconds = now()) {
  if (cron) {
    const next = new Cron(cron, { timezone, paused: true }).nextRun(
      new Date(fromSeconds * 1000),
    );
    return next ? Math.floor(next.getTime() / 1000) : null;
  }
  return runAt && runAt > fromSeconds ? runAt : null;
}

/** "daqui a 2 min", computed here: a model doing time arithmetic got it wrong. */
export function describeWait(seconds, fromSeconds = now()) {
  const minutes = Math.round((seconds - fromSeconds) / 60);
  if (minutes <= 0) return 'agora';
  if (minutes < 60) return `daqui a ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  if (hours < 48) return `daqui a ${hours} h${rest ? ` ${rest} min` : ''}`;
  return `daqui a ${Math.round(hours / 24)} dias`;
}

function present(row) {
  if (!row) return null;
  const routine = toApi(row);
  routine.isEnabled = Boolean(routine.isEnabled);
  routine.scheduleLabel = describeSchedule(routine);
  routine.nextRunLabel =
    routine.isEnabled && routine.nextRunAt
      ? formatInZone(routine.nextRunAt, routine.timezone)
      : null;
  routine.nextRunIn =
    routine.isEnabled && routine.nextRunAt
      ? describeWait(routine.nextRunAt)
      : null;
  return routine;
}

export function listRoutines(botId) {
  return db
    .query(
      'SELECT * FROM routines WHERE bot_id = ? ORDER BY COALESCE(next_run_at, 9e18), created_at',
    )
    .all(botId)
    .map(present);
}

export function fetchRoutine(routineId) {
  return present(
    db.query('SELECT * FROM routines WHERE id = ?').get(routineId),
  );
}

/** Who made a routine: the owner (their order at every run) or an agent (no order: approvals ask as always). */
export const ROUTINE_AUTHORS = ['person', 'agent'];

/**
 * `when` is { at: "AAAA-MM-DDTHH:MM" } (once, in the zone) or { cron: "0 6 * * 1-5" }.
 * `createdBy` is 'person' only from the owner's route; everything else is 'agent'.
 */
export function createRoutine({
  botId,
  name,
  instruction,
  when = {},
  timezone = DEFAULT_TIMEZONE,
  createdBy = 'agent',
}) {
  if (!ROUTINE_AUTHORS.includes(createdBy))
    throw new Error("createdBy é 'person' ou 'agent'");
  if (!String(name || '').trim()) throw new Error('dê um nome à rotina');
  if (!String(instruction || '').trim())
    throw new Error('diga o que o bot deve fazer na rotina');
  const cron = when.cron ? String(when.cron).trim() : null;
  const runAt = when.at ? zonedToInstant(when.at, timezone) : null;
  if (!cron && !runAt)
    throw new Error('diga quando: um horário (at) ou uma repetição (cron)');
  if (cron) {
    try {
      new Cron(cron, { timezone, paused: true });
    } catch (error) {
      throw new Error(`repetição inválida: ${error.message}`);
    }
  }
  if (runAt && runAt <= now()) throw new Error('esse horário já passou');
  const id = newId();
  const nextRunAt = nextRunFor({ cron, runAt, timezone });
  db.query(
    'INSERT INTO routines (id, bot_id, name, instruction, cron, run_at, timezone, is_enabled, next_run_at, created_by, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)',
  ).run(
    id,
    botId,
    name.trim().slice(0, 80),
    instruction.trim().slice(0, 4000),
    cron,
    runAt,
    timezone,
    nextRunAt,
    createdBy,
    now(),
    now(),
  );
  return fetchRoutine(id);
}

export function updateRoutine(
  routineId,
  { isEnabled, name, instruction, createdBy },
) {
  const routine = fetchRoutine(routineId);
  if (!routine) return null;
  if (createdBy !== undefined && !ROUTINE_AUTHORS.includes(createdBy))
    throw new Error("createdBy é 'person' ou 'agent'");
  // 'person' comes only from the owner's route (the owner saying it is their order); a rewrite from the repository passes 'agent'.
  if (createdBy !== undefined)
    db.query('UPDATE routines SET created_by = ? WHERE id = ?').run(
      createdBy,
      routineId,
    );
  if (typeof name === 'string' && name.trim())
    db.query('UPDATE routines SET name = ? WHERE id = ?').run(
      name.trim().slice(0, 80),
      routineId,
    );
  if (typeof instruction === 'string' && instruction.trim())
    db.query('UPDATE routines SET instruction = ? WHERE id = ?').run(
      instruction.trim().slice(0, 4000),
      routineId,
    );
  if (typeof isEnabled === 'boolean') {
    // Turning a routine back on computes its next time from now.
    const nextRunAt = isEnabled
      ? nextRunFor({
          cron: routine.cron,
          runAt: routine.runAt,
          timezone: routine.timezone,
        })
      : routine.nextRunAt;
    db.query(
      'UPDATE routines SET is_enabled = ?, next_run_at = ? WHERE id = ?',
    ).run(isEnabled ? 1 : 0, nextRunAt, routineId);
  }
  db.query('UPDATE routines SET updated_at = ? WHERE id = ?').run(
    now(),
    routineId,
  );
  return fetchRoutine(routineId);
}

export function deleteRoutine(routineId) {
  db.query('DELETE FROM routines WHERE id = ?').run(routineId);
}

let timer = null;
let sendRoutine = null;

/**
 * Sends every routine whose time came to its bot. A routine missed while the
 * server slept runs once when it wakes, never once per missed time.
 */
export function runDueRoutines() {
  if (!sendRoutine) return 0;
  const due = db
    .query(
      'SELECT * FROM routines WHERE is_enabled = 1 AND next_run_at IS NOT NULL AND next_run_at <= ?',
    )
    .all(now());
  for (const row of due) {
    const routine = present(row);
    const nextRunAt = nextRunFor(routine, now());
    db.query(
      'UPDATE routines SET last_run_at = ?, run_count = run_count + 1, next_run_at = ?, is_enabled = ?, updated_at = ? WHERE id = ?',
    ).run(now(), nextRunAt, routine.cron ? 1 : 0, now(), routine.id);
    try {
      sendRoutine(routine);
    } catch (error) {
      console.error(`routine ${routine.id}`, error.message);
    }
  }
  return due.length;
}

/** Checks every 20 s while awake; the alarm covers the time asleep. */
export function startRoutines(send, onRan) {
  if (timer) return;
  sendRoutine = send;
  const tick = () => {
    if (runDueRoutines() > 0) onRan?.();
  };
  tick();
  timer = setInterval(tick, TICK_MS);
}

/** The current time in the zone, for the bot's system prompt. */
export function nowInZone(timezone = DEFAULT_TIMEZONE) {
  return `${formatInZone(now(), timezone)} (${timezone})`;
}
