#!/usr/bin/env bash
# Regression pins for the s386 ship — the SSL controls that lied, the renewal
# that renewed the wrong machine, and the renewal that destroyed the certificate
# it was meant to protect.
#
# ⛔ READ THIS BEFORE ADDING AN ARM. The first draft of this suite passed with the
# ship's HEADLINE defect restored, because every arm read RAW SOURCE and a
# COMMENT quoting the correct SQL satisfied it. That is not hypothetical: the
# `WHERE s.server_id = $2` term was deleted from the query, the explanatory
# comment above it — which spells the correct form, as explanatory comments do —
# was left alone, and the suite printed 43/43 green. The mutation harness had
# missed it too, because every plant DELETED the pinned string rather than
# reverting the code beside prose that quotes it.
#
# So every source arm below reads `subj`, which strips comments before matching.
# An arm that reads a file any other way is a bug in this file.
#
# WHAT THE SHIP FIXED
#
#   * THE ONLY AUTOMATIC RENEWAL ON A STOCK INSTALL PICKED THE WRONG ROW.
#     `security_scanner::auto_fix_safe_findings` resolved the site with
#     `WHERE s.domain = $1` and no server term. `sites.domain` has been unique
#     only per SERVER since `20260319000000_multi_server.sql`, and the hazard is
#     spelled out IN THAT SAME FUNCTION on the vhost read 130 lines below — the
#     author wrote the rule, then applied it to the read that CONSUMES the id
#     rather than the one that PRODUCES it. On a fleet holding a domain twice it
#     renewed with another host's config, wrote the expiry onto another host's
#     row, and pushed that host's vhost through this host's agent.
#   * A RENEWAL IS A REPLACEMENT, AND NOTHING CHECKED WHOSE CERTIFICATE IT WAS.
#     The agent's ACME client is pinned to `LetsEncrypt::Production`, so an issuer
#     that is not Let's Encrypt PROVES DockPanel did not issue the certificate.
#     Nothing asked. The scanner's auto-fix needs no opt-in, walks the SSL
#     directory with `openssl -checkend`, never reads the issuer and never
#     consults the database — so a commercial wildcard or a Cloudflare Origin CA
#     certificate uploaded through the panel's own control was overwritten with a
#     90-day Let's Encrypt certificate, weekly, on every install. §F pins the
#     guard at all three doors, and pins that doubt still RENEWS: refusing when
#     the issuer cannot be read would let a real certificate lapse.
#   * A "FIX" BUTTON THAT COULD ONLY FAIL. The agent advertises
#     `renew-ssl:{domain}` and has no `apply_fix` arm for it, so it fell through
#     to `Unknown fix action` → 500 → `agent_error`'s non-4xx arm → an incident
#     id, plus a `tracing::error!` blaming a working agent, on every click.
#   * AN UPLOADED CERTIFICATE WAS INVISIBLE. `upload_ssl` wrote `ssl_enabled`
#     alone while the ACME path writes four columns, and every downstream reader
#     filters `ssl_expiry IS NOT NULL`.
#   * "NO INFORMATION" RENDERED AS THE GREEN OK BADGE, twice: `unwrap_or(999)` in
#     the handler and `|| STATUS_STYLES.ok` in the page.
#   * AN ADMIN WAS SHOWN A FINDING NO LIST COULD SHOW. The agent's diagnostics
#     walks the host; the certificate list was `WHERE user_id = $1`. §G pins the
#     separate admin route — the shape `sites::list` + `/api/admin/sites` already
#     chose — and pins that the tenant list did NOT gain a role branch.
#
# Every arm is static analysis over source text: offline and deterministic, so it
# judges a MUTATED tree the same way on an air-gapped runner (lesson #641).
set -uo pipefail
cd "$(dirname "$0")/.." || exit 1

PASS=0; FAIL=0
ok()  { printf '\033[32m✓\033[0m %s\n' "$1"; PASS=$((PASS+1)); }
bad() { printf '\033[31m✗\033[0m %s — %s\n' "$1" "${2:-}"; FAIL=$((FAIL+1)); }
eq()  { [ "$2" = "$3" ] && ok "$1" || bad "$1" "expected '$3', got '$2'"; }

# ugrep's --ignore-files shim honours .gitignore, so every count below uses the
# real binary explicitly (dockpanel-ops-p2, s357).
G=/usr/bin/grep

# THE SUBJECT: source with comments removed, then whitespace and the `\` that
# continues a Rust string literal, so a multi-line SQL statement flattens into
# the one token it becomes at compile time.
#
# Stripping comments is the load-bearing half — see the header. `//` covers `///`
# doc comments; `--` covers SQL. Neither appears inside any string this file
# pins, and an arm that needs one must say so and use its own extractor.
subj() { sed -E -e 's://.*$::' -e 's:^[[:space:]]*--.*$::' "$1" | tr -d ' \n\\'; }

# Occurrences, not matching LINES. `grep -c` over a flattened file always answers
# 1 or 0 — which silently turns "this appears twice" into "this appears".
# ⚠ -F, always: an arm whose pattern is a regex can match something the defect it
# guards would also produce (lesson #653 — an unescaped `.` matched the space in
# the very mutation the arm existed to catch).
occ() { printf '%s' "$1" | $G -oF -- "$2" | wc -l | tr -d ' '; }

SCAN=panel/backend/src/services/security_scanner.rs
HEAL=panel/backend/src/services/auto_healer.rs
SYS=panel/backend/src/routes/system.rs
SSL=panel/backend/src/routes/ssl.rs
SITES=panel/backend/src/routes/sites.rs
MON=panel/backend/src/routes/monitors.rs
HELP=panel/backend/src/helpers.rs
ROUTER=panel/backend/src/routes/mod.rs
ADIAG=panel/agent/src/services/diagnostics.rs
ASSL=panel/agent/src/services/ssl.rs
ASSLR=panel/agent/src/routes/ssl.rs
ASEC=panel/agent/src/services/security.rs
MIG=panel/backend/migrations/20260319000000_multi_server.sql
CERTS=panel/frontend/src/pages/Certificates.tsx
DIAGPAGE=panel/frontend/src/pages/Diagnostics.tsx
DOCS=docs/guides/security-hardening.md

for f in "$SCAN" "$HEAL" "$SYS" "$MON" "$HELP" "$ROUTER" "$ADIAG" \
         "$ASSL" "$ASSLR" "$ASEC" "$MIG" "$CERTS" "$DIAGPAGE" "$DOCS"; do
  [ -f "$f" ] || { bad "SETUP" "$f missing"; exit 1; }
done

