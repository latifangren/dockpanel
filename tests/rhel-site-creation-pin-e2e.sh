#!/usr/bin/env bash
#
# Regression pin: no site of ANY runtime could ever be created on the RHEL
# family, and PHP sites specifically failed a layer earlier than that too.
#
# TWO independent, stacked defects, found in the same session by trying to
# actually create a PHP site on a real Rocky 9 box.
#
# Defect 1 — the PHP-FPM socket. A carried tech-debt note (many sessions old)
# claimed `settle()` was a false positive on RHEL — it is not;
# `socket_exists()`/`settle()` in php.rs were already RHEL-aware. The real gap
# was one layer downstream: `put_site()` in nginx.rs validated and
# existence-checked `php_socket` as a LITERAL path
# (`/run/php/php{version}-fpm.sock`, Debian-shaped), with no fallback to
# RHEL's actual, unversioned socket (`/run/php-fpm/www.sock`). So on a real
# Rocky/Alma/CentOS box, PHP-FPM would install and report running correctly —
# and creating the very next PHP site was flatly refused with "PHP {version}
# is not installed, or its PHP-FPM service is not running", a false and
# unactionable message (reinstalling PHP cannot fix a path assumption). Fixed
# by `services::pkg::resolve_php_fpm_socket()`, the single place that knows
# both families' socket layouts, which php.rs::socket_exists() and
# nginx.rs::put_site() both now call instead of re-implementing their own
# existence check. sites.rs's hardcoded Debian-shaped string is now just a
# VERSION CARRIER on the wire, not an assertion about the real path — the
# backend cannot know the target's distro, so it was never the right layer.
#
# Defect 2 — found immediately after fixing defect 1, by hitting the NEXT
# wall live: nginx's vhost directory itself. Debian ships
# `sites-available`/`sites-enabled`; the RHEL family's nginx package has
# NEITHER — its `nginx.conf` includes only `conf.d/*.conf`. Roughly 25 call
# sites across a dozen files hardcoded the literal Debian path independently
# (`vhost_paths()` itself, plus every SSL/git-deploy/Docker-app/diagnostics/
# security-scanner/IaC-export/WAF-uninstall reader and writer of a site's
# vhost), so on RHEL EVERY write failed `ENOENT` regardless of runtime —
# static, PHP, Node, Python, proxy, all of them. Fixed by
# `services::nginx::sites_dir_for()`/`vhost_paths_for()`, mirroring the same
# `[ -d /etc/nginx/sites-enabled ]` detection `setup.sh::configure_nginx`
# already used for the PANEL's own vhost, with every other call site
# propagated to the one shared function instead of its own copy.
#
# Live-fire proof, both defects, same Rocky Linux 9.8 box, real command:
#   pre-fix (published v2.172.0):  "PHP 8.3 is not installed..." (defect 1)
#   defect-1-fixed only:           "Failed to write config: No such file
#                                    or directory" (defect 2, freshly exposed)
#   both fixed:                    site created, vhost at
#                                    /etc/nginx/conf.d/{domain}.conf,
#                                    `fastcgi_pass unix:/run/php-fpm/www.sock`,
#                                    `nginx -t` clean, curl returned
#                                    `PHP_WORKS:8.3.33` with
#                                    `X-Powered-By: PHP/8.3.33` over HTTP 200.
# Disable/enable (park/unpark) re-driven on the same site: parked file lands
# at `{domain}.conf.disabled` in the SAME conf.d directory (RHEL has no
# separate sites-available), 503 maintenance page after a reload settles,
# PHP output returns unchanged after re-enable.
#
# Pure source analysis below: no box, no network, no build — the box above
# already proved the mechanism live; this suite pins the STRUCTURE so a
# future refactor cannot silently reintroduce either literal Debian-only
# check.

set -uo pipefail
cd "$(dirname "$0")/.."

PASS=0 FAIL=0
ok()  { PASS=$((PASS+1)); printf '  \033[0;32m✓\033[0m %s\n' "$1"; }
bad() { FAIL=$((FAIL+1)); printf '  \033[0;31m✗\033[0m %s\n' "$1"; }

