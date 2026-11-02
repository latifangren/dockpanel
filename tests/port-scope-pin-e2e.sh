#!/usr/bin/env bash
# Regression pins for the s375 ship — a port allocator and the unique index
# behind it disagreed about what a port is unique WITHIN.
#
# `20260319000000_multi_server.sql` un-globalised five columns under the header
# "domain should be unique per server, not globally", including
# `git_deploys.host_port`. The NEXT migration re-introduced the global shape on
# two neighbouring columns, against allocators that were already server-scoped:
#
#   * `git_previews.host_port` — the allocator scopes through a JOIN and picks
#     the first free port in 8000-8999, so on a fleet the second server's used
#     set is empty, it picks 8000, and the INSERT collides with the first
#     server's row. The rejection was logged at warn and stepped over, and the
#     deploy ran anyway: container, port, vhost and certificate created with NO
#     ROW, and every consumer of a preview is row-driven.
#   * `sites.proxy_port` — same first-fit collision from `generate_series(5000,
#     5999)`, reported to the operator as CONFLICT "Domain already exists".
#
# The invariant these arms pin is NOT "a port index must name server_id".
# `databases.port` is globally unique and globally allocated, and that is
# correct — the table has no `server_id` to scope by. The invariant is that the
# INDEX and its ALLOCATOR agree, which is the thing that was false and which no
# textual arm elsewhere in the suite family could see: every line involved was
# correct on its own, in two files that never mention each other.
#
# §A derives its population from the migrations rather than listing it, because
# the list of port columns IS the thing that goes stale (lesson #551).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

PASS=0; FAIL=0
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '\033[31m✗\033[0m %s — %s\n' "$1" "$2"; FAIL=$((FAIL+1)); }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "expected '$3', got '$2'"; }

# ugrep's --ignore-files shim honours .gitignore, so every count below uses the
# real binary explicitly (dockpanel-ops-p2, s357).
G=/usr/bin/grep

MIG=panel/backend/migrations
DB=panel/backend/src/routes/databases.rs

for f in "$DB"; do
  [ -f "$f" ] || { bad "SETUP" "$f missing"; exit 1; }
done
[ -d "$MIG" ] || { bad "SETUP" "$MIG missing"; exit 1; }

WORK=$(mktemp -d) || exit 1
trap 'rm -rf "$WORK"' EXIT

# An arm that measures an empty subject prints green for every absence below, so
# every subject is asserted before it is measured (lesson #143).
echo "── A. The effective port-bearing unique indexes, DERIVED from the migrations ─"