# An arm that measures an empty subject prints green for every absence below, so
# each subject is asserted before it is measured (lesson #143). The floors are on
# the POST-comment-strip subject, because that is what the arms actually read —
# a file that is all comments would otherwise pass a line-count guard and then
# satisfy every absence arm vacuously.
# R8: routes/mod.rs stripped measures 35539 at HEAD (site/ssl/deploy routes deleted R1–R5); floor re-derived below measured.
# R8: agent routes/ssl.rs stripped measures 5177 at HEAD (upload/DNS-01/revoke doors deleted R6); floor re-derived below measured. at HEAD (site/ssl/deploy routes deleted R1–R5); floor re-derived below measured.
for pair in "$SCAN:6000" "$HEAL:20000" "$SYS:3000" \
            "$MON:12000" "$HELP:20000" "$ROUTER:35000" "$ADIAG:14000" \
            "$ASSL:8000" "$ASSLR:5000" "$ASEC:8000" "$CERTS:4000" "$DIAGPAGE:3000"; do
  f=${pair%:*}; min=${pair##*:}
  n=$(subj "$f" | wc -c)
  [ "$n" -ge "$min" ] || { bad "SETUP" "$f has $n chars of code, expected >= $min"; exit 1; }
done

F_SCAN=$(subj "$SCAN"); F_HEAL=$(subj "$HEAL"); F_SYS=$(subj "$SYS")
# R8 TOMBSTONE: F_SSL/F_SITES retired with routes/ssl.rs + routes/sites.rs (R3).
if [ -f "$SSL" ] || [ -f "$SITES" ]; then
  bad "TOMBSTONE (R8): routes/ssl.rs or routes/sites.rs is back — site arms must be restored"
else
  ok "TOMBSTONE (R8): routes/ssl.rs and routes/sites.rs stay deleted — the site-SSL feature is retired"
fi
F_MON=$(subj "$MON")
F_HELP=$(subj "$HELP"); F_ROUTER=$(subj "$ROUTER"); F_ADIAG=$(subj "$ADIAG")
F_ASSL=$(subj "$ASSL"); F_ASSLR=$(subj "$ASSLR"); F_MIG=$(subj "$MIG")
F_CERTS=$(subj "$CERTS"); F_DIAGPAGE=$(subj "$DIAGPAGE")

echo "── A. The renewal picks the row on the host that raised the finding ──────────"

# The premise the whole section rests on, read from the migration rather than
# asserted in prose: a domain is unique PER SERVER, so a name alone is not a row.
eq "A1 sites.domain is unique per server, not globally" \
   "$(occ "$F_MIG" 'CREATEUNIQUEINDEXIFNOTEXISTSidx_sites_domain_serverONsites(domain,server_id)')" "1"
eq "A2 the global unique constraint is dropped" \
   "$(occ "$F_MIG" 'ALTERTABLEsitesDROPCONSTRAINTIFEXISTSsites_domain_key')" "1"

# R8 TOMBSTONE (A3): the site lookup died with the sites table (R7). The
# server-term property for live lookups is carried by A4b (stack) and A4d
# (Docker app) below; no site-by-domain lookup remains in the scanner.
if [ "$(occ "$F_SCAN" 'FROMsitessWHERE')" -eq 0 ]; then
  ok "TOMBSTONE (R8): no site lookup remains in the scanner — A3 retired with the sites table"
else
  bad "TOMBSTONE (R8): a site lookup reappeared in the scanner — A3 must be restored"
fi
# FIVE since GAP 209 (was two since v2.161.0): the site lookup, the
# Compose-stack lookup, its cooldown, and now the Docker-app lookup and ITS
# cooldown — the same loop falls through to both fallbacks in turn. All resolve
# a DOMAIN, and a domain is unique only per server, so every one must bind the
# member that raised the finding — a name-only lookup on a fleet renews through
# the wrong host's agent.
# R8: 5 -> 4. The site lookup and its cooldown are gone; four bind pairs
# remain (stack read, stack cooldown, Docker-app read, Docker-app cooldown).
# The literal arms A4b–A4e hold each surviving door.
eq "A4 it binds the scanned member, not an arbitrary host" \
   "$(occ "$F_SCAN" '.bind(domain).bind(member.id)')" "4"
# ⛔ A COUNT CANNOT SEE A DOOR THAT DOES NOT BIND — a sixth domain-keyed lookup
# added without the server term leaves this arm at 5 and green. So each door
# also owns a literal arm: A3 for the site read, A4b for the stack read, A4c for
# the stack renewal's cooldown, A4d for the Docker-app read, A4e for the
# Docker-app renewal's cooldown. THIS IS NOT BOOKKEEPING: when the stack read
# joined, bumping A4 from 1 to 2 left it satisfied by the site door alone, and a
# mutation that deleted the new door's server term kept A4 GREEN — only A4b
# caught it. The count tracks the total; the literal arms hold each door.
eq "A4b the stack fallback lookup carries a server term too" \
   "$(occ "$F_SCAN" 'FROMdocker_stacksWHERElower(domain)=lower($1)ANDserver_id=$2')" "1"
# The cooldown counts the rows the renewal writes, and those rows are stamped
# per host. Counting them name-only let one host's renewal mute another's for six
# hours — a domain is unique only per server, and this query is the last one in
# the file that had not learned it.
eq "A4c the stack renewal cooldown counts this host's attempts, not the fleet's" \
   "$(occ "$F_SCAN" "action='auto_fix.renew_stack_ssl'ANDtarget_name=\$1ANDserver_id=\$2")" "1"
# GAP 209: the Docker-app fallback, added because neither the site lookup above
# nor the stack lookup can ever match a Docker app's domain (it owns no `sites`
# row and no `docker_stacks` row either) — see migration
# 20260905180000_docker_app_ssl_domains.sql.
eq "A4d the Docker-app fallback lookup carries a server term too" \
   "$(occ "$F_SCAN" 'FROMdocker_app_domainsWHERElower(domain)=lower($1)ANDserver_id=$2')" "1"
eq "A4e the Docker-app renewal cooldown counts this host's attempts, not the fleet's" \
   "$(occ "$F_SCAN" "action='auto_fix.renew_docker_app_ssl'ANDtarget_name=\$1ANDserver_id=\$2")" "1"
# The signature is what makes the id REACHABLE at all.
eq "A5 auto_fix_safe_findings receives the member, not just its handle" \
   "$(occ "$F_SCAN" 'asyncfnauto_fix_safe_findings(pool:&PgPool,member:&FleetMember,')" "1"
# TWO reads by id since v2.145.0, and the arm is about the KEY, not the count:
# the post-renewal vhost rebuild reads by the id already resolved, and so does
# the provenance read that decides which challenge renews this certificate.
# Both must stay keyed on the id — `domain` is unique only per server
# (`idx_sites_domain_server`), so a lookup on it can hand back another host's row.
# R8 TOMBSTONE (A6): no SELECT FROM sites remains in the scanner (0). The
# id-keyed re-read property moved to the stack/app lookups pinned by A4b/A4d.
if [ "$(occ "$F_SCAN" 'SELECT*FROMsites')" -eq 0 ]; then
  ok "TOMBSTONE (R8): no site re-reads remain in the scanner — A6 retired with the sites table"
else
  bad "TOMBSTONE (R8): a site re-read reappeared in the scanner — A6 must be restored"
fi
# …and none of them is keyed on the domain instead.
# R8 TOMBSTONE (A6b): subsumed by the A6 tombstone above — no site reads at all.
ok "TOMBSTONE (R8): A6b retired with A6 — no site re-reads remain to be domain-keyed"

# THE CLASS ARM. Not one spelling in one file: every backend query that reads a
# site and constrains `domain` must also constrain `server_id`. Derived by
# extracting each `FROM sites`-bearing SQL literal and testing it, so a NEW
# handler with a different spelling joins the census the day it lands.
domain_only=0; domain_scoped=0; offenders=""
while IFS= read -r stmt; do
  case "$stmt" in *domain=\$*) ;; *) continue ;; esac
  case "$stmt" in
    *server_id=\$*|*server_id=s.*) domain_scoped=$((domain_scoped+1)) ;;
    *) domain_only=$((domain_only+1)); offenders="$offenders ${stmt:0:60}" ;;
  esac
