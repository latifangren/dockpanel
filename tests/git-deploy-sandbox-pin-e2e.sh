#!/usr/bin/env bash
# Regression pins for s261 — the update path, and what driving it exposed.
#
# s260 shipped databases-in-backups. s261 asked the next question: does any of
# that reach the installs people already run? Driving a real v2.31.2 box up to
# v2.34.2 said yes — and the same box showed that git deploy had never worked
# on ANY hardened install, in three separate places, all the same shape: the
# agent runs ProtectSystem=strict + ProtectHome=yes, and the build path writes
# outside ReadWritePaths.
#
#   A. THE AGENT CAN WRITE WHAT ITS BUILD TOOLS NEED. `docker build` creates
#      $HOME/.docker and refuses to run without it; HOME=/root is an empty
#      read-only mount under the sandbox, so every Dockerfile deploy died at
#      "mkdir /root/.docker: read-only file system". The fix is one env var in
#      the shared helper, NOT a per-call-site patch — ~77 docker invocations go
#      through it and the one that got missed is how this stayed hidden.
#      Same shape twice more: nixpacks installed itself into /usr/local/bin and
#      cached into /var/cache/dockpanel, neither writable.
#   B. THE UPDATE'S AGENT CHECK ASKS THE AGENT. It curled an AUTHENTICATED
#      panel endpoint with no token, so it returned 401 and warned on every
#      update on every install — identically whether the agent was alive or
#      dead. A check that cannot distinguish those two states is not a check.
#   C. THE INSTALLER INSTALLS THE VERSION IT WAS GIVEN. install.sh reads
#      DOCKPANEL_VERSION and clones that ref; setup.sh, its only consumer,
#      always fetched releases/latest. `DOCKPANEL_VERSION=v2.31.2 install.sh`
#      built a v2.31.2 tree around v2.34.2 binaries and printed "v2.34.2".
#
# These are SOURCE pins and need no running panel. The behavioural proof is in
# /home/ovidiu/dockpanel-update-path-drill-s261.md.
#   run: bash tests/git-deploy-sandbox-pin-e2e.sh
set -u

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SAFECMD="$REPO/panel/agent/src/safe_cmd.rs"
UNIT="$REPO/panel/agent/dockpanel-agent.service"
UPDATE="$REPO/scripts/update.sh"
SETUP="$REPO/scripts/setup.sh"
INSTALL="$REPO/scripts/install.sh"
WEBINSTALL="$REPO/website/client/public/install.sh"

PASS=0; FAIL=0
ok()   { PASS=$((PASS+1)); printf '  \033[0;32m✓\033[0m %s\n' "$1"; }
bad()  { FAIL=$((FAIL+1)); printf '  \033[0;31m✗\033[0m %s\n' "$1"; }
has()  { grep -q  -- "$2" "$1" 2>/dev/null && ok "$3" || bad "$3"; }
hasE() { grep -qE -- "$2" "$1" 2>/dev/null && ok "$3" || bad "$3"; }
# Comment-blind variants. These pins describe the defects BY NAME in the
# comments that document each fix, so a raw grep would match the prose
# explaining the bug and pass while the code itself regressed.
#
# The comment marker is per-language: stripping `//` from a shell script would
# also eat every `http://` URL — which is exactly how the first draft of this
# file reported two false failures against correct code.
strip_comments() {
    case "$1" in
        *.rs) sed -E 's|[[:space:]]*//.*$||' "$1" ;;
        *)    sed -E 's|[[:space:]]*#.*$||'  "$1" ;;
    esac
}
code()   { strip_comments "$1" | grep -cE -- "$2" >/dev/null && ok "$3" || bad "$3"; }
nocode() { strip_comments "$1" | grep -cE -- "$2" >/dev/null && bad "$3" || ok "$3"; }

echo
echo "A. The agent can write what its build tools need"
has  "$SAFECMD" 'DOCKER_CONFIG_DIR: &str = "/var/lib/dockpanel/docker"' \
     "the docker CLI config dir is a fixed path under /var/lib/dockpanel"
code "$SAFECMD" 'cmd\.env\("DOCKER_CONFIG", DOCKER_CONFIG_DIR\)' \
     "safe_command sets DOCKER_CONFIG (env_clear means a unit Environment= cannot)"
[ "$(sed -E 's/[[:space:]]*\/\/.*$//' "$SAFECMD" | grep -c 'DOCKER_CONFIG')" -ge 4 ] \
     && ok "every helper family sets it — async, sync, and both unsandboxed" \
     || bad "every helper family sets it — async, sync, and both unsandboxed"
