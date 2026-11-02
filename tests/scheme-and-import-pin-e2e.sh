#!/usr/bin/env bash
# scheme-and-import-pin-e2e.sh — s293 / v2.51.0
#
# Pins two families of defect fixed this release. Pure source analysis: no box,
# no network, no build.
#
# They are one suite because they are one mistake made twice: the panel had two
# ends that disagreed about something each of them already knew.
#
#   §A  the SCHEME. Five places printed or fetched `https://<a user's domain>`
#       while the answer — a certificate, an ssl_email, an `ssl` flag in the very
#       response being read — was in scope. Issue #96.
#   §B  the DOCUMENT ROOT and the ARCHIVE ROOT. The migration importer wrote a
#       site's files one level above the directory its own vhost serves, and
#       resolved the archive root differently from the analyser that produced
#       the paths. Found while triaging issue #51.
#
# The arms are written against the CAPABILITY a regression must use, not the
# spelling the code happens to have today (lesson #122), and were attacked after
# they went green (lesson #125).
#
# NO PIPES INTO `grep -q`. Under `set -o pipefail` grep -q closes the pipe on its
# first match, the upstream dies of SIGPIPE (141), and pipefail reports the whole
# pipeline failed — so an arm goes red on correct code, non-deterministically.
# That bug has now shipped twice (backup-lands at s289, backup-truth at s292).
# Every arm here feeds grep a here-string.

set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0; FAIL=0
ok()  { PASS=$((PASS+1)); printf '  \033[32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[31m✗\033[0m %s\n' "$1"; }

APPS_UI=panel/frontend/src/pages/Apps.tsx
APPS_BE=panel/backend/src/routes/docker_apps.rs
APPS_SVC=panel/agent/src/services/docker_apps.rs
NGINX_SVC=panel/agent/src/services/nginx.rs
NGINX_ROUTE=panel/agent/src/routes/nginx.rs
TRAEFIK=panel/agent/src/services/traefik.rs
MIG_SVC=panel/agent/src/services/migration.rs

for f in "$APPS_UI" "$APPS_BE" "$APPS_SVC" "$NGINX_SVC" "$NGINX_ROUTE" "$TRAEFIK"; do
  [ -f "$f" ] || bad "MISSING SUBJECT FILE: $f"
done

# R6 merge (2026-11-02): the migration-wizard agent engine
# (services/migration.rs) was deleted with routes/migration.rs. The three
# MIG_SVC blocks below are tombstones: their properties die with the file.
if [ -f "$MIG_SVC" ]; then
  bad "services/migration.rs still exists — deleted in the R6 merge"
else
  ok "services/migration.rs is gone (R6 merge)"
fi

