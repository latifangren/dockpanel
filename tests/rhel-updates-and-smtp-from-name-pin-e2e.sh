#!/usr/bin/env bash
# Regression pins for the s460 rotation: services/smtp.rs + routes/smtp.rs
# (never a PRIMARY finder/skeptic target) and routes/updates.rs (same),
# LOC-ranked and pre-selection-checked per feedback_dockpanel_audit_scope.
#
#   Topic 1 (routes/updates.rs) — the whole System Updates feature
#     (list/count/apply) was 100% hardcoded to apt/apt-get, with zero use of
#     this project's own pkg.rs dual-family abstraction. On an RHEL-family
#     agent (a platform this project explicitly supports and tests
#     elsewhere), list_updates/update_count silently returned "0 updates" —
#     read as fully patched — because apt-family commands simply don't
#     exist there. Fixed: dnf/yum check-update support (exit code 0/100/
#     other correctly distinguished — check-update's exit status is NOT a
#     plain success/failure boolean), a 3-token line parser requiring a
#     name.arch dot (rejects a false-positive 3-word non-package line —
#     caught by this pin suite's own mutation test on the parser), an
#     rpm -qa lookup for current-version display, and a needs-restarting -r
#     fallback for reboot_required on RHEL (no /var/run/reboot-required
#     there). apply_updates now selects apt-get/dnf/yum via pkg::installer()
#     instead of a hardcoded apt-get binary.
#   Topic 2 (services/smtp.rs) — two CONFIRMED findings in configure():
#     (a) from_name was validated for injection and pushed fleet-wide by the
#     backend, but never written into the msmtp config or the PHP
#     sendmail_path ini — a "From Name" the UI promises applies "to all
#     sites on this server" had no effect on any real application mail,
#     only the one-off admin Test Email. Fixed: msmtp's from_full_name
#     directive (verified against `man msmtp` on this box — envelope `from`
#     is address-only; from_full_name is the separate directive that names
#     the display name msmtp adds to an auto-generated From header).
#     (b) Every SMTP settings save unconditionally truncated
#     /var/log/msmtp.log via fs::write(path, "") — the frontend always
#     re-PUTs all 7 smtp_* keys on Save (even an unrelated field edit),
#     which pushes to every online fleet member, wiping the mail relay log
#     on every save, including the save an operator makes while debugging a
#     mail problem using that exact log. Fixed: only create the file when
#     it doesn't already exist.
#   Off-menu, completeness-critic-found — routes/php.rs had the textually
#     identical vulnerable pattern v2.213.0 (the immediately prior ship) had
#     just fixed in pkg.rs: wrapping safe_command_unsandboxed(...).output()
#     in a caller-side tokio::time::timeout only kills the LOCAL systemd-run
#     waiter on expiry, leaving the actual privileged apt/dnf transaction
#     running orphaned in its own transient unit forever. Three live sites
#     (install_version, uninstall_version's purge, its apt autoremove
#     follow-up), all using the same 300s INSTALL_TIMEOUT-equal duration as
#     pkg.rs's own fixed sites. Fixed: converted to
#     UnsandboxedCommand::output_with_timeout(), which also stops the named
#     transient unit on timeout.
#
# Pure source analysis; no box, no network, no build.

set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0 FAIL=0
ok()  { PASS=$((PASS+1)); printf '  \033[0;32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[0;31m✗\033[0m %s\n' "$1"; }

# Strip comments and the test module. Only exits at a #[cfg(test)] line
# immediately followed by `mod ` — a real test module, not a cfg-gated
# function/const variant elsewhere in the file (project_dockpanel_lessons_p182).
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
fnbody()    { code "$1" | awk "/$2/,/^}/"; }
bodyhas()   { [ -n "$(fnbody "$1" "$2" | grep -F -- "$3")" ]; }
bodyhasre() { [ -n "$(fnbody "$1" "$2" | grep -E -- "$3")" ]; }
count()     { code "$1" | grep -Fc -- "$2"; }

UPDATES=panel/agent/src/routes/updates.rs

for f in "$UPDATES"; do
  [ -f "$f" ] || { echo "missing source file: $f"; exit 1; }
done

echo "── 1. Topic 1: routes/updates.rs gains a dnf/yum path via pkg.rs ──"
if hasre "$UPDATES" 'use crate::services::pkg::\{self, Installer, PkgMgr\};'; then
  ok "updates.rs imports the pkg.rs dual-family abstraction"
else
  bad "updates.rs no longer imports pkg::{Installer,PkgMgr} — RHEL path may be gone"
fi
if bodyhasre "$UPDATES" "^async fn rpm_check_update" 'Some\(0\) \| Some\(100\)'; then
  ok "rpm_check_update distinguishes check-update's 0/100/error exit codes"
else
  bad "rpm_check_update no longer distinguishes 0 (no updates) from 100 (updates) from a real error"
fi
if bodyhas "$UPDATES" "^fn parse_rpm_update_line" "rsplit_once('.')?"; then
  ok "parse_rpm_update_line requires the name.arch dot (rejects a false-positive 3-word line)"
else
  bad "parse_rpm_update_line's dot requirement is missing — may misparse a non-package summary line as one"
fi
if bodyhasre "$UPDATES" "^async fn list_updates" 'PkgMgr::Rpm'; then
  ok "list_updates branches on PkgMgr::Rpm"
else
  bad "list_updates no longer branches on PkgMgr::Rpm — may be apt-only again"
fi
if bodyhasre "$UPDATES" "^async fn update_count" 'PkgMgr::Rpm'; then
  ok "update_count branches on PkgMgr::Rpm"
else
  bad "update_count no longer branches on PkgMgr::Rpm — may be apt-only again"
fi
if bodyhasre "$UPDATES" "^async fn apply_updates" 'pkg::installer\(\).await'; then
  ok "apply_updates selects its binary via pkg::installer() rather than a hardcoded apt-get"
else
  bad "apply_updates no longer calls pkg::installer() — may have regressed to hardcoded apt-get"
fi
if bodyhas "$UPDATES" "^async fn apply_updates" 'safe_command_unsandboxed("apt-get", &[])'; then
  bad "apply_updates still hardcodes safe_command_unsandboxed(\"apt-get\", ...) — the RHEL branch may be dead code"
else
  ok "apply_updates no longer hardcodes the apt-get binary directly"
fi
if bodyhasre "$UPDATES" "^async fn reboot_required" 'needs-restarting'; then
  ok "reboot_required has an RHEL fallback (needs-restarting -r)"
else
  bad "reboot_required lost its RHEL fallback — reboot banner will never show on RPM boxes"
fi

echo
echo "── 2. Topic 1 control: the new RPM parser is unit-tested, not just source-shaped ──"
if grep -qF 'fn parses_a_real_dnf_check_update_line' "$UPDATES"; then
  ok "parse_rpm_update_line has a Rust unit test for a real dnf line"
else
  bad "no unit test found for parse_rpm_update_line"
fi
if grep -qF 'fn skips_section_headers_and_the_metadata_banner' "$UPDATES"; then
  ok "parse_rpm_update_line has a unit test for non-package lines"
else
  bad "no unit test found guarding against section-header false positives"
fi

echo
# R4 (2026-11-02): this section pinned mail/DNS hosting code removed in R4; deleted, not weakened.
# Topics 3-4 pinned services/smtp.rs (msmtp configure), deleted in R4. Topics 1, 2 survive.
# R6 (2026-11-02): section 5 pinned routes/php.rs, deleted in R6 with the
# versioned PHP surface. Deleted, not weakened: install_version and
# uninstall_version no longer exist anywhere in the tree.

echo
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
