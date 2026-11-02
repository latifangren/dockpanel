#!/usr/bin/env bash
# Regression pins for issue #117 — an optional field that cannot be emptied.
#
# THE DEFECT, as reported by Sylvain-SW against 2.132.1:
#   Clearing any optional field of a Git Deploy and saving returned 200, and the
#   value was still there on reload. The form sent `null` for an empty box:
#
#       post_deploy_cmd: formPostDeploy.trim() || null,        (GitDeploys.tsx)
#       post_deploy_cmd = COALESCE($12, post_deploy_cmd),      (git_deploys.rs)
#
#   COALESCE(NULL, old) is old, so "the client omitted this key" and "the operator
#   emptied this box" arrived identically and the second silently became the
#   first. A post-deploy hook the operator had removed went on running.
#
# THE CLASS. A derivation over the crate found 125 COALESCE self-guarded columns
# in 16 UPDATE statements across 13 files. Most are correct and must stay: an
# agent check-in that omits a metric must not blank the stored one, and a NOT NULL
# identifier has no "clear" to express. What makes a genuine defect is the PAIR —
# a column self-guarded on the UPDATE side AND a form field that sends null for an
# empty box. §1 derives both halves and pins the intersection, so a new pairing
# fails here whether it arrives from the SQL side or from the form side.
#
# THE FIX SHAPE, pinned by §2. Three states on the wire instead of two:
#
#       key absent      -> NULL -> COALESCE keeps the stored value
#       key sent as ""  -> ''   -> CASE writes NULL
#       key sent with v -> v    -> CASE writes v
#
#   The empty string is a WIRE sentinel and is never stored. v2.120.0 fixed the
#   same defect on the alert destinations by letting '' reach the column, which is
#   safe THERE because every reader of those columns guards on non-empty. It is
#   not safe here: `remove` reads the domain with `unwrap_or(&name)`, so a stored
#   '' would hand the agent an empty site identifier. §3 pins the normaliser that
#   keeps '' out of storage, and §4 pins the two readers that would otherwise ask
#   the agent for a vhost named ".conf" or an ACME order with no address.
#
# §5 pins the refusal. Clearing a DOMAIN is answered rather than folded away,
# because nothing in the git path takes an nginx vhost down — `unexpose_domain`
# exists for Docker apps and git_build.rs names wiring it as separate work.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

PASS=0; FAIL=0
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '\033[31m✗\033[0m %s — %s\n' "$1" "$2"; FAIL=$((FAIL+1)); }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "expected '$3', got '$2'"; }

# R5 (2026-11-02): §2-§6 pinned git_deploys.rs/GitDeploys.tsx; deleted with the
# feature. §1's derivation now covers the surviving routes/pages.

# ugrep's --ignore-files shim honours .gitignore, so use the real binary.
G=/usr/bin/grep

BACKEND=panel/backend/src/routes
SPA=panel/frontend/src/pages


echo "── §1 the class: a COALESCE self-guard must not meet a null-for-empty form field"

# Both halves are DERIVED. A hand-written list of subjects is the defect this arm
# exists to catch, so neither side may be enumerated by name.
#
# Backend half: the columns a placeholder is COALESCEd onto. Matched on the
# COALESCE itself rather than on the assignment, so BOTH shapes
# are in the population: the plain `col = COALESCE($n, col)` and the three-state
# `col = CASE WHEN $n = '' THEN NULL ELSE COALESCE($n, col) END`. That matters —
# under the CASE form a null STILL means "leave it alone", so a form field that
# sends null for an empty box is just as broken against a fixed column as
# against an unfixed one, and an arm that only knew the plain shape would go
# quiet on exactly the columns this release repaired.
guarded=$("$G" -rhoE 'COALESCE\(\$[0-9]+, [a-z_]+\)' "$BACKEND" --include=*.rs \
  | sed -E 's/^COALESCE\(\$[0-9]+, ([a-z_]+)\)$/\1/' | sort -u)

# Frontend half: payload keys sent as `key: <expr> || null`, carrying the FILE
# and — load-bearing — HOW MANY TIMES.
#
# The count is not decoration. Most of these pages post the same key from BOTH a
# create payload and an update payload, and only the update one is a defect: a
# create has no stored value to fold onto. `col@file` alone cannot tell them
# apart, so an allow-list entry earned by the legitimate create would silently
# excuse the update regrowing one — which a mutation proved, by reinstating
# `logo_url: logoUrl || null` on the reseller UPDATE and leaving this arm green.
# Pinning the count closes it: the create occurrence is the one that is expected,
# and a second occurrence in the same file is the regression.
nulled=$("$G" -rnoE '[a-z_]+: [^,;]*\|\| null' "$SPA" --include=*.tsx \
  | sed -E 's#^.*/([A-Za-z]+\.tsx):[0-9]+:([a-z_]+):.*#\2@\1#' \
  | sort | uniq -c | awk '{print $2 "=" $1}')

