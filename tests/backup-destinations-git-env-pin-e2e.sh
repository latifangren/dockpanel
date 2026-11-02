#!/usr/bin/env bash
#
# Regression pins for s288 — issues #93 and #94, two reports of the same shape:
# a feature whose halves were each present and were not connected to each other.
#
#   #94  The panel sent the container environment under the key "env_vars".
#        The agent's DeployRequest declared that field as `env` with a bare
#        #[serde(default)], so the unrecognised key was dropped and the
#        recognised one defaulted to empty. Every git deploy — Dockerfile and
#        Nixpacks, first deploy and redeploy, rollback and PR preview — started
#        its container with no environment, and every layer reported success.
#        A fifth call site, auto-rollback, sent no environment under either
#        spelling AND no memory_mb/cpu_percent, so a crashed container came back
#        both unconfigured and unbounded.
#
#   #93  The S3/SFTP destination form was written in Settings, then switched off
#        behind `{false && (` by the commit that moved the Destinations tab to
#        Backup Manager — which carried across the list and the Test button and
#        left create, update and delete with no caller anywhere in the panel.
#        The empty state went on telling operators to "add one via Settings".
#        Underneath, two of the three places that hand a destination to the
#        agent posted the stored CIPHERTEXT as the credential, while the third —
#        Test Connection — decrypted, so a destination verified green and then
#        failed every real upload. And the per-site schedule's destination check
#        inner-joined on a column that is NULL on every destination the panel
#        creates, so it answered 403 for all of them.
#
# ⚠ EVERY CHECK BELOW STRIPS COMMENTS FIRST. The code these pins inspect
# explains these defects in its own comments, naming the very strings under
# test — "env_vars", `{false && (`, "via Settings". A raw-source grep would
# match the prose that documents the trap and pass while the code re-broke.
# See feedback_source_pin_prose_trap and lesson #110f.
#
# Pure source analysis: no box, no network, no build.

# R5 (2026-11-02): §1-§4 pinned the git-deploy request body (git_deploys.rs);
# removed with the feature. This file now pins only the backup-destination half (§5-§10).
set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0
FAIL=0
ok()  { PASS=$((PASS+1)); printf '  \033[0;32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[0;31m✗\033[0m %s\n' "$1"; }

BD_RS=panel/backend/src/routes/backup_destinations.rs
BSCHED_RS=panel/backend/src/services/backup_scheduler.rs
BPOL_RS=panel/backend/src/services/backup_policy_executor.rs
BSCHEDR_RS=panel/backend/src/routes/backup_schedules.rs
ORCH_TSX=panel/frontend/src/pages/BackupOrchestrator.tsx
SETTINGS_TSX=panel/frontend/src/pages/Settings.tsx
BACKUPS_TSX=panel/frontend/src/pages/Backups.tsx

# R8: BSCHED_RS (services/backup_scheduler.rs) removed — deleted in R3;
# its destination-posting role moved to the policy executor (BPOL_RS).
# R8 follow-up: BACKUPS_TSX removed — Backups.tsx deleted with its page; its
# §8 arm retired with it (tombstone in §8 below).
for f in "$BD_RS" "$BPOL_RS" "$BSCHEDR_RS" \
         "$ORCH_TSX" "$SETTINGS_TSX"; do
  [ -f "$f" ] || { echo "missing file: $f"; exit 1; }
done

