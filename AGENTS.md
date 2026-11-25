# Instructions for coding agents working on Gemini Code

You are changing an open-source multi-agent coding workspace built around Google
Gemini. Everything here is public.

## Commands

- Install: `bun install` (never npm)
- Run: `bun run dev` (control :8787, dashboard :5180; the key comes from the
  root `.env`)
- Test: `bun run test`; one area:
  `cd control && bun test src/engine/subscription`
- Format: `bun run format`

## Rules

1. A test counts only if breaking the code it protects turns it red. Check that
   before you call a change done.
2. Bun's `mock.module` is global and leaks between test files; prefer injected
   fakes (see `useSpawner` in
   `packages/server/src/engine/subscription/antigravity-cli.js`).
3. Identifiers, files and comments in English; text a person reads in the
   product in Portuguese. When you rename, list collisions first: a rename can
   hit visible text or an existing name with another meaning.
4. Never commit secrets, machine paths, personal e-mail addresses or `.env`.
5. Anything that sends, pays, publishes, deletes or signs in must go through
   `packages/server/src/engine/policy.js`. Do not add a tool that bypasses it.
6. Smallest change that solves the problem. No shims or redirects for code that
   has not shipped.

## Map

- `packages/server/src/engine/run.js`: the agent loop
- `packages/server/src/engine/gemini.js`: Gemini API adapter
- `packages/server/src/engine/model-router.js`: failover between models
- `packages/server/src/engine/policy.js`: risk judge and approvals
- `packages/server/src/engine/subscription/`: Google subscription sign-in
  through a replaceable transport ([docs/subscription.md](docs/subscription.md))
- `packages/dashboard/src/`: React 19 + Mantine 8 dashboard
