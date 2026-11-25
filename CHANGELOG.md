# Changelog

Every change to Gemini Code, newest first. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/) and the version numbers
follow [Semantic Versioning](https://semver.org/).

Each pull request adds its line under **Unreleased**, in Added, Changed, Fixed
or Removed, with the date it merged and its number. CI refuses a pull request
without one (`scripts/check-changelog.js`). A release turns Unreleased into a
version with its date.

## [Unreleased]

### Fixed

- A flaky test of empty answers: each test now answers from its own script, so a
  late step of an earlier task can no longer take the next test's answers
  (2026-11-25).

### Changed

- The README opens with the mark, badges, a screenshot of the desk at work in
  light and dark, and download buttons per system (2026-11-25).
- New agent takes you to the command center's box, focused, with a hint on what
  to write and an example; an empty group no longer has its own New agent button
  (2026-11-25).
- Minor and patch updates: @eslint/js 9.39.5, eslint-plugin-react-hooks 7.1.1,
  Prettier 3.10.1 (with its formatting), @anthropic-ai/sdk 1.12.0,
  @modelcontextprotocol/sdk 1.32.2, @mantine/notifications 8.3.18, Tabler icons
  3.52.0, react-router-dom 7.18.6 and Vite 7.3.8 (2026-11-25).

- Groups of agents: a new group exists only once it is named (a pill field,
  Enter keeps it, Escape gives up), an empty group says what to do with it,
  deleting asks in the standard dialog, and the side header lines up with its
  buttons (2026-11-25).

### Added

- Settings › Projects: the folder that holds your repositories, and each agent
  works in its own `git worktree` of the one it picks, on the branch
  `gemini-code/<agent>`; the tree, the files MCP, the terminal, the subscription
  and the API tools all land there. GitHub is reached only through the GitHub
  connector (2026-11-25).
- The README, in English and Portuguese, shows the design system with an image
  of its page and links to the reference and the HTML page (2026-11-25).

### Removed

- Cloud mode: the cloud computers (Fly Sprites), their spares, the live screen,
  taking over the screen, teaching a task by recording it, disk restore points,
  the cloud browser and the Cloudflare Worker gateway, with packages/computer
  and packages/worker. Gemini Code runs as one executable on the person's own
  machine; the agents' computer is that machine, and the server answers only on
  127.0.0.1 (2026-11-25).
- Settings › Files and GitHub, and the agent's "Change folder" button: the
  workspace repository row was left from the hosted mode and showed nothing true
  on this machine (2026-11-25).
- Sharing an agent and the All / Mine / Shared filters in the side column: one
  person runs Gemini Code on their own machine (2026-11-25).

## [0.2.1] - 2026-11-25

### Added

- A design system for every piece Gemini Code makes: the dashboard, landing
  page, site, IDE, blog, text messages, e-mail, slides, social posts, business
  cards and the terminal, with the trademark rule and the open decision on the
  mark; and the same system as a page built from its own tokens and live
  components, `docs/2026-11-25-design-system.html` (2026-11-25).
- The macOS builds are signed with a Developer ID, run with the hardened runtime
  and are notarized by Apple (2026-11-25).

### Changed

- The design system records the decision that Gemini Code looks exactly like
  Gemini, as a showcase for Google, drawing its own star and never using
  Google's brand assets (2026-11-25).
- The README opens with a download table for every system (2026-11-25).
- Settings is rebuilt from one kit (pages/settings/kit.jsx) and documented as
  the pattern to follow (docs/settings.md): every section says what it is for,
  shows states in words, has loading, empty and error states, and sentence case.
  People lists accounts as rows with numbers that read at a glance; My Chrome
  links in three steps; Security says plainly that local mode has no sign-in;
  Team connections shows each service's icon, state and a Sign in button;
  Dictation shows which voice service answers; Agent safety lists the rules in
  the code (2026-11-25).

### Removed

- Settings › People: Gemini Code runs on the person's own machine, for them
  alone, so there is no one else to allow or block; the approvals and failures
  of the last 30 days moved to Diagnostics (2026-11-25).
- Settings › E-mail, an empty page beside the inbound address each agent already
  has in its own settings, and Settings › Team connections, a second list of
  what Connectors already manages (2026-11-25).
- The documents screen of the old per-agent docs folder, which nothing showed
  any more, and the agent trigger that pointed to an inbox outside Gemini Code
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

[Unreleased]: https://github.com/ciro-maciel/gemini-code/compare/v0.2.1...HEAD
[0.2.1]: https://github.com/ciro-maciel/gemini-code/compare/v0.2.0...v0.2.1
[0.2.0]: https://github.com/ciro-maciel/gemini-code/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/ciro-maciel/gemini-code/releases/tag/v0.1.0
