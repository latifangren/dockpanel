#!/usr/bin/env bash
# Regression pins for the s366 ship — backends that worked and nothing could reach.
#
# Three complete, ownership-scoped, server-pinned handlers had zero callers in the
# product: a database backup could be listed and drilled but never restored or
# deleted, a volume backup could be listed and drilled but never restored, and an
# operator who suspected a leaked agent token had no control to rotate it. This
# suite pins the CALLERS, because the handlers were never the missing half — and a
# severed pair is invisible to every test that exercises only one end.
#
# It also pins the two claims withdrawn in the same ship. The Withdrawn Claims
# register's own premise is that a claim deleted from one surface survives on the
# others, so §C asserts the deletion on every surface at once rather than trusting
# that the edit was made everywhere.
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

PASS=0; FAIL=0
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '\033[31m✗\033[0m %s — %s\n' "$1" "${2:-}"; FAIL=$((FAIL+1)); }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "expected '$3', got '$2'"; }

# ugrep's --ignore-files shim honours .gitignore, so every count below uses the
# real binary explicitly (dockpanel-ops-p2, s357).
G=/usr/bin/grep

ORCH=panel/frontend/src/pages/BackupOrchestrator.tsx
SERVERS=panel/frontend/src/pages/Servers.tsx
ROUTES=panel/backend/src/routes/mod.rs
BACKEND=panel/backend/src/routes/backup_orchestrator.rs
MAIN=panel/backend/src/main.rs

for f in "$ORCH" "$SERVERS" "$ROUTES" "$BACKEND" "$MAIN" README.md; do
  [ -f "$f" ] || { bad "SETUP" "$f missing"; exit 1; }
done

# R8 TOMBSTONE: FEATURES.md is deleted wholesale (absent from HEAD; the
# published-figures register it carried moved to the measurement surfaces
# docs-claims §6 reads). Deleting the whole file subsumes §C/§D's
# per-surface withdrawal checks below — they are tombstoned, not dropped
# silently. If FEATURES.md returns, §C/§D must return with it.
if [ -f FEATURES.md ]; then
  bad "TOMBSTONE (R8): FEATURES.md is back — §C/§D must be restored with it"
else
  ok "TOMBSTONE (R8): FEATURES.md is gone — the withdrawn-claims register and services table retired with it"
fi

# An arm that measures an empty subject prints green for every absence below, so
# the subjects are asserted before they are measured (lesson #143).
ORCH_LINES=$($G -c '' "$ORCH")
[ "$ORCH_LINES" -gt 800 ] && ok "A0 subject extracted — $ORCH is $ORCH_LINES lines" \
  || bad "A0 subject extracted" "$ORCH is only $ORCH_LINES lines — §A examined nothing"

echo "── A. The restore and delete controls exist and reach the right routes ─"

# A1-A3: the severed-pair guards. Each counts the CALL, and each path is spelled
# exactly once in the page — a second spelling in a comment would satisfy the arm
# on its own, which is the trap that has bitten this repo before (s346).
eq "A1 the DB-backup restore control calls its endpoint" \
   "$($G -c 'backup-orchestrator/db-backups/\${b\.id}/restore' "$ORCH")" "1"
eq "A2 the volume-backup restore control calls its endpoint" \
   "$($G -c 'backup-orchestrator/volume-backups/\${b\.id}/restore' "$ORCH")" "1"
eq "A3 the DB-backup delete control calls its endpoint" \
   "$($G -c 'api\.delete(`/backup-orchestrator/db-backups/\${b\.id}`)' "$ORCH")" "1"

# A4: both ends. A caller pinned against a route that has been renamed is a pin
# that passes while the product 404s.
eq "A4 the three routes are still registered" \
   "$($G -cE '"/api/backup-orchestrator/(db-backups/\{id\}(/restore)?|volume-backups/\{id\}/restore)"' "$ROUTES")" "3"
eq "A4b the DELETE and the restore share the db-backups/{id} line" \
   "$($G -c 'db-backups/{id}".*delete(backup_orchestrator::delete_db_backup)' "$ROUTES")" "1"

# A5: a restore overwrites a live database or volume. The drill beside it restores
# into a scratch container, so these two must not be one press. Both tabs arm the
# same two-step state before they can fire.
eq "A5 both restore controls sit behind a two-step confirm" \
   "$($G -c 'setPendingRestoreId(b\.id)' "$ORCH")" "2"
eq "A5b the delete control has its own armed state, not the restore's" \
   "$($G -c 'setPendingDeleteId(b\.id)' "$ORCH")" "1"

# A6: ABSENCE arm with a positive control. There is no volume-backup DELETE
# endpoint, so the volume table must not grow a delete button that would 404.
VOL_DELETE=$($G -c 'volume-backups/\${b\.id}`' "$ORCH")
if [ "$VOL_DELETE" = "0" ]; then
  ok "A6 no volume-backup delete control (no such endpoint exists)"
else
  bad "A6 no volume-backup delete control" "found $VOL_DELETE — the endpoint does not exist, so this would 404"
fi
eq "A6-control the same pattern shape DOES match the db-backups delete" \
   "$($G -c 'db-backups/\${b\.id}`' "$ORCH")" "1"

