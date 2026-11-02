#!/usr/bin/env bash
# container-identity-pin-e2e.sh — s297 / v2.55.0
#
# A container name is not a key anybody owns.
#
# `dockpanel-git-{X}` is written for a deployment called X. It was ALSO written
# for a preview of config C on branch B whenever `{C}-pr-{slug(B)}` spelled X —
# and `is_valid_name` accepts that name, so an admin creates it by ordinary
# means while the branch half is chosen by whoever can push to C's repo. The
# agent resolved the container by NAME ALONE, then blue-greened it: it read the
# domain off the container it had just found, swapped THAT domain's vhost to the
# pushed build, and force-removed the container behind it. The v2.53.0 ownership
# guard authorised the vhost write, correctly — the victim's container really
# was the one behind the victim's vhost. `services::ownership` had five
# primitives and every one of them read a file; the largest thing the agent
# destroys had none.
#
#   §A  TWO NAME SPACES, AND THEY CANNOT INTERSECT. A preview is scoped by a
#       character `is_valid_name` rejects, so no deployment can spell one. The
#       arm that fails if the whole separation is undone.
#   §B  A CONTAINER PROVES IT IS THE ONE ASKED FOR. Not "a container with this
#       name exists" — who does it say it belongs to, and does the answer permit
#       what is about to happen to it.
#   §C  THE STAND-IN SPACE IS NOT A REAL NAME EITHER. `{name}-blue` is a name
#       `is_valid_name` accepts, and the swap force-removed whatever held it.
#   §D  A COMMIT PHASE REPORTS. Destroy-then-rename with both results discarded
#       returned Ok over a half-swapped host and armed the next deploy to take
#       the site down.
#   §E  A MASK IS NOT A VALUE. The edit dialog is seeded from the masked read and
#       posts it back; the container is the only store of the real one.
#   §F  THE v2.53.0 GUARD REACHES THE PATHS IT MISSED. Rename, and the three
#       systemd lifecycle callers.
#   §G  AN UNATTENDED SWEEP DOES NOT ORPHAN WHAT IT FAILED TO REMOVE.
#
# Pure source analysis: no box, no network, no build.
#
# Arms are written against the CAPABILITY a regression must use, not today's
# spelling (lesson #122), and were attacked after they went green (lesson #132).
# Where an arm can be satisfied by the prose that NARRATES a check rather than
# the check, it keys on the syntax of the operation (lesson #149).
#
# NO PIPES INTO `grep -q`. Under `set -o pipefail` grep -q closes the pipe on its
# first match, the upstream dies of SIGPIPE (141), and pipefail reports the whole
# pipeline failed — so an arm goes red on correct code, non-deterministically.
# Every arm here feeds grep a here-string.

set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0; FAIL=0; SKIP=0
ok()   { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }
skip() { SKIP=$((SKIP+1)); printf '  \033[33m-\033[0m SKIP %s\n' "$1"; }

OWN=panel/agent/src/services/ownership.rs
DA=panel/agent/src/services/docker_apps.rs
DAR=panel/agent/src/routes/docker_apps.rs
NGX=panel/agent/src/routes/nginx.rs
APROC=panel/agent/src/services/app_process.rs
APPS_TSX=panel/frontend/src/pages/Apps.tsx

for f in "$OWN" "$DA" "$DAR" "$NGX" "$APROC" "$APPS_TSX"; do
  [ -f "$f" ] || bad "MISSING SUBJECT FILE: $f"
done

