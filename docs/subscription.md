# Signing in with a Google subscription

Gemini Code agents can talk through a Google AI Pro or Ultra subscription
instead of an API key. That gives them the newest models the subscription opens,
such as the Gemini 4 family (Neon, Carbon, Argon, Hydrogen), with no API
billing.

## How it works today

There is no official API yet for a third-party app to use a Gemini subscription.
The supported path is Google's own **Antigravity CLI** (`agy`), signed in once
on your machine:

```bash
brew install --cask antigravity-cli   # macOS; see antigravity.google for other systems
agy                                   # sign in once with the Google account that has the subscription
agy models                            # the models your subscription opens
```

When the control server starts, it asks `agy` which models it can use. If it
answers, an AI account called **Google subscription** appears with the Neon
models turned on. An agent set to one of those models hands each turn to
`agy acp`, the Antigravity CLI's Agent Client Protocol server
([agentclientprotocol.com](https://agentclientprotocol.com)), over stdio:

- `initialize`, then `session/new` in the agent's own folder
  (`workspace/agents/<agent>/`), or `session/load` to continue the same
  conversation, then `session/set_model` and `session/prompt`
- its text and tool steps arrive as `session/update` and stream into the agent's
  conversation
- **before every tool call it asks** (`session/request_permission`), and Gemini
  Code answers (`packages/server/src/engine/subscription/permission.js`): a path
  outside the agent's folder is refused, including paths a shell command names;
  deleting is refused and left to the person; reading, searching, editing inside
  the folder and running commands there are allowed. A refusal shows in the
  conversation with its reason.

Gemini Code never sees or stores your Google credentials: `agy` keeps them.

## What to know

- **The rules above are fixed, not yet the full risk judge.** Every call is
  checked against the folder and the delete rule; it does not yet open an
  approval card for the person to decide, the way Gemini Code's own tools do.
- **Gemini CLI cannot use the subscription.** On 25/11/2026 its Google sign-in
  answered "This client is no longer supported for Gemini Code Assist for
  individuals. To continue using Gemini, please migrate to the Antigravity suite
  of products". Antigravity is the path Google points to, and the one used here.
- **The subscription has a quota** that resets in hours. When it runs out, the
  agent says when it comes back and suggests switching to an API-key model.
- **One machine.** `agy` runs where the control server runs. Cloud computers
  (Fly Sprites) do not use it yet.

## The state tree, and why

Everything about the subscription lives in one serializable object, read with
`GET /api/subscription` and refreshed with `POST /api/subscription/refresh`:

```json
{
  "version": 1,
  "status": "ready",
  "transport": "antigravity-cli",
  "transportVersion": "1.5.17",
  "models": [{ "id": "gemini-4-neon-low", "label": "Gemini 4 Neon (Low)" }],
  "quota": { "isExhausted": false, "resetsAt": null },
  "officialApi": {
    "status": "awaiting",
    "expectedOn": "2026-12-02",
    "isConfirmed": false
  },
  "checkedAt": 1795632000000,
  "error": null
}
```

`status` is one of `unknown`, `checking`, `ready`, `not_installed`,
`signed_out`, `quota_exhausted`, `error`.

The transport fills the tree, and the rest of Gemini Code reads only the tree. A
new transport only has to implement two functions with the same answers as
`packages/server/src/engine/subscription/antigravity-cli.js`:

- `probe()` returns the patch for the tree (status, models, quota)
- `runTurn({ prompt, model, cwd, conversationId, onEvent, signal })` streams
  `start`, `text`, `tool_start`, `tool_end` and `done` events and resolves with
  `{ status, text, conversationId }`

Pick it with `SUBSCRIPTION_TRANSPORT=<id>`.

## 02/12/2026

A report, not an announcement, says Google may open Gemini subscriptions to
third-party harnesses on **02/12/2026**, starting with Hermes Agent
([TestingCatalog](https://www.testingcatalog.com/gemini-subscriptions-may-reach-hermes-agent-on-december-2/)).
`packages/server/src/engine/subscription/official-api.js` holds the place for
it: when Google publishes how it works, that file gets the two functions above
and becomes the default. Nothing else needs to change.
