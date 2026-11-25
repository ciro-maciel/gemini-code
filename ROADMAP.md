# Roadmap

What comes next for Gemini Code, in order. Each item is done when it works the
way a person reaches it, with tests that fail when it breaks.

## 1. Each agent with its own folder

- [x] The shared Files tab is gone; each agent's file tree sits next to its
      conversation and updates live.
- [x] A files MCP server (guide, read, write, delete) locks every file operation
      inside the agent's folder ([docs/files-mcp.md](docs/files-mcp.md)).
- [x] The agent's terminal starts in its own folder.
- [ ] Each agent gets its own `git worktree` of the project, so two agents can
      change the same repository without colliding.

## 2. A layout a Gemini CLI contributor already knows

Gemini Code is a lean cousin of
[google-gemini/gemini-cli](https://github.com/google-gemini/gemini-cli): the
same layout and code style, on Bun and plain JavaScript.

- [x] `packages/server` and `packages/dashboard` as Bun workspaces.
- [x] Prettier and `.editorconfig` in the Gemini CLI style; ESLint with zero
      warnings.
- [x] `bun run preflight`: format check, lint and every test, the one command
      before a pull request.
- [x] `GEMINI.md` as the context file for agents working on this repository.

## 3. English first

- [x] The dashboard is written in English; Brazilian Portuguese is a translation
      layer (`lib/pt.json`) that follows the browser's language.
- [ ] The server's messages a person reads (errors, warnings, notices) in
      English, translated by the same layer.
- [ ] The agent's instructions and tool results in English.

## 4. Gemini CLI as an agent engine

- [x] The subscription transport speaks ACP (`agy acp`), so every tool call the
      agent wants to run asks Gemini Code first.
- [ ] Blocked by Google for subscriptions: Gemini CLI's Google sign-in now
      refuses Google AI Pro and Ultra ("no longer supported for Gemini Code
      Assist for individuals ... migrate to the Antigravity suite"), and
      `@google/gemini-cli-sdk` is not published on npm. Gemini CLI over ACP with
      a Gemini API key remains possible.
- [ ] Permission requests open an approval card when the rules alone cannot
      decide, as Gemini Code's own tools do.
- [x] A subscription agent gets its folder through the files MCP; an MCP server
      it finds in its own global settings (such as the person's Playwriter) is
      refused.
- [ ] The person's connections (GitHub, Linear...) and Gemini Code's browser
      reach a subscription agent through an MCP proxy on the server, so secrets
      stay there and writes still pass the risk judge.

## 5. The official subscription API

- [ ] When Google publishes how third-party harnesses use a Gemini subscription
      (reported for 02/12/2026, unconfirmed), it replaces the Antigravity CLI
      transport behind the same state tree
      ([docs/subscription.md](docs/subscription.md)).
