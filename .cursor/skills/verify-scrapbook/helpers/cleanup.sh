#!/usr/bin/env bash
set -euo pipefail
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
# shellcheck source=common.sh
source "$SCRIPT_DIR/common.sh"

if [[ ! -f "$VERIFY_PID_FILE" ]]; then
  echo "cleanup: no pid file for run_id=$VERIFY_RUN_ID (nothing to kill)"
  echo "cleanup: evidence preserved at ${VERIFY_EVIDENCE_DIR:-"(unset)"}"
  exit 0
fi

pid="$(cat "$VERIFY_PID_FILE")"
if kill -0 "$pid" 2>/dev/null; then
  # Kill the process group when possible so vite child processes die with the launcher.
  if kill -TERM -"$pid" 2>/dev/null; then
    :
  else
    kill -TERM "$pid" 2>/dev/null || true
  fi
  for _ in $(seq 1 20); do
    if ! kill -0 "$pid" 2>/dev/null; then
      break
    fi
    sleep 0.25
  done
  if kill -0 "$pid" 2>/dev/null; then
    kill -KILL -"$pid" 2>/dev/null || kill -KILL "$pid" 2>/dev/null || true
  fi
  echo "cleanup: stopped pid $pid"
else
  echo "cleanup: pid $pid already dead"
fi

rm -f "$VERIFY_PID_FILE"
echo "cleanup: evidence preserved at ${VERIFY_EVIDENCE_DIR:-"(unset)"}"
if [[ -n "${VERIFY_EVIDENCE_DIR:-}" && -d "$VERIFY_EVIDENCE_DIR" ]]; then
  ls -la "$VERIFY_EVIDENCE_DIR" || true
fi