hasE "$UNIT" 'ReadWritePaths=.*/var/lib/dockpanel' \
     "and /var/lib/dockpanel really is writable under the unit's sandbox"
nocode "$UNIT" 'ReadWritePaths=.*(/root|/usr/local/bin)' \
     "the fix did NOT widen the sandbox to /root or /usr/local/bin"

echo "B. The update's agent check asks the agent"
code "$UPDATE" 'curl .*--unix-socket .*AGENT_SOCK.*localhost/health' \
     "the check probes the agent's own socket"
nocode "$UPDATE" 'curl.*api/system/info' \
     "it no longer curls an authenticated panel endpoint with no token"
has  "$UPDATE" 'AGENT_SOCK=/run/dockpanel/agent.sock' \
     "the modern socket path is tried first"
has  "$UPDATE" 'AGENT_SOCK=/var/run/dockpanel/agent.sock' \
     "with the legacy path as fallback, so older boxes still probe correctly"
has  "$REPO/panel/agent/src/routes/mod.rs" 'if request.uri().path() == "/health"' \
     "and /health is genuinely exempt from the agent's auth middleware"

echo
echo "C. The installer installs the version it was given"
code "$SETUP" 'DOCKPANEL_VERSION' \
     "download_binaries reads the pin instead of ignoring it"
code "$SETUP" 'Pinned release' \
     "and says so, rather than printing a version it did not install"
code "$SETUP" 'releases/latest' \
     "unpinned installs still resolve the latest release"
code "$INSTALL" 'git clone .*-b "\$VERSION"' \
     "install.sh still selects the tree by the same variable"
[ -n "$(diff "$INSTALL" "$WEBINSTALL" 2>&1)" ] \
     && bad "the advertised website copy of install.sh matches scripts/install.sh" \
     || ok "the advertised website copy of install.sh matches scripts/install.sh"

echo
echo "D. The FIRST deploy of a panel-created site (s307)"
# s261 found that git deploy had never worked on a hardened install. s307 found
# that its first run had never worked on ANY install: creating a site writes a
# filler page into the document root, and git refuses a destination that exists
# and is not empty — so the opening deploy of every site the panel itself made
# failed, taking with it every step gated on a successful deploy.
#
# Windows are bound on the declaration's own closing brace, never on a fixed
# -A count, and an empty extraction FAILS rather than passing silently.
DEPLOYSVC="$REPO/panel/agent/src/services/deploy.rs"
NGINXSVC="$REPO/panel/agent/src/services/nginx.rs"
fn_body() { perl -0777 -ne 'print $1 if /\n((?:pub )?(?:async )?fn '"$2"'\b.*?\n\})\n/s' "$1"; }

# R7 TOMBSTONE (2026-11-02): clone_or_pull is deleted with zero Rust
# callers, so the whole first-deploy staging property retires with it:
# there is no fresh clone left to stage beside the site, and no caller
# left to refuse a populated destination. Asserting the function and
# every shipped clone invocation are gone — a reintroduced clone that
# targets the site directory would fail the tombstone first, not pass
# silently as "no staging needed".
CLONE_FN="$(fn_body "$DEPLOYSVC" clone_or_pull)"
if [ -n "$CLONE_FN" ]; then
  bad "TOMBSTONE (R7): clone_or_pull is back in services/deploy.rs — the first-deploy staging arms below must be restored, not assumed"
else
  ok "TOMBSTONE (R7): clone_or_pull is gone from services/deploy.rs — the first-deploy staging property retired with it"
fi
CLONE_SHIPPED=$(sed -E 's|[[:space:]]*//.*$||' "$DEPLOYSVC" | sed -n '1,/#\[cfg(test)\]/p' | grep -cE '"clone",' || true)
if [ "${CLONE_SHIPPED:-0}" -eq 0 ]; then
  ok "TOMBSTONE (R7): no shipped clone invocation remains in services/deploy.rs (test-only git uses excluded by the same boundary §E uses)"
else
  bad "TOMBSTONE (R7): $CLONE_SHIPPED shipped clone invocation(s) remain in services/deploy.rs — the staging arms must be restored"
fi

# The merge must be entry by entry. A whole-directory rename cannot work — the
# destination is non-empty, which is the entire reason this path exists — and
# the entries the clone does NOT supply must survive, or a repository with no
# public/ leaves a static site with no document root at all.
MERGE_FN="$(fn_body "$DEPLOYSVC" merge_into)"
if [ -n "$MERGE_FN" ]; then
  ok "extracted the merge_into body — the arms below read real code"
