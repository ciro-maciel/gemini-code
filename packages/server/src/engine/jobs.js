// Long jobs on a bot's computer (23/10/2026): a command that runs past the 15
// minutes of computer_shell — a Claude Code run, a build, a whole report.
//
// WHY A HOLD. A Sprite pauses as soon as nothing talks to it: measured on
// 23/10, a process started in the background did not write its first line
// until the next command woke the computer. The job holds it awake with the
// Sprites task API (`sprite-env curl /v1/tasks`), taken by the start command
// itself before it returns — taken by the job, it came too late — and
// renewed every minute by the job; it expires 5 minutes after the job dies,
// so a crash never keeps a computer running.
//
// WHERE IT LIVES. ~/.assistant/jobs/<id>/: cmd (the command), log (stdout and
// stderr), exit (the code, when it ended), started and finished (seconds).
// The vault's keys reach the job the way they reach a command: in the
// environment of the start command, which the job inherits; never on disk.

export const JOB_ID = /^[a-z0-9]{8}$/;
/** The longest a job may run: a run gone in circles stops by itself. */
export const MAX_JOB_SECONDS = 6 * 60 * 60;
/** The longest one wait holds the conversation; the model waits again. */
export const MAX_WAIT_SECONDS = 840;
const LOG_TAIL = 12_000;

export const newJobId = () => crypto.randomUUID().replace(/-/g, '').slice(0, 8);

const jobDir = (id) => `/home/sprite/.assistant/jobs/${id}`;
const hold = (id) =>
  `sprite-env curl -X PUT /v1/tasks/assistant-job-${id} -d '{"expire":"5m"}' >/dev/null 2>&1`;

/** The one command that starts a job: holds the computer, writes the job, launches it, returns. */
export function startScript(id, command) {
  const dir = jobDir(id);
  const encoded = Buffer.from(String(command)).toString('base64');
  return `set -e
dir=${dir}
mkdir -p "$dir"
printf '%s' '${encoded}' | base64 -d > "$dir/cmd"
cat > "$dir/run.sh" <<'RUN'
#!/usr/bin/env bash
dir=$1
id=$2
( while sleep 60; do ${hold('$id')}; done ) &
holder=$!
trap 'kill $holder 2>/dev/null; sprite-env curl -X DELETE /v1/tasks/assistant-job-$id >/dev/null 2>&1' EXIT
cd /home/sprite/workspace 2>/dev/null || cd /home/sprite
timeout --kill-after=10 ${MAX_JOB_SECONDS} bash -l "$dir/cmd" > "$dir/log" 2>&1 < /dev/null
echo $? > "$dir/exit.tmp"
date +%s > "$dir/finished"
mv "$dir/exit.tmp" "$dir/exit"
RUN
chmod +x "$dir/run.sh"
${hold(id)}
date +%s > "$dir/started"
nohup setsid "$dir/run.sh" "$dir" ${id} > /dev/null 2>&1 < /dev/null &
echo "$!" > "$dir/pid"
echo started`;
}

/** Waits up to `seconds` for the job to end, then says where it is and the end of its log. */
export function waitScript(id, seconds) {
  const dir = jobDir(id);
  // 0 only looks; nothing given waits ten minutes.
  const asked =
    seconds === undefined || seconds === null || Number.isNaN(Number(seconds))
      ? 600
      : Number(seconds);
  const limit = Math.min(Math.max(Math.round(asked), 0), MAX_WAIT_SECONDS);
  // A job whose process is gone without an exit died with it: the computer restarted under it
  // (23/10: a Sprite rebooted 90 seconds into the drift, and the bot waited half an hour on
  // nothing), or something killed it. Said at once, never waited on.
  return `dir=${dir}
[ -f "$dir/started" ] || { echo "STATE missing"; exit 0; }
is_lost() {
  [ -f "$dir/exit" ] && return 1
  boot=$(awk '/^btime/ {print $2}' /proc/stat 2>/dev/null || echo 0)
  [ "\${boot:-0}" -gt "$(cat "$dir/started")" ] && return 0
  ! kill -0 "$(cat "$dir/pid" 2>/dev/null)" 2>/dev/null
}
end=$(( $(date +%s) + ${limit} ))
while [ ! -f "$dir/exit" ] && ! is_lost && [ "$(date +%s)" -lt "$end" ]; do sleep 3; done
if [ -f "$dir/exit" ]; then echo "STATE done $(cat "$dir/exit") $(cat "$dir/started") $(cat "$dir/finished")"; elif is_lost; then echo "STATE lost $(cat "$dir/started") $(date +%s)"; else echo "STATE running $(cat "$dir/started") $(date +%s)"; fi
echo "LINES $(wc -l < "$dir/log" 2>/dev/null || echo 0)"
tail -c ${LOG_TAIL} "$dir/log" 2>/dev/null`;
}

/** Stops a job and everything it started (the job is the leader of its own session). */
export function stopScript(id) {
  const dir = jobDir(id);
  return `dir=${dir}
[ -f "$dir/pid" ] || { echo "STATE missing"; exit 0; }
[ -f "$dir/exit" ] && { echo "STATE done $(cat "$dir/exit")"; exit 0; }
kill -TERM -- "-$(cat "$dir/pid")" 2>/dev/null; sleep 2; kill -KILL -- "-$(cat "$dir/pid")" 2>/dev/null
sprite-env curl -X DELETE /v1/tasks/assistant-job-${id} >/dev/null 2>&1
echo 143 > "$dir/exit"; date +%s > "$dir/finished"
echo "STATE stopped"`;
}

const minutes = (seconds) => {
  const value = Math.max(0, Math.round(seconds / 60));
  return value < 1
    ? 'menos de 1 minuto'
    : value === 1
      ? '1 minuto'
      : `${value} minutos`;
};

/** What a wait printed, as the model reads it. */
export function describeWait(id, output) {
  const [head = '', lines = '', ...rest] = String(output).split('\n');
  const log = rest.join('\n').trim();
  const [, state, a, b, c] = head.split(' ');
  if (state === 'missing') return `não existe trabalho ${id} neste computador`;
  const count = Number(lines.replace('LINES ', '')) || 0;
  const tail = log
    ? `\n\nFim do log (${count} linhas no total):\n${log}`
    : '\n\n(o log está vazio)';
  if (state === 'done') {
    const code = Number(a);
    const took = minutes(Number(c) - Number(b));
    const how =
      code === 0
        ? 'terminou bem'
        : code === 124 || code === 137
          ? 'passou do tempo máximo e foi parado'
          : code === 143
            ? 'foi parado'
            : `terminou com erro (código ${code})`;
    return `trabalho ${id} ${how}, em ${took}.${tail}`;
  }
  if (state === 'lost')
    return `trabalho ${id} morreu sem terminar, ${minutes(Number(b) - Number(a))} depois de começar: o processo sumiu (o computador reiniciou ou algo o matou). Não espere mais por ele: comece de novo com computer_job_start, se o pedido ainda vale.${tail}`;
  return `trabalho ${id} ainda rodando, há ${minutes(Number(b) - Number(a))}. Chame computer_job_wait de novo para continuar esperando.${tail}`;
}