PKG_RS=panel/agent/src/services/pkg.rs
PHP_RS=panel/agent/src/routes/php.rs
NGINX_ROUTE_RS=panel/agent/src/routes/nginx.rs
NGINX_SVC_RS=panel/agent/src/services/nginx.rs
SITES_RS=panel/backend/src/routes/sites.rs
OWNERSHIP_RS=panel/agent/src/services/ownership.rs
GIT_BUILD_SVC_RS=panel/agent/src/services/git_build.rs
DOCKER_APPS_ROUTE_RS=panel/agent/src/routes/docker_apps.rs
DOCKER_APPS_SVC_RS=panel/agent/src/services/docker_apps.rs
SERVICE_INSTALLER_RS=panel/agent/src/routes/service_installer.rs
IAC_RS=panel/agent/src/routes/iac.rs
SECURITY_SCANNER_RS=panel/agent/src/services/security_scanner.rs
DIAGNOSTICS_RS=panel/agent/src/services/diagnostics.rs
for f in "$PKG_RS" "$NGINX_ROUTE_RS" "$NGINX_SVC_RS" \
         "$OWNERSHIP_RS" "$DOCKER_APPS_ROUTE_RS" "$DOCKER_APPS_SVC_RS" \
         "$SERVICE_INSTALLER_RS" "$IAC_RS" "$SECURITY_SCANNER_RS" "$DIAGNOSTICS_RS"; do
  [ -f "$f" ] || { echo "MISSING SUBJECT FILE: $f"; exit 1; }
done
# R8: agent routes/php.rs, services/git_build.rs and backend routes/sites.rs
# are deleted (PHP routes + git build + site doors retired). Their arms are
# tombstoned per-section below; absence is asserted here.
for f in "$PHP_RS" "$GIT_BUILD_SVC_RS" "$SITES_RS"; do
  [ -f "$f" ] && bad "TOMBSTONE (R8): $f is back — its tombstoned arms must be restored"
done
ok "TOMBSTONE (R8): routes/php.rs, services/git_build.rs and routes/sites.rs stay deleted"

# Strip // line comments so an arm can't match its own explanatory prose
# (lesson #149) — the fix's comments deliberately name both families' paths.
strip() { sed 's://.*::' "$1"; }

SRC_PKG=$(strip "$PKG_RS")
SRC_PHP=""  # R8: routes/php.rs deleted; §2/§5 tombstoned
SRC_NGINX_ROUTE=$(strip "$NGINX_ROUTE_RS")
SRC_NGINX_SVC=$(strip "$NGINX_SVC_RS")
SRC_OWNERSHIP=$(strip "$OWNERSHIP_RS")
SRC_GIT_BUILD_SVC=""  # R8: services/git_build.rs deleted; §7 arm tombstoned
SRC_DOCKER_APPS_ROUTE=$(strip "$DOCKER_APPS_ROUTE_RS")
SRC_DOCKER_APPS_SVC=$(strip "$DOCKER_APPS_SVC_RS")
SRC_SERVICE_INSTALLER=$(strip "$SERVICE_INSTALLER_RS")
SRC_IAC=$(strip "$IAC_RS")
SRC_SECURITY_SCANNER=$(strip "$SECURITY_SCANNER_RS")
SRC_DIAGNOSTICS=$(strip "$DIAGNOSTICS_RS")
SRC_SITES=""  # R8: routes/sites.rs deleted; §4 tombstoned

# Here-strings, never pipelines: a `grep -q` closing the pipe SIGPIPEs the
# upstream sed, and pipefail turns that into a failed arm non-deterministically.
has()  { grep -q  -- "$2" <<< "$1"; }
hasE() { grep -qE -- "$2" <<< "$1"; }
fnbody() { awk "/$2/,/^}/" <<< "$1"; }
readable() { [ -n "$2" ] || bad "could not extract $1 — the arms reading it mean nothing"; }

echo
echo "§1 one resolver knows both families' socket layouts"

RESOLVER=$(fnbody "$SRC_PKG" 'pub async fn resolve_php_fpm_socket')
readable "resolve_php_fpm_socket" "$RESOLVER"

if has "$RESOLVER" '/run/php/php{version}-fpm.sock'; then
  ok "the resolver checks the Debian versioned path"
else
  bad "the resolver does not check the Debian path — apt boxes would regress"
fi