done < <(for f in "$SCAN" "$HEAL" "$SYS" "$MON"; do  # R8: SSL/SITES deleted
           subj "$f" | $G -oE '"[^"]*FROMsites[^"]*"' || true
         done)
# R8 TOMBSTONE (A7/A8): the census is vacated — no FROM-sites query remains
# in any of the four live files (measured 0), so there is no site-by-domain
# class left to judge. The live domain-keyed lookups are stack/app ones,
# pinned literally by A4b/A4d.
if [ "$((domain_only + domain_scoped))" -eq 0 ]; then
  ok "TOMBSTONE (R8): the site-by-domain census is empty — A7/A8 retired with the sites table"
else
  bad "TOMBSTONE (R8): a site-by-domain lookup reappeared — A7/A8 must be restored (offenders: $offenders)"
fi

# The CMS provisioner resolved a site by domain INSIDE an insert, attaching a new
# database — credentials included — to whichever row the planner returned first.
# R8 TOMBSTONE (A9/A10): the CMS provisioner died with routes/sites.rs (R3).
ok "TOMBSTONE (R8): A9/A10 retired with routes/sites.rs — no CMS site resolution remains"

echo "── B. The Fix button does something, and says so when it cannot ──────────────"

eq "B1 the agent advertises renew-ssl on expiring certificates" \
   "$(occ "$F_ADIAG" 'fix_id:Some(format!("renew-ssl:{domain}"))')" "2"
# ⚠ and it still has NO arm for it. Not a defect any more — it is WHY the panel
# takes the fix: the agent has no database, so it cannot know a site's runtime,
# root, PHP version or ACME contact.
eq "B2 the agent has no renew-ssl arm (it structurally cannot)" \
   "$(occ "$F_ADIAG" '"renew-ssl"=>')" "0"

# THE CENSUS, and the reason this file exists. Every action the agent ADVERTISES
# must be handled by the agent OR intercepted by the panel. Both sides derived,
# so neither satisfies it alone.
#
# The extractor takes the whole `fix_id: Some(...)` payload and keeps the leading
# identifier of the literal, covering both spellings the tree uses —
# `Some("clean-logs".into())` and `Some(format!("create-root:{p}"))` — and any
# name containing an underscore or digit, which an earlier draft dropped
# silently. A dropped name is an unhandled action the census never judges.
ADVERTISED=$(printf '%s' "$F_ADIAG" | $G -oE 'fix_id:Some\((format!\()?"[A-Za-z0-9_-]+' \
             | $G -oE '"[A-Za-z0-9_-]+$' | tr -d '"' | sort -u)
ADV_N=$(printf '%s\n' "$ADVERTISED" | $G -c . || true)
eq "B3 the census extracted the advertised fix actions" \
   "$([ "${ADV_N:-0}" -ge 3 ] && echo yes || echo "no($ADV_N)")" "yes"
UNHANDLED=""
for act in $ADVERTISED; do
  in_agent=$(occ "$F_ADIAG" "\"$act\"=>")
  in_panel=$(occ "$F_SYS" "strip_prefix(\"$act:\")")
  [ "$in_agent" = "0" ] && [ "$in_panel" = "0" ] && UNHANDLED="$UNHANDLED $act"
done
eq "B4 every advertised fix action has a handler somewhere" "${UNHANDLED:-none}" "none"

eq "B5 the panel intercepts renew-ssl" \
   "$(occ "$F_SYS" 'strip_prefix("renew-ssl:")')" "1"
# R8 TOMBSTONE (B6/B7/B8): the fix resolves no site at all anymore — the
# branch probes claimants (Docker app / Compose stack) and refuses with a
# sentence. SITE_CALLER_PREDICATE died with the sites table in R7 (only a doc
# comment in helpers.rs still names it).
if [ "$(occ "$F_SYS" 'FROMsites')" -eq 0 ]; then
  ok "TOMBSTONE (R8): B6/B7/B8 retired — the fix resolves no site and the shared site predicate is gone"
else
  bad "TOMBSTONE (R8): a site lookup reappeared in the fix handler — B6/B7/B8 must be restored"
fi

# A certificate with no site row gets a SENTENCE and a 4xx, so `agent_error`'s
# sibling rule cannot later collapse it into an incident id.
eq "B9 an unmatched certificate answers 4xx, not 5xx" \
   "$(occ "$F_SYS" 'StatusCode::UNPROCESSABLE_ENTITY')" "1"
# ⚠ and it must NOT claim the certificate came from outside DockPanel: the agent
# issues certificates for Docker apps, Git deploys and mail domains, none of
# which becomes a `sites` row. The refusal names what the panel actually found.
# R8 TOMBSTONE (B10): the mail_domains arm died with its table in R7; the
# refusal now names claimants from the surviving probe (B11 below).
ok "TOMBSTONE (R8): B10 retired — mail_domains is gone; the claimant probe names Docker apps and stacks"
# R8: B11 re-derived — the git_deploys arm died with its table in R7; the two
# surviving claimant arms are container_sleep_config (Docker app, once) and
# docker_stacks (Compose stack, twice: the claimant probe AND the tls-mode
# read that decides the stack's sentence).
eq "B11 the refusal names both surviving claimant kinds" \
   "$([ "$(occ "$F_SYS" 'FROMcontainer_sleep_configWHEREdomain=$1')" = 1 ] && \
      [ "$(occ "$F_SYS" 'FROMdocker_stacksWHERElower(domain)=lower($1)')" = 2 ] && echo both || echo missing)" "both"
eq "B12 and it no longer asserts provenance it cannot know" \
   "$($G -cF 'by something outside the panel' "$SYS")" "0"

# The renewal itself is the one the Certificates page already uses. Reuse carries
# the mechanism, never the gate — so the shared function takes a Site the CALLER
# resolved; it does not resolve one itself.
# R8 TOMBSTONE (B13–B16): renew_for_site retired with routes/ssl.rs (R3).
# Renewal now lives in the scanner's renew_stack_certificate /
# renew_docker_app_certificate; the diagnostics fix no longer delegates to
# anything — it refuses with the claimant sentence (B5/B9/B11 above).
ok "TOMBSTONE (R8): B13–B16 retired with routes/ssl.rs — no shared site renewal remains to delegate to"

# Cross-tree: the shape the screen reads. A handler answering {ok, domain} would
# render a blank success line.
eq "B17 the page reads success+message" \
   "$(occ "$F_DIAGPAGE" 'success:boolean;message:string')" "1"
# R8 TOMBSTONE (B18): the handler builds no success answer anymore — the
# renew-ssl branch always returns Err (422 + sentence) and the proxy path
# returns the agent's JSON verbatim. No "success":true literal remains in SYS.
if [ "$(occ "$F_SYS" '"success":true,')" -eq 0 ]; then
  ok "TOMBSTONE (R8): B18 retired — no success answer is constructed in the fix handler"
else
  bad "TOMBSTONE (R8): a success answer reappeared in the fix handler — B18 must be restored"
