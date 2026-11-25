# Gemini Code

**An open-source desk where several coding agents, built around Google Gemini, work on your software at the same time and ask a person before anything risky.**

Coding agents that read a repository, run commands and ship changes are already part of how developers work. One agent at a time is the easy part. The hard part comes next: running several at once without them overwriting each other, and keeping a person in charge of what matters.

Gemini Code is an open answer to that, built around Gemini. You open as many agents as the work needs (an engineer, a reviewer, a debugger) and watch them work in parallel. Each agent works in its own folder: its terminal starts there, its file tree sits next to its conversation, and it cannot read or write outside it.

> Independent open-source project. Not affiliated with, sponsored or endorsed by Google. "Gemini" is a trademark of Google LLC.

---

## What it does

- **A desk of agents (Mesa).** Split panes, one agent per pane, all running at once. The command center shows who is working, who is waiting for you and what each one changed.
- **Built around Gemini.** Talks to the Gemini API directly: streaming, thinking summaries, function calling, images and cached tokens. Gemini is the default and the only provider set up out of the box; the engine also speaks the OpenAI chat format, so another provider works with its own key.
- **A person decides what matters.** A risk judge reads every shell command, browser action and connector write before it runs. Payments and sign-ins ask you every time. Sending, publishing and deleting ask until you choose to always allow them, so routine work stops asking.
- **Secrets stay out of the model.** A per-agent encrypted vault puts keys only into the command's environment and removes their values from everything the model reads.
- **Connectors through MCP.** GitHub, Linear, Sentry, Cloudflare, Notion, Figma and others through their official remote MCP servers, plus a browser the agent can drive.
- **Sign in with your Google subscription.** Agents can run on a Google AI Pro or Ultra subscription through Google's Antigravity CLI, which opens the Gemini 4 family (Neon and others) with no API billing. See [docs/subscription.md](docs/subscription.md).
- **Each agent's folder, through one MCP.** A files MCP server with four tools (guide, read, write, delete) covers listing, tree, reading, searching, writing, editing, moving, copying and deleting, all locked inside the agent's folder. Deleting always waits for the person. The dashboard's tree uses the same routes, and any MCP client (Antigravity CLI, Gemini CLI, Claude Code) can mount it at `/api/bots/<agent>/mcp/files`. See [docs/files-mcp.md](docs/files-mcp.md).
- **Local first.** Runs on your machine against a folder, with no account and no login. A cloud mode, one isolated Linux computer per agent on Fly Sprites, is optional.

## Quickstart

You need [Bun](https://bun.sh) 1.2+ and a Gemini API key from [Google AI Studio](https://aistudio.google.com/apikey). The free tier is enough to try it.

```bash
git clone https://github.com/ciro-maciel/gemini-code.git
cd gemini-code
bun install
cp .env.example .env        # set GEMINI_API_KEY=...
bun run dev                 # control server on :8787, dashboard on :5180
```

Open http://localhost:5180. To point the agents at your own project:

```bash
WORKSPACE_DIR=/path/to/your/repo bun run dev
```

## Models

The default is the fastest Gemini model that answered reliably on the free tier when we tried them. Change it with `DEFAULT_MODEL`.

| Model | Use |
|---|---|
| `gemini-3.5-flash-lite` (default) | Everyday steps, the risk judge, titles |
| `gemini-3.6-flash` | Harder work across many files |
| `gemini-3.5-flash` | Fallback when the others are busy |

In one run on 24/11/2026 (free tier, a prompt that calls one tool), `gemini-3.5-flash-lite` started answering in 0.75 s and `gemini-3.6-flash` in 1.5 s. When a model is overloaded or out of quota, the engine moves to the next healthy one on its own.

## How it is built

| Folder | Stack | What it is |
|---|---|---|
| `control/` | Bun, SQLite (WAL) | REST API and live streams, the agent loop, the Gemini adapter, risk judge, MCP client, vault, local and cloud runtimes |
| `dashboard/` | React 19, Vite, Mantine 8 | The desk: panes, command center, agent conversations, approvals, audit trail |
| `computer/` | Ubuntu, Chrome, Playwright MCP | Optional image for one isolated cloud computer per agent |
| `worker/` | Cloudflare Worker | Optional public gateway and wake-up alarm for cloud deployments |
| `workspace/` | Files | Where agents and shared skills live by default |

Where to start reading: `control/src/engine/run.js` (the loop), `control/src/engine/gemini.js` (the API), `control/src/engine/policy.js` (what needs a person), `control/src/engine/model-router.js` (failover).

## Roadmap

**Milestone 1, almost done: each agent with its own file tree.** Done: the shared Files tab is gone; each agent's tree shows next to its conversation and updates live, with what it added (A) or modified (M) marked; its terminal starts in its own folder; the files MCP locks every file operation inside it. Still to do: give each agent its own `git worktree` of the project.

Later milestones are discussed in the issues.

## Contributing

Issues and pull requests are welcome. Read [CONTRIBUTING.md](CONTRIBUTING.md) first; agents working on this repository read [AGENTS.md](AGENTS.md).

```bash
bun run test     # unit tests in control/ and dashboard/
bun run format   # Prettier
```

## Who makes it

Gemini Code was started by [Ciro Cesar Maciel](https://ciromaciel.click/?ref=oss-gemini-code), who builds software and AI agents and publishes the tools he uses as open source.

## License

[Apache License 2.0](LICENSE). Copyright 2026 Ciro Cesar Maciel and contributors.

Leia em português: [README.pt-BR.md](README.pt-BR.md).