# Strip whole-line `//` comments FIRST, then block comments — that order matters
# and the reverse is a live hazard. The sibling suites do it the other way, and a
# doc comment containing `/*` (a path glob such as the agent's backups route with
# a wildcard, which this file's own subject matter has) reads as a block-comment
# opener: the scanner then swallows every remaining line, and each later check
# inspects an empty stream and PASSES for having found nothing wrong. That is the
# failure direction a pin must never have (lesson #100). Stripping line comments
# first means a glob inside one is gone before anything looks for an opener.
#
# `//` is only stripped at the start of a (trimmed) line: stripping it mid-line
# would blank the inside of every string containing a URL.
#
# `#[cfg(test)]` modules are dropped too. Several arms below COUNT call sites,
# and a unit test that exercises the very function being counted would inflate
# the total and fail an arm whose subject is correct. That is not hypothetical:
# it cost the previous release's suite two false failures (#94c).
code_of() {
  awk '{ t=$0; sub(/^[ \t]+/,"",t); if (t !~ /^\/\//) print }' "$1" \
    | sed 's:/\*.*\*/::g' \
    | awk '
        /\/\*/ { inblk=1 }
        !inblk { print }
        /\*\// { inblk=0 }
      ' \
    | awk '/^#\[cfg\(test\)\]/ { intest=1 } !intest { print }'
}

# Guard the guard: if stripping ever eats most of a file again, say so loudly
# rather than let the checks below pass on an empty stream.
assert_readable() {
  local raw stripped
  raw=$(wc -l < "$1")
  stripped=$(code_of "$1" | grep -c . || true)
  if [ "$raw" -gt 40 ] && [ "$stripped" -lt $((raw / 4)) ]; then
    bad "comment stripping consumed $1 ($stripped of $raw lines survive) — every check against it would pass vacuously"
    return 1
  fi
  return 0
}

# grep -c, never grep -q: under pipefail a `grep -q` match SIGPIPEs its producer
# and the pipeline reports FAILURE for a SUCCESSFUL match (#103d).
has()    { [ "$(code_of "$1" | grep -cF -- "$2")" -gt 0 ]; }
hasre()  { [ "$(code_of "$1" | grep -cE -- "$2")" -gt 0 ]; }
countre(){ code_of "$1" | grep -cE -- "$2" || true; }
countf() { code_of "$1" | grep -cF -- "$2" || true; }

echo "§0 the source these pins read survives comment stripping"
STRIP_OK=0
for f in "$BD_RS" "$BPOL_RS" "$BSCHEDR_RS" \
         "$ORCH_TSX" "$SETTINGS_TSX"; do
  assert_readable "$f" && STRIP_OK=$((STRIP_OK+1))
done
if [ "$STRIP_OK" -eq 5 ]; then
  ok "all 5 inspected files survive stripping"
fi

echo
echo "§5 the destination the agent is given has been decrypted (#93, the silent half)"

# Discovery: every site that posts a destination to the agent, versus the one
# helper that decrypts. These must be the same set.
# R8: the scheduler count is gone with the scheduler; the executor is the
# only remaining poster besides the helper's own file (measured 3 + 1 = 4).
# R8: summed in shell arithmetic — `bc` is not installed on the VM runner,
# and the count is two numbers, not a pipeline that needs it.
DECRYPT_CALLERS=$(( $(countre "$BD_RS" 'agent_destination_payload\(') + $(countre "$BPOL_RS" 'agent_destination_payload\(') ))

if [ "$DECRYPT_CALLERS" -ge 3 ]; then
  ok "$DECRYPT_CALLERS call sites route through agent_destination_payload"
else
  bad "only $DECRYPT_CALLERS uses of agent_destination_payload — the policy executor must go through it, or it posts ciphertext as the credential while Test Connection reports success"
fi

for f in "$BPOL_RS"; do
  if hasre "$f" 'insert\("type"\.to_string\(\)'; then
    bad "$(basename "$f") folds \"type\" into a destination payload by hand — that is the hand-rolled path that skipped the decrypt"
  else
    ok "$(basename "$f") does not hand-roll a destination payload"
  fi
done

if hasre "$BD_RS" 'pub fn agent_destination_payload' && hasre "$BD_RS" 'decrypt_config_secrets\(config\)'; then
  ok "the shared helper is the thing that decrypts"
else
  bad "agent_destination_payload is missing or no longer decrypts"
fi

echo
echo "§6 a destination can be attached to a per-site schedule (#93, the 403)"