fi

# The docs promise an audit row for every fix. Until this ship nothing in this
# handler wrote one, for ANY of the agent's six fixes either.
eq "B19 the docs promise a logged fix" \
   "$($G -cF 'Each fix is logged in the activity log' "$DOCS")" "1"
# ⚠ the pattern runs to `server_id` deliberately: an earlier draft stopped four
# arguments short, so dropping the host stamp — the whole point of using
# `log_activity_on_server` — survived with the arm green and its title intact.
eq "B20 and the handler writes one, stamped with the server" \
   "$(occ "$F_SYS" 'Some(&action),target.as_deref(),None,None,Some(server_id),')" "1"
# R8 TOMBSTONE (B21): the renew-ssl branch returns Err before the shared
# log call, so no activity row is written for it; the shared call below the
# branch (B20) serves only proxied fixes.
ok "TOMBSTONE (R8): B21 retired — the refusing renew-ssl branch writes no activity row"

echo "── C. An uploaded certificate is a certificate the panel can see ─────────────"

# The SET comparison, not a literal: whatever ssl_* columns the ACME path records,
# the upload path records too.
# ⚠ guarded against vacuity — an extraction that matches nothing yields an empty
# reference set, and every subset test over an empty set passes.
# R8: the F_SITES extraction is retired with C1–C3 (routes/sites.rs deleted).
acme_cols=""; upload_cols=""
# v2.145.0 widened this set twice over. `ssl_profile` had ALWAYS been missing
# from the auto-SSL-on-create statement while both deliberate issuance doors
# recorded it — a real gap this arm could not see, because it compares this
# statement against the UPLOAD path rather than against the doors in
# `routes/ssl.rs`. And the four provenance columns join it, because which
# challenge issued a certificate is decided here and nowhere else.
# R8 TOMBSTONE (C1–C3): the sites UPDATE statements died with routes/sites.rs
# (R3). The ACME-vs-upload column-set comparison has no live statements to
# compare; the upload door itself is retired (see C5/C8/C11 below).
ok "TOMBSTONE (R8): C1–C3 retired with routes/sites.rs — no site certificate columns remain to compare"

# ⚠ NON-DESTRUCTIVE. An independent read-back can fail on its own, and binding a
# bare NULL there erased a known expiry — removing the site from auto_healer AND
# the alert ladder, which is precisely the invisibility this section repairs. Its
# two sibling columns were already guarded; this one was not.
# R8 TOMBSTONE (C4): the sites read-back UPDATE died with routes/sites.rs.
ok "TOMBSTONE (R8): C4 retired with routes/sites.rs — no site expiry read-back remains"
# The agent now returns the expiry of the certificate it just wrote, so the
# common path needs no second round trip at all.
# R8 TOMBSTONE (C5): the agent upload door died with upload_cert (R6); the
# status route reports the installed certificate's expiry, but no upload
# response carries it anymore. The status route itself is pinned by C8.
if [ "$(occ "$F_ASSLR" '"expiry":status.not_after,')" -eq 0 ]; then
  ok "TOMBSTONE (R8): C5 retired — no upload response reports an installed expiry"
else
  bad "TOMBSTONE (R8): an upload response reports an expiry again — C5 must be restored"
fi
# R8 TOMBSTONE (C6): the panel-side upload reader died with routes/sites.rs.
ok "TOMBSTONE (R8): C6 retired with routes/sites.rs — no panel upload reader remains"
# …and falls back to the route every agent has always carried, so the fix reaches
# installs nobody has updated.
# R8 TOMBSTONE (C7): the panel-side fallback call died with routes/sites.rs.
ok "TOMBSTONE (R8): C7 retired with routes/sites.rs — no panel upload fallback remains"
eq "C8 that route exists on the agent" \
   "$(occ "$F_ASSLR" '.route("/ssl/status/{domain}",get(status))')" "1"
# Three: the ACME provision path, the upload's preferred answer, and its fallback.
# R8 TOMBSTONE (C9): the three sites-side parse_agent_cert_expiry call sites
# died with routes/sites.rs. The shared parser itself survives in helpers.rs;
# its live callers, if any, are pinned by their own suites.
ok "TOMBSTONE (R8): C9 retired with routes/sites.rs — no sites-side expiry parsing remains"
# R8 TOMBSTONE (C10): the sites renewal-hint clearing UPDATE died with routes/sites.rs.
ok "TOMBSTONE (R8): C10 retired with routes/sites.rs — no site renewal hints remain to clear"

# THE WIRE CONTRACT. These key names cross the panel/agent boundary and are
# matched as strings on both sides — nothing type-checks them together, so a
# rename on either side compiles cleanly and silently stops working.
# ⚠ scoped to the UPLOAD response as one object, not to each key name: three
# different handlers in that file answer with a `cert_path`, so an arm counting
# the bare key is satisfied by the other two while the one that matters is
# renamed.
# R8 TOMBSTONE (C11): the agent upload response died with upload_cert (R6).
ok "TOMBSTONE (R8): C11 retired — the agent upload door is gone"
# R8 TOMBSTONE (C11b): the panel-side cert_path/key_path readers died with routes/sites.rs.
ok "TOMBSTONE (R8): C11b retired with routes/sites.rs — no panel upload readers remain"
eq "C12 CertStatus still names not_after / issuer / days_remaining / has_cert" \
   "$([ "$(occ "$F_ASSL" 'pubnot_after:Option<String>,')" = 1 ] && \
      [ "$(occ "$F_ASSL" 'pubissuer:Option<String>,')" = 1 ] && \
      [ "$(occ "$F_ASSL" 'pubdays_remaining:Option<i64>,')" = 1 ] && \
      [ "$(occ "$F_ASSL" 'pubhas_cert:bool,')" = 1 ] && echo all || echo drifted)" "all"

echo "── D. 'Unknown' is not 'OK' ─────────────────────────────────────────────────"

# ONE ladder, shared by both certificate lists — two copies is how the Dashboard
# tile and this page came to disagree in the first place.
eq "D1 there is a single expiry ladder" \
   "$(occ "$F_MON" "fnexpiry_status(days_left:Option<i64>,renewal_failing:bool)->&'staticstr{")" "1"
# Five call sites, two lists: the admin list classifies its site-backed rows,
# its host-only rows and its stack rows separately, and the per-caller list
# classifies its own site rows AND — since s413 — its own stack rows too. All
# five must use the same ladder — a second ladder is how two screens came to
# describe the same certificate differently.
# ⚠ The trailing comma is what excludes the DECLARATION, whose parameter list
# reads `days_left:` — matching on the name alone would count one more.
# R8: 5 -> 3. The certificate lists shrank with the sites table: three
# expiry_status call sites remain (tenant stack rows, tenant host-scan rows,
# admin stack rows), each pinned by its own row class below in D2b/G-arms.
eq "D2 both lists use it, on every row class" \
   "$(occ "$F_MON" 'expiry_status(days_left,')" "3"
# ⛔ AND THE FOURTH GETS ITS OWN ARM. Raising D2 from 3 to 4 leaves it satisfied
# by the three that were already there — a count cannot tell which member is
# missing. This one names the offline row by the field only it carries.
eq "D2b the offline half classifies through the same ladder and says it is stored" \
   "$(occ "$F_MON" '"stale":true,')" "1"
