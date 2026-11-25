# Contributing to Gemini Code

Thanks for helping. This page says how to get the project running, what a good
change looks like and how it gets in.

## Run it

```bash
bun install
cp .env.example .env      # GEMINI_API_KEY from https://aistudio.google.com/apikey
bun run dev               # server on :8787, dashboard on :5180
bun run preflight         # format check, lint and every test: run it before a pull request
```

Coding agents working here read [GEMINI.md](GEMINI.md) first.

Use [Bun](https://bun.sh) for everything (`bun install`, `bun add`, `bun test`,
`bunx`). Do not use npm: two dependency trees drift apart without warning.

## A good change

- **One change per pull request**, with the reason in its description: what a
  person could not do before, and can now.
- **Tests that fail when the behavior breaks.** Before you open the pull
  request, break the code your test protects and watch the test turn red. A test
  that stays green when the code is wrong proves nothing.
- **Small.** Delete before adding. No compatibility shims for code that has not
  shipped.
- **Names:** `camelCase` for variables, functions and JSON fields, `PascalCase`
  for classes, `SCREAMING_SNAKE` for module constants, `kebab-case.js` for
  files. `Id`, never `ID`. Booleans start with `is`, `has`, `can` or `should`
  and say the positive.
- **Language:** code, identifiers, comments and commits in English. Text a
  person reads in the product is in Portuguese today; English is welcome as a
  second language.
- **Commits:** `type(scope): imperative sentence in lower case, no period`.
  Types: `feat` `fix` `refactor` `chore` `docs` `test` `ci` `perf`.

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
