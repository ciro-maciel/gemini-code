# Gemini Code Project Context

Context for coding agents (Gemini CLI, Antigravity, Claude Code and others)
working on this repository. Everything here is public.

## Project Overview

Gemini Code is an open-source desk of coding agents built around Google Gemini:
several agents work at once, each in its own folder, and a person approves what
matters. It is a lean cousin of
[google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli): the
same layout and code style, on Bun and plain JavaScript.

- `packages/server`: Bun, SQLite. REST API and live streams, the agent loop
  (`src/engine/run.js`), the Gemini adapter (`src/engine/gemini.js`), failover
  (`src/engine/model-router.js`), the risk judge and approvals
  (`src/engine/policy.js`), the files MCP (`src/agent-files.js`,
  `src/mcp-files.js`) and the Google subscription transport
  (`src/engine/subscription/`).
- `packages/dashboard`: React 19, Vite, Mantine 8. The desk, the agent
  conversations and file trees; the public demo in `src/demo/`.
- `packages/computer`: the optional cloud computer image (Fly Sprites).
- `packages/worker`: the optional Cloudflare Worker gateway.
- `workspace/`: where agents and shared skills live by default.

## Building and Running

- Install: `bun install`. Bun only: never npm, never a second lockfile.
- Run: `bun run dev` (server on :8787, dashboard on :5180). The server reads the
  root `.env`; `GEMINI_API_KEY` is the only value it needs.
- Demo: `bun --cwd packages/dashboard run dev:demo` runs the dashboard against
  the in-browser fake API.

## Testing and Quality

- `bun run preflight` before every pull request: Prettier check, ESLint with
  zero warnings, and every test.
- `bun run test`, or one area:
  `bun --cwd packages/server test src/engine/subscription`.
- `bun run format` and `bun run lint:fix` fix what can be fixed.

## Development Conventions

- **Plain JavaScript**, ES modules. No TypeScript.
- **Style:** Prettier with the Gemini CLI settings (two spaces, 80 columns,
  semicolons, single quotes, trailing commas). ESLint enforces the rest.
- **Names:** `camelCase` for variables, functions and JSON fields, `PascalCase`
  for classes and components, `SCREAMING_SNAKE` for module constants,
  `kebab-case.js` for files. `Id`, never `ID`. Booleans start with `is`, `has`,
  `can` or `should`.
- **Language:** English everywhere: identifiers, comments, commits and every
  text the dashboard shows. Brazilian Portuguese is a layer over it: each new
  visible text gets its translation in `packages/dashboard/src/lib/pt.json`
  (`texts` for exact matches, `patterns` with `{0}` or `{#0}` for values), and a
  line built from pieces translates each piece with `t()` from
  `lib/language.js`. The layer follows the browser (pt-\* reads Portuguese)
  until the person picks a language. When you rename, list collisions first: a
  rename can hit visible text or an existing name.
- **Commits:** Conventional Commits,
  `type(scope): imperative sentence in lower case`.
- **Safety:** anything that sends, pays, publishes, deletes or signs in goes
  through `packages/server/src/engine/policy.js`. Never add a tool that bypasses
  it. File work goes through the files MCP and stays inside the agent's folder.
- **Small changes.** Delete before adding; no shims for code that has not
  shipped.
- Never commit secrets, machine paths, personal e-mail addresses or `.env`.

## Branches and Pull Requests

- `main` is protected. Never push to it: create a branch from `main`, push it,
  and open a pull request. It merges (squash) only when the `test` check passes.
- Every pull request from a branch of this repository gets its own demo at
  `https://ciro-maciel.github.io/gemini-code/preview/<branch>/`, linked in a
  comment. Use it to show a UI change before it merges.
- Run `bun run preflight` before every push.
- Every pull request adds its line to `CHANGELOG.md` under `## [Unreleased]`
  (Added, Changed, Fixed or Removed, with the merge date and the pull request
  number). CI refuses one without it.

## Testing Conventions

- A test counts only if breaking the code it protects turns it red. Break it on
  purpose before you call a change done.
- Bun's `mock.module` is global and leaks between files. Prefer injected fakes
  (`useSpawner` in `src/engine/subscription/antigravity-cli.js`,
  `useGeminiFetch` in `src/engine/gemini.js`).
- Set config values on the imported `config` object, not on `process.env`: the
  config is read at import, and a value set later only works when the shell
  already had it.
- A test that drives a task counts only that task's calls (use a prompt no other
  test uses): steps of an earlier test can still arrive.

## Documentation

- Documentation lives in `docs/`: `files-mcp.md`, `subscription.md`,
  `design.md`.
- `README.md` and `README.pt-BR.md` say the same thing; change both together.
- Suggest documentation updates when a change makes a page wrong.