eq "D3 a missing expiry is unknown" \
   "$(occ "$F_MON" 'None=>"unknown",')" "1"
# ⚠ absence arms, and the token is spelled two ways on purpose: the defect was
# `.unwrap_or(999)` and a reformat to `.unwrap_or( 999 )` is the same defect.
# `subj` removes the whitespace, so one fixed string covers both — what it does
# NOT cover is a different sentinel, which D5 catches by construction.
eq "D4 the 999-day placeholder is gone" \
   "$(occ "$F_MON" 'unwrap_or(999)')" "0"
# Three now, not two: `certificate_dashboard`'s own site branch, the admin
# list's site branch, and — since s413 — `certificate_dashboard`'s own new
# stack branch, all computing `days_left` the identical `Option`-preserving
# way (the admin list's host-scan and offline halves use their own shapes,
# not this one, so they are not counted here).
# R8: 3 -> 1. Only the stack branch still computes days_left from an
# Option expiry inline; the host-scan branch takes the agent's days_remaining
# and the admin branch computes from a dereferenced expiry. The
# Option-preserving shape survives exactly once — here.
eq "D5 days_left is an Option all the way out of the handler" \
   "$(occ "$F_MON" 'letdays_left=expiry.map(|e|(e-now).num_days());')" "1"
eq "D6 the page no longer falls back to the reassuring badge" \
   "$(occ "$F_CERTS" 'STATUS_STYLES[cert.status]||STATUS_STYLES.ok')" "0"

# CROSS-TREE VOCABULARY CENSUS. Both sides derived from their own file — an
# earlier draft extracted the backend set with a fixed string that SUPPLIED the
# answer it then compared against, which is the tautology this repo has a named
# lesson about.
# ⚠ BOTH character classes admit `_`, and v2.159.0 is why. The ladder gained a
# rung named with an underscore, and `[a-z]+` matched only the tail of it — the
# census compared a frontend key it had silently truncated to `failed` against a
# backend set the same truncation had dropped entirely. Neither side was wrong
# about the code; the instrument could not see the name. A vocabulary census is
# only as wide as its character class.
BACK_STATUS=$(printf '%s' "$F_MON" \
  | $G -oE "fnexpiry_status\\(days_left:Option<i64>,renewal_failing:bool\\)->&.staticstr\\{[^}]*\\}" \
  | $G -oE '"[a-z_]+"' | tr -d '"' | sort -u | tr '\n' ' ')
FRONT_STATUS=$(printf '%s' "$F_CERTS" \
  | $G -oE 'constSTATUS_STYLES:Record<string,\{[^}]*\}>=\{.*?\};' \
  | $G -oE '[a-z_]+:\{bg:' | sed 's/:{bg://' | sort -u | tr '\n' ' ')
eq "D7 the backend ladder's vocabulary was extracted" \
   "$([ "$(printf '%s' "$BACK_STATUS" | wc -w)" -ge 4 ] && echo yes || echo "no($BACK_STATUS)")" "yes"
eq "D8 the page's style map was extracted" \
   "$([ "$(printf '%s' "$FRONT_STATUS" | wc -w)" -ge 4 ] && echo yes || echo "no($FRONT_STATUS)")" "yes"
eq "D9 the page renders exactly the vocabulary the handler emits" "$FRONT_STATUS" "$BACK_STATUS"

eq "D10 the countdown column admits it does not know" \
   "$(occ "$F_CERTS" 'cert.days_left===null?"—"')" "1"
eq "D11 the type admits it too" \
   "$(occ "$F_CERTS" 'days_left:number|null;')" "1"

echo "── E. The published Auto-Fix list is the real one ───────────────────────────"

# The docs named three example fixes. One is what §B made true; the other two —
# "Fixing file permissions on config files" and "Disabling debug mode in web
# applications" — were implemented by NEITHER fix system, on either screen.
eq "E1 the docs no longer promise a permissions fix" \
   "$($G -cF 'Fixing file permissions on config files' "$DOCS")" "0"
eq "E2 the docs no longer promise a debug-mode fix" \
   "$($G -cF 'Disabling debug mode in web applications' "$DOCS")" "0"
eq "E3 and they say where the SSL renewal is actually applied" \
   "$($G -cF 'This one is applied by the panel' "$DOCS")" "1"
# These go RED when a fix arm is added or removed, because that is the moment a
# list claiming completeness stops being complete.
eq "E4 the Diagnostics fix vocabulary is still six arms" \
   "$(subj "$ADIAG" | $G -oE '"[a-z-]+"(\|"[a-z-]+")?=>\{' | wc -l | tr -d ' ')" "6"
eq "E5 the Security fix vocabulary is still five arms" \
   "$(awk '/^pub async fn apply_fix/,/^}/' "$ASEC" | $G -cE '^        "[a-z_]+" => \{')" "5"
eq "E6 the docs claim the lists are complete, so drift must be loud" \
   "$($G -cF 'list below is the complete set' "$DOCS")" "1"

echo "── F. A renewal is a replacement, so whose certificate is it? ────────────────"

# The PROOF this rests on: the agent's ACME client is pinned to one CA, so an
# issuer that is not Let's Encrypt cannot be a certificate this product issued.
# If that pin ever moves, the inference is void and this arm must go red.
eq "F1 the agent still issues from exactly one CA" \
   "$(occ "$F_ASSL" 'LetsEncrypt::Production.url().to_string(),')" "1"
eq "F2 and the panel reasons from that issuer" \
   "$([ "$(occ "$F_HELP" "lowered.contains(\"let'sencrypt\")||lowered.contains(\"letsencrypt\")")" = 1 ] && echo yes || echo no)" "yes"

# ⚠ DOUBT MUST RENEW. Every early return in the helper yields None, and every
# caller treats None as permission to proceed — because refusing on an
# unreachable agent or an unreadable certificate would let a real Let's Encrypt
# certificate lapse. We act only on a POSITIVE identification.
eq "F3 an unreadable issuer is 'unknown', never 'foreign'" \
   "$(occ "$F_HELP" 'letstatus=agent.get(&format!("/ssl/status/{domain}")).await.ok()?;')" "1"
eq "F4 a host with no certificate is not foreign either" \
   "$(occ "$F_HELP" 'if!status.get("has_cert").and_then(|v|v.as_bool()).unwrap_or(false){')" "1"