if hasre "$BSCHEDR_RS" 'JOIN backup_destinations|bd JOIN servers'; then
  bad "the destination check still INNER JOINs servers on bd.server_id — that column is NULL on every destination the panel creates, so this answers 403 for all of them"
else
  ok "the destination check no longer inner-joins on a column that is always NULL"
fi

# s351 repointed this arm rather than relaxing it. The rule moved into a shared
# constant next to the route that LISTS the same set, because the writer admitted
# unscoped destinations while the only reader was administrator-only, so a site
# owner was granted a choice nothing could show them. The arm follows the code
# (lesson #150) and keeps asking the same question of it; that the writer still
# REACHES the constant is asserted next door, in client-surface-gating.
DEST_RS=panel/backend/src/routes/backup_destinations.rs
if hasre "$DEST_RS" 'DESTINATION_CALLER_PREDICATE.*bd\.server_id IS NULL'; then
  ok "an unscoped (shared) destination is accepted"
else
  bad "the check does not accept a NULL server_id — destinations created through the API have no server"
fi

echo
echo "§7 the three mutating endpoints have a caller in the panel (#93)"

# Discovery: the routes as registered, then whether the frontend calls each.
for verb in post put delete; do
  case $verb in
    post)   pat='api\.post\("/backup-destinations"' ; label="create" ;;
    put)    pat='api\.put\(`/backup-destinations/' ; label="update" ;;
    delete) pat='api\.delete<[^>]*>\(`/backup-destinations/|api\.delete\(`/backup-destinations/' ; label="delete" ;;
  esac
  if hasre "$ORCH_TSX" "$pat"; then
    ok "Backup Manager calls $label"
  else
    bad "no caller for $label — the endpoint is registered and unreachable, which is #93"
  fi
done

if hasre "$ORCH_TSX" 'Add Destination'; then
  ok "the Destinations tab offers an Add control"
else
  bad "the Destinations tab has no Add control"
fi

echo
echo "§8 nothing points the operator at a screen that no longer has the control (#93)"

DEST_CALLS_IN_SETTINGS=$(countf "$SETTINGS_TSX" '/backup-destinations')
if [ "$DEST_CALLS_IN_SETTINGS" -eq 0 ]; then
  ok "Settings makes no backup-destination calls"
else
  bad "Settings still has $DEST_CALLS_IN_SETTINGS backup-destination call(s) — the split ownership that produced #93"
fi

if hasre "$SETTINGS_TSX" '\{false && \('; then
  bad "Settings has a {false && (...)} block — a feature switched off in place is a feature nobody can find and nobody deletes"
else
  ok "Settings has no disabled-in-place block"
fi

for f in "$ORCH_TSX" "$SETTINGS_TSX"; do
  if hasre "$f" '(via|in) \*{0,2}Settings'; then
    bad "$(basename "$f") still sends the operator to Settings for a destination"
  else
    ok "$(basename "$f") does not send the operator to Settings for a destination"
  fi
done

# R8 follow-up TOMBSTONE: the third file in the loop above was Backups.tsx —
# its empty state was the remaining "via Settings" pointer. The page is gone;
# if it returns, its arm must return with it.
if [ -f "$BACKUPS_TSX" ]; then
  bad "TOMBSTONE (R8 follow-up): Backups.tsx is back — its §8 'via Settings' arm must be restored"
else
  ok "TOMBSTONE (R8 follow-up): Backups.tsx is gone — its §8 arm retired with the page"
fi

echo
echo "§9 the deep link the guidance layer already used actually lands (#93)"

PREREQ_RS=panel/backend/src/services/prerequisites/backups.rs
if hasre "$PREREQ_RS" 'backup-orchestrator\?tab=destinations'; then
  ok "the prerequisite remediation links to the destinations tab"
else
  bad "the prerequisite no longer links to the destinations tab"
fi

if hasre "$ORCH_TSX" 'function tabFromSearch' && hasre "$ORCH_TSX" 'URLSearchParams'; then
  ok "the page reads ?tab= — the remediation link lands where it says"