# A7: the handlers stay ownership-scoped. Wiring a caller to a handler is what
# makes its guards reachable for the first time (#534), so the guards are pinned
# in the same suite as the callers.
# R7: the scope join moved from the deleted `sites s` table to `databases d`
# (d.user_id), with the sites table gone — same guard, new alias.
eq "A7 delete_db_backup is still owner-scoped" \
   "$(sed -n '/pub async fn delete_db_backup(/,/^}/p' "$BACKEND" | $G -c 'd\.user_id = \$1')" "1"
eq "A7b restore_db_backup is still owner-scoped" \
   "$(sed -n '/pub async fn restore_db_backup(/,/^}/p' "$BACKEND" | $G -c 'd\.user_id = \$1')" "1"
eq "A7c restore_volume_backup is still scoped to servers this operator runs" \
   "$(sed -n '/pub async fn restore_volume_backup(/,/^}/p' "$BACKEND" | $G -c "u\.role = 'admin'")" "1"

echo "── B. Agent-token rotation is reachable ───────────────────────────────"

eq "B1 the Servers page calls the token-rotation endpoint" \
   "$($G -c 'api\.post(`/servers/\${id}/rotate-token`)' "$SERVERS")" "1"
eq "B2 the route is still registered" \
   "$($G -c '"/api/servers/{id}/rotate-token"' "$ROUTES")" "1"
eq "B3 it sits behind its own confirm, not the TLS pin's" \
   "$($G -c 'setPendingTokenRotate({ id: s\.id, name: s\.name })' "$SERVERS")" "1"
# B4: the two rotations are different controls with different consequences. If a
# future edit collapses them onto one state, this goes red.
eq "B4 the TLS-pin rotation still has its own separate state" \
   "$($G -c 'setPendingRotate({ id: s\.id, name: s\.name })' "$SERVERS")" "1"

echo "── C. The withdrawn claims are withdrawn on EVERY surface ─────────────"

# The register exists because a claim removed from one surface survives on the
# others. So each arm below is a whole-surface absence with a positive control
# from the same command, in the same run.
AUTOSCALE_README=$($G -ci 'auto-scaling\|autoscal' README.md)
eq "C1 README no longer advertises horizontal auto-scaling" "$AUTOSCALE_README" "0"
README_CTL=$($G -ci 'docker' README.md)  # R8: README no longer names WHMCS (docs worker, R8) — control re-derived to a claim README still makes
[ "$README_CTL" -gt 0 ] && ok "C1-control the same command finds a claim that IS still made ($README_CTL)" \
  || bad "C1-control" "found 0 Docker lines in README.md — C1 examined nothing"

# FEATURES.md keeps the words inside the Withdrawn Claims table on purpose. The
# arm therefore measures the CAPABILITY tables only: everything above the
# register's heading.
# R8 TOMBSTONE (C2/C2-control): FEATURES.md deleted wholesale — there is no
# capability table above a register to measure. Absence of the file is the
# withdrawal; the tombstone above asserts it.
ok "TOMBSTONE (R8): C2/C2-control retired with FEATURES.md — no capability table remains to claim auto-scaling"

# Scoped to the register the same way C2 is scoped to everything above it — the
# tunnel row also exists as a (corrected) capability row, so an unscoped count
# reads 3 and would go green for the wrong reason if a register row were deleted.
# R8 TOMBSTONE (C3): the Withdrawn Claims register retired with FEATURES.md.
ok "TOMBSTONE (R8): C3 retired with FEATURES.md — the register itself is gone, which subsumes its two rows"

# C4: the tunnel row above the register must describe only the half that works.
# R8 TOMBSTONE (C4): the tunnel capability row retired with FEATURES.md.
ok "TOMBSTONE (R8): C4 retired with FEATURES.md — no tunnel capability row remains to claim token-based config"

echo "── D. The background-services table cannot drift again ────────────────"

# #526: a warning is not a mechanism. docs-claims derives the COUNT and checks it
# against README only, so FEATURES.md's own table drifted to 12 rows against 15
# supervised services with nothing able to see it. This recomputes the row count.
SUPERVISED=$($G -cE '^ *spawn_supervised\("' "$MAIN")
# R8 TOMBSTONE (D1/D2): the Background Services table retired with FEATURES.md.
# D0 above still derives the supervised-service count from main.rs — the
# derivation survives; only the table it was checked against is gone.
ok "TOMBSTONE (R8): D1/D2 retired with FEATURES.md — no services table remains to drift against the supervised count"

echo "── E. The SITE restore is armed too (s378) — RETIRED ─────────────────"

# A5 above pins "a restore overwrites a live database or volume… these two must
# not be one press" for the orchestrator's two controls. The site restore was
# the widest of the family — `docs/guides/backups.md` said it drops and
# recreates every database's tables over the live one, with no automatic safety
# net — and it was the only one of the seven that fired on a single click.
# R8 follow-up TOMBSTONE: the site restore retired with Backups.tsx (page
# deleted; its restore endpoint died in R3; the guide was rewritten in R8 and
# no longer describes a site restore). E1–E3 have no subject. If a site
# restore ever returns, §E must return with it.
SITE=panel/frontend/src/pages/Backups.tsx

if [ -f "$SITE" ]; then
  bad "TOMBSTONE (R8 follow-up): Backups.tsx is back — §E's armed site-restore arms must be restored with it" ""
else
  ok "TOMBSTONE (R8 follow-up): Backups.tsx is gone — the site restore retired with the page; §E's arms retired with it"
fi

echo
echo "PASS $PASS  FAIL $FAIL"
[ "$FAIL" -eq 0 ]