# Comments out, CODE INTACT. Copied from the FIXED stripper (lesson #136): the
# naive `s{/\*.*?\*/}{}gs` opened a block comment inside a string literal and ate
# real code, which makes an ABSENCE arm pass on what it merely removed.
code() {
  perl -0777 -pe '
    s{\{/\*.*?\*/\}}{}gs;
    s{^[ \t]*/\*.*?\*/[ \t]*$}{}gms;
    s{^\s*//.*$}{}gm;
  ' "$1"
}

# The stripper is code, and code can be wrong. Measure it before trusting
# anything downstream: every `fn` declaration must survive the strip.
stripper_self_check() {
  local bad_files=0 f raw_decls stripped_decls
  for f in "$@"; do
    [ -f "$f" ] || continue
    raw_decls=$(grep -cE '^[[:space:]]*(pub )?(pub\(crate\) )?(async )?fn ' "$f" || true)
    stripped_decls=$(grep -cE '^[[:space:]]*(pub )?(pub\(crate\) )?(async )?fn ' <<< "$(code "$f")" || true)
    if [ "$raw_decls" != "$stripped_decls" ]; then
      bad "STRIPPER ATE CODE in $f: $raw_decls fn declarations before, $stripped_decls after"
      bad_files=$((bad_files+1))
    fi
  done
  [ "$bad_files" -eq 0 ] && ok "comment stripper preserves every fn declaration in all $# subjects"
}

# An arm whose subject could not be extracted must SKIP, not print a confident
# green next to a red about the same subject.
subj() { local t; t=$(code "$1"); [ -n "$t" ] || return 1; printf '%s' "$t"; }

has()   { grep -qE -- "$2" <<< "$1"; }
count() { grep -cE -- "$2" <<< "$1" || true; }

# Only DEAD-CODE markers belong here (lesson #133).
#
# ⚠ SCOPED TO THE MATCH, not to the whole subject, and that is a correction to
# how the earlier suites spell it. `git_build.rs` carries an auto-generated
# Dockerfile as a string literal containing `collectstatic --noinput || true`, so
# a whole-subject liveness test reads the ENTIRE FILE as dead and every arm over
# it goes red on correct code — permanently, which means those arms could never
# report a real catch either. Same family as the stripper that ate code (#136)
# and the arm that matched the prose narrating a check (#149): a harness rule
# that matched a string literal. Judge the lines that matched, plus a little
# context so an `if false {` wrapper two lines up is still caught.
live_at() {
  local w="$1" pat="$2" hits
  hits=$(grep -E -B3 -A1 -- "$pat" <<< "$w" || true)
  [ -n "$hits" ] && ! grep -qE -- '(if false|&& false|\|\| true|let _unused)' <<< "$hits"
}

# The body of one top-level fn, bounded by the NEXT top-level fn.
# A fixed `-A <n>` window is NOT a function (lesson #131).
fnbody() {
  awk -v name="$2" '
    /^[[:space:]]*(pub )?(pub\(crate\) )?(async )?fn / {
      if ($0 ~ "(pub |pub\\(crate\\) )?(async )?fn " name "\\(") { inside=1; next }
      inside=0
    }
    inside { print }
  ' <<< "$1"
}

derives() {
  local w="$1" pat="$2"
  [ -n "$w" ] && grep -qE -- "$pat" <<< "$w" && live_at "$w" "$pat"
}

# First 1-indexed line of $2 within $1, or 0. Used where the DEFECT IS THE
# ORDER — a pin that only checks both statements exist passes on the bug.
lineof() {
  local n
  n=$(grep -nE -- "$2" <<< "$1" | head -1 | cut -d: -f1)
  printf '%s' "${n:-0}"
}

# LAST 1-indexed line of $2 within $1, or 0. Needed where a construct legitimately
# appears several times and only its position relative to another one is the
# property (D3 below: rollbacks existed before this release, just not on the path
# that needed one).
lastlineof() {
  local n
  n=$(grep -nE -- "$2" <<< "$1" | tail -1 | cut -d: -f1)
  printf '%s' "${n:-0}"
}

# Does a multi-line construct appear in the window? `grep` is line-oriented and
# every Rust call here spans six lines.
spans() { perl -0777 -ne 'exit(1) unless /'"$2"'/s' <<< "$1"; }

O=$(subj "$OWN")   || O=""
D=$(subj "$DA")    || D=""
DR=$(subj "$DAR")  || DR=""
N=$(subj "$NGX")   || N=""
AP=$(subj "$APROC")|| AP=""
TSX=$(subj "$APPS_TSX") || TSX=""

echo
# R5 (2026-11-02): §A-§D/§G/§H pinned the git container spaces (git_build,
# git_deploys, preview_cleanup); deleted with those features. §E pins the
# surviving ownership guards; §F was deleted in R6 with rename_site (see below).
echo "container-identity-pin-e2e — a container name is not a key anybody owns"
echo

# ── stripper self-check ────────────────────────────────────────────────
echo "§0 the harness measures its own preprocessing"
stripper_self_check "$OWN" "$DA" "$DAR" "$NGX" "$APROC"

# ── §E a mask is not a value ───────────────────────────────────────────
echo
echo "§E the mask a read substitutes cannot be written back as the secret"
if [ -z "$D" ] || [ -z "$DR" ]; then
  skip "§E — a subject could not be read"
else
  # Caller-reaches-helper (lesson #150): a merge nothing calls satisfies "the
  # helper exists" while the secret is still destroyed.
  UE=$(fnbody "$D" "update_env")
  if derives "$UE" 'merge_env_preserving_masked\('; then
    ok "E1 update_env goes through the merge"
  else
    bad "E1 update_env builds the environment itself again — the mask is written back as the value"
  fi
  ME=$(fnbody "$D" "merge_env_preserving_masked")
  if derives "$ME" 'ENV_MASK' && derives "$ME" 'existing\.get\('; then
    ok "E2 the merge recognises the mask and reads the real value off the container"
  else
    bad "E2 the merge does not consult the container it is about to replace"
  fi
  # The read side must consult the catalogue rather than masking every name that
  # merely CONTAINS a sensitive word — three shipped variables are hostnames and
  # usernames.
  GE=$(fnbody "$DR" "get_env")
  if derives "$GE" 'catalogue_non_secret_env\(' && derives "$GE" 'docker_apps::ENV_MASK'; then
    ok "E3 the masking read exempts what the catalogue declares non-secret, and uses the shared token"
  else
    bad "E3 the read masks by substring alone, or re-spells the mask as a literal"
  fi
  CNS=$(fnbody "$D" "catalogue_non_secret_env")
  if derives "$CNS" 'if v\.secret \{[[:space:]]*$' || derives "$CNS" 'v\.secret'; then
    ok "E4 the exemption can only ever un-mask a name the catalogue itself calls non-secret"
  else
    bad "E4 the exemption does not consult the catalogue's own secret flag"
  fi
  if [ -n "$TSX" ]; then
    if derives "$TSX" 'ENV_MASK'; then
      ok "E5 the dialog names the mask rather than open-coding it, so the two trees agree"
    else
      bad "E5 the frontend open-codes the mask"
    fi
  else
    skip "E5 — $APPS_TSX could not be read"
  fi
fi

# R6 (2026-11-02): §F pinned the ownership guard on routes/nginx.rs::rename_site
# and its three lifecycle callers, all deleted in the R6 nginx split, plus
# the now-callerless owned_service_name resolver. Deleted, not weakened:
# there is no rename path and no lifecycle caller left to guard.

# ── summary ────────────────────────────────────────────────────────────
echo
if [ "$SKIP" -gt 0 ]; then
  echo "container-identity pin: $PASS passed, $FAIL failed, $SKIP skipped"
else
  echo "container-identity pin: $PASS passed, $FAIL failed"
fi
[ "$FAIL" -eq 0 ] || exit 1