else
  bad "BackupOrchestrator ignores ?tab=, so every link the panel already emits opens Overview instead"
fi

echo
echo "§10 a vault read derives its key — the raw JWT secret is not the vault key (s306)"

# Same shape as #94 at the top of this file, one layer down: the git deploy's
# environment was assembled correctly and never arrived, because the only reader
# of auto-inject secrets unlocked them with the wrong key material. AES-GCM
# authenticates, so a wrong key cannot yield garbage — it yields an Err, which a
# bare `if let Ok` discarded, leaving the agent call and the only log line inside
# an `if !env_pairs.is_empty()` that could not be entered.
#
# THE SUBJECTS ARE DERIVED, NOT LISTED. `secrets_crypto` exposes two families:
# the vault pair `encrypt`/`decrypt`, whose key is `secrets::get_encryption_key`,
# and the `*_credential*` family, whose key IS the JWT secret. Only the first is
# in scope. A hardcoded list of its call sites is precisely the arm that cannot
# see the next one (lesson #182) — this defect sat in a file such a list would
# never have named.
#
# s358 SPLIT THE READ PATH, so this section's subject moved (lesson #150) and
# the shape it used to require of a reader is now itself the defect. A vault
# READ goes through `secrets_crypto::decrypt_vault`, which tries every key
# source a value could have been written under. Deriving ONE source with
# `get_encryption_key` and handing it to the low-level `decrypt` is exactly what
# made adding `SECRETS_ENCRYPTION_KEY` strand every vault secret on an install
# that already held data — so writers must still derive, and readers must not.
VAULT_CALL='secrets_crypto::(encrypt|decrypt)\('
VAULT_SURFACE='secrets_crypto::(encrypt|decrypt|decrypt_vault)\('
VAULT_FILES=()
while IFS= read -r f; do
  [ -n "$f" ] && VAULT_FILES+=("$f")
done < <(grep -rlE "$VAULT_SURFACE" panel/backend/src --include=*.rs 2>/dev/null | sort)

# R8: floor 3 -> 1. Measured surface is exactly {secrets.rs}: the vault-crypto
# callers in deploy.rs/git_deploys died with those features, and
# secrets_crypto.rs calls decrypt_vault unqualified (never matching this
# qualified grep). 1 is the true population; 0 still means the grep broke.
if [ "${#VAULT_FILES[@]}" -lt 1 ]; then
  bad "enumerated only ${#VAULT_FILES[@]} files on the vault surface — implausible, so every arm below would pass having examined nothing"
else
  ok "enumerated ${#VAULT_FILES[@]} files on the vault surface"

  for f in "${VAULT_FILES[@]}"; do
    writes=$(countre "$f" 'secrets_crypto::encrypt\(')
    if [ "$writes" -gt 0 ]; then
      if [ "$(countre "$f" 'get_encryption_key')" -gt 0 ]; then
        ok "$(basename "$f") derives the vault key before writing"
      else
        bad "$(basename "$f") writes with the vault cipher without ever deriving the key — its values are unreadable by every other caller"
      fi
    else
      ok "$(basename "$f") does not write to the vault, so it owes no derivation"
    fi
  done

  # THE NEW INVARIANT, as an absence over the whole backend: outside the crypto
  # module itself, nothing may call the SINGLE-SOURCE `decrypt`. That call
  # cannot see a value written under a different key source, which is the
  # one-way door this section now exists to keep shut.
  SINGLE_SOURCE_READ='secrets_crypto::decrypt\('
  SS_HITS=0
  for f in "${VAULT_FILES[@]}"; do
    case "$f" in *services/secrets_crypto.rs) continue ;; esac
    n=$(countre "$f" "$SINGLE_SOURCE_READ")
    if [ "$n" -gt 0 ]; then
      SS_HITS=$((SS_HITS + n))
      bad "$(basename "$f") reads the vault with the single-source cipher — a value written under any other key source is invisible to it"
    fi
  done
  # POSITIVE CONTROL for the absence above: the same matcher, same corpus, must
  # still find the multi-source read. Otherwise "found no violations" and "the
  # grep never ran" are the same output (lesson #480).
  MS_HITS=0
  for f in "${VAULT_FILES[@]}"; do
    MS_HITS=$((MS_HITS + $(countre "$f" 'secrets_crypto::decrypt_vault\(')))
  done
  if [ "$MS_HITS" -lt 1 ]; then
    bad "control failed: found 0 multi-source vault reads, so the absence arm above proves nothing"
  else
    ok "control: $MS_HITS multi-source vault read(s) found, so the matcher works"
  fi
  if [ "$SS_HITS" -eq 0 ]; then
    ok "no caller outside secrets_crypto reads the vault single-source"
  fi
