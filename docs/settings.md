# Settings: the pattern every section follows

Settings is where a person checks and changes how Gemini Code works for them.
They arrive with one question ("is my key working?", "who can see this?", "why
did the agent refuse?") and leave when the screen answered it. Every section is
built the same way, from the same pieces, so the answer is always in the same
place. Build any new section, and any screen that lists and changes things, the
way this page describes.

The pieces live in `packages/dashboard/src/pages/settings/kit.jsx`; their styles
are the "Settings kit" part of `neural-expressive.css`. The tokens (color, type,
corners, motion) come from the design system.

## Anatomy of a section

```
Settings                  AI accounts                     [Add a Gemini API key]
                          Agents think with Gemini through your own Gemini
Your account              API key. Each key opens a list of models...
  AI accounts   (chosen)
  Language - Idioma       +----------------------------------------------------+
  Notifications           | (o) Google Gemini - Personal    [Choose] [Remove]  |
  ...                     |     US$ 0.01 today - US$ 0.02 in 30 days - 2 agents|
Organization              |     gemini-3.6-flash x   gemini-3.5-flash x        |
  ...                     +----------------------------------------------------+
Help
  Diagnostics
```

1. **The navigation** on the left: the sections grouped by whom they concern
   (Your account, Organization, Help), each with its icon. The chosen one sits
   in the primary container. Sections are set apart by space, never by rules.
2. **The header** (`SettingsHeader`): the section's name, then one or two
   sentences on what it is for and why it matters, then its one main action on
   the right.
3. **Groups** (`SettingsGroup`): rows on a tonal surface (`--gm-surface-1`), an
   optional title and note on top, an optional foot line.
4. **Rows** (`SettingsRow`): an icon in a circle (or a brand image, or a step
   number), the title, a line on what it means, and on the right its state or
   its controls. A hairline separates rows; nothing else draws lines.

## The pieces

| Piece              | Use it for                                              | Props                                                         |
| ------------------ | ------------------------------------------------------- | ------------------------------------------------------------- |
| `SettingsHeader`   | The top of every section                                | `title`, `description`, `actions`                             |
| `SettingsGroup`    | A set of related rows                                   | `title`, `note`, `actions`, `footer`, children                |
| `SettingsRow`      | One thing, its meaning, its state or control            | `icon` or `image` or `step`, `title`, `description`, children |
| `StateTag`         | A state, always as a word with its icon                 | `status`: `ok` `warn` `fail` `off` `wait`, children           |
| `StatGrid`         | Numbers that read at a glance                           | `items`: `{ label, value, note }`, `isLoading`                |
| `Notice`           | What is true here and what to do (empty, off, failed)   | `tone`: `info` `warn` `fail`, `icon`, `title`, children       |
| `SettingsSkeleton` | The rows' shape while they load                         | `rows`                                                        |
| `Parts`            | A line made of parts, joined with a middle dot          | `items`                                                       |
| `.st-form`         | A form inside a group: `.st-form-row`, `.st-field`      | class names                                                   |
| `.st-chips`        | Removable values under a row (models): `.st-chip`, an x | class names                                                   |

## Writing a section

- **The header says what the section is for, not what is on it.** "Agents think
  with Gemini through your own Gemini API key" tells why the key matters; "Your
  AI accounts are listed below" tells nothing.
- **A row's title names the thing; its line says what it means for the person.**
  "Local mode, no sign-in" / "Whoever reaches its port acts as you, so keep it
  on localhost."
- **A state is a word.** `StateTag` carries the icon and the color as hints; the
  word carries the meaning ("Connected", "Waiting for sign-in", "Failed"). A
  failure says why, in the row's line.
- **Say only what the code does.** Before writing "always", find the rule in the
  code. When a mode changes the truth (local mode has no sign-in), the section
  changes with it. A section that promises something the server does not do is
  deleted, not kept as a placeholder.
- **One filled button per view**, for the main action. Everything else is tonal
  (`btn outline`). Destructive actions confirm in `DeleteModal`, which names
  what stops working.
- **Sentence case everywhere.** No tiny uppercase labels tracked wide, no table
  headers in capitals.
- **Words:** agent (never bot), AI account (never provider), connector, agent
  folder, the risk judge.

## States every section has

| State   | What shows                                                                 |
| ------- | -------------------------------------------------------------------------- |
| Loading | `SettingsSkeleton` in the shape of the rows, after the page's one loader   |
| Empty   | A `Notice` that says what is missing and how to add it                     |
| Off     | A row with `StateTag status="off"` and what turns it on                    |
| Error   | A `Notice tone="fail"` with the reason; never "nothing here" for a failure |
| Full    | The groups and rows                                                        |

## Language

Every text is written in English. Brazilian Portuguese comes from
`packages/dashboard/src/lib/pt.json`: exact texts under `texts`, texts with a
value under `patterns` (`{0}` any short value, `{#0}` only a number, a date or a
time). The layer translates one text node at a time, so:

- Build a line from values as one template string (`` `${count} agents` ``),
  never as text and values side by side in JSX.
- A line of several facts uses `Parts`, so each fact is its own text.
- A name that must read in both languages ("Language · Idioma") carries
  `data-no-translate`.
- Add every new text to `pt.json` in the same commit.

## Adding a section

1. Write it in `pages/settings/`, from the kit only. One component per section,
   with a comment on what it is for.
2. Add it to `NAV` in `pages/SettingsPage.jsx`: id, label, icon, component, and
   `true` when only the owner sees it.
3. If it reports on the system, add a check to
   `packages/server/src/diagnostics.js` too, so Diagnostics shows it.
4. Add its texts to `pt.json`.
5. Look at it in light and dark, at desktop width and at 390 px, in each of the
   states above, before you call it done.

## The sections today

| Section           | What it answers                                                       |
| ----------------- | --------------------------------------------------------------------- |
| AI accounts       | Which Gemini API keys the agents use, what they cost, which models    |
| Language · Idioma | The dashboard's language in this browser                              |
| Notifications     | Whether this device is told when an agent needs you                   |
| My Chrome         | Whether agents can act in your own Chrome, and how to link it         |
| Security          | How this Gemini Code is reached and who can act in it                 |
| People            | Who uses it, who waits for access, what happened to approvals (owner) |
| Files and GitHub  | Where the agents' files live                                          |
| Team connections  | Each connected service and its real state                             |
| Dictation         | Talking instead of typing, and which voice service answers            |
| Agent safety      | The rules every agent follows, whatever anyone allows                 |
| Diagnostics       | Whether every part works, is connected and is allowed, right now      |
