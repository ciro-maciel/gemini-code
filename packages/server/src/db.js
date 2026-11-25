import { Database } from 'bun:sqlite';
import { mkdirSync } from 'node:fs';
import path from 'node:path';
import { config } from './config.js';

mkdirSync(config.dataDir, { recursive: true });

export const db = new Database(path.join(config.dataDir, 'assistant.db'), {
  create: true,
  strict: true,
});
db.exec('PRAGMA journal_mode = WAL');
// A second process on the same file (a maintenance script) once made a
// person's message fail at once with "database is locked": wait for it instead.
db.exec('PRAGMA busy_timeout = 5000');
db.exec('PRAGMA foreign_keys = ON');

// Only ever append to this list: each entry runs once, in order.
const MIGRATIONS = [
  `CREATE TABLE bots (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        sprite_name TEXT NOT NULL UNIQUE,
        sprite_url TEXT,
        status TEXT NOT NULL,
        status_detail TEXT,
        model TEXT NOT NULL,
        instructions TEXT NOT NULL DEFAULT '',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )`,
  `CREATE TABLE tasks (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        prompt TEXT NOT NULL,
        title TEXT,
        status TEXT NOT NULL,
        waiting_reason TEXT,
        waiting_detail TEXT,
        enabled_tools TEXT NOT NULL DEFAULT '[]',
        result TEXT,
        error TEXT,
        cost REAL NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        finished_at INTEGER
    )`,
  `CREATE INDEX tasks_by_bot ON tasks (bot_id, created_at)`,
  `CREATE TABLE task_messages (
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        seq INTEGER NOT NULL,
        message TEXT NOT NULL,
        PRIMARY KEY (task_id, seq)
    )`,
  `CREATE TABLE task_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        type TEXT NOT NULL,
        data TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )`,
  `CREATE INDEX task_events_by_task ON task_events (task_id, id)`,
  `CREATE TABLE approvals (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        tool_call_id TEXT NOT NULL,
        tool_name TEXT NOT NULL,
        arguments TEXT NOT NULL,
        summary TEXT NOT NULL,
        reason TEXT NOT NULL,
        checkpoint_id TEXT,
        status TEXT NOT NULL,
        note TEXT,
        created_at INTEGER NOT NULL,
        resolved_at INTEGER
    )`,
  `CREATE TABLE connections (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        server_name TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        transport TEXT NOT NULL,
        status TEXT NOT NULL,
        status_detail TEXT,
        secrets TEXT,
        tools TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (bot_id, url)
    )`,
  `CREATE TABLE tool_policies (
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        tool_name TEXT NOT NULL,
        policy TEXT NOT NULL,
        PRIMARY KEY (bot_id, tool_name)
    )`,
  `CREATE TABLE memories (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        kind TEXT NOT NULL,
        content TEXT NOT NULL,
        source_task_id TEXT,
        created_at INTEGER NOT NULL
    )`,
  // Computers provisioned ahead of time, so a new bot gets one at once.
  `CREATE TABLE spare_computers (
        sprite_name TEXT PRIMARY KEY,
        sprite_url TEXT,
        status TEXT NOT NULL,
        status_detail TEXT,
        created_at INTEGER NOT NULL
    )`,
  `ALTER TABLE bots ADD COLUMN mascot TEXT`,
  // Sections organize the column (Grok Bot's "Mover para"). A section exists
  // while a bot is in it; null is "Sem seção".
  `ALTER TABLE bots ADD COLUMN section TEXT`,
  // The bot's place inside its section; null sorts after, by creation.
  `ALTER TABLE bots ADD COLUMN position INTEGER`,
  // Routines (Grok Bot's): an instruction the control server sends to a
  // bot's conversation at a time — once, or on a cron, in a time zone.
  `CREATE TABLE routines (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        instruction TEXT NOT NULL,
        cron TEXT,
        run_at INTEGER,
        timezone TEXT NOT NULL,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        next_run_at INTEGER,
        last_run_at INTEGER,
        run_count INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )`,
  `CREATE INDEX routines_due ON routines (is_enabled, next_run_at)`,
  // Accounts come from Auth: the id is the JWT's `sub`. Bots and connections
  // belong to one; null marks what existed before accounts, and the owner's
  // first sign-in claims it.
  `CREATE TABLE accounts (
        id TEXT PRIMARY KEY,
        email TEXT,
        name TEXT,
        status TEXT NOT NULL,
        is_owner INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        last_seen_at INTEGER NOT NULL
    )`,
  `ALTER TABLE bots ADD COLUMN account_id TEXT`,
  `CREATE INDEX bots_by_account ON bots (account_id, created_at)`,
  `ALTER TABLE connections ADD COLUMN account_id TEXT`,
  `CREATE INDEX connections_by_account ON connections (account_id, created_at)`,
  // What each account spent on the model, per day in São Paulo (AAAA-MM-DD).
  `CREATE TABLE usage (
        account_id TEXT NOT NULL,
        day TEXT NOT NULL,
        cost REAL NOT NULL DEFAULT 0,
        steps INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (account_id, day)
    )`,
  // The hash of packages/computer/ installed on the bot's Sprite; a different one
  // means the computer is upgraded before it is used.
  `ALTER TABLE bots ADD COLUMN computer_version TEXT`,
  `ALTER TABLE spare_computers ADD COLUMN computer_version TEXT`,
  // Files the person sent with a message. Kept here and copied to the
  // bot's computer (workspace/anexos) the first time it is used after.
  `CREATE TABLE attachments (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        mime_type TEXT NOT NULL,
        size INTEGER NOT NULL,
        stored_path TEXT NOT NULL,
        computer_path TEXT NOT NULL,
        copied_at INTEGER,
        created_at INTEGER NOT NULL
    )`,
  `CREATE INDEX attachments_by_bot ON attachments (bot_id, copied_at)`,
  // What a person taught the bot by doing it once (Ensinar uma tarefa).
  `CREATE TABLE skills (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        when_to_use TEXT NOT NULL DEFAULT '',
        steps TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )`,
  // What a waiting account wants its first bot to do. Shown to the owner in
  // Pessoas, and designed into that bot the moment the account is let in.
  `ALTER TABLE accounts ADD COLUMN first_wish TEXT`,
  // How far the bot's owner has read its conversation: the last event seen.
  // What came after it and is meant for the person (a reply, files, a request)
  // lights the dot in the sidebar. Everything that exists now counts as read.
  `ALTER TABLE bots ADD COLUMN read_event_id INTEGER`,
  `UPDATE bots SET read_event_id = (SELECT MAX(id) FROM task_events)`,
  // The trail (trail.js). Every action that went through a judgment, which
  // the person sees and downloads per bot; it goes with the bot.
  `CREATE TABLE judgments (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        task_id TEXT,
        tool_call_id TEXT,
        tool_name TEXT NOT NULL,
        summary TEXT NOT NULL,
        rule TEXT NOT NULL,
        verdict TEXT NOT NULL,
        reason TEXT,
        approval_id TEXT,
        created_at INTEGER NOT NULL
    )`,
  `CREATE INDEX judgments_by_bot ON judgments (bot_id, id)`,
  // How an approval ended (approved, approved_task, approved_always,
  // rejected, cancelled), by whom, and when it passed the timeout unanswered.
  `ALTER TABLE approvals ADD COLUMN outcome TEXT`,
  `ALTER TABLE approvals ADD COLUMN resolved_by TEXT`,
  `ALTER TABLE approvals ADD COLUMN timed_out_at INTEGER`,
  `UPDATE approvals SET outcome = status WHERE status != 'pending'`,
  // Kinds and ids only, no text: the counts outlive a deleted bot.
  `CREATE TABLE outcome_events (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT,
        bot_id TEXT,
        task_id TEXT,
        approval_id TEXT,
        kind TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )`,
  `CREATE INDEX outcome_events_by_time ON outcome_events (created_at, kind)`,
  // The moments the agent went wrong or needed a person, for evals. The
  // context is redacted before it is written; it goes with the bot.
  `CREATE TABLE failures (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        account_id TEXT,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        task_id TEXT,
        kind TEXT NOT NULL,
        context TEXT NOT NULL DEFAULT '',
        model TEXT,
        created_at INTEGER NOT NULL
    )`,
  `CREATE INDEX failures_by_account ON failures (account_id, created_at)`,
  // The approvals asked before the trail existed enter it as they were.
  `INSERT INTO judgments (account_id, bot_id, task_id, tool_call_id, tool_name, summary, rule, verdict, reason, approval_id, created_at)
        SELECT bots.account_id, tasks.bot_id, approvals.task_id, approvals.tool_call_id, approvals.tool_name, approvals.summary,
            CASE WHEN approvals.tool_name LIKE 'mcp\\_\\_%' ESCAPE '\\' THEN 'service' WHEN approvals.tool_name LIKE 'browser\\_%' ESCAPE '\\' OR approvals.tool_name = 'computer_shell' THEN 'judged' ELSE 'confirm' END,
            'ask', approvals.reason, approvals.id, approvals.created_at
        FROM approvals JOIN tasks ON tasks.id = approvals.task_id JOIN bots ON bots.id = tasks.bot_id ORDER BY approvals.created_at`,
  `INSERT INTO outcome_events (account_id, bot_id, task_id, approval_id, kind, created_at)
        SELECT bots.account_id, tasks.bot_id, approvals.task_id, approvals.id, 'approval_requested', approvals.created_at
        FROM approvals JOIN tasks ON tasks.id = approvals.task_id JOIN bots ON bots.id = tasks.bot_id`,
  `INSERT INTO outcome_events (account_id, bot_id, task_id, approval_id, kind, created_at)
        SELECT bots.account_id, tasks.bot_id, approvals.task_id, approvals.id, approvals.status, COALESCE(approvals.resolved_at, approvals.created_at)
        FROM approvals JOIN tasks ON tasks.id = approvals.task_id JOIN bots ON bots.id = tasks.bot_id WHERE approvals.status IN ('approved', 'rejected')`,
  // A bot's vault (vault.js): keys for its terminal, encrypted, by name.
  `CREATE TABLE bot_secrets (
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        name TEXT NOT NULL,
        value TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (bot_id, name)
    )`,
  // A bot's door (inbox.js): the address other systems post to.
  `CREATE TABLE bot_inboxes (
        bot_id TEXT PRIMARY KEY REFERENCES bots(id) ON DELETE CASCADE,
        token TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL
    )`,
  // A bot's artifacts (artifacts.js): one row per key, one per version, and the
  // choices the person made in each version.
  `CREATE TABLE artifacts (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        key TEXT NOT NULL,
        title TEXT NOT NULL,
        version INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        UNIQUE (bot_id, key)
    )`,
  `CREATE TABLE artifact_versions (
        artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        content TEXT NOT NULL,
        task_id TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (artifact_id, version)
    )`,
  `CREATE TABLE artifact_choices (
        artifact_id TEXT NOT NULL REFERENCES artifacts(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        item_id TEXT NOT NULL,
        value TEXT NOT NULL,
        label TEXT NOT NULL,
        note TEXT,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (artifact_id, version, item_id)
    )`,
  // A section exists on its own (23/10/2026): created from the column's
  // right-click before any bot is in it, and kept when its last bot leaves.
  // The sections bots were already in are carried over.
  `CREATE TABLE sections (
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, name)
    );
    INSERT OR IGNORE INTO sections (account_id, name, created_at)
        SELECT account_id, section, MIN(created_at) FROM bots WHERE section IS NOT NULL AND account_id IS NOT NULL GROUP BY account_id, section`,
  // The section's place in the column, set by dragging it; null sorts after, by name.
  `ALTER TABLE sections ADD COLUMN position INTEGER`,
  // Connections are the account's pool, not a bot's (24/10/2026: deleting
  // every bot took the eleven connections with them). The foreign key that
  // cascaded goes; bot_id only remembers who made it, and may be empty.
  `CREATE TABLE connections_pool (
        id TEXT PRIMARY KEY,
        account_id TEXT,
        bot_id TEXT,
        server_name TEXT NOT NULL,
        title TEXT NOT NULL,
        url TEXT NOT NULL,
        transport TEXT NOT NULL,
        status TEXT NOT NULL,
        status_detail TEXT,
        secrets TEXT,
        tools TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    )`,
  `INSERT INTO connections_pool (id, account_id, bot_id, server_name, title, url, transport, status, status_detail, secrets, tools, created_at, updated_at)
     SELECT id, account_id, bot_id, server_name, title, url, transport, status, status_detail, secrets, tools, created_at, updated_at FROM connections`,
  `DROP TABLE connections`,
  `ALTER TABLE connections_pool RENAME TO connections`,
  `CREATE INDEX connections_by_account ON connections (account_id, created_at)`,
  `CREATE UNIQUE INDEX connections_by_account_url ON connections (account_id, url)`,
  // The unit of a permission (24/10/2026): the service and its class, or the
  // computer action's kind, that an approval covers; what the card names.
  `ALTER TABLE approvals ADD COLUMN grant_key TEXT`,
  `ALTER TABLE approvals ADD COLUMN service TEXT`,
  `ALTER TABLE approvals ADD COLUMN reach TEXT`,
  // A standing permission carries its origin (arXiv 2609.01836: a permission
  // in memory with no source event is authority nobody gave) and a date, so
  // it can expire; the kind of action says whether "always" is even offered.
  `ALTER TABLE tool_policies ADD COLUMN approval_id TEXT`,
  `ALTER TABLE tool_policies ADD COLUMN granted_by TEXT`,
  `ALTER TABLE tool_policies ADD COLUMN granted_at INTEGER`,
  `ALTER TABLE tool_policies ADD COLUMN summary TEXT`,
  `ALTER TABLE approvals ADD COLUMN kind TEXT`,
  // A version is addressed by its UUID, never by its number (house rule,
  // 25/10/2026): the number stays as the label "versão 3". Existing versions get
  // one, and the conversations and choices that point at them learn it.
  `ALTER TABLE artifact_versions ADD COLUMN id TEXT;
    UPDATE artifact_versions SET id = lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)));
    CREATE UNIQUE INDEX artifact_versions_by_id ON artifact_versions (id);
    UPDATE task_events SET data = json_set(data, '$.versionId', (SELECT v.id FROM artifact_versions v WHERE v.artifact_id = json_extract(task_events.data, '$.artifactId') AND v.version = json_extract(task_events.data, '$.version')))
        WHERE type = 'artifact';
    UPDATE task_events SET data = json_set(data, '$.choice.versionId', (SELECT v.id FROM artifact_versions v WHERE v.artifact_id = json_extract(task_events.data, '$.choice.artifactId') AND v.version = json_extract(task_events.data, '$.choice.version')))
        WHERE type = 'user_message' AND json_extract(data, '$.choice.artifactId') IS NOT NULL`,
  // Sections, events, the vault and the trail are addressed by their UUID
  // too (house rule, 25/10/2026). A section's name is its label; a bot points
  // at its section by id (bots.section stays, unread). An event keeps its
  // number as its place in the conversation ("after this one"); a secret's
  // name is the variable a command reads, never how the API finds it.
  `INSERT OR IGNORE INTO sections (account_id, name, created_at)
        SELECT account_id, section, MIN(created_at) FROM bots WHERE section IS NOT NULL AND account_id IS NOT NULL GROUP BY account_id, section;
    ALTER TABLE sections ADD COLUMN id TEXT;
    UPDATE sections SET id = lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)));
    CREATE UNIQUE INDEX sections_by_id ON sections (id);
    ALTER TABLE bots ADD COLUMN section_id TEXT;
    UPDATE bots SET section_id = (SELECT s.id FROM sections s WHERE s.account_id = bots.account_id AND s.name = bots.section) WHERE section IS NOT NULL`,
  `ALTER TABLE task_events ADD COLUMN uuid TEXT;
    UPDATE task_events SET uuid = lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)));
    CREATE UNIQUE INDEX task_events_by_uuid ON task_events (uuid)`,
  `ALTER TABLE bot_secrets ADD COLUMN id TEXT;
    UPDATE bot_secrets SET id = lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)));
    CREATE UNIQUE INDEX bot_secrets_by_id ON bot_secrets (id)`,
  `ALTER TABLE judgments ADD COLUMN uuid TEXT;
    UPDATE judgments SET uuid = lower(hex(randomblob(4))) || '-' || lower(hex(randomblob(2))) || '-4' || substr(lower(hex(randomblob(2))), 2) || '-' || substr('89ab', 1 + (abs(random()) % 4), 1) || substr(lower(hex(randomblob(2))), 2) || '-' || lower(hex(randomblob(6)));
    CREATE UNIQUE INDEX judgments_by_uuid ON judgments (uuid)`,
  // Memory in three kinds (29/10/2026): what a person refused with a reason is a
  // decision; what the bot kept on its own is an observation.
  `UPDATE memories SET kind = 'decision' WHERE kind = 'correction';
     UPDATE memories SET kind = 'observation' WHERE kind NOT IN ('decision', 'preference', 'observation')`,
  // The queue (29/10/2026): what a person sends "for when it finishes" waits
  // here, in order, and goes to the bot when its task stops.
  `CREATE TABLE bot_queue (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        text TEXT NOT NULL,
        attachment_ids TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL
    )`,
  `CREATE INDEX bot_queue_by_bot ON bot_queue (bot_id, created_at)`,
  // What each agent chooses (29/10/2026): how hard its model thinks, its
  // working folder, the AI account its long jobs run on, the template it came
  // from, and the connections it uses (null: every one of the account).
  `ALTER TABLE bots ADD COLUMN effort TEXT`,
  `ALTER TABLE bots ADD COLUMN folder TEXT`,
  `ALTER TABLE bots ADD COLUMN ai_account TEXT`,
  `ALTER TABLE bots ADD COLUMN template_id TEXT`,
  `ALTER TABLE bots ADD COLUMN connection_ids TEXT`,
  // What each agent spent per day (São Paulo's), beside the account's usage.
  `CREATE TABLE bot_usage (
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        cost REAL NOT NULL DEFAULT 0,
        PRIMARY KEY (bot_id, day)
    )`,
  // The account's AI accounts: Claude Code tokens its agents' long jobs run on.
  `CREATE TABLE ai_accounts (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        token TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )`,
  // The account's own templates, and its copies of house ones it edited (templates.js).
  `CREATE TABLE templates (
        id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        icon TEXT NOT NULL,
        area TEXT NOT NULL,
        owns TEXT NOT NULL DEFAULT '',
        measure TEXT NOT NULL DEFAULT '',
        run_when TEXT NOT NULL DEFAULT '',
        asks TEXT NOT NULL DEFAULT '',
        model TEXT NOT NULL,
        effort TEXT NOT NULL DEFAULT 'medium',
        instructions TEXT NOT NULL DEFAULT '',
        uses TEXT NOT NULL DEFAULT '[]',
        skills TEXT NOT NULL DEFAULT '[]',
        from_ids TEXT NOT NULL DEFAULT '[]',
        to_ids TEXT NOT NULL DEFAULT '[]',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, id)
    )`,
  // Skills are the account's library (29/10/2026): one outlives the agent that
  // wrote it, and each agent marks the ones it uses. The table is rebuilt to drop
  // the cascade from its creator, as connections were on 24/10.
  `CREATE TABLE skills_library (
        id TEXT PRIMARY KEY,
        account_id TEXT,
        bot_id TEXT,
        name TEXT NOT NULL,
        when_to_use TEXT NOT NULL DEFAULT '',
        steps TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
    );
     INSERT INTO skills_library (id, account_id, bot_id, name, when_to_use, steps, created_at, updated_at)
        SELECT skills.id, bots.account_id, skills.bot_id, skills.name, skills.when_to_use, skills.steps, skills.created_at, skills.updated_at FROM skills LEFT JOIN bots ON bots.id = skills.bot_id;
     CREATE TABLE bot_skills (
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        skill_id TEXT NOT NULL,
        PRIMARY KEY (bot_id, skill_id)
     );
     INSERT INTO bot_skills (bot_id, skill_id) SELECT bot_id, id FROM skills;
     DROP TABLE skills;
     ALTER TABLE skills_library RENAME TO skills;
     CREATE INDEX skills_by_account ON skills (account_id, name)`,
  // The person's repository on GitHub (repo.js): its name on the account, and
  // the last content written of each file, so only changes travel.
  `ALTER TABLE accounts ADD COLUMN repo TEXT`,
  `CREATE TABLE repo_files (
        account_id TEXT NOT NULL,
        path TEXT NOT NULL,
        content TEXT NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, path)
    )`,
  // Who else is in a bot (29/10/2026): kept by e-mail, so a person invited
  // before they ever signed in finds the bot on their first visit. 'read'
  // follows the conversation; 'enter' also writes to the bot, signed.
  `CREATE TABLE bot_members (
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        email TEXT NOT NULL,
        access TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (bot_id, email)
    )`,
  `CREATE INDEX bot_members_by_email ON bot_members (email)`,
  `ALTER TABLE bot_queue ADD COLUMN author TEXT`,
  // Each phone or browser that asked for notifications (web push).
  `CREATE TABLE push_subscriptions (
        endpoint TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        keys TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )`,
  `CREATE INDEX push_by_account ON push_subscriptions (account_id)`,
  // The composer's clock and ring: how long the bot worked on the
  // conversation, and how much the model read at its last step.
  `ALTER TABLE tasks ADD COLUMN work_seconds INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE tasks ADD COLUMN context_tokens INTEGER`,
  // What of the repository each bot's computer already has (path and blob
  // sha), so only what changed is copied there, and a file changed in the
  // repository while the bot worked is not overwritten by its version.
  `CREATE TABLE computer_files (
        bot_id TEXT NOT NULL REFERENCES bots(id) ON DELETE CASCADE,
        path TEXT NOT NULL,
        sha TEXT NOT NULL,
        PRIMARY KEY (bot_id, path)
    )`,
  // When the account's repository was last known to match the central: the
  // "GitHub sincronizado há 1 min" line over the files.
  `ALTER TABLE accounts ADD COLUMN repo_synced_at INTEGER`,
  // AI accounts by provider (29/10/2026): the rows before were all Claude
  // Code tokens; an API key's account keeps the models the person turned on.
  `ALTER TABLE ai_accounts ADD COLUMN provider TEXT NOT NULL DEFAULT 'claude-code'`,
  `ALTER TABLE ai_accounts ADD COLUMN models TEXT`,
  // What each AI account spent per day: the agents run on the person's own
  // keys, so the panel shows each key's use instead of a house limit.
  `CREATE TABLE ai_account_usage (
        ai_account_id TEXT NOT NULL REFERENCES ai_accounts(id) ON DELETE CASCADE,
        day TEXT NOT NULL,
        cost REAL NOT NULL DEFAULT 0,
        steps INTEGER NOT NULL DEFAULT 0,
        PRIMARY KEY (ai_account_id, day)
    )`,
  // What the model read at the last step, by part: the detail under the composer's ring.
  `ALTER TABLE tasks ADD COLUMN context_parts TEXT`,
  // The spoken summary of each final answer, and how fast it plays: off until the person turns it on.
  `ALTER TABLE accounts ADD COLUMN voice_summary INTEGER NOT NULL DEFAULT 0`,
  `ALTER TABLE accounts ADD COLUMN voice_speed REAL NOT NULL DEFAULT 1`,
  // "Liberar contexto": the computer's and the browser's tools left out of a
  // conversation that did not use them, until the agent brings them back.
  `ALTER TABLE tasks ADD COLUMN is_computer_released INTEGER NOT NULL DEFAULT 0`,
  // The person's own Chrome, shared by Playwriter's Remote control: the tunnel id (encrypted)
  // and the session the central keeps open on it (user-browser.js).
  `CREATE TABLE user_browsers (
        account_id TEXT PRIMARY KEY,
        tunnel TEXT NOT NULL,
        session_id TEXT,
        created_at INTEGER NOT NULL
    )`,
  // Each step's times (29/10/2026): first word, model, tools, cached tokens. The last 60 steps.
  'ALTER TABLE tasks ADD COLUMN step_timings TEXT',
  // A full conversation's beginning as a summary (30/10/2026), and the first message kept after it.
  'ALTER TABLE tasks ADD COLUMN compacted_summary TEXT',
  'ALTER TABLE tasks ADD COLUMN compacted_until INTEGER',
  // What a connected server says about using its tools (30/10/2026): the MCP `instructions`, read at
  // every connect and refresh, shown to the agent as the service's notes (engine/run.js).
  'ALTER TABLE connections ADD COLUMN instructions TEXT',
  // The person's standing order in a conversation (04/11/2026): their last words, or the ones a
  // colleague passed along with the work. An action those words ordered runs without asking again.
  'ALTER TABLE tasks ADD COLUMN mandate TEXT',
  // An agent's reply a person marked to find again (04/11/2026), by its event's UUID, with its words kept.
  `CREATE TABLE bookmarks (
        account_id TEXT NOT NULL,
        bot_id TEXT NOT NULL,
        event_id TEXT NOT NULL,
        text TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, event_id)
    )`,
  // What a "Voltar para aqui" cut (04/11/2026): the events after that message, kept to read, never run again.
  `CREATE TABLE branches (
        id TEXT PRIMARY KEY,
        bot_id TEXT NOT NULL,
        title TEXT NOT NULL,
        events TEXT NOT NULL,
        created_at INTEGER NOT NULL
    )`,
  // The day each account's health report went to its director (10/11/2026), so a restart never sends it twice.
  `CREATE TABLE health_reports (
        account_id TEXT NOT NULL,
        day TEXT NOT NULL,
        bot_id TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (account_id, day)
    )`,
  // An account can hold several companies, each with its director (10/11/2026): the report is per director.
  `DROP TABLE health_reports`,
  `CREATE TABLE health_reports (
        bot_id TEXT NOT NULL,
        day TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        PRIMARY KEY (bot_id, day)
    )`,
  // Keys for scripts and the house engineering (api-keys.js): only the hash is kept.
  `CREATE TABLE api_keys (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        name TEXT NOT NULL,
        prefix TEXT NOT NULL,
        hash TEXT NOT NULL UNIQUE,
        created_at INTEGER NOT NULL,
        last_used_at INTEGER,
        revoked_at INTEGER
    )`,
  // Who made a routine (18/11/2026): 'person' through the owner's route (panel or API key), 'agent' through
  // routine_create, the designer of a new bot, or an instruction rewritten from the repository. A person's
  // routine is their order on the turn it starts (engine/run.js keepMandate); the ones that existed are
  // 'agent' until the owner marks them.
  `ALTER TABLE routines ADD COLUMN created_by TEXT NOT NULL DEFAULT 'agent'`,
  // Local document revision history (Gemini Code OSS): tracks edits and diffs in local workspace mode
  // even when the workspace folder is not a Git repository.
  `CREATE TABLE document_revisions (
        id TEXT PRIMARY KEY,
        account_id TEXT NOT NULL,
        path TEXT NOT NULL,
        content TEXT,
        is_deleted INTEGER NOT NULL DEFAULT 0,
        message TEXT NOT NULL,
        author TEXT NOT NULL,
        created_at INTEGER NOT NULL
    );
    CREATE INDEX document_revisions_by_file ON document_revisions (account_id, path, created_at DESC)`,
  // Projects (25/11/2026): the folder of the person's repositories, and the
  // repository each agent works on, in its own worktree.
  `ALTER TABLE accounts ADD COLUMN projects_dir TEXT`,
  `ALTER TABLE bots ADD COLUMN project TEXT`,
];

db.exec(
  'CREATE TABLE IF NOT EXISTS migrations (id INTEGER PRIMARY KEY, applied_at INTEGER NOT NULL)',
);
const applied = db
  .query('SELECT COUNT(*) AS count FROM migrations')
  .get().count;
for (let index = applied; index < MIGRATIONS.length; index++) {
  db.transaction(() => {
    db.exec(MIGRATIONS[index]);
    db.query('INSERT INTO migrations (id, applied_at) VALUES (?, ?)').run(
      index,
      now(),
    );
  })();
}

export function now() {
  return Math.floor(Date.now() / 1000);
}

export function newId() {
  return crypto.randomUUID();
}

const toCamel = (key) =>
  key.replace(/_([a-z])/g, (_, letter) => letter.toUpperCase());

// snake_case stops here: rows leave this module in camelCase.
export function toApi(row, jsonFields = []) {
  if (!row) return null;
  const output = {};
  for (const [key, value] of Object.entries(row)) {
    output[toCamel(key)] =
      jsonFields.includes(key) && typeof value === 'string'
        ? JSON.parse(value)
        : value;
  }
  return output;
}
