#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

mkdir -p "$VERIFY_STATE_DIR" "$VERIFY_EVIDENCE_DIR"
cd "$ROOT"

if [[ -f "$VERIFY_PID_FILE" ]]; then
  old_pid="$(cat "$VERIFY_PID_FILE")"
  if kill -0 "$old_pid" 2>/dev/null; then
    echo "verify-scrapbook: already running pid=$old_pid (run_id=$VERIFY_RUN_ID)" >&2
    exit 1
  fi
  rm -f "$VERIFY_PID_FILE"
fi

if command -v curl >/dev/null 2>&1; then
  if curl -fsS --max-time 1 "$VERIFY_BASE_URL/" >/dev/null 2>&1; then
    echo "verify-scrapbook: refusing launch; $VERIFY_BASE_URL already answers (foreign or stale instance)" >&2
    exit 1
  fi
fi

: >"$VERIFY_LOG_FILE"
bun run dev -- --port "$VERIFY_PORT" --host 127.0.0.1 >>"$VERIFY_LOG_FILE" 2>&1 &
echo $! >"$VERIFY_PID_FILE"

for _ in $(seq 1 60); do
  if curl -fsS --max-time 2 "$VERIFY_BASE_URL/" 2>/dev/null | grep -q 'Scrapbook'; then
    echo "verify-scrapbook: ready at $VERIFY_BASE_URL (pid=$(cat "$VERIFY_PID_FILE") run_id=$VERIFY_RUN_ID)"
    echo "verify-scrapbook: evidence -> $VERIFY_EVIDENCE_DIR"
    exit 0
  fi
  if ! kill -0 "$(cat "$VERIFY_PID_FILE")" 2>/dev/null; then
    echo "verify-scrapbook: dev process exited during boot; see $VERIFY_LOG_FILE" >&2
    exit 1
  fi
  sleep 1
done

echo "verify-scrapbook: timed out waiting for $VERIFY_BASE_URL; see $VERIFY_LOG_FILE" >&2
exit 1