gcount=$(printf '%s\n' "$guarded" | "$G" -c . || true)
ncount=$(printf '%s\n' "$nulled"  | "$G" -c . || true)

# A derivation that returns nothing passes every membership test ever written.
if [ "$gcount" -lt 20 ] || [ "$ncount" -lt 5 ]; then
  bad "§1-derivation both populations are non-empty" \
      "derived $gcount guarded columns and $ncount null-for-empty keys — the greps stopped matching"
else
  ok "§1-derivation both populations are non-empty ($gcount guarded columns, $ncount null-for-empty keys)"
fi

pairs=$(printf '%s\n' "$nulled" \
  | while IFS= read -r entry; do
      col=${entry%@*}
      # NOT `... | "$G" -qx ...` — `-q` closes the read end on its first
      # match, and `$guarded` is 100+ lines: a race between that early close
      # and printf still writing turns into a broken-pipe failure here that
      # has nothing to do with membership (CI hit it; this box did not in 8
      # runs). Draining the match fully avoids the race the same way this
      # project's own `has()`/`hasre()` helpers already do elsewhere.
      [ -n "$(printf '%s\n' "$guarded" | "$G" -x -- "$col")" ] && printf '%s\n' "$entry"
    done | sort -u | tr '\n' ' ' | sed 's/ *$//')

# Every surviving pair needs a written reason. Keep this list SHORT — a pair
# belongs here only when clearing the field is not a thing an operator can mean.
#
#   ── on a CREATE payload, where null is the correct spelling of "not set".
#      A create has no stored value to preserve, so there is nothing to fold onto
#      and nothing an operator could be trying to clear.
#        logo_url@Resellers.tsx                         reseller create (the
#                                                       UPDATE beside it sends
#                                                       the operator's blank)
#        allowed_images@ContainerPolicies.tsx           policy create, ditto
#        alert_slack_url@Monitors.tsx, alert_discord_url@Monitors.tsx,
#        keyword@Monitors.tsx                           monitors have no edit form
#                                                       at all — `api.put` there
#                                                       sends only { enabled }
#   (R2/R3: the reseller accent_color/panel_name and stack domain/ssl_email pairs
#    left with resellers.rs/sites.rs — their guarded columns no longer exist.)
#                                      of each. Both verified SAFE against the
#                                      ACTUAL target column — stacks.rs, not the
#                                      git_deploys.rs column this arm's bare
#                                      column-name matching pairs them with:
#                                        domain    — UpdateStackRequest.domain is
#                                                     Option<Option<String>> via
#                                                     explicit_option, genuinely
#                                                     three-state at the struct
#                                                     level (absent=keep, explicit
#                                                     null=vacate, per the field's
#                                                     own doc comment); stacks.rs's
#                                                     UPDATE has no COALESCE on
#                                                     domain at all ("no COALESCE,
#                                                     so the statement says exactly
#                                                     what the row will hold").
#                                        ssl_email — UpdateStackRequest.ssl_email
#                                                     really is "absent (or an
#                                                     explicit null) = keep stored"
#                                                     — but that is INTENTIONAL,
#                                                     stated in TlsPlan's own doc
#                                                     comment: "an edit that says
#                                                     nothing about the address
#                                                     keeps it, and a stack
#                                                     switched to none and back to
#                                                     acme finds it again." Not the
#                                                     #117 shape (an operator who
#                                                     WANTS to clear it silently
#                                                     cannot): the round-trip is
#                                                     the point.
#
# Each entry pins a COUNT, because file granularity alone is not enough: several
# of these pages carry a create AND an update payload, and an allow-list entry
# earned by the create would otherwise excuse the update regrowing one. Most
# expected counts are 1 — the create occurrence — so any OTHER count in the same
# file fails here unless written above.
EXPECTED_PAIRS="alert_discord_url@Monitors.tsx=1 alert_slack_url@Monitors.tsx=1 allowed_images@ContainerPolicies.tsx=1 keyword@Monitors.tsx=1 logo_url@Resellers.tsx=1"
eq "§1 the only null-for-empty fields left on a COALESCE-guarded column are the five with written reasons" \
   "$pairs" "$EXPECTED_PAIRS"

echo
if [ "$FAIL" -eq 0 ]; then
  printf '\033[32mPASS %d  FAIL %d\033[0m\n' "$PASS" "$FAIL"
else
  printf '\033[31mPASS %d  FAIL %d\033[0m\n' "$PASS" "$FAIL"
fi
[ "$FAIL" -eq 0 ]
