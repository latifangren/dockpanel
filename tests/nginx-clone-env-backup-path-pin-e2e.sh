#!/usr/bin/env bash
# nginx-clone-env-backup-path-pin-e2e.sh — s438
#
# R6 (2026-11-02): §A is deleted with routes/nginx.rs's clone_site/get_env/
# set_env handlers, removed in the R6 nginx split. Deleted, not weakened:
# the handlers no longer exist, and the A8 census floor (31 is_valid_domain
# call sites in nginx.rs) died with the file's site-handler bulk. What
# remains is §B, re-derived unchanged below.
#
#   §B  remote_backup.rs's upload() gated the backup filepath with a lexical
#       `starts_with()` check that "/var/backups/dockpanel/../../etc/shadow"
#       satisfies — the OS resolves the `..` on open. ProtectSystem=strict
#       blocks writes outside the allowlist but not READS, so an unguarded
#       path here is arbitrary root-readable-file exfiltration (shadow,
#       Let's Encrypt private keys, .env secrets) to an attacker-supplied
#       S3/SFTP destination.
#
# Pure source analysis: no box, no network, no build.

set -uo pipefail
cd "$(dirname "${BASH_SOURCE[0]}")/.." || exit 1

echo
echo "=============================================="
echo "  remote-backup path validation — source pins (s438, §B only)"
echo "=============================================="
echo

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }

# Strip comments before matching (per [[feedback_source_pin_prose_trap]] — this
# file's own header spells the tokens the arms grep for).
code() {
  perl -0777 -pe '
    s{^[ \t]*/\*.*?\*/[ \t]*$}{}gms;
    s{^\s*///.*$}{}gm;
    s{^\s*//.*$}{}gm;
  ' "$1"
}

has()  { grep -qE -- "$2" <<< "$1"; }
flat() { tr '\n' ' ' <<< "$1" | tr -s ' '; }

# A function body, bounded on ITS OWN braces (s323 fix — a window ending at
# the successor's match position swallows the next function's declaration).
fnbody() {
  awk -v fn="$2" '
    index($0, "fn " fn) && !started { started=1 }
    started {
      n=gsub(/\{/,"{"); m=gsub(/\}/,"}"); depth += n - m; print
      if (opened || n>0) opened=1
      if (opened && depth<=0) exit
    }
  ' <<< "$1"
}

BACKUP=panel/agent/src/routes/remote_backup.rs

for f in "$BACKUP"; do
  [ -f "$f" ] || { bad "SETUP subject missing: $f"; exit 1; }
done

BACKUP_SRC=$(code "$BACKUP")

# ── §B  remote_backup.rs: upload() rejects '..' in the filepath ──────────────

UPLOAD=$(flat "$(fnbody "$BACKUP_SRC" "upload")")
if [ -z "$UPLOAD" ]; then
  bad "B0 could not extract remote_backup::upload"
else
  ok "B0 remote_backup::upload extracted"
  if has "$UPLOAD" 'starts_with\("/var/backups/dockpanel/"\)' && has "$UPLOAD" 'body\.filepath\.contains\("\.\."\)'; then
    ok "B1 upload rejects BOTH a non-prefixed path AND a lexical '..' traversal"
  else
    bad "B1 upload is missing the prefix check, the '..' rejection, or both — a crafted filepath can read outside /var/backups/dockpanel/"
  fi
  # B2 — the two conditions must be OR'd together in one guard, not two
  # separate ifs where an early return on the first could let a later
  # "and only if that passed" mutation quietly drop the second (both must
  # gate the SAME single rejection).
  if has "$UPLOAD" 'starts_with\("/var/backups/dockpanel/"\) \|\| body\.filepath\.contains\("\.\."\)'; then
    ok "B2 both conditions are OR'd into a single rejection guard"
  else
    bad "B2 the prefix check and the '..' rejection are not combined into one guard — re-read upload(), a mutation may have split them"
  fi
fi

echo
echo "----------------------------------------------"
printf '  PASS %d  FAIL %d\n' "$PASS" "$FAIL"
echo "----------------------------------------------"
echo

[ "$FAIL" -eq 0 ] || exit 1
exit 0