# Comments out, CODE INTACT.
#
# The obvious `s{/\*.*?\*/}{}gs` is wrong and shipped in four suites before this
# one: `/*` occurs INSIDE string literals (a Dockerfile's
# `COPY --from=builder /app/target/release/*`, a glob, a regex), so it opened a
# "block comment" that ran to the next `*/` and deleted real code —
# git_build.rs 1214 -> 729 lines, agent/routes/nginx.rs 2263 -> 2145. A
# truncated subject makes an ABSENCE arm pass on code that was merely deleted by
# the stripper, which is the worst way for a pin to be wrong.
#
# So a block comment is only recognised where one is actually written: opening at
# the start of a line, closing at the end of one. A `/*` in the middle of a line
# is data.
code() {
  perl -0777 -pe '
    s{\{/\*.*?\*/\}}{}gs;
    s{^[ \t]*/\*.*?\*/[ \t]*$}{}gms;
    s{^\s*//.*$}{}gm;
  ' "$1"
}

# An arm whose subject could not be extracted must SKIP, not print a confident
# green next to a red about the same subject (lesson #122b).
subj() { local t; t=$(code "$1"); [ -n "$t" ] || return 1; printf '%s' "$t"; }

has()   { grep -qE -- "$2" <<< "$1"; }
count() { grep -cE -- "$2" <<< "$1" || true; }

# The N lines following a marker — the window an arm is allowed to reason about.
win() { grep -A"${3:-20}" -E -- "$2" <<< "$1" || true; }

# A presence grep is not an arm. Every probe that beat the first draft of this
# suite kept the call in the file and made it not happen: `if false { … }`, a
# discarded `let _ = …`, a `&& false` bolted onto the condition. Same escape that
# beat backup-truth at s292 (lesson #125) — dead code satisfies a presence grep.
# So an arm asserts BOTH that the window derives its answer AND that the window
# is live.
# Only DEAD-CODE markers belong here. An earlier draft also forbade `let _ =`
# and `return false;`, and immediately reported three failures on code verified
# by hand minutes earlier — both are ordinary Rust (`domain_is_https` returns
# false when there is no vhost; the monitor INSERT discards its Result on
# purpose). That is the #127 tell: when a whole class of arms fails on code you
# have already verified, the harness is wrong, not the subject. Discards that
# DO matter are forbidden by name at the one arm that cares.
live() {
  ! grep -qE -- '(if false|&& false|\|\| true|let _unused)' <<< "$1"
}

# The body of one top-level fn, bounded by the NEXT top-level fn.
#
# A fixed `-A <n>` window is not a function. Probe P9 removed the directory from
# parse_plesk's database path and the per-parser arm stayed green, because the
# 90-line window ran on into parse_hestiacp — whose line still matched. A window
# that can be satisfied by the code AFTER the subject is not scoped to the
# subject.
fnbody() {
  awk -v name="$2" '
    /^(pub )?(async )?fn / {
      if ($0 ~ "^(pub )?(async )?fn " name "\\(") { inside=1; next }
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

echo "== §A  the scheme is derived, never assumed =="

if S=$(subj "$APPS_UI"); then
  # The link must consume a per-app boolean. Requiring the ternary INSIDE the
  # href template is what stops "compute app.ssl, then ignore it" — the shape
  # that walked through the backup suite at s292.
  if has "$S" 'href=\{`\$\{app\.ssl \? "https" : "http"\}://\$\{app\.domain\}`\}'; then
    ok "the app link picks its scheme from the app's own ssl flag"
  else
    bad "the app link no longer derives its scheme from app.ssl"
  fi
  if has "$S" 'href=\{`https://\$\{app\.'; then
    bad "an app link hardcodes https:// again"
  else
    ok "no app link hardcodes https://"
  fi
  # The opt-out has to reach the wire, not merely exist in component state.
  if has "$S" 'external_tls' && has "$S" 'externalTls'; then
    ok "the deploy form sends external_tls"
  else
    bad "the deploy form no longer sends external_tls"
  fi
  # …and it must suppress the certificate request, not sit beside it.
  if has "$S" '&& !externalTls \? \{ ssl_email'; then
    ok "ticking 'TLS terminated upstream' withholds ssl_email"
  else
    bad "ssl_email is sent even when TLS is terminated upstream"
  fi
fi

if S=$(subj "$APPS_SVC"); then
  if has "$S" 'pub ssl: bool'; then
    ok "DeployedApp carries the served scheme"
  else
    bad "DeployedApp lost its ssl field"
  fi
  # Must be FILLED, not merely declared. A struct field defaulted to false is a
  # different bug wearing the same shape.
  W=$(win "$S" 'let ssl = domain' 6)
  if derives "$W" 'domain_is_https' && has "$S" '^ *ssl,$'; then
    ok "the app list fills ssl by asking what the box serves"
  else
    bad "the app list no longer derives ssl from the served config"
  fi
fi

if S=$(subj "$NGINX_SVC"); then
  # The nginx answer must come from the vhost, and Traefik must be consulted
  # first — when Traefik owns a domain there is no nginx vhost to read, and
  # "no file" would otherwise be reported as "no TLS".
  W=$(win "$S" 'pub fn domain_is_https' 26)
  if derives "$W" 'route_is_tls' && derives "$W" 'lines\(\)\.any' && derives "$W" '443'; then
    ok "domain_is_https reads Traefik first, then the nginx vhost's listen line"
  else
    bad "domain_is_https no longer derives from the served configuration"
  fi
fi

if S=$(subj "$TRAEFIK"); then
  # One path builder, used by the writer's siblings and both readers, so a
  # rename of the mangling cannot desynchronise them.
  if has "$S" 'fn route_config_path' && has "$S" 'pub fn route_is_tls'; then
    ok "the Traefik route path has one builder and a TLS reader"
  else
    bad "the Traefik route path builder or its TLS reader is gone"
  fi
  # None means "not proxied by Traefik" and must stay distinguishable from false.
  if has "$S" 'pub fn route_is_tls\(domain: &str\) -> Option<bool>'; then
    ok "route_is_tls keeps 'not mine' distinct from 'no TLS'"
  else
    bad "route_is_tls collapsed 'not proxied here' into 'no TLS'"
  fi
fi

if S=$(subj "$APPS_BE"); then
  if has "$S" 'let url = format!\("https://\{domain\}"\)'; then
    bad "the auto-created app monitor hardcodes https again"
  else
    ok "the auto-created app monitor does not hardcode https"
  fi
  # It must read the deploy's own answer. Requiring `result.get("ssl")` in the
  # same file is not enough — the SSE step already does that — so require the
  # scheme binding to exist and the URL to interpolate it.
  W=$(win "$S" 'let scheme = if result\.get\("ssl"\)' 8)
  if derives "$W" 'https' && derives "$W" 'http' \
     && has "$S" 'format!\("\{scheme\}://\{domain\}"\)'; then
    ok "the monitor URL is built from the scheme the deploy reported"
  else
    bad "the monitor URL no longer follows the deploy's reported scheme"
  fi
  if has "$S" 'pub external_tls: bool'; then
    ok "the deploy request can decline a certificate"
  else
    bad "DeployRequest lost external_tls"
  fi
  # Declining must actually suppress the fallback to the operator's address.
  W=$(win "$S" 'let deploy_ssl_email = if body\.external_tls \{$' 6)
  if derives "$W" 'None' && derives "$W" 'or_else\(\|\| Some\(claims\.email'; then
    ok "external_tls suppresses the ssl_email fallback"
  else
    bad "external_tls no longer gates the ssl_email fallback"
  fi
fi

echo "== §B  the importer and the vhost agree on where a site lives =="

if S=$(subj "$NGINX_SVC"); then
  if has "$S" 'pub fn document_root_for'; then
    ok "there is one answer to 'which directory does nginx serve'"
  else
    bad "document_root_for is gone — the rule is spelled per-caller again"
  fi
fi

# R6 merge: the document-root loop above asserted the migration service
# asked document_root_for instead of re-deriving the runtime rule.
# The service file is deleted with the wizard; document_root_for
# itself survives (asserted above against NGINX_SVC) for its remaining
# caller in app_process.rs. Deleted, not weakened: no importer
# remains to re-derive the rule.

# R6 merge: the archive-root / parser blocks asserted the migration
# importers resolved archive roots and emitted archive-relative paths.
# The importer file is deleted with the wizard. Deleted, not weakened:
# there is no importer left whose paths could escape the archive.

# R6 merge (2026-11-02): the runtime block above asserted import_site_files
# took runtime as a typed parameter. The service file is deleted with the
# wizard, so the key-spelling lesson dies with it. Deleted, not weakened.

echo
echo "──────────────────────────────────────────"
echo "PASS: $PASS   FAIL: $FAIL"
[ "$FAIL" -eq 0 ]
