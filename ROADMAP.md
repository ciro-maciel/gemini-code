# Roadmap

What comes next for Gemini Code, in order. Each item is done when it works the way a person reaches it, with tests that fail when it breaks.

## 1. Each agent with its own folder

- [x] The shared Files tab is gone; each agent's file tree sits next to its conversation and updates live.
- [x] A files MCP server (guide, read, write, delete) locks every file operation inside the agent's folder ([docs/files-mcp.md](docs/files-mcp.md)).
- [x] The agent's terminal starts in its own folder.
- [ ] Each agent gets its own `git worktree` of the project, so two agents can change the same repository without colliding.

## 2. A layout a Gemini CLI contributor already knows

Gemini Code is a lean cousin of [google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli): the same layout and code style, on Bun and plain JavaScript.

- [ ] `packages/server`, `packages/dashboard`, `packages/computer`, `packages/worker` as Bun workspaces.
- [ ] Prettier and `.editorconfig` in the Gemini CLI style; ESLint with zero warnings.
- [ ] `bun run preflight`: format check, lint and every test, the one command before a pull request.
- [ ] `GEMINI.md` as the context file for agents working on this repository.

## 3. English first

- [ ] Every text a person reads in English by default, with Brazilian Portuguese as a translation that follows the browser's language.

## 4. Gemini CLI as an agent engine

- [ ] An agent can run on `@google/gemini-cli-sdk` (`GeminiCliAgent`), next to the Gemini API and the Google subscription, with its steps streaming into the conversation.

## 5. The official subscription API

- [ ] When Google publishes how third-party harnesses use a Gemini subscription (reported for 02/12/2026, unconfirmed), it replaces the Antigravity CLI transport behind the same state tree ([docs/subscription.md](docs/subscription.md)).