if has "$RESOLVER" '/run/php-fpm/www.sock'; then
  ok "the resolver checks the RHEL unversioned path"
else
  bad "the resolver does not check RHEL's socket — the whole point of the fix"
fi

if has "$RESOLVER" 'installed_php_version().await.as_deref() == Some(version)'; then
  ok "the RHEL branch confirms it's THIS version before trusting the unversioned socket"
else
  bad "no version confirmation on the RHEL branch — every version would claim the one live socket"
fi

echo
echo
echo "§2 [R8 TOMBSTONE] both resolver call sites retired with their files"
# R8 TOMBSTONE: php.rs::socket_exists and nginx.rs::put_site died with
# routes/php.rs and the site doors. resolve_php_fpm_socket itself survives
# in pkg.rs (§1) but has ZERO callers left — the sharing property is
# vacated, not violated. If a PHP door returns and calls the resolver,
# §2 must return with it.
CALLERS=$(grep -rn 'resolve_php_fpm_socket(' panel/agent/src panel/backend/src --include='*.rs' | grep -v 'pub async fn resolve_php_fpm_socket' | grep -v '//' | grep -c . || true)
if [ "$CALLERS" -eq 0 ]; then
  ok "TOMBSTONE (R8): §2 retired — no resolver call sites remain (resolver retained uncalled in pkg.rs)"
else
  bad "TOMBSTONE (R8): the resolver gained $CALLERS call site(s) — §2 must be restored"
fi

echo
echo "§3 [R8 TOMBSTONE] the per-site FPM pool feature retired with put_site"
# R8 TOMBSTONE: the per-site pool block lived in put_site (deleted) and
# write_php_pool_config is gone (0 occurrences) — no Debian pool.d writer
# remains to degrade on RHEL.
if grep -rq 'write_php_pool_config\|per_site_socket' panel/agent/src --include='*.rs'; then
  bad "TOMBSTONE (R8): per-site pool code reappeared — §3 must be restored"
else
  ok "TOMBSTONE (R8): §3 retired — no per-site pool code remains"
fi

echo
echo "§4 [R8 TOMBSTONE] the version-carrier contract retired with sites.rs"
# R8 TOMBSTONE: the php_socket construction sites died with routes/sites.rs
# (R3) — no backend string carries a version to the resolver anymore.
ok "TOMBSTONE (R8): §4 retired with routes/sites.rs — no php_socket construction sites remain"

echo
echo "§5 [R8 TOMBSTONE] the version-status API retired with routes/php.rs"
# R8 TOMBSTONE: list_versions died with routes/php.rs — no versions API
# remains to advertise a socket.
ok "TOMBSTONE (R8): §5 retired with routes/php.rs — no versions API remains"

echo "§6 the nginx vhost directory itself — no site of ANY runtime worked on RHEL"

SITES_DIR_FOR=$(fnbody "$SRC_NGINX_SVC" 'pub fn sites_dir_for')
readable "sites_dir_for" "$SITES_DIR_FOR"
if hasE "$SITES_DIR_FOR" '"/etc/nginx/sites-enabled"' && hasE "$SITES_DIR_FOR" '"/etc/nginx/conf.d"'; then
  ok "one function knows both families' vhost directories"
else
  bad "sites_dir_for does not name both directories — the RHEL branch may be gone"
fi

# Split-for-testability, the same shape this file already used for
# vhost_target_between/vhost_target: the pure decision takes a bool so a test
# needs no nginx installed. A version that probed the filesystem directly
# would pass or fail by accident of whether the CI runner has nginx — pin
# against that regression explicitly.
if hasE "$SRC_NGINX_SVC" 'fn sites_dir\(\) -> &.static str \{' ; then
  SITES_DIR_UNCONDITIONAL=$(fnbody "$SRC_NGINX_SVC" 'pub fn sites_dir\(\)')
  if has "$SITES_DIR_UNCONDITIONAL" 'sites_dir_for('; then
    ok "the real-filesystem wrapper delegates to the pure, testable decision"
  else
    bad "sites_dir() does not delegate to sites_dir_for — the decision is no longer testable without nginx installed"
  fi
else
  bad "could not find sites_dir() — the real-filesystem entry point is gone"
fi