# SQL statements span lines, so a line-based grep cannot see a CREATE and its
# column list together. Comments are stripped BEFORE the join, or a single `--`
# would swallow the rest of the file and shrink the census silently.
for f in $(ls "$MIG"/*.sql | sort); do
  sed 's/--.*$//' "$f" | tr '\n' ' ' | sed 's/;/;\n/g'
done > "$WORK/stmts.txt"

$G -oiE 'CREATE +UNIQUE +INDEX +(IF +NOT +EXISTS +)?[A-Za-z0-9_]+ +ON +[A-Za-z0-9_]+ *\([^)]*\)' \
  "$WORK/stmts.txt" > "$WORK/creates.txt"
$G -oiE 'DROP +INDEX +(IF +EXISTS +)?[A-Za-z0-9_]+' "$WORK/stmts.txt" \
  | $G -oE '[A-Za-z0-9_]+$' | sort -u > "$WORK/drops.txt"

# A0c/A0d: the parse itself. A malformed regex writes to stderr and returns
# nothing, and "no violations" is indistinguishable from "the grep never ran"
# (lesson #480). Both floors are controls, not assertions about the product.
NCREATE=$($G -c '' "$WORK/creates.txt")
NDROP=$($G -c '' "$WORK/drops.txt")
[ "$NCREATE" -ge 15 ] && ok "A0c migration parse is live — $NCREATE CREATE UNIQUE INDEX statements read" \
  || bad "A0c migration parse is live" "only $NCREATE parsed — the extraction failed, every arm in §A examined nothing"
[ "$NDROP" -ge 8 ] && ok "A0d DROP INDEX parse is live — $NDROP names read" \
  || bad "A0d DROP INDEX parse is live" "only $NDROP parsed"

# The surviving set: created and not later dropped. Every drop in this tree
# names an index that is not re-created under the same name, so a set difference
# is exact; if that ever stops being true A1 goes red on a name it cannot
# resolve, which is the loud direction.
: > "$WORK/live.txt"
while IFS= read -r st; do
  name=$(printf '%s' "$st" | $G -oiE 'INDEX +(IF +NOT +EXISTS +)?[A-Za-z0-9_]+' | $G -oE '[A-Za-z0-9_]+$')
  [ -n "$name" ] || continue
  $G -qxF "$name" "$WORK/drops.txt" && continue
  tbl=$(printf '%s' "$st" | sed -E 's/.*[Oo][Nn] +([A-Za-z0-9_]+) *\(.*/\1/')
  cols=$(printf '%s' "$st" | sed -E 's/.*\(([^)]*)\).*/\1/' | tr -d ' ')
  printf '%s\t%s\t%s\n' "$name" "$tbl" "$cols" >> "$WORK/live.txt"
done < "$WORK/creates.txt"
sort -u "$WORK/live.txt" -o "$WORK/live.txt"

# Port-bearing members only. `_port` and bare `port` both, because the three
# real columns are `host_port`, `proxy_port` and `port`.
awk -F'\t' '$3 ~ /(^|,)[a-z_]*port(,|$)/ {print}' "$WORK/live.txt" > "$WORK/portidx.txt"
NPORT=$($G -c '' "$WORK/portidx.txt")

# A1-control (positive): the derivation finds the index that has been correct
# since 2026-03-19. If this is absent the filter is wrong, not the tree.
$G -qF 'idx_git_deploys_host_port_server' "$WORK/portidx.txt" \
  && ok "A1-control the derivation finds the sibling that was scoped correctly in 2026-03" \
  || bad "A1-control" "idx_git_deploys_host_port_server is not in the derived set — the filter is broken, not the tree"

# A1-control-neg (negative), re-derived in R7: the global preview index's
# DROP lived in `20260320200000_port_constraints.sql`, deleted with the
# hosting schema — and the index itself dies with the `git_previews`
# table, dropped by the terminal migration. Asserting all three
# directions: creating file gone, table dropped, index not live.
if [ ! -e "$MIG/20260320200000_port_constraints.sql" ] \
   && $G -qF 'DROP TABLE IF EXISTS git_previews;' "$MIG/20260909000001_drop_hosting_schema.sql" \
   && ! $G -qE '^idx_git_previews_host_port\b' "$WORK/portidx.txt"; then
  ok "A1-control-neg the global preview index is gone with its table (creating migration deleted, git_previews dropped by the terminal migration, index not live)"
else
  bad "A1-control-neg" "idx_git_previews_host_port is still live, its creating migration survives, or git_previews is not dropped by the terminal migration"
fi

# A1: THE INVARIANT. For every live port-bearing unique index, the index's scope
# and its allocator's scope must be the same. A table with no `server_id` cannot
# be scoped and its allocator must therefore be global too — that is `databases`,
# and it is correct, which is why this arm is not "must contain server_id".
VIOL=""; AGREE=0
while IFS=$'\t' read -r name tbl cols; do
  case ",$cols," in *,server_id,*) idx_scoped=1 ;; *) idx_scoped=0 ;; esac
  # R5: the git_deploys/git_previews/sites allocators were removed with their
  # features; their indexes stay live in the migrations until R7 drops the
  # tables. Only databases still has a live allocator to agree with.
  case "$tbl" in git_previews|git_deploys|sites) continue ;; esac
  # Each branch locates the allocator's BASE query first and only then asks
  # whether it carries a server predicate. A pattern that silently stops
  # matching therefore reports `unmapped` — red — instead of reporting "global",
  # which is a real answer and would be the reassuring direction.
  case "$tbl" in
    # Deliberately global, and correct: `databases` has no server_id column to
    # scope by, so a global index is the only shape its allocator can match.
    databases)     A=$DB; base='SELECT port FROM databases WHERE port IS NOT NULL'
                          scoped='FROM databases WHERE port IS NOT NULL AND server_id' ;;
    # A port index on a table this arm has never been taught about. Red on
    # purpose: whoever adds it must map its allocator here, which is exactly the
    # step that was skipped on 2026-03-20.
    *)             A=''; base=''; scoped='' ;;
  esac
  if [ -z "$A" ]; then
    alloc_scoped=unmapped
  elif ! $G -qE "$base" "$A"; then
    alloc_scoped=unmapped
  elif $G -qE "$scoped" "$A"; then
    alloc_scoped=1
  else
    alloc_scoped=0
  fi
  # Accumulated into ONE assertion rather than emitted per index. `docs-claims`
  # §3 re-runs every suite and compares its live tally to the number published in
  # four places, so a per-member arm would move the published count every time
  # the tree gains a port index — a false red on an unrelated change (#529).
  if [ "$alloc_scoped" = unmapped ]; then
    VIOL="$VIOL
    $name ($tbl.$cols): no allocator mapped — add it to this arm and state whether it is server-scoped"
  elif [ "$alloc_scoped" != "$idx_scoped" ]; then
    if [ "$idx_scoped" = 0 ]; then
      VIOL="$VIOL
    $name ($tbl.$cols): allocator is server-scoped, index is GLOBAL — every server after the first picks the bottom of the range for ever and its INSERT is rejected"
    else
      VIOL="$VIOL
    $name ($tbl.$cols): index is server-scoped, allocator is GLOBAL — the allocator lost its predicate"
    fi
  else
    AGREE=$((AGREE + 1))
  fi