fi

# The defect itself, as a negative over the whole backend rather than over the
# enumeration above: the vault cipher may never be handed a JWT secret. This is
# the arm that would have been red for the four and a half months the feature
# was advertised and inert.
JWT_AS_VAULT_KEY='secrets_crypto::(encrypt|decrypt)\([^;]*,[[:space:]]*&?[A-Za-z_.]*jwt_secret'
JWT_KEYED=0
for f in $(grep -rlE "$VAULT_CALL" panel/backend/src --include=*.rs 2>/dev/null); do
  n=$(countre "$f" "$JWT_AS_VAULT_KEY")
  if [ "$n" -gt 0 ]; then
    JWT_KEYED=$((JWT_KEYED + n))
    bad "$(basename "$f") unlocks the vault with the JWT secret instead of the derived key"
  fi
done
if [ "$JWT_KEYED" -eq 0 ]; then
  ok "no vault read or write is keyed on the JWT secret"
fi

# The working sibling is the reason this is a correctness bug and not a design
# question: the manual Inject button runs the same query against the same rows
# and PUTs the same body to the same agent route. If it ever stops doing so, the
# arm above loses the reference implementation it is measured against.
# R8 TOMBSTONE: the auto-inject sibling is deleted. routes/deploy.rs went
# in R3 and the /nginx/env/ push went with it (0 occurrences repo-wide);
# secrets.rs keeps the vault CRUD but pushes nothing to any agent. If either
# returns, the sibling arms above must be restored with it.
SECRETS_RS=panel/backend/src/routes/secrets.rs
DEPLOY_RS=panel/backend/src/routes/deploy.rs
if [ -f "$DEPLOY_RS" ]; then
  bad "TOMBSTONE (R8): routes/deploy.rs is back — its auto-inject sibling arms must be restored"
else
  ok "TOMBSTONE (R8): routes/deploy.rs is gone — the auto-inject push retired with it"
fi
if [ "$(countre "$SECRETS_RS" '/nginx/env/')" -gt 0 ]; then
  bad "TOMBSTONE (R8): secrets.rs pushes to /nginx/env/ again with no deploy path behind it — re-scope §10"
else
  ok "TOMBSTONE (R8): secrets.rs pushes no auto-inject payload to any agent route — the sibling is retired, not silently broken"
fi

# A skipped secret must be sayable, and the arm has to be keyed on THIS path's
# own diagnostics: `deploy.rs` is a large file with warnings all over it, so an
# arm asking only whether the file can warn at all is green on the broken tree
# too — it would have passed for the whole time the feature was dead. The
# `Auto-inject:` prefix belongs to this block alone; the success line reads
# `Auto-injected`, so it cannot satisfy this on its own.
# R8 TOMBSTONE: the "Auto-inject:" diagnostics belonged to deploy.rs's
# auto-inject block, deleted with it in R3.
if [ -f "$DEPLOY_RS" ]; then
  bad "TOMBSTONE (R8): routes/deploy.rs is back — its decrypt-failure diagnostics must be restored"
else
  ok "TOMBSTONE (R8): deploy.rs is gone — its auto-inject diagnostics retired with it"
fi

echo
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