VHOST_PATHS_FOR=$(fnbody "$SRC_NGINX_SVC" 'pub fn vhost_paths_for')
readable "vhost_paths_for" "$VHOST_PATHS_FOR"
if has "$VHOST_PATHS_FOR" 'sites_dir_for(uses_sites_enabled)'; then
  ok "vhost_paths_for shares the same directory decision, not a second copy"
else
  bad "vhost_paths_for re-derives the directory instead of sharing sites_dir_for"
fi
if hasE "$VHOST_PATHS_FOR" 'if uses_sites_enabled \{' && has "$VHOST_PATHS_FOR" '} else {'; then
  ok "vhost_paths_for actually branches on the convention rather than returning one shape"
else
  bad "vhost_paths_for has no visible branch on uses_sites_enabled — one family always gets the other's paths"
fi

echo
echo "§7 every other reader/writer of a site's vhost shares the one decision, not its own copy"

# The class of defect: ~25 call sites across a dozen files independently
# hardcoded the Debian path. Each subject below must call through sites_dir()
# — or, s449, through `vhost_paths()`/`vhost_target()`, which themselves
# resolve through `sites_dir_for` and additionally know the PARKED path
# sites_dir() alone does not — rather than spelling /etc/nginx/sites-enabled
# itself. mail.rs is a deliberate exception — it already tried both literal
# paths for the PANEL's own vhost before this fix existed, which is a
# different (already-correct) shape.
declare -A PROPAGATION=(
  # R8: ssl.rs (routes) and service_installer.rs dropped from the census —
  # neither holds vhost-path code anymore (ssl.rs mentions vhosts only in
  # comments + one test name; service_installer installs certbot, never
  # reads a vhost). Their vhost logic lives in services/nginx.rs (§6).
  ["ownership.rs"]="$OWNERSHIP_RS"
  # R8: git_build.rs deleted (R5) — its propagation arm is tombstoned; the
  # shared-decision census below covers the surviving files.
  ["docker_apps.rs (routes)"]="$DOCKER_APPS_ROUTE_RS"
  ["docker_apps.rs (services)"]="$DOCKER_APPS_SVC_RS"

  ["iac.rs"]="$IAC_RS"
  ["security_scanner.rs"]="$SECURITY_SCANNER_RS"
  ["diagnostics.rs"]="$DIAGNOSTICS_RS"
)
for label in "${!PROPAGATION[@]}"; do
  f="${PROPAGATION[$label]}"
  src=$(strip "$f")
  if hasE "$src" '"/etc/nginx/sites-enabled/'; then
    bad "$label still hardcodes the Debian vhost directory literally"
  elif hasE "$src" 'sites_dir\(\)|vhost_paths\(|vhost_target\('; then
    ok "$label reads the vhost directory through the shared decision"
  else
    bad "$label neither hardcodes nor calls sites_dir()/vhost_paths()/vhost_target() — re-derive what changed"
  fi
done

# R4 (2026-11-02): this section pinned mail/DNS hosting code removed in R4; deleted, not weakened.

echo
echo "§8 the parked (disabled) directory: RHEL shares one dir, and a shared-dir scan is not double-counted"

PARKED_DIR_FOR=$(fnbody "$SRC_NGINX_SVC" 'pub fn parked_dir_for')
readable "parked_dir_for" "$PARKED_DIR_FOR"
if has "$PARKED_DIR_FOR" 'sites_dir_for(false)'; then
  ok "on the RHEL branch, parked_dir_for falls back to the SAME directory as sites_dir_for"
else
  bad "parked_dir_for's RHEL branch does not point at the same directory as sites_dir_for"
fi

REGISTRY_REFS=$(fnbody "$SRC_OWNERSHIP" 'fn registry_needle_references')
readable "registry_needle_references" "$REGISTRY_REFS"
if hasE "$REGISTRY_REFS" 'parked_dir == live_dir'; then
  ok "a shared live/parked directory short-circuits before the second scan"
else
  bad "no guard against scanning the same directory twice — RHEL would double-count every match"
fi

if has "$SRC_OWNERSHIP" 'a_single_shared_directory_is_not_scanned_twice'; then
  ok "the double-scan guard has its own mutation-reachable unit test"
else
  bad "no unit test exercises the double-scan guard directly"
fi

echo
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