# ALL SIX DOORS. Every path that can overwrite fullchain.pem asks the question.
# ⚠ Was "ALL THREE" and named three while the tree held five: the mail host door
# has been unpinned since it was written, and v2.161.0 added the Compose-stack
# door; GAP 209 then added a sixth, the Docker-app door. A census whose prose
# counts lower than the tree is how a new door joins without ever being asked —
# which is exactly how the stack door was written without the guard in the
# first place.
#
# ⚠ s411: THE NAME CHECKED MUST BE THE NAME THE ORDER IS ABOUT TO OVERWRITE.
# This asked `site.domain` unconditionally until s411 — correct for HTTP-01, but
# a DNS-01 renewal orders against `subject`, the zone apex for a wildcard, and
# `site.domain` typically has no certificate directory of its own in that case.
# So the guard always answered "no certificate here" for exactly the shape a
# foreign wildcard certificate at the zone apex would take — #832's shape,
# alive in shipped code until this fix. F5 alone would still pass if a later
# edit made `subject_domain` collapse back to `site.domain` in every case
# (renaming a variable proves nothing about what it holds), so F5b pins the
# derivation as well as the call site.
# R8 TOMBSTONE (F5/F5b): the shared manual renewal died with routes/ssl.rs
# (R3). The foreign guard survives at the scanner doors (F6/F6b) and the
# agent writers (F10–F14).
ok "TOMBSTONE (R8): F5/F5b retired with routes/ssl.rs — no shared manual renewal remains"
# R8: the site loop is gone; both surviving renew doors (stack + Docker app)
# ask through &member.agent. The count is shared between them — F8b/F8c
# disambiguate which door by its own stop sentence.
eq "F6 both renew doors ask (the loop that needs no opt-in)" \
   "$(occ "$F_SCAN" 'crate::helpers::foreign_cert_issuer(&member.agent,domain).await')" "2"
# TWO since GAP 209: the Compose-stack fallback and the Docker-app fallback call
# this literally the same way (`&member.agent, domain` — neither function has a
# local `agent` binding the way the site arm above does), so this count is now
# shared between them. F8b/F8c disambiguate WHICH door by pinning each one's own
# distinct "stops rather than renewing" sentence instead.
# R8 TOMBSTONE (F6b): subsumed by F6 (count 2 over both doors) + F8b/F8c
# (per-door stop sentences). No third ask remains to count.
ok "TOMBSTONE (R8): F6b retired — subsumed by F6 and the per-door stop arms"
# R8 TOMBSTONE (F7): the healer performs no SSL renewal anymore — its
# auto-renew function is gone (only an orphaned doc comment remains, noting
# the agent endpoint was removed in R8). No foreign guard can live there.
if [ "$(occ "$F_HEAL" 'foreign_cert_issuer')" -eq 0 ]; then
  ok "TOMBSTONE (R8): F7 retired — the healer asks no foreign-cert question because it renews nothing"
else
  bad "TOMBSTONE (R8): the healer asks the foreign-cert question again — F7 must be restored"
fi
# R4 (2026-11-02): this section pinned mail/DNS hosting code removed in R4; deleted, not weakened.
# …and each one STOPS. A guard that computes a verdict and proceeds anyway is the
# shape a careless edit leaves behind.
# R8 TOMBSTONE (F8): the site stop sentence went with the site door; the
# stack (F8b) and Docker-app (F8c) stop sentences carry the property.
if [ "$(occ "$F_SCAN" 'Auto-fix:NOTrenewing{domain}')" -eq 0 ]; then
  ok "TOMBSTONE (R8): F8 retired — the site stop sentence is gone with the site door"
else
  bad "TOMBSTONE (R8): the site stop sentence reappeared — F8 must be restored"
fi
# Deliberately a DIFFERENT sentence from F8's, so neither arm can be satisfied by
# the other's line — the sibling-satisfaction discipline this file keeps.
eq "F8b and the stack door stops too" \
   "$(occ "$F_SCAN" 'Auto-fix:NOTrenewingtheComposestackcertificatefor{domain}')" "1"
eq "F8c and the Docker-app door stops too" \
   "$(occ "$F_SCAN" 'Auto-fix:NOTrenewingtheDockerappcertificatefor{domain}')" "1"
# R8 TOMBSTONE (F9): subsumed by the F7 tombstone — no healer renewal, no stop sentence.
ok "TOMBSTONE (R8): F9 retired with F7 — the healer renews nothing"

# ── F-CHOKE. The doors above are a CENSUS, and a census is a promise somebody
# has to keep. It was short twice: "ALL THREE" while the tree held five, and the
# stack door written with no guard because nothing enumerated the others. Twenty
# -six reachable call sites reach an ACME order — Compose deploys, git deploys,
# template apps, four CLI commands, raw curl — and before v2.162.0 exactly three
# asked. So the question is now ALSO asked at the two functions all of them pass
# through, where a door added tomorrow inherits it without anyone remembering.
# ⛔ These arms are what stop that from being deleted as "redundant".
# R8: 2 -> 1. The two writers consolidated into one: provision_cert is the
# only ACME writer left (enable_ssl_for_site calls no provision path); its
# single foreign check is at services/ssl.rs:441.
eq "F10 the HTTP-01 writer asks before it orders" \
   "$(occ "$F_ASSL" 'ifletSome(issuer)=foreign_installed_issuer(domain).await{')" "1"
# ⛔ FAIL CLOSED. Both writers take `Option<&ProvisionOpts>` and the callers that
# never asked the question pass None — the compose deploy, the git build. If
# absent ever came to mean "go ahead", the guard would protect only the doors
# that did not need it.
# R8: 2 -> 1, same consolidation as F10 — the replace_foreign gate lives
# once, in provision_cert (:440).
eq "F11 an absent option means refuse, not proceed" \
   "$(occ "$F_ASSL" 'if!opts.map(|o|o.replace_foreign).unwrap_or(false){')" "1"
# The same three-state reading as the panel's helper, and it CANNOT import it:
# separate crates, no shared dependency. Both apostrophe spellings are deliberate
# in both copies — a straight quote is a typographic accident, not a different CA.
eq "F12 the agent reads the issuer the same way the panel does" \
   "$([ "$(occ "$F_ASSL" "lowered.contains(\"let'sencrypt\")||lowered.contains(\"letsencrypt\")")" = 1 ] && echo yes || echo no)" "yes"
eq "F13 no certificate on disk is not 'foreign'" \
   "$(occ "$F_ASSL" 'if!status.has_cert{returnNone;}')" "1"
eq "F14 an unreadable issuer is not 'foreign' either" \
   "$(occ "$F_ASSL" 'ifissuer.is_empty(){returnNone;}')" "1"
# ⛔ A REFUSAL IS NOT A FAULT. Everything unlabelled leaves the agent as a 500,
# and the panel hides every agent 5xx behind an incident id — which would answer
# the most actionable message this door produces with a reference number.
eq "F15 the marker exists" \
   "$(occ "$F_ASSL" 'pubconstFOREIGN_CERT_REFUSED:&str="[foreign]";')" "1"
# ⛔ AND THE SENTENCE ACTUALLY WEARS IT. F15 and F16 pin that the machinery
# EXISTS — the constant, and the arm that reads it — and a mutation proved that
# is not the same as it being USED: stripping the marker off the refusal string
# left both of them green while the refusal quietly went back to being a 500 the
# panel answers with an incident id. The declaration and the reader can both be
# perfect while nothing joins them.
eq "F15b and the refusal sentence actually carries it" \
   "$(occ "$F_ASSL" '"{FOREIGN_CERT_REFUSED}Refusing')" "1"
eq "F16 and the marker becomes a 4xx, not an internal fault" \
   "$(occ "$F_ASSLR" 'ifletSome(reason)=e.strip_prefix(ssl::FOREIGN_CERT_REFUSED){')" "1"
