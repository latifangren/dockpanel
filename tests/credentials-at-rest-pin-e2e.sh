#!/usr/bin/env bash
# Regression pins for the s377 ship — the credential promise the project publishes.
#
# `SECURITY.md` and `README.md` both state, without qualification, that every
# stored credential is encrypted at rest with AES-256-GCM. Two columns were
# not: `git_deploys.github_token` and `servers.agent_token`
# — the last one named in cleartext by `auto_healer`'s own comment about what a
# panel database dump carries. The claim was false on the project's front page,
# and no test could see it, because nothing compared the published sentence with
# the columns.
#
# So this suite pins BOTH ENDS. §B–§C pin each column's writer and its single
# decrypting read site; §D pins the masks on the wire; §E pins the sentence
# against the code, so the promise cannot come back without the columns, and the
# columns cannot regress without the promise going red.
#
# The choke-point shape is the load-bearing one and it is deliberate: every read
# of these two credentials funnels through exactly one function
# (`helpers::cf_headers`, `git_deploys::set_github_status`,
# `AgentRegistry::for_server`), so no read site can forget to decrypt. Arms that
# count CALL sites rather than the helper's own name are used throughout —
# a name search is satisfied by the declaration itself, which is how a severed
# filter came back green at s376 (#592).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

PASS=0; FAIL=0
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '\033[31m✗\033[0m %s — %s\n' "$1" "$2"; FAIL=$((FAIL+1)); }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "expected '$3', got '$2'"; }

# ugrep's --ignore-files shim honours .gitignore, so every count below uses the
# real binary explicitly (dockpanel-ops-p2, s357).
G=/usr/bin/grep

SERVERS=panel/backend/src/routes/servers.rs
AGENT=panel/backend/src/services/agent.rs
HELPERS=panel/backend/src/helpers.rs
REENC=panel/backend/src/services/credential_reencrypt.rs
SETTINGS=panel/backend/src/routes/settings.rs
BACKUP_DEST=panel/backend/src/routes/backup_destinations.rs

for f in "$SERVERS" "$AGENT" "$HELPERS" "$REENC" "$SETTINGS" "$BACKUP_DEST" README.md SECURITY.md; do
  [ -f "$f" ] || { bad "SETUP" "$f missing"; exit 1; }
done

