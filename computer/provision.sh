#!/usr/bin/env bash
# Prepares a bot's Sprite: virtual screen, Chrome, VNC, the bridge service and
# the browser tools.
# Safe to run again: it installs only what is missing and recreates the services
# so a new version of server.js or of the flags takes effect.
set -euo pipefail

HOME_DIR=/home/sprite
APP_DIR="$HOME_DIR/computer"
PROFILE_DIR="$HOME_DIR/browser-profile"
WORKSPACE_DIR="$HOME_DIR/workspace"
SCREEN=1440x900

mkdir -p "$APP_DIR" "$PROFILE_DIR" "$WORKSPACE_DIR" "$HOME_DIR/Downloads"

missing=()
for pkg in xvfb x11vnc fonts-noto-core fonts-noto-color-emoji; do
    dpkg -s "$pkg" >/dev/null 2>&1 || missing+=("$pkg")
done

# Chrome downloads while apt refreshes its index; then one apt run installs
# everything, instead of two passes over dpkg.
chrome_download=""
if ! command -v google-chrome >/dev/null; then
    curl -fsSLo /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb &
    chrome_download=$!
fi

if [ ${#missing[@]} -gt 0 ] || [ -n "$chrome_download" ]; then
    echo "installing ${missing[*]} ${chrome_download:+google-chrome}"
    # A fresh Sprite runs its own apt-get at boot; wait for its lock instead of failing.
    APT="sudo DEBIAN_FRONTEND=noninteractive apt-get -o DPkg::Lock::Timeout=300 -qq"
    $APT update
    debs=()
    if [ -n "$chrome_download" ]; then
        wait "$chrome_download"
        debs+=(/tmp/chrome.deb)
    fi
    $APT install -y --no-install-recommends "${missing[@]}" "${debs[@]}" >/dev/null
    rm -f /tmp/chrome.deb
fi

# The computer's own code (server.js, browser.js and their packages) arrives
# as one archive; the browser tools need their dependencies installed here.
# It lands in ~/.assistant, not /tmp: on the first computers /tmp/provision.sh
# belongs to another user, and writing over it failed the upgrade.
BUNDLE="$HOME_DIR/.assistant/computer.tgz"
if [ -f "$BUNDLE" ]; then
    tar xzf "$BUNDLE" -C "$APP_DIR"
    rm -f "$BUNDLE"
    (cd "$APP_DIR" && bun install --frozen-lockfile --production >/dev/null)
fi

# Gemini CLI (@google/gemini-cli) is the primary coding CLI for long jobs in Gemini Code,
# reading GEMINI_API_KEY from the bot's vault environment.
if command -v bun >/dev/null 2>&1; then
    timeout 120 bun add -g @google/gemini-cli >/dev/null 2>&1 || true
elif command -v npm >/dev/null 2>&1; then
    timeout 120 npm install -g @google/gemini-cli >/dev/null 2>&1 || true
fi

# Claude Code (optional secondary CLI) if present on the Sprite image.
if [ -x "$HOME_DIR/.local/bin/claude" ]; then
    timeout 120 "$HOME_DIR/.local/bin/claude" update >/dev/null 2>&1 || true
fi

# Claude Code sees the bot's Chrome (the same one the browser tools drive) through
# the Playwright MCP over the debugging port, the way Playwriter gives an agent
# the person's own Chrome. A run passes this file with --mcp-config.
mkdir -p "$HOME_DIR/.assistant"
cat > "$HOME_DIR/.assistant/claude-mcp.json" <<EOF
{ "mcpServers": { "browser": { "command": "$APP_DIR/node_modules/.bin/playwright-mcp", "args": ["--cdp-endpoint", "http://127.0.0.1:9222"] } } }
EOF

recreate() {
    local name=$1
    shift
    sprite-env services delete "$name" >/dev/null 2>&1 || true
    sprite-env services create "$name" "$@" --no-stream >/dev/null
}

recreate display --cmd /usr/bin/Xvfb --args ":99,-screen,0,${SCREEN}x24,-nolisten,tcp"

# Service args are comma-separated, and Chrome's window flags carry commas, so
# Chrome starts from a launcher script instead.
cat > "$APP_DIR/browser.sh" <<EOF
#!/usr/bin/env bash
rm -f "$PROFILE_DIR/SingletonLock" "$PROFILE_DIR/SingletonSocket" "$PROFILE_DIR/SingletonCookie"
exec /usr/bin/google-chrome \\
    --remote-debugging-port=9222 \\
    --user-data-dir="$PROFILE_DIR" \\
    --no-first-run --no-default-browser-check \\
    --password-store=basic --lang=pt-BR \\
    --window-position=0,0 --window-size=${SCREEN/x/,} \\
    --disable-features=Translate --disable-dev-shm-usage \\
    about:blank
EOF
chmod +x "$APP_DIR/browser.sh"

recreate browser --cmd "$APP_DIR/browser.sh" --needs display --env "DISPLAY=:99"

recreate vnc --cmd /usr/bin/x11vnc --needs display --args \
"-display,:99,-forever,-shared,-localhost,-rfbport,5900,-nopw,-quiet,-noxdamage"

recreate computer --cmd "$(command -v bun)" --dir "$APP_DIR" --args "server.js" --http-port 8080

for _ in $(seq 1 30); do
    if curl -fs localhost:8080/health | grep -q '"isChromeReady":true'; then
        echo "ready"
        exit 0
    fi
    sleep 1
done

echo "chrome did not come up" >&2
sprite-env services list >&2
exit 1
