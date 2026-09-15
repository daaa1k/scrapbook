#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
VERSION="v1.7.1"
VERSION_NUM="${VERSION#v}"
BIN_DIR="$ROOT/.bin"
PINNED="$BIN_DIR/betterleaks"

fail_install() {
  cat >&2 <<EOF
betterleaks is not installed and could not be fetched.

Install (pin ${VERSION}):
  go install github.com/betterleaks/betterleaks@${VERSION}

Or download the GitHub release binary:
  https://github.com/betterleaks/betterleaks/releases/tag/${VERSION}

Then re-run: bun run secrets

mise does not currently ship betterleaks; do not skip this scan.
EOF
  exit 1
}

resolve_betterleaks() {
  if command -v betterleaks >/dev/null 2>&1; then
    command -v betterleaks
    return
  fi
  if [[ -x "$PINNED" ]]; then
    printf '%s\n' "$PINNED"
    return
  fi

  mkdir -p "$BIN_DIR"
  local os arch asset url tmp
  os="$(uname -s | tr '[:upper:]' '[:lower:]')"
  arch="$(uname -m)"
  case "$os-$arch" in
    linux-x86_64 | linux-amd64) asset="betterleaks_${VERSION_NUM}_linux_x64.tar.gz" ;;
    linux-aarch64 | linux-arm64) asset="betterleaks_${VERSION_NUM}_linux_arm64.tar.gz" ;;
    darwin-arm64) asset="betterleaks_${VERSION_NUM}_darwin_arm64.tar.gz" ;;
    darwin-x86_64) asset="betterleaks_${VERSION_NUM}_darwin_x64.tar.gz" ;;
    *)
      echo "No betterleaks ${VERSION} asset mapped for ${os}-${arch}." >&2
      fail_install
      ;;
  esac
  url="https://github.com/betterleaks/betterleaks/releases/download/${VERSION}/${asset}"
  tmp="$(mktemp -d)"
  if ! curl -fsSL "$url" -o "$tmp/betterleaks.tgz"; then
    rm -rf "$tmp"
    fail_install
  fi
  tar -xzf "$tmp/betterleaks.tgz" -C "$tmp"
  local extracted
  extracted="$(find "$tmp" -type f -name betterleaks | head -n 1)"
  if [[ -z "$extracted" ]]; then
    rm -rf "$tmp"
    fail_install
  fi
  cp "$extracted" "$PINNED"
  chmod +x "$PINNED"
  rm -rf "$tmp"
  printf '%s\n' "$PINNED"
}

TOOL="$(resolve_betterleaks || true)"
if [[ -z "${TOOL:-}" || ! -x "$TOOL" ]]; then
  fail_install
fi

cd "$ROOT"
exec "$TOOL" dir "$ROOT" --no-banner