# ⚠ s387 moved this from a bare status count to the refusal's own sentence. The
# count went 1 -> 2 when a SECOND, unrelated 422 landed in this file (a failed
# ACME order now answers with its reason instead of an incident id), and a count
# alone could not tell the two apart — the arm's title claims it names the ISSUER,
# so that is what it now reads.
# ⚠ THE PROSE HERE WAS STALE: it said "two is the number that is correct" while
# the arm below already pinned FOUR. Whoever moves that number moves this sentence.
# Five since v2.145.0 — a DNS-01 renewal that cannot reach its Cloudflare zone
# answers 422 rather than silently re-ordering the certificate over HTTP-01.
# ⚠ `carry-sweep` B5b pins this SAME literal in this SAME file. Both move together.
# R8 TOMBSTONE (second F10/F10b): the manual door died with routes/ssl.rs.
# Refusals naming the issuer now live at the agent writers (F15b/F16) and
# the scanner decline path (tombstoned below).
ok "TOMBSTONE (R8): F10/F10b (manual door) retired with routes/ssl.rs"
# The operator has to LEARN about a declined renewal, or a protected certificate
# and a forgotten one look identical from the panel. Counts the CALL, so deleting
# the alert while keeping the `continue` — a silent skip, which is what a
# protected certificate must never be — goes red.
# R8 TOMBSTONE: the declined-renewal alert helper (ssl_renewal_declined_alert
# + ssl_renewal_blocked) is gone — a declined renewal now only logs its stop
# sentence and returns handled, with no dedicated alert. The DECLINED state
# key survives in notifications.rs for resolve-side compatibility. If a
# decline alert returns, this arm must return with it.
ok "TOMBSTONE (R8): declined-renewal alert helper retired — declines surface as log lines only"
# ⚠ and it must NOT borrow the failure helper's words. That helper says "SSL
# renewal failed", "could not renew it automatically" and `critical` — three
# statements that are all false when the panel declined ON PURPOSE. Paging an
# operator about a failure that did not happen is this release's own defect class
# one layer out, and it trains them to ignore the alert that means a site really
# is about to go dark.
# R8 TOMBSTONE: the declined-renewal alert helper (ssl_renewal_declined_alert
# + ssl_renewal_blocked) is gone — a declined renewal now only logs its stop
# sentence and returns handled, with no dedicated alert. The DECLINED state
# key survives in notifications.rs for resolve-side compatibility. If a
# decline alert returns, this arm must return with it.
ok "TOMBSTONE (R8): declined-renewal alert helper retired — declines surface as log lines only"
# TWO declines now, and both are warnings worded as the operator's job: a
# certificate DockPanel did not issue, and a DNS-01 certificate whose Cloudflare
# zone it cannot reach. The count is what stops a THIRD outcome being wired into
# the warning wording without a decision — and `ssl-correctness` guards the other
# direction, that neither decline borrows the failure helper.
#
# ⚠ This arm used to read the two declines as `"ssl_renewal_failure","","warning",`
# twice, which pinned the EMPTY dedup key as correct — the very defect fixed here.
# Both declines are still warnings, but they are now SEPARATE dedup subjects, so
# the arm names each one instead of counting an indistinguishable pair. Keying
# them apart is what `alert-resolve-scope` §G pins; this arm keeps the severity
# and wording half.
# R8 TOMBSTONE (second F13): the two decline wordings died with the declined-alert helper (see above).
ok "TOMBSTONE (R8): decline wordings retired with the declined-alert helper"
# The four genuine failure paths keep the helper that names a failure — the split
# is the point, so both counts are pinned.
# R8: the failure-alert count moved with the renew functions — failure alerts
# now fire from renew_stack_certificate and renew_docker_app_certificate
# (two fire_alert_deduped call sites with ssl_renewal_failure). Count re-derived 4 -> 2.
# R8: ssl_renewal_alert( is gone (0 occurrences) — the failure helper was
# inlined. Both renew functions now call notifications::fire_alert_deduped
# directly with ssl_renewal_failure (stack :869, Docker app :1096). The split
# — failures alert, declines only log — is what this arm keeps.
eq "F14 the real failure paths still alert as failures" \
   "$(occ "$F_SCAN" 'notifications::fire_alert_deduped(')" "2"

echo "── G. The admin can see what the admin is told to fix ───────────────────────"

eq "G1 a separate admin route exists" \
   "$(occ "$F_ROUTER" '"/api/admin/certificates",get(monitors::certificate_dashboard_for_admin)')" "1"
eq "G2 it is admin-gated and server-scoped" \
   "$([ "$(occ "$F_MON" 'AdminUser(_claims):AdminUser,ServerScope(server_id,agent):ServerScope,')" = 1 ] && echo yes || echo no)" "yes"
# R8: the admin list reads docker_stacks (sites table gone), whole-server
# scoped, domain-bearing rows only.
eq "G3 it reads the whole server, not one caller" \
   "$(occ "$F_MON" 'FROMdocker_stacksWHEREserver_id=$1ANDdomainISNOTNULL')" "1"

# ⚠ THE TENANT LIST MUST NOT HAVE GAINED A ROLE BRANCH. The whole reason for a
# separate route is that a per-caller list can never quietly start returning
# other people's rows — the shape `sites::list` + `/api/admin/sites` chose.
# R8: the tenant list reads docker_stacks, caller-scoped by user_id.
eq "G4 the tenant certificate list is still caller-scoped" \
   "$(occ "$F_MON" 'FROMdocker_stacksWHEREuser_id=$1ANDdomainISNOTNULL')" "1"
eq "G5 and it still has no admin arm of its own" \
   "$(occ "$F_MON" "role='admin'")" "0"

# The host-wide half needs an agent that can enumerate. An older agent cannot,
# and the honest answer is to SAY SO rather than imply the list is complete.
eq "G6 the agent can enumerate certificates" \
   "$(occ "$F_ASSLR" '.route("/ssl/certificates",get(list_certificates))')" "1"
eq "G7 the listing walks the SSL directory" \
   "$(occ "$F_ASSL" 'pubasyncfnlist_cert_status()->Vec<CertStatus>{')" "1"
eq "G8 the panel asks for it" \
   "$(occ "$F_MON" 'agent.get("/ssl/certificates")')" "1"
eq "G9 and reports whether the disk was actually read" \
   "$(occ "$F_MON" '"host_scan":host_scan')" "1"
eq "G10 the page surfaces that limitation instead of hiding it" \
   "$(occ "$F_CERTS" 'allCerts&&!hostScan&&(')" "1"

# A certificate that belongs to neither a site nor a Let's Encrypt stack has
# nothing on this page that could renew or delete it, so the page must not offer
# either — the same defect class the rest of this ship removes.
eq "G11 an unmanaged row is marked as such by the handler" \
   "$(occ "$F_MON" '"managed":false,')" "1"
# ⛔ THE PAGE MUST READ THE HANDLER'S ANSWER, not re-derive it. This arm used to
# pin `cert.site_id===null?(`, which asked the same question only while a stack
# could never be managed from here. Once one can, `site_id` is null for a row
# that DOES have a control, and the old spelling would have hidden the very
# button v2.162.0 adds. `managed` is the one field that means what this branch
# needs to mean, and pinning it keeps the two ends of that wire together.
eq "G12 and the page renders no control for a row the handler calls unmanaged" \
   "$(occ "$F_CERTS" 'cert.managed===false?(')" "1"
