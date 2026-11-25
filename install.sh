#!/bin/sh
# Installs Gemini Code on macOS or Linux, for this user only (no sudo):
#
#   curl -fsSL https://raw.githubusercontent.com/ciro-maciel/gemini-code/main/install.sh | sh
#
# It downloads the release for this system, checks its SHA-256, unpacks it in
# ~/.gemini-code/app and puts a `gemini-code` command in ~/.local/bin.
# GEMINI_CODE_VERSION=0.1.0 picks a version; GEMINI_CODE_HOME moves the folder.
set -eu

REPO="ciro-maciel/gemini-code"
HOME_DIR="${GEMINI_CODE_HOME:-$HOME/.gemini-code}"
BIN_DIR="$HOME/.local/bin"

say() { printf '%s\n' "$*"; }
fail() { printf 'gemini-code install: %s\n' "$*" >&2; exit 1; }

case "$(uname -s)" in
  Darwin) os=darwin ;;
  Linux) os=linux ;;
  *) fail "this script is for macOS and Linux; on Windows use install.ps1" ;;
esac
case "$(uname -m)" in
  x86_64 | amd64) arch=x64 ;;
  arm64 | aarch64) arch=arm64 ;;
  *) fail "no build for $(uname -m) yet" ;;
esac
# A Mac with Apple silicon running this shell under Rosetta still gets the arm64 build.
if [ "$os" = darwin ] && [ "$arch" = x64 ] && [ "$(sysctl -n hw.optional.arm64 2>/dev/null || echo 0)" = 1 ]; then
  arch=arm64
fi

command -v curl >/dev/null || fail "curl is needed"
command -v tar >/dev/null || fail "tar is needed"

asset="gemini-code-$os-$arch.tar.gz"
if [ -n "${GEMINI_CODE_DOWNLOAD_URL:-}" ]; then
  # For testing a build before it is released (docs/install.md).
  base="$GEMINI_CODE_DOWNLOAD_URL"
elif [ -n "${GEMINI_CODE_VERSION:-}" ]; then
  base="https://github.com/$REPO/releases/download/v${GEMINI_CODE_VERSION#v}"
else
  base="https://github.com/$REPO/releases/latest/download"
fi

tmp=$(mktemp -d)
trap 'rm -rf "$tmp"' EXIT

say "Downloading $asset..."
curl -fsSL "$base/$asset" -o "$tmp/$asset" || fail "could not download $base/$asset"
curl -fsSL "$base/SHA256SUMS" -o "$tmp/SHA256SUMS" || fail "could not download the checksums"

expected=$(grep " $asset\$" "$tmp/SHA256SUMS" | cut -d' ' -f1)
[ -n "$expected" ] || fail "$asset is not in SHA256SUMS"
if command -v sha256sum >/dev/null; then
  actual=$(sha256sum "$tmp/$asset" | cut -d' ' -f1)
else
  actual=$(shasum -a 256 "$tmp/$asset" | cut -d' ' -f1)
fi
[ "$expected" = "$actual" ] || fail "checksum mismatch for $asset: the download is not the release"

tar -xzf "$tmp/$asset" -C "$tmp"
mkdir -p "$HOME_DIR"
rm -rf "$HOME_DIR/app"
mv "$tmp/gemini-code" "$HOME_DIR/app"
chmod +x "$HOME_DIR/app/gemini-code"
if [ "$os" = darwin ]; then
  xattr -dr com.apple.quarantine "$HOME_DIR/app" 2>/dev/null || true
fi

mkdir -p "$BIN_DIR"
cat >"$BIN_DIR/gemini-code" <<EOF
#!/bin/sh
exec "$HOME_DIR/app/gemini-code" "\$@"
EOF
chmod +x "$BIN_DIR/gemini-code"

version=$("$HOME_DIR/app/gemini-code" --version 2>/dev/null || echo "?")
say "Gemini Code $version installed in $HOME_DIR/app."

case ":$PATH:" in
  *":$BIN_DIR:"*) ;;
  *)
    line="export PATH=\"$BIN_DIR:\$PATH\""
    for rc in "$HOME/.zshrc" "$HOME/.bashrc"; do
      if [ -f "$rc" ] && ! grep -qF "$BIN_DIR" "$rc"; then
        printf '\n# Gemini Code\n%s\n' "$line" >>"$rc"
        say "Added $BIN_DIR to PATH in $rc."
      fi
    done
    say "Open a new terminal, or run: $line"
    ;;
esac

say ""
say "Start it with: gemini-code"
say "Or point the agents at a project: gemini-code ~/code/my-app"
