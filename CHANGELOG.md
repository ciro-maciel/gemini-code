# Changelog

Every change to Gemini Code, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the version numbers
follow [Semantic Versioning](https://semver.org/).

Each pull request adds its line under **Unreleased**, in Added, Changed, Fixed
or Removed, with the date it merged and its number. CI refuses a pull request
without one (`scripts/check-changelog.js`). A release turns Unreleased into a
version with its date.

## [Unreleased]

### Changed

- Settings is rebuilt from one kit (pages/settings/kit.jsx) and documented as
  the pattern to follow (docs/settings.md): every section says what it is for,
  shows states in words, has loading, empty and error states, and sentence case.
  People lists accounts as rows with numbers that read at a glance; My Chrome
  links in three steps; Security says plainly that local mode has no sign-in;
  Team connections shows each service's icon, state and a Sign in button;
  Dictation shows which voice service answers; Agent safety lists the rules in
  the code (2026-11-25).

### Removed

- The E-mail section, which promised inbound webhooks the server does not have
  (2026-11-25).

- Trunk-based development: maintainers push small commits straight to `main`; a
  `pre-push` hook runs the preflight and the changelog rule on the machine, and
  CI runs no tests (2026-11-25).

## [0.2.0] - 2026-11-25

### Added

- An installer for macOS, Linux and Windows: one command downloads a single
  executable with the Bun runtime inside, checks its SHA-256 and adds
  `gemini-code` to the PATH, with no administrator rights; a tag `v*` builds the
  five archives and publishes the release (2026-11-25, #28).
- Settings › Diagnostics checks every part for real, now: the server, the
  database, the workspace, the Gemini key (asked to Google), each agent's AI
  account, folder and files MCP, the connectors, your Chrome and the
  permissions, each with its state, the reason and its time; the report copies
  as text. It replaces the support modal (2026-11-25, #34).
- Each connector shows its brand's own icon, in its colors, kept in the
  repository so the app and the demo show it without fetching images from
  another host (2026-11-25, #27).
- A changelog, and a CI check that every pull request adds its line to it
  (2026-11-25, #26).
- Subscription agents get their own folder through the files MCP (2026-11-25,
  #25).
- The subscription transport speaks the Agent Client Protocol (`agy acp`): every
  tool call the agent wants to run asks Gemini Code first, and the answer keeps
  it inside its folder and leaves deleting to the person (2026-11-25, #23).
- A search palette with quick actions, keyboard navigation and one selection
  (2026-11-25, #19).
- A demo of the dashboard for every branch, at
  `ciro-maciel.github.io/gemini-code/preview/<branch>/` (2026-11-25, #16).

### Changed

- The language list in Settings is compact and narrower (2026-11-25, #34).
- The account menu is an account card in Google's pattern: the e-mail, the
  avatar in Gemini's ring, a greeting, Manage settings, the account's lines with
  what each holds, and the version with the changelog (2026-11-25, #31).
- Language moved from a modal to Settings › Language · Idioma, a Material radio
  list as Google's settings draw a choice (2026-11-25, #31).

- The language picker in the dashboard's own look: tonal cards with the
  language's code, its name in its own language and in the other one, and the
  date and number format it brings; arrows move, Enter chooses (2026-11-25,
  #29).
- Gemini Code works only with Gemini: AI accounts offer only a Gemini API key
  from Google AI Studio. The subscription account is no longer made on its own
  or shown until Google publishes its official path, and stays as a personal
  experiment behind `GEMINI_SUBSCRIPTION=1`; the demo shows only Gemini too
  (2026-11-25, #30).
- The changelog check also accepts a release that turns Unreleased into a new
  version (2026-11-25, #30).
- The README says signing in with a Google AI Pro or Ultra subscription waits
  for Google's official path for third-party tools; the official way today is a
  Gemini API key from Google AI Studio (2026-11-25, #24).
- The server's messages a person reads are in English, translated to Brazilian
  Portuguese by the dashboard (2026-11-25, #21).
- The dashboard is written in English first, with Brazilian Portuguese as a
  translation that follows the browser's language (2026-11-25, #18).
- `main` changes only through pull requests with the `test` check green
  (2026-11-25, #16).

### Removed

- The folder chip in the composer: every agent works in its own folder, shown
  beside its conversation (2026-11-25, #31).

### Fixed

- "API Keys & Models" and "Diagnostics" in the account menu show in Portuguese
  too (2026-11-25, #29).
- Notion, Atlassian and the other servers that accept a URL as the client id
  connect on `http://localhost`: the URL is offered only on HTTPS, and the
  sign-in registers otherwise (2026-11-25, #27).
- A server that lets in only the MCP clients it approved (Figma) says so in
  words, not as a JSON parse error (2026-11-25, #27).
- A follow-up on the subscription no longer repeats the previous answer: the
  history `session/load` replays stays out of the new one (2026-11-25, #25).
- An MCP server a subscription agent finds in its own global settings, such as
  the person's Playwriter, is refused (2026-11-25, #25).
- File links inside the agent's folder show as relative paths, not the machine's
  `file://` address (2026-11-25, #25).
- A refused turn with no answer says what was refused and why, instead of
  "Done." (2026-11-25, #25).
- A tool result no longer shows twice when the agent repeats its final status
  (2026-11-25, #25).
- No rules on the collapsed side of the dashboard (2026-11-25, #22).
- A preview removal is never dropped: one queue per demo target (2026-11-25,
  #20).
- One 12 px space between panes, not 32 (2026-11-25, #17).

## [0.1.0] - 2026-11-25

The first public version.

### Added

- A desk of coding agents built around the Gemini API: split panes, one agent
  per pane, a command center, a risk judge before shell, browser and connector
  actions, a per-agent encrypted vault and connectors through MCP.
- Each agent's folder through a files MCP (guide, read, write, delete), with its
  tree beside the conversation.
- Code opens in Monaco, with VS Code's colors and Cmd+S to save.
- A neural expressive look, after Google's 2026 Gemini design.
- A public demo of the dashboard on GitHub Pages, with example agent folders.
- The Gemini CLI layout (`packages/*`), Prettier, EditorConfig, ESLint with zero
  warnings, `bun run preflight`, `GEMINI.md`, a roadmap and one grouped weekly
  Dependabot update.

[Unreleased]: https://github.com/ciro-maciel/gemini-code/compare/v0.2.0...HEAD
[0.2.0]: https://github.com/ciro-maciel/gemini-code/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ciro-maciel/gemini-code/releases/tag/v0.1.0