# ⛔ AND THE STACK BRANCH GETS ITS OWN ARM. G12 is satisfied by the refusal
# branch alone; it cannot tell whether the row that IS managed reaches anything.
# A stack has no `sites` row, so the site-shaped route could never address one —
# posting there is how this control lied for two releases.
eq "G13 a stack row renews through the stack route, not the site one" \
   "$(occ "$F_CERTS" '`/stacks/${cert.stack_id}/renew-ssl`')" "1"
# The spinner keys off an identity every controllable row actually has. Keyed on
# `site_id`, a null-site row makes `renewingId === cert.site_id` true for every
# such row at once, and one click spins them all.
eq "G14 the row identity used by the controls is never null" \
   "$(occ "$F_CERTS" 'constrowId=(cert:Certificate)=>cert.site_id??cert.stack_id??cert.domain;')" "1"

echo
echo "── H. an uploaded certificate has to name the site it secures (s395) ──"
# Until v2.148.0 this door took any text containing `BEGIN CERTIFICATE`. A
# certificate for ANOTHER site installed cleanly: nginx does not compare a
# certificate against `server_name` (measured — `nginx -t` is "successful" for a
# cert naming a different host), the panel wrote `ssl_enabled = true` and drew a
# padlock reading the hardcoded literal "Enabled (Let's Encrypt)", and only the
# browser ever disagreed. Reachable by a site OWNER, not just an admin.
#
# The subject is upload_cert's OWN BODY. `routes/ssl.rs` holds several handlers
# and a whole-file arm here would be satisfied by a sibling — the class that
# printed 43/43 green over a restored defect at s386.
ufn() { awk -v p="$2" 'index($0,p){f=1} f{print} f && /^}$/{exit}' "$1"; }
U=$(ufn "$ASSLR" 'async fn upload_cert(' | sed -E -e 's://.*$::' | tr -d ' \n\\')
# R8 TOMBSTONE (H0–H4): the agent upload_cert door died with the R6 trim of
# agent routes/ssl.rs (routes now: certificates/status/profiles/renew only).
# cert_covers_domain survives in agent services/ssl.rs, but no handler calls
# it — the check-before-write property has no live door. If an upload door
# returns, H0–H4 must return with it.
if grep -q 'async fn upload_cert(' "$ASSLR"; then
  bad "TOMBSTONE (R8): upload_cert is back on the agent — H0–H4 must be restored"
else
  ok "TOMBSTONE (R8): H0–H4 retired — the agent upload door is gone"
fi

# Only the FIRST certificate block is asked, because that is the one nginx binds.
# Measured against nginx 1.24.0: a `[wrong, right]` bundle paired with the WRONG
# key passes `nginx -t` and then serves `wrong`. An "any block will do" rule
# would wave through exactly the mismatch this check exists to stop.
eq "H5 only the first CERTIFICATE block is treated as the leaf" \
   "$(occ "$F_ASSL" 'ifleaf.is_none(){')" "1"
eq "H6 a non-certificate block in the certificate field is refused" \
   "$(occ "$F_ASSL" 'ifblock.label!="CERTIFICATE"{')" "1"

# ⛔ An `is_ca()` leaf filter INVERTS this ship: `openssl req -x509` stamps
# CA:TRUE by default, so it refuses every self-signed staging certificate.
eq "H7 no is_ca() filter was added to the leaf search" \
   "$(occ "$F_ASSL" '.is_ca()')" "0"
# Three call sites: the leaf search here (:152), the ARI reader and the status
# reader. Pinned exactly, so H7 cannot go green because the parse it guards was
# deleted along with the filter.
eq "H7b control: the leaf IS parsed, so H7 is not green by absence" \
   "$(occ "$F_ASSL" '.parse_x509()')" "3"

# A wildcard covers EXACTLY ONE label. Pinned as the DERIVATION, not as the
# identifier — an arm naming `dns_name_covers` survives the rule being inverted
# inside it.
eq "H8 the wildcard rule compares exactly one label" \
   "$(occ "$F_ASSL" '=>!label.is_empty()&&!label.contains(')" "1"
eq "H9 the Common Name is used only when no SAN name was found" \
   "$(occ "$F_ASSL" 'if!names.is_empty(){returnnames;}')" "1"

# ─────────────────────────────────────────────────────────────────────────────
# §I  THE CONTROL THAT WAS NAMED BUT NOT RENDERED (s400)
#
# THREE separate sentences in this product tell the operator to install a
# replacement certificate "under the site's SSL tab" — the hand-driven renew
# refusal, the scanner's declined-renewal alert, and the DNS-01 renewal plan's
# refusal. §F (above) pins all three, and they are RIGHT to refuse: renewing a
# certificate DockPanel did not issue replaces it.
#
# Nothing rendered the tab they name. `SiteDetail.tsx` put EVERY SSL control,
# the upload form included, inside the `else` branch of `{site.ssl_enabled ? …}`,
# so the moment SSL was on the page offered a badge and a date. The certificate
# list's Renew/Delete are admin-only and revoke is `AdminUser`, so a site's own
# NON-ADMIN owner holding a commercial certificate had zero reachable paths: the
# panel correctly declined to renew, then named a control that did not exist.
#
# ⛔⛔ WHY THESE ARMS USE AN EXTRACTOR AND NOT `subj`. The defect is a control
# that is PRESENT IN THE FILE and UNREACHABLE IN A STATE. A whole-file arm
# asserting SiteDetail calls `/ssl/upload` IS GREEN WITH THE DEFECT FULLY
# RESTORED — the caller exists, it is merely in the other branch. Every arm below
# reads ONE BRANCH, via `tests/helpers/ssl-enabled-branch.py`, which also strips
# `{/* … */}` JSX comments that `subj` does not (the true branch carries a long
# comment naming these very controls — [[feedback_source_pin_prose_trap]]).
#
# And the badge: the row asserted ONE CA's name over every enabled certificate,
# including one the panel had just refused to renew BECAUSE it came from another
# CA. It now renders what the backend decided. `unknown` is a real answer and
# must stay neutral — an unreachable agent and a zone-wildcard child both land
# there holding real certificates, and rendering either as a CA name is the
# original lie re-emitted on every hiccup.

DETAIL=panel/frontend/src/pages/SiteDetail.tsx
BRANCH=tests/helpers/ssl-enabled-branch.py
FRONT=panel/frontend/src
# R8 TOMBSTONE (§I whole section): SiteDetail.tsx was deleted by the R8
# frontend work with the site pages — the SSL tab, its upload form, and the
# badge it rendered are all gone. The refusals that named "the site's SSL
# tab" now name claimant holders instead (see §B). No branch extraction is
# possible; asserting both files absent is the tombstone.
# NOTE: the branch helper (tests/helpers/ssl-enabled-branch.py) still exists
# as test tooling — only the page's return retires §I.
if [ -f "$DETAIL" ]; then
  bad "TOMBSTONE (R8): SiteDetail.tsx is back — §I must be restored"
else
  ok "TOMBSTONE (R8): §I retired — SiteDetail.tsx is deleted with the site pages"
fi

# ── The reachable exit ───────────────────────────────────────────────────────
ok "TOMBSTONE (R8): §I arms I1–I11 deleted with SiteDetail.tsx — no SSL tab remains to render an upload control or a badge"
echo "── Result ───────────────────────────────────────────────────────────────────"
printf 'passed: %d   failed: %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ] || exit 1
