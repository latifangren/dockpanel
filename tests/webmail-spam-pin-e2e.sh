#!/usr/bin/env bash
# Regression pins for s270 — the webmail and the spam filter nobody had driven.
#
# s268 drove Postfix/Dovecot/OpenDKIM on the RHEL family and stopped there.
# Driving the remaining two on a Rocky 9.8 box found that neither worked, and
# that the oldest un-root-caused defect on the books was a delivery problem
# rather than the bug everyone had been hunting.
#
#   W1  rspamd is NOT in EPEL. On a stock Rocky 9 with epel AND crb enabled,
#       `dnf install rspamd` answers "Unable to find a match: rspamd", so the
#       panel's Spam Filter button could never work on any RHEL box. Upstream
#       publishes an rpm repo; it must be added on the RPM family ONLY, because
#       Debian and Ubuntu package rspamd themselves and that path already works
#       (#95c — the fix for one family is the defect on the other).
#
#   W2  Even once installed, Postfix never consulted it — on EVERY family.
#       `rspamd_install` wired the milter by replacing the literal
#       `smtpd_milters = unix:opendkim/...`, which s268 stopped writing when it
#       moved OpenDKIM's milter to a loopback port. str::replace with an absent
#       needle returns the string unchanged, so main.cf was rewritten
#       byte-identical and the handler reported success. #96e, one ship later.
#
#   W3  s262's webmail fix reached NO existing box. The /webmail/ nginx
#       fragment is written only on the Install click, and update.sh carried a
#       hand-copied mirror frozen at the v2.10.1 shape — without the header
#       re-declaration — whose "heal" therefore WROTE the shape that makes
#       Roundcube render an empty inbox, and whose guard skipped every box that
#       already had sub_filter. Repaired by derivation: one generator in the
#       agent, reconciled at startup, and the shell mirror deleted.
#
# Pure source analysis: no box, no network, no build.

set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0 FAIL=0
ok()  { PASS=$((PASS+1)); printf '  \033[0;32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[0;31m✗\033[0m %s\n' "$1"; }

# Strip comments and the test module, so a pin can never be satisfied (or
# tripped) by prose describing the very thing it forbids.
code()  { sed '/#\[cfg(test)\]/q' "$1" | grep -vE '^[[:space:]]*(///|//!|//|\*|/\*)'; }
has()   { [ -n "$(code "$1" | grep -F -- "$2")" ]; }
hasre() { [ -n "$(code "$1" | grep -E -- "$2")" ]; }

# The same idea for shell: strip full-line `#` comments. Without this, the
# comment that explains WHY the mirror was deleted trips the pin forbidding
# the mirror — a pin matching prose about the thing it forbids, which is how
# this suite first went red against correct code.
shcode() { grep -vE '^[[:space:]]*#' "$1"; }

PKG=panel/agent/src/services/pkg.rs
MAIN=panel/agent/src/main.rs
UPDATE=scripts/update.sh

for f in "$PKG" "$MAIN" "$UPDATE"; do
  [ -f "$f" ] || { echo "missing source file: $f"; exit 1; }
done

# R4 (2026-11-02): this section pinned mail/DNS hosting code removed in R4; deleted, not weakened.
# Sections 1-3 pinned the agent mail routes (rspamd/webmail/heal), deleted in R4.
# Section 4 (the update.sh mirror ban) survives: update.sh is untouched by R4.

echo "── 4. W3: the shell mirror is GONE, not merely updated ──"

# The mirror is the drift source. Correcting it would only reset the clock;
# deleting it is what closes the class (#96e — derivation, not correction).
if shcode "$UPDATE" | grep -cE '^[[:space:]]*location /webmail/' >/dev/null; then
  bad "update.sh spells out the /webmail/ fragment again — a second copy that will rot"
else
  ok "update.sh contains no copy of the fragment"
fi

if shcode "$UPDATE" | grep -cE 'sub_filter|proxy_redirect / /webmail/' >/dev/null; then
  bad "update.sh still carries fragment internals — the mirror is back"
else
  ok "update.sh carries no fragment internals"
fi

echo
printf 'webmail/spam pins: \033[0;32m%d passed\033[0m, ' "$PASS"
if [ "$FAIL" -gt 0 ]; then
  printf '\033[0;31m%d failed\033[0m\n' "$FAIL"
  exit 1
fi
printf '0 failed\n'
exit 0
