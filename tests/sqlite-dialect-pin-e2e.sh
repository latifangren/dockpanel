#!/usr/bin/env bash
# ==============================================================================
# tests/sqlite-dialect-pin-e2e.sh
#
# Ensures panel/backend/src contains NO PostgreSQL dialect leftovers that fail
# at runtime on SQLite (Issue #2).
#
# Gates:
#   1. No NOW() in backend queries (use CURRENT_TIMESTAMP or datetime('now'))
#   2. No INTERVAL '...' in backend queries (use datetime('now', '-...'))
#   3. No SQL ::interval casts (distinguishing from tokio::time::interval)
#   4. No pg_dump calls
#   5. No dockpanel-postgres container references
#   6. No PERCENTILE_CONT
#   7. No generate_series
#   8. No SPLIT_PART
# ==============================================================================
set -euo pipefail

PASS=0
FAIL=0

ok()  { PASS=$((PASS+1)); printf '  \033[0;32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[0;31m✗\033[0m %s\n' "$1"; }

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKEND_SRC="$REPO_ROOT/panel/backend/src"

echo "── 1. PostgreSQL dialect leftovers audit (Issue #2) ──"

# Helper: strip whole-line and inline comments from .rs files before inspection
code_stream() {
  find "$BACKEND_SRC" -type f -name "*.rs" | while read -r f; do
    perl -ne '
      next if /^\s*\/\//;
      next if /^\s*\/\*\*/;
      next if /^\s*\*/;
      print "$ARGV:$.: $_";
    ' "$f"
  done
}

CODE=$(code_stream)

# 1. NOW()
NOW_MATCHES=$(grep -E '\bNOW\(\)' <<< "$CODE" || true)
if [ -z "$NOW_MATCHES" ]; then
  ok "no NOW() in backend code (replaced with CURRENT_TIMESTAMP or datetime('now'))"
else
  bad "found NOW() in backend code:"
  echo "$NOW_MATCHES" | head -10
fi

# 2. INTERVAL '...'
INTERVAL_MATCHES=$(grep -E "\bINTERVAL\s*'" <<< "$CODE" || true)
if [ -z "$INTERVAL_MATCHES" ]; then
  ok "no INTERVAL '...' literals in backend code (replaced with datetime('now', '-...'))"
else
  bad "found INTERVAL '...' in backend code:"
  echo "$INTERVAL_MATCHES" | head -10
fi

# 3. SQL ::interval (excluding tokio::time::interval)
SQL_INTERVAL_MATCHES=$(grep -E '::interval\b' <<< "$CODE" | grep -v 'tokio::time::interval' || true)
if [ -z "$SQL_INTERVAL_MATCHES" ]; then
  ok "no SQL ::interval typecasts in backend code"
else
  bad "found SQL ::interval typecast in backend code:"
  echo "$SQL_INTERVAL_MATCHES" | head -10
fi

# 4. pg_dump
PG_DUMP_MATCHES=$(grep -E '\bpg_dump\b' <<< "$CODE" || true)
if [ -z "$PG_DUMP_MATCHES" ]; then
  ok "no pg_dump calls in backend code (replaced with native SQLite online backup)"
else
  bad "found pg_dump in backend code:"
  echo "$PG_DUMP_MATCHES" | head -10
fi

# 5. dockpanel-postgres container references
PG_CONTAINER_MATCHES=$(grep -E 'dockpanel-postgres' <<< "$CODE" || true)
if [ -z "$PG_CONTAINER_MATCHES" ]; then
  ok "no dockpanel-postgres container references in backend code"
else
  bad "found dockpanel-postgres in backend code:"
  echo "$PG_CONTAINER_MATCHES" | head -10
fi

# 6. PERCENTILE_CONT
PCT_MATCHES=$(grep -E '\bPERCENTILE_CONT\b' <<< "$CODE" || true)
if [ -z "$PCT_MATCHES" ]; then
  ok "no PERCENTILE_CONT in backend code (computed in memory in Rust)"
else
  bad "found PERCENTILE_CONT in backend code:"
  echo "$PCT_MATCHES" | head -10
fi

# 7. generate_series
GEN_MATCHES=$(grep -E '\bgenerate_series\b' <<< "$CODE" || true)
if [ -z "$GEN_MATCHES" ]; then
  ok "no generate_series in backend code (enumerated in memory in Rust)"
else
  bad "found generate_series in backend code:"
  echo "$GEN_MATCHES" | head -10
fi

# 8. SPLIT_PART
SPLIT_MATCHES=$(grep -E '\bSPLIT_PART\b' <<< "$CODE" || true)
if [ -z "$SPLIT_MATCHES" ]; then
  ok "no SPLIT_PART in backend code (split in memory in Rust)"
else
  bad "found SPLIT_PART in backend code:"
  echo "$SPLIT_MATCHES" | head -10
fi

echo ""
echo "── SQLite dialect pin: PASS $PASS / FAIL $FAIL ──"
[ "$FAIL" -eq 0 ] || exit 1