else
  bad "merge_into is gone — the entries the clone does not supply are unprotected"
fi
printf '%s' "$MERGE_FN" | sed -E 's|[[:space:]]*//.*$||' | grep -cE 'read_dir\(from\)' >/dev/null \
  && ok "the merge walks the staged clone entry by entry" \
  || bad "the merge no longer iterates — an unreplaced document root is at risk"
# An ABSENCE arm over a window that does not exist passes having examined
# nothing, which reads exactly like a clean sweep. Assert the subject first.
if [ -z "$MERGE_FN" ]; then
  bad "the whole-destination-wipe arm has no subject to read — it cannot report a catch"
elif printf '%s' "$MERGE_FN" | sed -E 's|[[:space:]]*//.*$||' | grep -cE 'remove_dir_all\((&)?to\)' >/dev/null; then
  bad "the merge clears the whole destination — a repo without public/ loses its document root"
else
  ok "the merge never clears the whole destination, so an unreplaced document root survives"
fi

# CLASS ARM, subjects derived FROM SOURCE. The filler page is WRITTEN when a
# site is created and READ BACK when a deploy decides whether a document root
# holds a real site. If those two ever spell it separately they can drift, and
# a deploy would then either refuse every fresh site or adopt an operator's
# file. Read the sentence out of the constant, then count it across the crate.
MARKER="$(perl -0777 -ne 'print $1 if /PLACEHOLDER_MARKER: &str = "([^"]+)"/' "$NGINXSVC")"
if [ -n "$MARKER" ]; then
  ok "the filler page's identifying sentence is declared once, as a constant"
else
  bad "PLACEHOLDER_MARKER is gone — the writer and the reader can drift apart"
fi
# An empty needle makes `grep -F` match every line, so the count arm would go
# red with a meaningless five-figure number and hide WHY. Guard it explicitly.
if [ -z "$MARKER" ]; then
  bad "the re-inlining arm has no sentence to count — blocked by the missing constant above"
else
  MARKER_N=$(grep -rF -- "$MARKER" "$REPO/panel/agent/src" 2>/dev/null | wc -l)
  if [ "$MARKER_N" -eq 1 ]; then
    ok "and nothing re-inlines it — $MARKER_N occurrence in panel/agent/src, the declaration"
  else
    bad "the sentence appears $MARKER_N times in panel/agent/src — writer and reader can now disagree"
  fi
fi
code "$NGINXSVC" 'read_to_string\(path\)' \
     "the page is recognised by CONTENT — an operator's own index.html is not ours to delete"
# R6 (2026-11-02): the put_site arm is deleted with routes/nginx.rs::put_site,
# removed in the R6 nginx split. The placeholder_page helper itself survives
# in services/nginx.rs and is still read via is_placeholder_page by deploy.rs.

# CLASS ARM: every path in this file that materialises a checkout on disk must
# hand it to the user the web server runs as. atomic_deploy always did; the
# non-atomic path never did, so a green deploy left a tree the application
# could not write to. Subjects are the clone invocations, found here rather
# than listed — but only the ones that SHIP. This arm's first run went red on
# two subjects inside the file's own test module, which run git against scratch
# directories and hold no site to hand over; the arm was right and the class
# definition was loose, so the boundary is drawn here and the count is printed
# rather than filtered away in silence.
SHIPPED=$(sed -E 's|[[:space:]]*//.*$||' "$DEPLOYSVC" | sed -n '1,/#\[cfg(test)\]/p')
ALL_CLONES=$(sed -E 's|[[:space:]]*//.*$||' "$DEPLOYSVC" | grep -cE '"clone",')
CHOWN_SUBJECTS=$(grep -cE '"clone",' <<< "$SHIPPED")
CHOWN_N=$(grep -cE 'hand_tree_to_web_user\(' <<< "$SHIPPED")
# The helper is called once per shipped checkout path plus once at its own
# declaration, so the subject count is the callers.
CHOWN_CALLS=$(grep -cE '^\s*hand_tree_to_web_user\(&' <<< "$SHIPPED")
# R6 re-derivation: atomic_deploy's clone path was deleted in R6, leaving ONE
# shipped checkout path (clone_or_pull). The property is unchanged — every
# shipped path reaches the handover — so the floor tracks the surviving
# path count (1), not the historical 2.
# R7 re-derivation: clone_or_pull was deleted too, leaving ZERO shipped
# checkout paths. The tombstone asserts the zero and that the handover
# helper itself survives (its own arm below still pins what it does).
if [ "$CHOWN_SUBJECTS" -eq 0 ] && [ "$CHOWN_CALLS" -eq 0 ]; then
  ok "TOMBSTONE (R7): 0 shipped checkout paths remain — the handover property retired with clone_or_pull, and no path deploys without one"
else
  bad "TOMBSTONE (R7): $CHOWN_SUBJECTS shipped checkout paths but only $CHOWN_CALLS reach the handover — a deploy succeeds and the app cannot write"
fi

# PAIRED WITH THE ABOVE: the ownership work moved into a helper at v2.64.2, and
# an arm that only checks the callers reach it would stay green if the helper
# stopped doing the job. Extracting a helper moves the subject of every pin that
# measured it, so both halves are pinned: the callers reach it, and it still
# hands the tree over.
HAND_FN="$(fn_body "$DEPLOYSVC" hand_tree_to_web_user)"
if [ -n "$HAND_FN" ] \
   && grep -qE 'args\(\["-R", "www-data:www-data"' <<< "$HAND_FN"; then
  ok "and hand_tree_to_web_user still chowns the tree to www-data"
else
  bad "hand_tree_to_web_user no longer chowns to www-data — every caller is now a no-op"
fi

# THE ESCALATION ARM. v2.64.0 chowned the whole checkout, `.git` included, and
# v2.64.1 then told git to accept a repository it did not own. Together those
# let a compromised site write `.git/config` and have root execute it on the
# next deploy — reproduced end to end with no hook file at all, via one
# `core.fsmonitor` line. The handover must therefore SKIP the repository, and
# take it back for root afterwards. Both halves, because either alone is the
# defect.
if grep -qE 'OsStr::new\("\.git"\)' <<< "$SHIPPED" \
   && grep -qE 'continue;' <<< "$SHIPPED"; then
  ok "the handover skips .git rather than handing the repository to the web user"
else
  bad "the handover no longer skips .git — the site can write config and hooks that root executes"
fi
if grep -qE 'args\(\["-R", "root:root", &git_dir\]\)' <<< "$SHIPPED" \
   && grep -qE 'args\(\["-R", "go-rwx", &git_dir\]\)' <<< "$SHIPPED"; then
  ok "and the repository is taken back for root, unreadable to anyone else"
else
  bad "the repository is not reclaimed as root-only — a checkout inherited from v2.64.x stays writable"
fi

# The site directory carries the sticky bit, or the application can simply
# unlink a root-owned `.git` and leave a repository of its own in its place —
# which would defeat every arm above without touching one of them.
if grep -qE 'args\(\["3775", dir\]\)' <<< "$SHIPPED"; then
  ok "and the site directory is setgid+sticky, so the site cannot replace .git wholesale"
else
  bad "the site directory is not sticky — the application can unlink .git and plant its own"
fi

# R7 TOMBSTONE: the discard CALL lived in clone_or_pull and died with it;
# the helper itself survives in the file (and still removes the foreign
# repo), but no shipped code runs git against a foreign repo any more.
# Asserting helper-present + no-caller, so a reintroduced git path that
# adopts a foreign repo fails here first.
if grep -qE 'fn discard_repo_we_do_not_own' <<< "$SHIPPED" \
   && grep -qE 'remove_dir_all\(&git_dir\)' <<< "$SHIPPED" \
   && ! grep -qE 'discard_repo_we_do_not_own\(&site_dir' <<< "$SHIPPED"; then
  ok "TOMBSTONE (R7): the discard helper survives but no shipped caller remains — nothing runs git against a repo root does not own"
else
  bad "TOMBSTONE (R7): the discard helper is gone, or a shipped caller adopts a foreign repository again — the escalation survives an upgrade"
fi


# CLASS ARM: chowning a checkout to the web server's user and then reading it
# back as root is a pair, and the second half is easy to forget. Git refuses a
# repository owned by somebody else, so EVERY `git -C` in this file that points
# at a path the agent hands to www-data must also declare that path safe — and
# it must be command scope, because git ignores `safe.directory` written in the
# repository's own config. Found by driving: the FIRST deploy worked and the
# SECOND failed, and `list_releases` had been answering None on every atomic
# release since the chown was written. Subjects are found, not listed.
#
# ⚠ Subjects are GIT invocations, which is narrower than "lines containing -C".
# This arm's first run counted 6 and found 5, because `generate_deploy_key`
# passes ssh-keygen a `-C` too — and there it means the key's COMMENT, not a
# directory. Two programs, one flag spelling, one wrong class. The subject list
# is therefore resolved back to the command being run, and the non-git match is
# printed rather than dropped in silence.
CLASSIFY='
  my @lines = split /\n/, $src; my ($git, $safe, $other) = (0,0,0); my $cur = "";
  for my $l (@lines) {
    $cur = "git"     if $l =~ /safe_command(?:_sync)?\("git"\)/;
    $cur = "notgit"  if $l =~ /safe_command(?:_sync)?\("(?!git")[^"]+"\)/;
    next unless $l =~ /"-C",/;
    if ($cur eq "git") { $git++; }
    else               { $other++; }
  }
  for my $l (@lines) { $safe++ if $l =~ /"-c",\s*&(?:safe_dir|format!\("safe\.directory)/; }
  print "$git $safe $other";
'
read -r CGIT CSAFE COTHER <<< "$(SRC="$SHIPPED" perl -e '$src=$ENV{SRC};'"$CLASSIFY")"
# ⚠ INVERTED AT v2.64.2, and the inversion is the point. This arm used to demand
# a `safe.directory` on every shipped `git -C`. That demand was the escalation:
# the exception exists to let root operate on a tree somebody else owns, and the
# somebody else here is the web user. The requirement is now the opposite — the
# ownership guard stays switched ON, and the repository is kept root's instead.
# R6 re-derivation: atomic_deploy's git -C was deleted in R6, leaving 3 shipped
# git -C invocations. The property is unchanged — none lifts the guard — so
# the floor tracks the surviving count (3); CSAFE == 0 is the whole point.
# R7 re-derivation: clone_or_pull's git -C invocations were deleted too,
# leaving ZERO shipped git -C invocations. The tombstone asserts the zero
# in both counters — no git runs, so no guard can be lifted.
if [ "${CGIT:-0}" -eq 0 ] && [ "${CSAFE:-0}" -eq 0 ]; then
  ok "TOMBSTONE (R7): no shipped git -C invocation remains ($COTHER non-git -C excluded by name) — nothing left to lift the ownership guard"
else
  bad "TOMBSTONE (R7): $CSAFE of $CGIT shipped git -C invocations still declare a directory safe — root will run git out of a tree the site controls"
fi

# The suppression pair, on every shipped git invocation. Ownership is the real
# control; this is what protects a site upgrading from v2.64.x, whose repository
# was writable and may already carry a payload. Command scope beats repo config,
# so it is inert from the first deploy after this version.
GITCMDS=$(grep -cE 'safe_command(_sync)?\("git"\)' <<< "$SHIPPED" || true)
NOEXEC_N=$(grep -cE '\.args\(GIT_NO_EXEC\)' <<< "$SHIPPED" || true)
# R7 TOMBSTONE: the shipped git invocations are gone with clone_or_pull, so
# the pair property retires — but the GIT_NO_EXEC constant itself must
# survive (the hooks/fsmonitor arm below still pins its coverage), or a
# future git path would have no suppression to carry.
if [ "$GITCMDS" -eq 0 ] && [ "$NOEXEC_N" -eq 0 ] && grep -qE 'const GIT_NO_EXEC' <<< "$SHIPPED"; then
  ok "TOMBSTONE (R7): 0 shipped git invocations remain and the GIT_NO_EXEC constant survives for any future git path"
else
  bad "TOMBSTONE (R7): $GITCMDS shipped git invocations but only $NOEXEC_N carry GIT_NO_EXEC — repo config can still execute"
fi
if grep -qE 'core\.hooksPath=' <<< "$SHIPPED" && grep -qE '"core\.fsmonitor="' <<< "$SHIPPED"; then
  ok "and GIT_NO_EXEC suppresses BOTH hooks and fsmonitor — a hook file is not the only vector"
else
  bad "GIT_NO_EXEC no longer covers both vectors; core.fsmonitor alone needs no hook file and no executable bit"
fi

# R7 TOMBSTONE: the reset whose status was read lived in clone_or_pull's
# pull branch and died with it. Asserting no git reset remains in shipped
# code — a reintroduced pull branch that ignores its reset status would
# fail here first.
if grep -qE 'reset\.status|"reset"' <<< "$SHIPPED"; then
  bad "TOMBSTONE (R7): a git reset is back in shipped code without the status-read arm below it — a failed reset would report a successful deploy"
else
  ok "TOMBSTONE (R7): no git reset remains in shipped code — the pull branch that read its status is deleted with clone_or_pull"
fi

echo
printf 'passed %d, failed %d\n' "$PASS" "$FAIL"
[ "$FAIL" -eq 0 ]
