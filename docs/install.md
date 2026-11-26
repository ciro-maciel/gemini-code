# Installing Gemini Code

One command, no administrator rights, nothing else to install: the download is a
single executable with the Bun runtime inside, next to the dashboard.

**macOS and Linux**

```bash
curl -fsSL https://raw.githubusercontent.com/ciro-maciel/gemini-code/main/install.sh | sh
```

**Windows (PowerShell)**

```powershell
powershell -c "irm https://raw.githubusercontent.com/ciro-maciel/gemini-code/main/install.ps1 | iex"
```

Then:

```bash
gemini-code                  # agents work in ~/GeminiCode
gemini-code ~/code/my-app    # agents work in your project
gemini-code --port 9000 --no-open
```

It opens the dashboard at http://localhost:8787. Add a Gemini API key under
Settings, or put `GEMINI_API_KEY=...` in `~/.gemini-code/.env`.

## What goes where

| Path                                                              | What                                                                                                                             |
| ----------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| `~/.gemini-code/app/` (Windows: `%LOCALAPPDATA%\GeminiCode\app\`) | The executable and the dashboard. Replaced on every install.                                                                     |
| `~/.gemini-code/data/`                                            | The database and the encryption key. Kept across installs.                                                                       |
| `~/.gemini-code/.env`                                             | Optional keys, `KEY=value` per line.                                                                                             |
| `~/.local/bin/gemini-code`                                        | A two-line launcher (macOS, Linux). Windows adds the app folder to the user's PATH.                                              |
| `~/GeminiCode/`                                                   | Where agents work when no folder is given.                                                                                       |
| `~/Applications/Gemini Code.app` (macOS)                          | The app with the icon: Spotlight and Launchpad find it. Opening it starts Gemini Code in the background and opens the dashboard. |
| `~/.local/share/applications/gemini-code.desktop` (Linux)         | The applications menu entry, with the icon in `~/.local/share/icons`.                                                            |
| Start menu, `Gemini Code` (Windows)                               | A shortcut with the icon that starts Gemini Code with no console window.                                                         |
| `~/.gemini-code/logs/`                                            | What Gemini Code prints when the app started it.                                                                                 |

Opening the app, or running `gemini-code`, while Gemini Code already runs only
opens the dashboard: it never starts a second server.

Both scripts check the download against the release's `SHA256SUMS` before
unpacking it. `GEMINI_CODE_VERSION=0.1.0` installs a given version.

**Uninstall:** delete `~/.gemini-code` (and `~/.local/bin/gemini-code`), or
`%LOCALAPPDATA%\GeminiCode` on Windows.

## Builds

| System               | Archive                           |
| -------------------- | --------------------------------- |
| macOS, Apple silicon | `gemini-code-darwin-arm64.tar.gz` |
| macOS, Intel         | `gemini-code-darwin-x64.tar.gz`   |
| Linux x64            | `gemini-code-linux-x64.tar.gz`    |
| Linux ARM64          | `gemini-code-linux-arm64.tar.gz`  |
| Windows x64          | `gemini-code-windows-x64.zip`     |

The macOS executables are signed with a Developer ID (Ciro Cesar Maciel, team
4X58N3TK8V), run with the hardened runtime and are notarized by Apple, so a copy
downloaded with a browser opens with no warning. A bare executable cannot carry
its notarization ticket: macOS checks it online the first time. The entitlements
the Bun runtime needs are in `packages/server/macos/entitlements.plist`.

## Making a release

1. On a machine, build the executable for that machine and run it:
   ```bash
   bun build --compile --minify packages/server/src/cli.js --outfile /tmp/gemini-code/gemini-code
   HOME=$(mktemp -d) /tmp/gemini-code/gemini-code --no-open --port 8799
   ```
   Check `GET /api/health`, create an agent, and write a file through
   `POST /api/bots/<id>/fs/write`. On macOS, sign it first with
   `codesign --force --sign -`.
2. Move the **Unreleased** lines of `CHANGELOG.md` under the new version, in a
   pull request.
3. Tag the merged commit: `git tag v0.1.0 && git push origin v0.1.0`. The
   release workflow builds the five archives and publishes them with
   `SHA256SUMS`.
