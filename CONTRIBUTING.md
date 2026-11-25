# Contributing to Gemini Code

Thanks for helping. This page says how to get the project running, what a good
change looks like and how it gets in.

## Run it

```bash
bun install
cp .env.example .env      # GEMINI_API_KEY from https://aistudio.google.com/apikey
bun run dev               # server on :8787, dashboard on :5180
bun run preflight         # format check, lint and every test: the pre-push hook runs it
```

Coding agents working here read [GEMINI.md](GEMINI.md) first.

Use [Bun](https://bun.sh) for everything (`bun install`, `bun add`, `bun test`,
`bunx`). Do not use npm: two dependency trees drift apart without warning.

## A good change

- **One change per commit**, with the reason in its message: what a person could
  not do before, and can now.
- **Tests that fail when the behavior breaks.** Before you open the pull
  request, break the code your test protects and watch the test turn red. A test
  that stays green when the code is wrong proves nothing.
- **Small.** Delete before adding. No compatibility shims for code that has not
  shipped.
- **Names:** `camelCase` for variables, functions and JSON fields, `PascalCase`
  for classes, `SCREAMING_SNAKE` for module constants, `kebab-case.js` for
  files. `Id`, never `ID`. Booleans start with `is`, `has`, `can` or `should`
  and say the positive.
- **Language:** everything in English: code, comments, commits and every text a
  person reads in the dashboard. Brazilian Portuguese is a translation: add the
  new text to `packages/dashboard/src/lib/pt.json` (exact texts in `texts`,
  texts with values in `patterns`, as `{0}`, or `{#0}` for a number). A line
  built from pieces translates its pieces with `t()` from `lib/language.js`.
- **Commits:** `type(scope): imperative sentence in lower case, no period`.
  Types: `feat` `fix` `refactor` `chore` `docs` `test` `ci` `perf`.

## How a change gets in

Gemini Code is developed **trunk-based**: maintainers work on `main` and push
small commits straight to it, as Gemini CLI does. `main` keeps a linear history
and cannot be force-pushed or deleted.

1. `git pull --rebase` on `main`.
2. Make one small change, with its test, and a line in `CHANGELOG.md` under
   `## [Unreleased]`.
3. `git push`. The `pre-push` hook runs `bun run preflight` and the changelog
   rule on your machine first; `bun install` turns the hook on. Nothing is
   tested in CI.

Every push to `main` updates the public demo. A change that is not ready to be
seen hides behind a flag instead of waiting on a branch.

Contributors without write access send a pull request from a fork; a maintainer
runs the preflight on it before landing it on `main`. A pull request from a
branch of this repository also gets a demo at
`https://ciro-maciel.github.io/gemini-code/preview/<branch>/`.

## Where things are

Read the "How it is built" section of the [README](README.md). The agent loop is
`packages/server/src/engine/run.js`; anything that decides whether a person must
approve an action is `packages/server/src/engine/policy.js`. Signing in with a
Google subscription is `packages/server/src/engine/subscription/`
([docs](docs/subscription.md)).

## Security

Never put a key, token or password in code, tests or issues. Report a
vulnerability privately, as [SECURITY.md](SECURITY.md) says.

## License

By contributing you agree that your contribution is licensed under the
[Apache License 2.0](LICENSE).
