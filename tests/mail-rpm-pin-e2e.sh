#!/usr/bin/env bash
# Regression pins for s268 — the mail vertical on the RHEL family.
#
# Mail was refused on RPM boxes from s266 to s268 with an honest reason: nothing
# past the packages had been driven there. Driving it on two real Rocky 9.8
# boxes found FIVE defects, and the refusal's own premise was wrong in both
# directions — it claimed the packages installed (they did not) and warned about
# a Debian failure mode that cannot occur on RHEL.
#
#   R1  EPEL's opendkim needs libmilter.so.1.0 (sendmail-milter) and
#       libmemcached.so.11 (libmemcached-awesome), both CRB-only. setup.sh
#       enabled EPEL and never CRB, which EPEL itself requires — so the mail
#       install died on "nothing provides", while a name-availability probe
#       reported all four packages available. That probe is where the false
#       "the packages install" claim came from.
#   R2  The OpenDKIM config wrote TrustAnchorFile /usr/share/dns/root.key, a
#       Debian path (dns-root-data). OpenDKIM treats a missing anchor as FATAL:
#       status=78/CONFIG, the daemon never starts, nothing is ever signed.
#   R3  s262 removed `-f` from the drop-in because Debian's unit is
#       Type=forking. EPEL's is Type=simple, where a backgrounding daemon makes
#       systemd reap the parent and log "Deactivated successfully" while the
#       unit goes INACTIVE — a failure that does not even register as failed.
#   R4  The milter socket lived in Postfix's chroot (/var/spool/postfix/...),
#       which exists only because DEBIAN chroots smtpd. RHEL does not (master.cf
#       column 5 = n), and SELinux forbids it outright: dkim_milter_t is denied
#       search on postfix_spool_t.
#   R5  /var/vmail is created by the installer so it inherits var_t, which
#       dovecot_t may not write. Every message was deferred and never delivered
#       while both services were active and the panel called the stack healthy.
#   R6  Rocky 9.8 ships Dovecot 2.3.16 built WITHOUT Argon2, so the {ARGON2ID}
#       hashes the panel writes fail with "Unknown scheme ARGON2ID" and no
#       mailbox can be opened — s259's finding on a different family. Argon2 is
#       a BUILD OPTION, not a version, and our own comment said ">= 2.3.11".
#
# Pure source analysis: no box, no network, no build.

set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0 FAIL=0
ok()  { PASS=$((PASS+1)); printf '  \033[0;32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[0;31m✗\033[0m %s\n' "$1"; }

PKG=panel/agent/src/services/pkg.rs
SETUP=scripts/setup.sh

# Production code only. These files carry long comments that NAME the very
# strings being forbidden, and a scanner that cannot tell a guard from a use
# convicts the explanation instead of the defect (#94c). Strip comment lines
# before searching for a forbidden token.
#
# `has`/`hasnt` take the whole pipeline into ONE command substitution rather
# than piping into `grep -q`. Under `set -o pipefail`, `code f | grep -q X`
# returns FAILURE even when X matches: grep -q exits at the first hit, the
# upstream grep dies of SIGPIPE (141), and pipefail propagates that. The first
# draft of this suite reported 7 false failures that way — and a harness lying
# about pins is indistinguishable from pins failing, which is how you end up
# "fixing" correct code.
#
# It also stops at `#[cfg(test)]`. The unit tests legitimately call the plain
# hash function to assert what it produces, and counting those as production
# call sites made this suite demand that its own tests be rewritten — the same
# scoping s267 had to add for the `--pipe` pin (#94c).
code()  { sed '/#\[cfg(test)\]/q' "$1" | grep -vE '^[[:space:]]*(///|//!|//|\*|/\*)'; }
has()   { [ -n "$(code "$1" | grep -F -- "$2")" ]; }
hasre() { [ -n "$(code "$1" | grep -E -- "$2")" ]; }

echo "── 1. R1: CRB is enabled wherever EPEL is ──"

# Pin the PAIRING, not the literal command: EPEL without CRB is the defect, and
# a future rewrite that keeps EPEL and drops CRB must fail here.
if grep -q 'epel-release' "$SETUP"; then
  if grep -qE 'set-enabled (crb|powertools)' "$SETUP"; then
    ok "setup.sh enables CRB/PowerTools alongside EPEL"
  else
    bad "setup.sh enables EPEL but never CRB — EPEL requires it, and opendkim's deps live there"
  fi
else
  bad "setup.sh no longer enables EPEL at all — this pin can no longer see the pairing"
fi

# Both repo ids must be attempted: `crb` is EL9+, `powertools` is EL8.
if grep -qE 'set-enabled crb' "$SETUP" && grep -qE 'set-enabled powertools' "$SETUP"; then
  ok "both CRB repo ids are attempted (crb on EL9+, powertools on EL8)"
else
  bad "only one CRB repo id is attempted — the other EL generation is left broken"
fi

# R4 (2026-11-02): this section pinned mail/DNS hosting code removed in R4; deleted, not weakened.
# Sections 2-9 pinned the mail vertical (agent/backend mail.rs, pkg.rs mail refusal), deleted in R4.
# Section 1 (setup.sh CRB/EPEL pairing) survives: setup.sh is untouched by R4 on those lines.


echo
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
