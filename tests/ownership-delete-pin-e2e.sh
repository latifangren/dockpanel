#!/usr/bin/env bash
# ownership-delete-pin-e2e.sh — s295 / v2.53.0
#
# v2.52.0 pinned the question "may this domain be CLAIMED?". This pins the one
# that comes after it: "is this thing I am about to DESTROY actually mine?"
#
# Nothing owned that question, so every removal named its target by a key it had
# never checked, and the key lied in two different ways.
#
#   §A  the shared answer exists, and it FAILS CLOSED. `Owner::Unknown` — the
#       file could not be read, or carries no marker — must not permit a delete.
#   §B  EVERY destructive path asks it. The arm that matters, and the one the
#       v2.52.0 sweep is a lesson about: a shared helper is worth nothing until
#       the call sites are counted.
#   §C  /etc/letsencrypt is NOT the panel's namespace. Neither tree issues
#       through certbot, so every lineage those deletes could name belonged to
#       the operator — including the one `mail.rs` points Postfix and Dovecot at.
#   §D  a cron sync owns only the lines it was SENT, and a crontab it could not
#       READ is never treated as an empty one.
#   §E  the status-page cleanup is tenant-scoped.
#   §F  `rename_site` snapshots what it displaces. It is the writer the v2.52.0
#       `restore_or_remove` retrofit missed.
#   §G  markers are ANCHORED. `example.com` must not answer for
#       `example.community`, and a cron id must not answer for a longer one.
#
# Pure source analysis: no box, no network, no build.
#
# Arms are written against the CAPABILITY a regression must use, not today's
# spelling (lesson #122), and were attacked after they went green (lesson #132).
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
APPS_ROUTE=panel/agent/src/routes/docker_apps.rs
APPS_SVC=panel/agent/src/services/docker_apps.rs
TRAEFIK=panel/agent/src/services/traefik.rs
APP_PROC=panel/agent/src/services/app_process.rs
NGINX_ROUTE=panel/agent/src/routes/nginx.rs
SSL_ROUTE=panel/agent/src/routes/ssl.rs
CRONS_AGENT=panel/agent/src/routes/crons.rs
# s323: read_crontab/write_crontab moved OUT of routes/crons.rs into a shared
# service, because the WordPress auto-update twin needed them and private
# helpers cannot be shared. Extracting a helper moves the subject of every pin
# that measured it — D2 below went red for exactly that reason, not for a
# regression, and repointing it is the fix rather than relaxing it.
CRONTAB_SVC=panel/agent/src/services/crontab.rs
CRONS_BE=panel/backend/src/routes/crons.rs  # R8: deleted (see tombstone below)
SITES_BE=panel/backend/src/routes/sites.rs  # R8: deleted in R3 (see tombstone below)
INCIDENTS=panel/backend/src/routes/incidents.rs
WP=panel/agent/src/services/wordpress.rs

for f in "$APPS_ROUTE" "$APPS_SVC" "$TRAEFIK" "$APP_PROC" \
         "$NGINX_ROUTE" "$SSL_ROUTE" "$CRONS_AGENT" "$INCIDENTS" "$WP"; do
  [ -f "$f" ] || bad "MISSING SUBJECT FILE: $f"
done
# R8 TOMBSTONE: routes/crons.rs and routes/sites.rs are deleted (crons sync
# died with the site-cron model in R7; sites.rs died in R3). Their arms below
# are tombstoned per-section; absence itself is asserted here.
for f in "$CRONS_BE" "$SITES_BE"; do
  [ -f "$f" ] && bad "TOMBSTONE (R8): $f is back — its tombstoned arms must be restored"
done
ok "TOMBSTONE (R8): routes/crons.rs and routes/sites.rs stay deleted"