# An arm that measures an empty subject prints green for every absence below, so
# each subject is asserted before it is measured (lesson #143).
for pair in "$SERVERS:400" "$AGENT:1200"; do
  f=${pair%:*}; floor=${pair##*:}
  n=$($G -c '' "$f")
  [ "$n" -gt "$floor" ] && ok "S0 subject extracted — $f is $n lines" \
    || bad "S0 subject extracted" "$f is only $n lines (floor $floor) — arms over it examine nothing"
done

echo "── B. the shared decrypting choke point in helpers ──────────────────────"

# B0 (was A2c): the Cloudflare half in helpers still has its own choke point.
# Kept here after §A (cdn_zones) was removed in R2 — its subject is helpers.rs, not cdn.rs.
eq "B0 the Cloudflare choke point in helpers still decrypts" \
   "$($G -c 'decrypt_credential_from_env(token)' "$HELPERS")" "1"

echo "── C. servers.agent_token ──────────────────────────────────────────────"

eq "C1 the create writer binds the encrypted value" \
   "$($G -c '\.bind(&agent_token_enc)' "$SERVERS")" "1"
eq "C1b the rotation writer binds the encrypted value" \
   "$($G -c '\.bind(&new_token_enc)' "$SERVERS")" "1"
eq "C1c both ensure_local_server writers bind the encrypted value" \
   "$($G -c '\.bind(&agent_token_enc)' "$AGENT")" "2"

# C2: the ONLY consumer of the stored dial-out token. The inbound direction is
# authenticated by `agent_token_hash` and is untouched by this ship — asserted
# here so a future reader does not "helpfully" encrypt the hash too.
eq "C2 for_server decrypts before dialling" \
   "$($G -c 'decrypt_credential_or_legacy(' "$AGENT")" "1"
# TWO reads of the field since v2.145.0 — `for_server` opens a stored dial-out
# token, and the accessor hands the same key to the UNATTENDED renewal loops so
# they can open the Cloudflare token that issued a DNS-01 certificate. Both are
# struct-field reads, which is what this arm is about; an `std::env::var` here
# would be the second source of truth the field comment forbids.
eq "C2b the key is a struct field, not an environment read" \
   "$($G -c '&self\.jwt_secret' "$AGENT")" "2"
eq "C2b-env the key is never re-read from the environment in the agent registry" \
   "$($G -c 'env::var("JWT_SECRET")' "$AGENT")" "0"
eq "C2c the inbound path still authenticates on the HASH" \
   "$($G -c 'hash_agent_token' panel/backend/src/routes/agent_checkin.rs)" "1"

# C3: legacy tolerance is what makes this migration-free. `_or_legacy` returns a
# pre-encryption plaintext token unchanged, so an existing fleet keeps dialling.
# If this ever became the strict `decrypt_credential`, every fleet member
# enrolled before this release would stop being reachable.
eq "C3 the dial-out decrypt is the legacy-tolerant variant" \
   "$($G -c 'decrypt_credential_or_legacy(\s*$\|decrypt_credential_or_legacy(' "$AGENT")" "1"

# C4 / the shared premise. Two of the three choke points decrypt with
# `decrypt_credential_from_env`, which reads JWT_SECRET from the process
# environment, while every WRITER encrypts with `state.config.jwt_secret`. Those
# must be the same value or every read returns ciphertext where a credential
# belongs — silently, since the legacy fallback returns the input verbatim. They
# are the same by construction, and this arm is what keeps them so: `Config`
# takes the field straight from the variable and the process refuses to start
# without it. `cf_headers` has depended on this since before the ship; two more
# credentials depend on it now.
eq "C4 config.jwt_secret IS the JWT_SECRET environment variable" \
   "$($G -c 'let jwt_secret = std::env::var("JWT_SECRET").expect(' panel/backend/src/config.rs)" "1"

echo "── E. The published sentence and the columns are one edit ──────────────"

# E1: the claim. This is the arm that would have caught the original defect: the
# promise is unqualified on two surfaces, so every credential column must be in
# the sweep. It is pinned as a PRESENCE test on the sentence plus a membership
# test on the registry, because the two halves drifted apart silently for months.
eq "E1 README still publishes the at-rest claim" \
   "$($G -c 'Credentials are encrypted at rest with AES-256-GCM' README.md)" "1"
eq "E1b SECURITY.md still publishes it unqualified" \
   "$($G -c 'All stored credentials encrypted with AES-256-GCM' SECURITY.md)" "1"

# E2: the surviving column this ship added is in the sweep's own registry.
# (git_deploys.github_token left with the feature in R5.) A
# module named without its subject is the half-edit `subject_tokens_match_the_sweep`
# rejects in Rust; this is the source-level mirror, so the pair cannot be
# separated by an edit that never runs cargo test.
for sub in '("servers", "id", "agent_token")'; do
  # COUNT, never forbid: the file's own doc comment spells one of these
  # declarations in prose, so an absence test could not fail (s376 #386 family).
  n=$($G -cF "    $sub," "$REENC")
  eq "E2 the sweep re-keys $sub" "$n" "1"
done
eq "E2b each surviving column's module names it in COVERED_MODULES" \
   "$($G -cE '\("(servers|agent)", "servers\.agent_token"\),' "$REENC")" "2"

eq "E3 the writer census walks the crate root, not a directory list" \
   "$($G -c 'join("src");' "$REENC")" "1"
eq "E3b it descends" "$($G -c 'stack.push(path);' "$REENC")" "1"

echo "── F. The re-encryption sweep does not lose a race, or its own history ──"
#
# s428's first-ever audit of this sweep found a real lost-update race: every
# UPDATE below was keyed on id alone, no transaction/lock/CAS, so a normal
# write (a password reset, a token rotation, a settings save) landing between
# the sweep's SELECT and its UPDATE got silently reverted to the STALE value
# the sweep read — worst on `databases` (the panel's stored password stops
# matching the live DB) and `servers` (the panel loses its own dial-out token).
# It also found the vault arm bumping `secrets.version` on EVERY successful
# re-key with no paired `secret_versions` row — not race-dependent, deterministic
# on every non-racing run — desyncing the two the same way `routes::secrets`'
# real edit path never does.

eq "F1 reencrypt_column's UPDATE is CAS-guarded on the value it read" \
   "$($G -c 'WHERE {id_col}::text = \$2 AND {value_col} = \$3' "$REENC")" "1"
eq "F2 reencrypt_settings's UPDATE is CAS-guarded" \
   "$($G -c 'WHERE key = \$2 AND value = \$3' "$REENC")" "1"
eq "F3 reencrypt_destinations's UPDATE is CAS-guarded" \
   "$($G -c 'WHERE id::text = \$2 AND config = \$3' "$REENC")" "1"
eq "F4 reencrypt_vault_secrets's UPDATE is CAS-guarded" \
   "$($G -c 'WHERE id::text = \$2 AND encrypted_value = \$3' "$REENC")" "1"

# F5/F6: the guard is CHECKED, not merely present — a CAS clause nobody reads
# the result of protects nothing. Four sweep functions, four counts each.
eq "F5 every sweep function checks rows_affected before counting a rewrite" \
   "$($G -c 'rows_affected() > 0' "$REENC")" "4"
eq "F6 every sweep function counts a raced row instead of silently dropping it" \
   "$($G -cF 'report.raced += 1;' "$REENC")" "4"

VERSION_BUMP=$($G -cF 'version = version + 1' "$REENC")
if [ "$VERSION_BUMP" = "0" ]; then
  ok "F7 reencrypt_vault_secrets no longer bumps secrets.version on every re-key"
else
  bad "F7 reencrypt_vault_secrets no longer bumps secrets.version on every re-key" \
      "found $VERSION_BUMP occurrence(s) — re-keying desyncs version from secret_versions again"
fi

echo "── G. The two duplicated, unenforced secret-key lists ───────────────────"
#
# Both currently matched their source of truth, but neither had a test tying
# them together — the exact severed-pair shape this file's own header says the
# module-level COVERED_MODULES registry already got burned by once, unfixed
# one layer down. `DESTINATION_SECRET_KEYS` is now a direct import (single
# source of truth, nothing left to drift); `SENSITIVE_SETTINGS_SQL`'s literal
# stays hand-copied (it's SQL text, not Rust) but is now pinned by a test.

eq "G1 DESTINATION_SECRET_KEYS imports backup_destinations::CONFIG_SENSITIVE_KEYS directly" \
   "$($G -cF 'use crate::routes::backup_destinations::CONFIG_SENSITIVE_KEYS as DESTINATION_SECRET_KEYS;' "$REENC")" "1"
DUP=$($G -cE 'const DESTINATION_SECRET_KEYS: &\[&str\]' "$REENC")
if [ "$DUP" = "0" ]; then
  ok "G1b no hand-duplicated DESTINATION_SECRET_KEYS literal remains in credential_reencrypt.rs"
else
  bad "G1b no hand-duplicated DESTINATION_SECRET_KEYS literal remains" \
      "found $DUP — the two lists can drift again"
fi
eq "G1c CONFIG_SENSITIVE_KEYS is pub(crate) so credential_reencrypt can import it" \
   "$($G -cF 'pub(crate) const CONFIG_SENSITIVE_KEYS' "$BACKUP_DEST")" "1"

eq "G2 settings::SENSITIVE_KEYS is declared exactly once, at module level" \
   "$($G -cE 'const SENSITIVE_KEYS: &\[&str\]' "$SETTINGS")" "1"
eq "G2b it's pub(crate) so credential_reencrypt's test can see it" \
   "$($G -cF 'pub(crate) const SENSITIVE_KEYS' "$SETTINGS")" "1"
eq "G3 a test ties SENSITIVE_SETTINGS_SQL to settings::SENSITIVE_KEYS" \
   "$($G -cF 'fn sensitive_settings_sql_covers_settings_sensitive_keys' "$REENC")" "1"

echo
echo "PASS $PASS · FAIL $FAIL"
[ "$FAIL" -eq 0 ]
