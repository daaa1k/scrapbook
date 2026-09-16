#!/usr/bin/env bash
# Shared defaults for verify-scrapbook helpers.
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../../.." && pwd)"
export VERIFY_RUN_ID="${VERIFY_RUN_ID:-default}"
export VERIFY_PORT="${VERIFY_PORT:-3000}"
export VERIFY_BASE_URL="${VERIFY_BASE_URL:-http://127.0.0.1:${VERIFY_PORT}}"
export VERIFY_STATE_DIR="${VERIFY_STATE_DIR:-/tmp/verify-scrapbook-${VERIFY_RUN_ID}}"
export VERIFY_EVIDENCE_DIR="${VERIFY_EVIDENCE_DIR:-/cursor/stores/bc-7849fa82-1973-46ca-a837-b0e386645567/media/verify-scrapbook/${VERIFY_RUN_ID}}"
export VERIFY_PID_FILE="${VERIFY_STATE_DIR}/dev.pid"
export VERIFY_LOG_FILE="${VERIFY_STATE_DIR}/dev.log"
