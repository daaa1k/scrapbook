#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

ok=0

if [[ -f "$VERIFY_PID_FILE" ]]; then
  pid="$(cat "$VERIFY_PID_FILE")"
  if kill -0 "$pid" 2>/dev/null; then
    echo "doctor: pid $pid alive (run_id=$VERIFY_RUN_ID)"
  else
    echo "doctor: FAIL pid file present but process $pid not alive" >&2
    ok=1
  fi
else
  echo "doctor: FAIL missing pid file $VERIFY_PID_FILE" >&2
  ok=1
fi

body="$(mktemp)"
trap 'rm -f "$body"' EXIT
code="$(curl -sS -o "$body" -w '%{http_code}' --max-time 5 "$VERIFY_BASE_URL/" || true)"
if [[ "$code" != "200" ]]; then
  echo "doctor: FAIL GET $VERIFY_BASE_URL/ -> HTTP $code" >&2
  ok=1
elif ! grep -q 'Scrapbook' "$body"; then
  echo "doctor: FAIL response missing Scrapbook brand" >&2
  ok=1
else
  echo "doctor: GET $VERIFY_BASE_URL/ -> 200 with Scrapbook"
fi

if [[ "$ok" -ne 0 ]]; then
  exit 1
fi
echo "doctor: ok"