done < "$WORK/portidx.txt"

if [ -z "$VIOL" ]; then
  ok "A1 all $AGREE port indexes agree with their allocator about what a port is unique within"
else
  bad "A1 a port index and its allocator disagree" "$VIOL"
fi

# R7 re-derivation: the port-index population is 2, not 4. The git_previews
# and sites CREATEs died with their migration files (and their tables with
# the terminal migration); the surviving members are exactly the two the
# derivation still finds — databases (global, correct) and git_deploys'
# server-scoped host_port index (whose CREATE survives in multi_server.sql).
[ "$NPORT" -ge 2 ] && ok "A2 the port-index population is $NPORT — both surviving port-bearing tables reached (databases, git_deploys)" \
  || bad "A2 the port-index population" "only $NPORT derived — expected at least 2 (databases, git_deploys)"

# R5: MIGF was defined in §B (deleted with the git-preview arms); the §D arms
# below still read the scoping migration, which stays until R7.
# R7: the scoping migration is deleted with the hosting schema and the
# `sites` table is dropped by the terminal migration, so §D's property
# (a server-scoped site proxy_port index) retires with both. Tombstones
# assert the file is gone, the table is dropped, and no site port index
# survives in the derived live set.
MIGF="$MIG/20260818000000_port_uniqueness_server_scope.sql"

echo "── D. sites.proxy_port — the collision the operator was told was a domain ──"

if [ -e "$MIGF" ]; then
  bad "D1 TOMBSTONE (R7): the site port-scoping migration is back — the §D arms below must be restored, not assumed" "file exists again"
elif ! $G -qF 'DROP TABLE IF EXISTS sites;' "$MIG/20260909000001_drop_hosting_schema.sql"; then
  bad "D1 TOMBSTONE (R7): the sites table is not dropped by the terminal migration — the proxy_port index may still reject" "no DROP TABLE sites in terminal migration"
elif $G -qE 'idx_sites_proxy_port' "$WORK/portidx.txt"; then
  bad "D1 TOMBSTONE (R7): a site proxy_port index is still live in the derived set" "index survives"
else
  ok "D1 TOMBSTONE (R7): the site proxy_port index is gone with the sites table (scoping migration deleted, table dropped, no site port index live)"
fi
if [ -e "$MIGF" ]; then
  bad "D1b TOMBSTONE (R7): the scoping migration survives — its partial predicate cannot be asserted from a deleted file" "file exists again"
else
  ok "D1b TOMBSTONE (R7): the partial predicate died with its migration file — no NULL-proxying site can collide on a dropped table"
fi
if [ -e "$MIGF" ]; then
  bad "D1c TOMBSTONE (R7): the scoping migration survives — its DROP of the global index cannot be asserted from a deleted file" "file exists again"
else
  ok "D1c TOMBSTONE (R7): the global site port index died with its migration file and the sites table — both indexes are gone because the table is"
fi

echo "PASS $PASS / FAIL $FAIL"
[ "$FAIL" -eq 0 ]