# Comments out, CODE INTACT.
#
# The obvious `s{/\*.*?\*/}{}gs` shipped in four suites before s294 and was
# DELETING CODE: `/*` occurs inside string literals (a Dockerfile's
# `COPY --from=builder /app/target/release/*`), so it opened a "block comment"
# that ran to the next `*/`. A truncated subject makes an ABSENCE arm — §C here —
# pass on code the stripper merely removed, which is the worst way for a pin to
# be wrong. So a block comment is recognised only where one is actually written:
# opening at the start of a line, closing at the end of one.
code() {
  perl -0777 -pe '
    s{\{/\*.*?\*/\}}{}gs;
    s{^[ \t]*/\*.*?\*/[ \t]*$}{}gms;
    s{^\s*//.*$}{}gm;
  ' "$1"
}

# The stripper is code, and code can be wrong. Measure it before trusting
# anything downstream: every `fn`/`pub fn` declaration must survive the strip.
# This is the check that would have caught #136 on the day it shipped.
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
# green next to a red about the same subject (lesson #122b).
subj() { local t; t=$(code "$1"); [ -n "$t" ] || return 1; printf '%s' "$t"; }

has()   { grep -qE -- "$2" <<< "$1"; }
count() { grep -cE -- "$2" <<< "$1" || true; }

# Only DEAD-CODE markers belong here. An earlier suite also forbade `let _ =` and
# `return false;` and immediately reded three arms on code verified by hand
# minutes earlier — both are ordinary Rust (lesson #133).
live() {
  ! grep -qE -- '(if false|&& false|\|\| true|let _unused)' <<< "$1"
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

# Assert a window both matches and is live, in one place so no arm forgets.
derives() {
  local w="$1" pat="$2"
  [ -n "$w" ] && grep -qE -- "$pat" <<< "$w" && live "$w"
}

echo
echo "ownership-delete-pin-e2e — a delete must prove it owns what it deletes"
echo

# ── stripper self-check ────────────────────────────────────────────────
echo "§0 the harness measures its own preprocessing"
stripper_self_check "$APPS_ROUTE" "$APPS_SVC" "$TRAEFIK" "$APP_PROC" \
                    "$NGINX_ROUTE" "$SSL_ROUTE" "$CRONS_AGENT" "$SITES_BE" "$WP"

# ── §A the shared answer, and that it fails closed ─────────────────────
echo
echo "§A the ownership question has ONE owner, and Unknown is not a maybe"
if [ ! -f "$OWN" ]; then
  skip "§A — $OWN absent (that absence is what §B reds on, not this)"
else
  O=$(subj "$OWN") || O=""
  if [ -z "$O" ]; then
    skip "§A — $OWN produced no code after stripping"
  else
    # Three states, and Unknown must be one of them: a resource that cannot be
    # read has to be distinguishable from one that answered "not mine".
    if has "$O" 'enum Owner' && has "$O" '\bOurs\b' && has "$O" '\bTheirs\b' && has "$O" '\bUnknown\b'; then
      ok "A1 Owner distinguishes Ours / Theirs / Unknown"
    else
      bad "A1 Owner must have three states — an unreadable resource is not 'not mine'"
    fi

    # THE fail-closed arm, keyed on the property rather than the spelling:
    # whatever may_delete is written as, it must be true for Ours ALONE.
    MD=$(fnbody "$O" "may_delete")
    if [ -n "$MD" ] && has "$MD" 'Ours' && ! has "$MD" 'Theirs' && ! has "$MD" 'Unknown'; then
      ok "A2 may_delete permits Ours and nothing else (fails closed)"
    else
      bad "A2 may_delete must permit ONLY Owner::Ours — Unknown must not delete"
    fi

    # Whole-line equality, not `contains`: every marker embeds a domain, and a
    # substring test lets a shorter domain answer for a longer one.
    OBL=$(fnbody "$O" "owner_by_lines")
    if derives "$OBL" '\.trim\(\) *== *m|line\.trim\(\)'; then
      ok "A3 markers are compared whole-line, not by substring"
    else
      bad "A3 marker comparison must be whole-line — 'contains' lets example.com match example.community"
    fi

    MISSING=""
    for probe in systemd_unit fail2ban_jail traefik_route app_vhost cert_dir_in_use_elsewhere; do
      has "$O" "fn +$probe\b" || MISSING="$MISSING $probe"
    done
    if [ -z "$MISSING" ]; then
      ok "A4 all five ownership probes exist"
    else
      bad "A4 missing ownership probe(s):$MISSING"
    fi

    # A cert directory whose neighbours cannot be enumerated must be assumed
    # shared — refusing to delete is recoverable, deleting is not.
    # Scoped to the read_dir failure BRANCH. The first draft only asked that
    # `return true` appear somewhere in the body — and it does, on the
    # found-a-reference path — so inverting the failure branch to `return false`
    # sailed through.
    CDU=$(fnbody "$O" "cert_dir_in_use_elsewhere")
    CDU_FAIL=$(grep -A3 -E 'read_dir' <<< "$CDU" || true)
    if [ -n "$CDU_FAIL" ] && has "$CDU_FAIL" 'return true' && live "$CDU"; then
      ok "A5 cert_dir_in_use_elsewhere assumes SHARED when it cannot read the vhost dir"
    else
      bad "A5 an unreadable sites-enabled must mean 'shared', not 'free to delete'"
    fi

    # app_vhost with no port knows nothing — it must not answer Ours.
    # Scoped to the no-port BRANCH, for the same reason as A5: `Owner::Unknown`
    # also appears on the unreadable-file path, so a body-wide test let the
    # no-port branch be flipped to `Owner::Ours` unnoticed.
    AV=$(fnbody "$O" "app_vhost")
    AV_NOPORT=$(grep -A2 -E 'let Some\(port\) *= *host_port' <<< "$AV" || true)
    if [ -n "$AV_NOPORT" ] && has "$AV_NOPORT" 'Owner::Unknown' && live "$AV"; then
      ok "A6 app_vhost with no readable port binding returns Unknown"
    else
      bad "A6 app_vhost must return Unknown when the container port is unknown"
    fi
  fi
fi

# ── §B every destructive path asks ─────────────────────────────────────
echo
echo "§B EVERY destructive path asks before it destroys"

# B1 — the regression v2.52.0 shipped. `route_key` doubles a literal '-', so for
# any domain without one it AGREES with the pre-fix mangle: legacy("a-b.com") is
# route_key("a.b.com"), the live file of a different app. Fires on a fresh
# install and never expires.
T=$(subj "$TRAEFIK") || T=""
RRC=$(fnbody "$T" "remove_route_config")
if derives "$RRC" 'ownership::traefik_route'; then
  ok "B1 traefik legacy-name cleanup checks the file's own Host rule first"
else
  bad "B1 remove_route_config deletes the legacy name unguarded — that name is another live domain's file"
fi

# B2/B3 — app removal.
AR=$(subj "$APPS_ROUTE") || AR=""
# The handler is `remove`, not `remove_app` — `remove_app` is the SERVICE call it
# makes. Naming the wrong function gives fnbody an empty window, and `derives`
# treats an empty window as a failure, so the arm reds rather than greening on a
# body it never read (lesson #131).
RA=$(fnbody "$AR" "remove")
# The guarded teardown moved out of `remove` and into the shared
# `unexpose_domain` at v2.54.0, so the Compose-stack teardown reaches the same
# guard instead of copying it. Follow the deletes; the arm below is unchanged.
# A SEPARATE window: the later arms in this section measure `remove`'s own
# body (the data-tree cleanup lives there still), so this must not overwrite it.
RA_VHOST="$RA"
if [ -n "$AR" ] && ! grep -qE 'ownership::app_vhost' <<< "$RA"; then
  RA_HELPER=$(fnbody "$AR" "unexpose_domain")
  # Only accept the helper if `remove` actually reaches it — otherwise the
  # teardown has simply been deleted and the arm must red.
  if grep -qE 'unexpose_domain' <<< "$RA" && [ -n "$RA_HELPER" ]; then
    RA_VHOST="$RA_HELPER"
  fi
fi
# The guard's ANSWER must reach the branch. Calling it and dropping the result
# on the floor is one of the two evasions that beat the s294 pin, so the arm is
# keyed on the call sitting inside the condition, not on the call existing.
if derives "$RA_VHOST" 'if +[^;]*ownership::app_vhost[^;]*may_delete'; then
  ok "B2 app removal proves the vhost is still fronting THIS container"
else
  bad "B2 app removal deletes the vhost without the guard's answer reaching the branch"
fi
# The handler used to gate on the BOOLEAN and then delete a path it rebuilt from
# the name label — so it asked the right question and acted on the wrong answer.
# That is how a data directory the migration had written under the CONTAINER name
# survived its own app's deletion, silently. The arm follows the value that is
# actually deleted: the directory the container's own binds proved.
if derives "$RA" 'identity\.app_dir'; then
  ok "B3 app removal deletes the data dir only when the container mounts it"
else
  bad "B3 app removal deletes /var/lib/dockpanel/apps/{name} on an unvalidated label"
fi

# B2c/B2d — s417: stack removal used to derive its ownership proof from
# `DeployedApp.port` (`list_deployed_apps`'s own field), read from Docker's
# LIVE container listing — empty for a STOPPED ("parked") container, so a
# parked-then-removed stack could never prove its vhost was its own, and the
# vhost + certificate were stranded forever, unrecoverable by any later panel
# action (the container that would have proven it is by then gone too).
# `removal_identity` (single-app removal, just above) already solved this
# correctly, from `inspect_container`'s HostConfig; these arms are the same
# capability reaching the stack path.
SA=$(fnbody "$AR" "stack_action")
if derives "$SA" 'inspect_host_port'; then
  ok "B2c stack removal derives its port proof from inspect_container's HostConfig, not the live listing"
else
  bad "B2c stack removal cannot prove ownership of a parked (stopped) stack's vhost — it is stranded forever"
fi
if derives "$SA" 'unexpose_domain\([^;]*stack_port'; then
  ok "B2d that proof actually reaches the vhost-deletion call, not dropped on the floor"
else
  bad "B2d stack_port is computed but never reaches unexpose_domain"
fi

# The proof itself must come from the container's MOUNTS, not from its name.
AS=$(subj "$APPS_SVC") || AS=""
RI=$(fnbody "$AS" "removal_identity")
# Keyed on the ASSIGNMENT, not on the word `binds` appearing somewhere in the
# body: the first draft still saw `binds` in the destructuring `let` after the
# value had been replaced with a constant, and passed.
# Repointed from `owns_app_dir` onto the field that now carries the evidence —
# the boolean is derived FROM it, so keying on the boolean would measure a line
# that no longer reads the mounts at all. Extracting a helper moves the subject
# of every pin that measured it (the same note as CRONTAB_SVC above); the
# receiver is still `removal_identity`, so the caller is still what is proved.
# Qualified with `id.` because `owns_app_dir` ends in the shorter name and an
# unqualified pattern would match the derived line and pass on it.
OAD_ASSIGN=$(grep -E 'id\.app_dir *=' <<< "$RI" || true)
if [ -n "$OAD_ASSIGN" ] && has "$OAD_ASSIGN" 'binds' && live "$RI"; then
  ok "B4 owns_app_dir is ASSIGNED from the container's bind mounts"
else
  bad "B4 owns_app_dir must be assigned from binds — a name label is not ownership"
fi

# B7/B8 — the non-injective systemd unit name. '.'->'-' is not injective because
# '-' is legal in a domain label, so a.b.com and a-b.com share one unit file.
AP=$(subj "$APP_PROC") || AP=""
RAS=$(fnbody "$AP" "remove_app_service")
if derives "$RAS" 'ownership::systemd_unit'; then
  ok "B7 unit removal reads the unit to see whose app it runs"
else
  bad "B7 remove_app_service unlinks a unit whose name a.b.com and a-b.com share"
fi
CAS=$(fnbody "$AP" "create_app_service")
if derives "$CAS" 'ownership::systemd_unit'; then
  ok "B8 unit creation refuses to overwrite another domain's unit"
else
  bad "B8 create_app_service silently replaces the colliding domain's unit"
fi

# B9/B10 — the Fail2Ban jail, same mangle, both directions.
NR=$(subj "$NGINX_ROUTE") || NR=""
# R8 TOMBSTONE (B9/B10): delete_site/put_site died with routes/sites.rs
# (R3) and the agent nginx routes no longer carry them (0 occurrences
# repo-wide). The fail2ban_jail helper survives in agent ownership.rs for
# the live stack/app doors (B1–B8).
if grep -q 'fn delete_site\|fn put_site' <<< "$(subj "$NGINX_ROUTE")"; then
  bad "TOMBSTONE (R8): delete_site/put_site reappeared — B9/B10 must be restored"
else
  ok "TOMBSTONE (R8): B9/B10 retired — delete_site/put_site are gone"
fi

# B11/B12 — the shared wildcard cert directory.
# R8 TOMBSTONE (B11/B12): the site deletion and ssl-revoke doors died with
# routes/sites.rs and routes/ssl.rs (R3). cert_dir_in_use_elsewhere survives
# in agent ownership.rs for live doors.
# (No `|| grep -q` shape here: pipefail-sigpipe flags it as a boolean-grep pipeline.)
DOOR_BACK=0
grep -q 'fn delete_site' <<< "$(subj "$NGINX_ROUTE")" && DOOR_BACK=1
grep -q 'async fn revoke' <<< "$(subj "$SSL_ROUTE")" && DOOR_BACK=1
if [ "$DOOR_BACK" = "1" ]; then
  bad "TOMBSTONE (R8): a site deletion/revoke door reappeared — B11/B12 must be restored"
else
  ok "TOMBSTONE (R8): B11/B12 retired — site deletion and ssl revoke are gone"
fi

# ── §C Let's Encrypt is not ours ───────────────────────────────────────
echo
echo "§C /etc/letsencrypt belongs to the operator, and the panel never wrote it"

# ABSENCE arms. These are the ones a truncated subject would falsely green, which
# is why §0 measures the stripper first.
# Enumerate with `find`, not `git ls-files`. The first draft used git, which
# returns NOTHING outside a checkout — so both absence arms below passed
# vacuously, green, having examined zero files. That is #136's failure direction
# with a different cause: not a truncated subject, an empty subject LIST. The
# count is asserted before the arms are allowed to mean anything.
RS_FILES=$(find panel/agent/src panel/backend/src -name '*.rs' -type f 2>/dev/null | sort)
RS_COUNT=$(printf '%s\n' "$RS_FILES" | grep -c '\.rs$' || true)
if [ "${RS_COUNT:-0}" -lt 50 ]; then
  bad "C0 only $RS_COUNT Rust files enumerated — the absence arms below cannot mean anything"
else
  ok "C0 $RS_COUNT Rust source files enumerated for the absence arms"
fi

LE_HITS=0; LE_WHERE=""
for f in $RS_FILES; do
  [ -f "$f" ] || continue
  C=$(code "$f")
  n=$(count "$C" 'remove_(dir_all|file)\(&?(le_|.*letsencrypt)')
  m=$(count "$C" '/etc/letsencrypt/(live|archive|renewal)')
  if [ "$n" != "0" ]; then LE_HITS=$((LE_HITS+n)); LE_WHERE="$LE_WHERE $f"; fi
  # A read is fine (mail.rs reads the panel host's cert); a DELETE is not.
  if [ "$m" != "0" ] && grep -qE 'remove_dir_all|remove_file' <<< "$(grep -A2 -E '/etc/letsencrypt/(live|archive|renewal)' <<< "$C")"; then
    LE_HITS=$((LE_HITS+1)); LE_WHERE="$LE_WHERE $f(adjacent-remove)"
  fi
done
if [ "$LE_HITS" -eq 0 ]; then
  ok "C1 nothing deletes an /etc/letsencrypt lineage"
else
  bad "C1 $LE_HITS deletion(s) of an operator Let's Encrypt lineage:$LE_WHERE"
fi

CERTBOT_DEL=0; CB_WHERE=""
for f in $RS_FILES; do
  [ -f "$f" ] || continue
  C=$(code "$f")
  n=$(count "$C" '"delete", *"--cert-name"|certbot.*delete.*--cert-name')
  if [ "$n" != "0" ]; then CERTBOT_DEL=$((CERTBOT_DEL+n)); CB_WHERE="$CB_WHERE $f"; fi
done
if [ "$CERTBOT_DEL" -eq 0 ]; then
  ok "C2 nothing shells out to \`certbot delete --cert-name\`"
else
  bad "C2 \`certbot delete\` destroys a lineage and ALL its SANs:$CB_WHERE"
fi

# The reader that made this matter must still be there — if mail stops reading
# the lineage the blast radius changes and this section wants revisiting.
MAIL=panel/agent/src/routes/mail.rs
if [ -f "$MAIL" ]; then
  MC=$(code "$MAIL")
  if has "$MC" '/etc/letsencrypt/live'; then
    ok "C3 mail.rs still READS the panel host's lineage (why C1/C2 matter)"
  else
    skip "C3 mail.rs no longer reads /etc/letsencrypt — re-derive C1/C2's blast radius"
  fi
fi

# ── §D the cron sync owns only what it was sent ────────────────────────
echo
echo "§D a cron sync owns the lines it was SENT, and never mistakes a failed read for an empty crontab"
CA=$(subj "$CRONS_AGENT") || CA=""
SC=$(fnbody "$CA" "sync_crons")
# The capability a regression must use: stripping by the panel-wide marker
# instead of by the ids in this request.
if [ -n "$SC" ] && has "$SC" 'owned' && ! has "$SC" 'filter\(\|line\| *!line\.contains\(CRONTAB_MARKER\)\)'; then
  ok "D1 sync strips only the ids it was sent, not every dockpanel line on the box"
else
  bad "D1 sync_crons strips every '# dockpanel:' line — every other tenant's jobs with it"
fi

RC=$(fnbody "$(subj "$CRONTAB_SVC")" "read_crontab")
# `Err(` appears in the MATCH ARMS too (`Ok(Err(e))`), so the first draft passed
# even after both failure arms were flipped to `Ok(String::new())`. The property
# is: an empty crontab may be returned for exactly ONE reason, and that reason
# must be the genuine "no crontab for <user>" message.
RC_EMPTIES=$(count "$RC" 'Ok\(String::new\(\)\)')
if [ "$RC_EMPTIES" = "1" ] && has "$RC" 'no crontab for' && live "$RC"; then
  ok "D2 read_crontab returns an empty crontab only when there genuinely is none"
else
  bad "D2 read_crontab has $RC_EMPTIES ways to return '' — a timeout must not be one of them"
fi
# Scoped to the READ statement itself. The first draft of this arm allowed a
# bare `map_err` anywhere in the body and so went GREEN against v2.52.0 — it was
# matching the WRITE call's error handling, which was never in question. An arm
# that passes on the defect it names is worse than no arm (lesson #141).
RC_STMT=$(grep -A3 -E 'read_crontab\(\)' <<< "$SC" || true)
if [ -n "$RC_STMT" ] && has "$RC_STMT" 'map_err|\?;' && live "$SC"; then
  ok "D3 sync_crons propagates a failed read rather than writing over it"
else
  bad "D3 sync_crons must refuse to write when the crontab could not be read"
fi

# R8 TOMBSTONE (D4/D5): sync_crons_to_agent is gone (0 occurrences
# repo-wide) with routes/crons.rs — the panel no longer pushes a cron set to
# the agent, so no payload ambiguity can force a global wipe. D1–D3 (the
# agent-side read/write discipline) stay live above.
if grep -rq 'sync_crons_to_agent' panel/backend/src panel/agent/src; then
  bad "TOMBSTONE (R8): sync_crons_to_agent reappeared — D4/D5 must be restored"
else
  ok "TOMBSTONE (R8): D4/D5 retired — sync_crons_to_agent is gone"
fi

# ── §E tenant scoping on the shared table ──────────────────────────────
echo
echo "§E status-page components are per-account, and the site paths say so"
# R8: §E re-aimed — the site-coupled statements died with routes/sites.rs.
# The live status-page DELETE lives in incidents.rs, scoped by id + user_id.
INCS=$(subj "$INCIDENTS") || INCS=""
SCOPED_DEL=$(count "$INCS" 'DELETE FROM status_page_components WHERE id = \$1 AND user_id')
if [ "$SCOPED_DEL" != "0" ]; then
  ok "E1 the status-page DELETE is scoped to the acting account"
else
  bad "E1 DELETE FROM status_page_components has no user_id — it deletes other accounts' rows"
fi
# R8 TOMBSTONE (E2): the rename twin (UPDATE ... WHERE name = $2 AND user_id)
# died with routes/sites.rs. The only status_page_components UPDATE left is
# the status_override clear inside the incident-resolve handler, which runs
# only after the incident is loaded owner-scoped (id + claims.sub) — no
# rename path remains to scope.
if grep -q 'UPDATE status_page_components SET name' <<< "$INCS"; then
  bad "TOMBSTONE (R8): a component rename UPDATE reappeared — E2 must be restored"
else
  ok "TOMBSTONE (R8): E2 retired — no component rename UPDATE remains"
fi

# ── §F rename_site snapshots what it displaces ─────────────────────────
echo
echo "§F rename_site is a replacing writer, and replacing writers snapshot"
# R8 TOMBSTONE (§F): rename_site is gone (0 occurrences repo-wide) with
# routes/sites.rs — no replacing writer remains to snapshot or restore.
if grep -rq 'fn rename_site' panel/backend/src panel/agent/src; then
  bad "TOMBSTONE (R8): rename_site reappeared — §F must be restored"
else
  ok "TOMBSTONE (R8): §F retired — rename_site is gone"
fi

# ── §G markers are anchored ────────────────────────────────────────────
echo
echo "§G a marker that embeds a domain or an id must be ANCHORED"
W=$(subj "$WP") || W=""
SAU=$(fnbody "$W" "set_auto_update")
IAU=$(fnbody "$W" "is_auto_update_enabled")
if [ -n "$SAU" ] && ! has "$SAU" 'contains\(&marker\)'; then
  ok "G1 the WordPress auto-update strip is line-anchored"
else
  bad "G1 'contains' lets example.com strip example.community's security-update cron"
fi
if [ -n "$IAU" ] && ! has "$IAU" '\.contains\(&marker\)'; then
  ok "G2 the auto-update READ is anchored too (delete_site branches on it)"
else
  bad "G2 the unanchored read reports the wrong site as enabled, then strips it"
fi
# Keyed on the parse, not on the function's NAME: renaming it, or reimplementing
# it as a `contains`, must both red.
MID=$(fnbody "$CA" "marker_id")
if [ -n "$MID" ] && has "$MID" 'split_whitespace' && ! has "$MID" 'contains' && live "$MID"; then
  ok "G3 a cron line's id is PARSED as a token, not substring-matched"
else
  bad "G3 without a parsed id, cron 'abc-123' matches the line of 'abc-1234'"
fi

# ── summary ────────────────────────────────────────────────────────────
echo
echo
if [ "$SKIP" -gt 0 ]; then
  echo "ownership-delete pin: $PASS passed, $FAIL failed, $SKIP skipped"
else
  echo "ownership-delete pin: $PASS passed, $FAIL failed"
fi
[ "$FAIL" -eq 0 ] || exit 1
