#!/usr/bin/env bash
# Regression pins for this session's dockpanel-fanout run over
# panel/agent/src/services/cms.rs + routes/cms.rs.
#
# R6 (2026-11-02): services/cms.rs and routes/cms.rs were DELETED with the
# CMS hosting surface, so every arm that measured them is deleted here too —
# deleted, not weakened. What remains is the one arm whose subject survived:
#
#   F2  services/pkg.rs::enable_php_stream was MISCITED as an "already
#       fixed" precedent — it actually has tokio::time::timeout with ZERO
#       kill_on_drop anywhere in the file, because it spawns via
#       safe_command_unsandboxed(), whose UnsandboxedCommand::output()/
#       spawn_streaming() build their own inner tokio::process::Command
#       that no caller can reach to chain .kill_on_drop(true) onto. Fixed
#       AT THE SOURCE in safe_cmd.rs (not per-caller) — this closes the
#       gap for every safe_command_unsandboxed call site, not just
#       enable_php_stream, as a natural consequence of the correct fix
#       location.
#
# Deleted with cms.rs (F1 run_cmd/run_cmd_in timeouts, F3 Laravel .env
# quoting, F4 CodeIgniter .env quoting, F5 composer.phar sha256, F6
# Joomla release-zip sha256, F7 routes/cms.rs db validation): those
# functions no longer exist anywhere in the tree, so there is nothing
# left to pin. Re-derive from the deletion, do not resurrect the arms
# against another file.
#
# Pure source analysis; no box, no network, no build.

set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0 FAIL=0
ok()  { PASS=$((PASS+1)); printf '  \033[0;32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[0;31m✗\033[0m %s\n' "$1"; }

# Strip comments and the test module. NOT the naive "sed-quit-at-first-
# #[cfg(test)]" shape — see project_dockpanel_lessons_p182 (s456): only exit
# at a #[cfg(test)] line immediately followed by `mod `, a real test module,
# not a cfg-gated function/const variant elsewhere in the file.
code() {
  awk '
    held == 1 {
      if ($0 ~ /^mod /) { exit }
      print heldline
      held = 0
    }
    /^#\[cfg\(test\)\]$/ { held = 1; heldline = $0; next }
    { print }
  ' "$1" | grep -vE '^[[:space:]]*(///|//!|//|\*|/\*)'
}
has()   { [ -n "$(code "$1" | grep -F -- "$2")" ]; }
hasre() { [ -n "$(code "$1" | grep -E -- "$2")" ]; }

# One named function's body, comment-stripped. Function-name patterns MUST be
# anchored (^ ... \() — GNU awk's \b silently matches nothing in default ERE
# mode (project_dockpanel_lessons_p182, s456).
fnbody()    { code "$1" | awk "/$2/,/^}/"; }
bodyhas()   { [ -n "$(fnbody "$1" "$2" | grep -F -- "$3")" ]; }
bodyhasre() { [ -n "$(fnbody "$1" "$2" | grep -E -- "$3")" ]; }
countin()   { fnbody "$1" "$2" | grep -Fc -- "$3"; }

PKG=panel/agent/src/services/pkg.rs
SAFE_CMD=panel/agent/src/safe_cmd.rs

for f in "$PKG" "$SAFE_CMD"; do
  [ -f "$f" ] || { echo "missing source file: $f"; exit 1; }
done

echo "── F2: safe_cmd.rs's UnsandboxedCommand sets kill_on_drop centrally ──"
if bodyhasre "$SAFE_CMD" "^    pub async fn output\(&mut self\)" 'cmd\.kill_on_drop\(true\)'; then
  ok "UnsandboxedCommand::output() sets kill_on_drop(true) on the inner systemd-run Command"
else
  bad "UnsandboxedCommand::output() is missing kill_on_drop(true) — pkg.rs::enable_php_stream (and ~48 other call sites) regress"
fi
if bodyhasre "$SAFE_CMD" "^    pub fn spawn_streaming\(&mut self\)" 'cmd\.kill_on_drop\(true\)'; then
  ok "UnsandboxedCommand::spawn_streaming() sets kill_on_drop(true) too"
else
  bad "UnsandboxedCommand::spawn_streaming() is missing kill_on_drop(true)"
fi
# s459 update: pkg.rs legitimately gained 4 kill_on_drop(true) sites this
# session (see pkg-rs-and-clone-dedup-hardening-pin-e2e.sh) — but all 4 are
# chained onto the SANDBOXED safe_command() builder, for an unrelated bug
# class (a plain-timeout-without-kill_on_drop gap this pin never covered).
# What THIS control actually guards is narrower and still holds: no
# safe_command_unsandboxed(...) call site chains kill_on_drop directly
# (which would mean the centralized safe_cmd.rs fix for the systemd-run-
# backed path was bypassed — impossible by construction today, since
# UnsandboxedCommand exposes no such method, but worth pinning as
# documentation of the invariant regardless).
KOD_ON_UNSANDBOXED=$(code "$PKG" | grep -E 'safe_command_unsandboxed' -A2 | grep -c 'kill_on_drop')
if [ "$KOD_ON_UNSANDBOXED" -eq 0 ]; then
  ok "no safe_command_unsandboxed(...) call site in pkg.rs chains kill_on_drop directly (control: the systemd-run fix is still centralized in safe_cmd.rs, not duplicated here)"
else
  bad "a safe_command_unsandboxed(...) call site in pkg.rs appears to chain kill_on_drop directly — the centralized safe_cmd.rs fix may have been bypassed"
fi
if bodyhasre "$PKG" "^pub async fn enable_php_stream" 'safe_command_unsandboxed'; then
  ok "enable_php_stream still spawns via safe_command_unsandboxed (control: it's the same call path the safe_cmd.rs fix protects)"
else
  bad "enable_php_stream no longer calls safe_command_unsandboxed — re-check whether this pin's premise still holds"
fi

echo
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
