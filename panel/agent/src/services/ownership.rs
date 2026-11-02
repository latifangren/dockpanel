//! A delete must prove it owns what it deletes.
//!
//! v2.52.0 fixed the *write* side of this mistake: a vhost writer that replaced
//! a file and, when the whole-server `nginx -t` failed, deleted it — so a
//! neighbour's broken config cost an innocent site its own. The read side was
//! left standing, and it is the same shape one step later: a *removal* that
//! names its target by a key it never checked belongs to the thing being
//! removed.
//!
//! Two ways the key lies.
//!
//! **It is derived from an identity nobody re-verified.** A Docker app's domain
//! lives in the `dockpanel.app.domain` label. Removing the app deletes
//! `/etc/nginx/sites-enabled/{domain}.conf` — but by then that vhost may belong
//! to a site, because on any box installed before v2.52.0 nothing stopped a site
//! from claiming a domain an app already held.
//!
//! **It is not injective.** `domain.replace('.', "-")` maps `a.b.com` and
//! `a-b.com` onto one name, and `-` is legal inside a domain label, so both are
//! separately claimable and separately deletable by different owners. That is
//! the bug `traefik::route_key` was written to fix — and the fix is only half
//! applied while `remove_route_config` still deletes the pre-fix name, which is
//! the *current* name of a different live domain.
//!
//! The remedy in both cases is the same and needs no rename, no migration and no
//! new database column: **every one of these resources already records its own
//! owner**, because the panel wrote it there. A systemd unit carries the
//! `WorkingDirectory` of the site it runs. A Fail2Ban jail carries the `logpath`
//! it watches. A Traefik route carries its `Host()` rule. An app's vhost carries
//! the `proxy_pass` port of the container behind it. So do not trust the
//! filename — open the file and ask who it says it belongs to.
//!
//! [`Owner::Unknown`] deliberately does **not** permit a delete. Leaving a stale
//! config behind is an untidy box; deleting a live one is an outage nobody can
//! attribute. The asymmetry is the whole point, so every caller logs the refusal
//! loudly enough that the leftover is findable.
//!
//! # Containers
//!
//! Everything above reads a file. That left the largest resource the agent
//! destroys — a running container — with no primitive at all, and the same two
//! ways for a key to lie apply to it word for word. The git-deploy container
//! spaces that once needed a label-based proof (`dockpanel-git-*` deploys and
//! `pr.`-scoped previews) were removed with the git-deploy feature; what
//! remains here is the blue-green stand-in guard ([`blue_leftover`]) and the
//! app-vhost port proof ([`app_vhost`]). Same remedy as above — do not trust
//! the name, open the thing and ask.

/// Who a resource on disk says it belongs to.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Owner {
    /// The file names this domain. Deleting it is correct.
    Ours,
    /// The file names something else. Deleting it destroys another owner's
    /// configuration.
    Theirs,
    /// The file could not be read, or carries no marker to judge by. Treated as
    /// `Theirs` by [`Owner::may_delete`] — see the module note on fail-closed.
    Unknown,
}

impl Owner {
    /// The only question a caller should ask. `Unknown` is not a maybe.
    pub fn may_delete(self) -> bool {
        matches!(self, Owner::Ours)
    }
}

/// The suffix a blue-green swap parks its stand-in container under.
///
/// It was `-blue`, which is not a space anybody owns: `is_valid_name` accepts
/// `api-blue`, so `dockpanel-app-api-blue` is *simultaneously* the stand-in for
/// the app `api` and the production container of the app `api-blue` — and the
/// leftover-cleanup that runs before every swap force-removed whatever it
/// found there. The separator is now `.`, which `is_valid_name` rejects, so no
/// deployment can be standing in this space to begin with.
pub const BLUE_SUFFIX: &str = ".blue";

/// Compose the blue-green stand-in name for `container_name`.
pub fn blue_name(container_name: &str) -> String {
    format!("{container_name}{BLUE_SUFFIX}")
}

/// May the container found at a [`blue_name`] be force-removed as the leftover
/// of an interrupted swap?
///
/// The load-bearing half of that question is answered by [`BLUE_SUFFIX`]: no
/// panel resource can be named into that space, so nothing legitimate is
/// standing there. This is the second half — Docker itself will accept a `.` in
/// a name typed by hand, and an operator's own container is not ours to
/// destroy. `Unknown` for anything that does not say it is managed.
pub fn blue_leftover(labels: Option<&std::collections::HashMap<String, String>>) -> Owner {
    match labels
        .and_then(|l| l.get("dockpanel.managed"))
        .map(String::as_str)
    {
        Some("true") => Owner::Ours,
        _ => Owner::Unknown,
    }
}

/// Read `path` and decide ownership by whether any line, trimmed, equals one of
/// `markers`.
///
/// Whole-line equality rather than `contains`, because every marker here embeds
/// a domain and `contains` would let `example.com` answer for
/// `example.community` — the same unanchored-substring defect that let one
/// site's WordPress auto-update cron strip another's.
fn owner_by_lines(path: &str, markers: &[String]) -> Owner {
    let Ok(content) = std::fs::read_to_string(path) else {
        return Owner::Unknown;
    };
    if content
        .lines()
        .any(|line| markers.iter().any(|m| line.trim() == m))
    {
        Owner::Ours
    } else {
        Owner::Theirs
    }
}

/// Does the systemd unit at `path` run `domain`'s app process?
///
/// `create_app_service` writes a `WorkingDirectory` under `/var/www/{domain}` and
/// `Description=DockPanel App: {domain}`; either identifies the owner, and a
/// hand-edited description should not be able to make the unit undeletable, so
/// both are accepted.
///
/// ⚠ BOTH working-directory forms are listed, and the `/public` one may not be
/// dropped. Units written before v2.123.0 hardcoded `{domain}/public`; v2.123.0
/// starts the process at the site root instead (the crash-loop fix in
/// `app_process`). Recognising only the new form would hand every unit already on
/// disk to the `Theirs` branch — `owned_service_name` refuses to stop, restart or
/// delete one of those — so an upgrade would strand exactly the sites the release
/// exists to repair. The `Description` marker happens to cover the same case, but
/// this function's whole reason for accepting two markers is that either one alone
/// can be edited away.
// R6: callers were app-service management deleted in R6. Retained as a generic unit-ownership predicate; tests still exercise it.
#[allow(dead_code)]
pub fn systemd_unit(path: &str, domain: &str) -> Owner {
    owner_by_lines(
        path,
        &[
            format!("WorkingDirectory=/var/www/{domain}"),
            format!("WorkingDirectory=/var/www/{domain}/public"),
            format!("Description=DockPanel App: {domain}"),
        ],
    )
}

/// Does the Fail2Ban jail at `path` watch `domain`'s access log?
///
/// The jail's `logpath` is the one line that says what it is actually
/// protecting, which is exactly what the colliding `nginx-{mangled}.conf`
/// filename does not.
// R6: callers were nginx site handlers deleted in R6. Retained as an ownership probe; the ownership-delete pin asserts its existence.
#[allow(dead_code)]
pub fn fail2ban_jail(path: &str, domain: &str) -> Owner {
    owner_by_lines(
        path,
        &[format!("logpath = /var/log/nginx/{domain}.access.log")],
    )
}


/// Does the Traefik dynamic route file at `path` route `domain`?
///
/// Both the plain and the TLS router emit the same `rule:` line, so one marker
/// covers both shapes `write_route_config` produces.
pub fn traefik_route(path: &str, domain: &str) -> Owner {
    owner_by_lines(path, &[format!("rule: \"Host(`{domain}`)\"")])
}

/// Is the nginx vhost at `path` the one serving the container published on
/// `host_port`?
///
/// An app's vhost is rendered from the same template a site's is, so the file
/// carries nothing that says "an app wrote this". What it does carry is the
/// `proxy_pass` line naming the container's own published port, and Docker will
/// not let two containers publish the same host port — so the port is the
/// app's identity in the only place the vhost records it.
///
/// `None` for the port means the container's binding could not be read; that is
/// `Unknown`, and the caller must not delete.
pub fn app_vhost(path: &str, host_port: Option<u16>) -> Owner {
    let Some(port) = host_port else {
        return Owner::Unknown;
    };
    let Ok(content) = std::fs::read_to_string(path) else {
        return Owner::Unknown;
    };
    let marker = format!("proxy_pass http://127.0.0.1:{port};");
    if content.lines().any(|line| line.trim() == marker) {
        Owner::Ours
    } else {
        Owner::Theirs
    }
}

/// Is the certificate directory `/etc/dockpanel/ssl/{domain}` still referenced
/// by a vhost other than `domain`'s own?
///
/// A DNS-01 wildcard is provisioned once under the zone apex and every site in
/// the zone points its `ssl_certificate` at that one directory. Deleting it
/// because *one* of those sites went away leaves the others pointing at a
/// missing file — which does not fail now, because nginx is already serving from
/// memory, but fails the next `nginx -t` anyone triggers and leaves nginx down
/// at the next full restart, for every site on the box.
///
/// Answered by reading the vhosts rather than the database because the agent has
/// no database, and because the vhosts are what nginx will actually parse.
pub fn cert_dir_in_use_elsewhere(domain: &str) -> bool {
    let needle = format!("/etc/dockpanel/ssl/{domain}/");
    let own = format!("{domain}.conf");
    let Ok(entries) = std::fs::read_dir(super::nginx::sites_dir()) else {
        // Cannot tell — assume shared. Refusing to delete a cert directory is
        // recoverable; deleting one another vhost still points at is not.
        return true;
    };
    for entry in entries.flatten() {
        let name = entry.file_name();
        let name = name.to_string_lossy();
        if name == own.as_str() {
            continue;
        }
        if let Ok(content) = std::fs::read_to_string(entry.path()) {
            if content.contains(&needle) {
                return true;
            }
        }
    }
    false
}

/// Is the registered certificate `alias` still referenced by any vhost on this
/// box — in service or parked?
///
/// The same question as [`cert_dir_in_use_elsewhere`] asked of the other tree,
/// with one difference: there is no "own" vhost to skip, because a registered
/// certificate belongs to no domain. Any vhost naming its directory is a reason
/// not to delete it — a parked one included, since enabling that site would put
/// a vhost pointing at a missing file back into service, which fails the next
/// `nginx -t` for every site on the box.
///
/// Answered from the vhosts rather than the panel's database for the reason the
/// sibling gives: the agent has no database, and the vhosts are what nginx will
/// actually parse. A vhost tree that cannot be read is assumed to reference it.
pub fn registry_cert_in_use(alias: &str) -> bool {
    let needle = format!("{}/{alias}/", super::ssl::SSL_REGISTRY_DIR);
    registry_needle_in_use(
        &needle,
        std::path::Path::new(super::nginx::sites_dir()),
        // The parent of the parked path `nginx::vhost_paths` spells — the SAME
        // directory as the live one on the RHEL family, which has no second
        // directory; `registry_needle_references` skips the double scan then.
        std::path::Path::new(super::nginx::parked_dir()),
    )
}

/// Every vhost file that names the registered certificate `alias`, in service
/// or parked — so a refusal to delete it can say WHICH files, and the operator
/// knows whether to move a domain or clear a parked configuration. `Err` means
/// a tree could not be read, which the caller must treat as "in use".
pub fn registry_cert_references(alias: &str) -> Result<Vec<String>, String> {
    let needle = format!("{}/{alias}/", super::ssl::SSL_REGISTRY_DIR);
    registry_needle_references(
        &needle,
        std::path::Path::new(super::nginx::sites_dir()),
        std::path::Path::new(super::nginx::parked_dir()),
    )
}

/// The directory walk behind [`registry_cert_in_use`], with the two roots as
/// arguments so a test can point it at a scratch tree. `true` for any
/// reference, and for a tree that could not be read.
fn registry_needle_in_use(
    needle: &str,
    live_dir: &std::path::Path,
    parked_dir: &std::path::Path,
) -> bool {
    match registry_needle_references(needle, live_dir, parked_dir) {
        Ok(refs) => !refs.is_empty(),
        Err(_) => true,
    }
}

/// The files under the two roots whose text names `needle`.
///
/// Both trees are read whole — the parked one too, without filtering on the
/// parked filename, which `nginx::vhost_paths` alone may spell. A hand-kept
/// copy in that directory naming the pair is a reader nginx could be handed
/// next, so it counts. An unreadable in-service tree is an error. A parked
/// tree that does not exist holds nothing parked; any other failure to read
/// it is an error for the same fail-closed reason as the sibling — refusing a
/// delete is recoverable, deleting a referenced pair is not.
fn registry_needle_references(
    needle: &str,
    live_dir: &std::path::Path,
    parked_dir: &std::path::Path,
) -> Result<Vec<String>, String> {
    let mut found = Vec::new();
    let live = std::fs::read_dir(live_dir)
        .map_err(|e| format!("cannot read {}: {e}", live_dir.display()))?;
    for entry in live.flatten() {
        if let Ok(content) = std::fs::read_to_string(entry.path()) {
            if content.contains(needle) {
                found.push(entry.path().display().to_string());
            }
        }
    }
    // The RHEL family has no separate parked directory (see `nginx::parked_dir`)
    // — live and parked are the same path there, and the live scan above
    // already covered it. Scanning again would list every match twice.
    if parked_dir == live_dir {
        return Ok(found);
    }
    let parked = match std::fs::read_dir(parked_dir) {
        Ok(parked) => parked,
        Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(found),
        Err(e) => return Err(format!("cannot read {}: {e}", parked_dir.display())),
    };
    for entry in parked.flatten() {
        if let Ok(content) = std::fs::read_to_string(entry.path()) {
            if content.contains(needle) {
                found.push(entry.path().display().to_string());
            }
        }
    }
    found.sort();
    Ok(found)
}

#[cfg(test)]
mod tests {
    use super::*;

    /// A file under the process temp dir, named uniquely so parallel test
    /// threads cannot collide. Matches the idiom in `services::files`.
    struct Tmp(std::path::PathBuf);

    impl Drop for Tmp {
        fn drop(&mut self) {
            std::fs::remove_file(&self.0).ok();
        }
    }

    fn tmpfile(body: &str) -> (Tmp, String) {
        let path = std::env::temp_dir().join(format!("dp-own-{}", uuid::Uuid::new_v4()));
        std::fs::write(&path, body).unwrap();
        let s = path.to_string_lossy().into_owned();
        (Tmp(path), s)
    }

    #[test]
    fn a_missing_file_is_unknown_and_unknown_may_not_delete() {
        assert_eq!(systemd_unit("/nonexistent/unit.service", "a.com"), Owner::Unknown);
        assert!(!Owner::Unknown.may_delete());
        assert!(!Owner::Theirs.may_delete());
        assert!(Owner::Ours.may_delete());
    }

    #[test]
    fn the_systemd_collision_that_motivated_this_is_refused() {
        // `a.b.com` and `a-b.com` both mangle to `dockpanel-app-a-b-com`, so the
        // owner of one used to be able to delete the unit of the other.
        let (_d, p) = tmpfile(
            "[Unit]\nDescription=DockPanel App: a.b.com\n\n[Service]\n\
             WorkingDirectory=/var/www/a.b.com/public\nExecStart=node server.js\n",
        );
        assert_eq!(systemd_unit(&p, "a.b.com"), Owner::Ours);
        assert_eq!(systemd_unit(&p, "a-b.com"), Owner::Theirs);
    }

    /// v2.123.0 moved a managed process off `{domain}/public` and onto the site
    /// root. Ownership is keyed on that very line, so BOTH spellings have to be
    /// recognised — and the one that matters on an upgrade is the OLD one: every
    /// unit already on disk carries it, and `owned_service_name` refuses to stop,
    /// restart or delete anything this function calls `Theirs`. Dropping the
    /// superseded marker would strand exactly the sites the release repairs.
    ///
    /// The description is deliberately omitted from both fixtures. With it
    /// present either marker alone satisfies the check, and the arm would pass
    /// without ever exercising the WorkingDirectory line it exists to pin.
    #[test]
    fn both_working_directory_forms_are_ours_and_neither_leaks_to_a_collision() {
        let (_d1, new_form) =
            tmpfile("[Service]\nWorkingDirectory=/var/www/a.b.com\nExecStart=node server.js\n");
        assert_eq!(systemd_unit(&new_form, "a.b.com"), Owner::Ours);
        assert_eq!(systemd_unit(&new_form, "a-b.com"), Owner::Theirs);

        let (_d2, old_form) = tmpfile(
            "[Service]\nWorkingDirectory=/var/www/a.b.com/public\nExecStart=node server.js\n",
        );
        assert_eq!(systemd_unit(&old_form, "a.b.com"), Owner::Ours);
        assert_eq!(systemd_unit(&old_form, "a-b.com"), Owner::Theirs);

        // The site-root marker is a strict PREFIX of the public one, so an
        // unanchored comparison would let a unit for `a.b.com` answer for a
        // sibling whose name merely starts the same way. `owner_by_lines` compares
        // whole trimmed lines; this asserts it stays that way.
        assert_eq!(systemd_unit(&new_form, "a.b.co"), Owner::Theirs);
    }

    #[test]
    fn the_fail2ban_collision_is_refused_on_the_same_pair() {
        let (_d, p) = tmpfile(
            "[nginx-a-b-com]\nenabled = true\nfilter = nginx-http-auth\n\
             logpath = /var/log/nginx/a.b.com.access.log\nmaxretry = 10\n",
        );
        assert_eq!(fail2ban_jail(&p, "a.b.com"), Owner::Ours);
        assert_eq!(fail2ban_jail(&p, "a-b.com"), Owner::Theirs);
    }

    #[test]
    fn the_traefik_legacy_name_names_a_different_live_domain() {
        // `legacy_route_config_path("a-b.com")` is `a-b-com.yml`, which is
        // `route_key("a.b.com")` — the file below. Deleting it on behalf of
        // `a-b.com` is what this refuses.
        let (_d, p) = tmpfile(concat!(
            "http:\n",
            "  routers:\n",
            "    a-b-com:\n",
            "      rule: \"Host(`a.b.com`)\"\n",
            "      entryPoints:\n",
            "        - web\n",
        ));
        assert_eq!(traefik_route(&p, "a.b.com"), Owner::Ours);
        assert_eq!(traefik_route(&p, "a-b.com"), Owner::Theirs);
    }

    #[test]
    fn a_vhost_proxying_to_another_port_is_not_this_apps() {
        let (_d, p) = tmpfile(concat!(
            "server {\n",
            "  server_name app.example.com;\n",
            "  location / {\n",
            "    proxy_pass http://127.0.0.1:8080;\n",
            "  }\n",
            "}\n",
        ));
        assert_eq!(app_vhost(&p, Some(8080)), Owner::Ours);
        assert_eq!(app_vhost(&p, Some(9090)), Owner::Theirs);
        // A container whose port binding could not be read decides nothing.
        assert_eq!(app_vhost(&p, None), Owner::Unknown);
    }

    #[test]
    fn markers_are_whole_line_so_a_prefix_domain_cannot_answer_for_a_longer_one() {
        // The unanchored-substring class: `example.com` must not match
        // `example.community`, which is a separately registerable domain.
        let (_d, p) = tmpfile(
            "[Unit]\nDescription=DockPanel App: example.community\n\n[Service]\n\
             WorkingDirectory=/var/www/example.community/public\n",
        );
        assert_eq!(systemd_unit(&p, "example.community"), Owner::Ours);
        assert_eq!(systemd_unit(&p, "example.com"), Owner::Theirs);
    }

    #[test]
    fn a_file_with_no_marker_at_all_is_theirs_not_ours() {
        let (_d, p) = tmpfile("[Unit]\nDescription=Something an operator wrote\n");
        assert_eq!(systemd_unit(&p, "a.com"), Owner::Theirs);
    }

    fn labelled(pairs: &[(&str, &str)]) -> std::collections::HashMap<String, String> {
        pairs
            .iter()
            .map(|(k, v)| ((*k).to_string(), (*v).to_string()))
            .collect()
    }

    #[test]
    fn the_blue_stand_in_space_cannot_hold_a_real_deployment() {
        // The defect: `is_valid_name` accepts `api-blue`, so the app whose
        // container is `dockpanel-app-api-blue` WAS the stand-in name for the
        // app `api`, and was force-removed every time `api` was updated.
        assert_eq!(blue_name("dockpanel-app-api"), "dockpanel-app-api.blue");
        assert_ne!(blue_name("dockpanel-app-api"), "dockpanel-app-api-blue");
        // Nothing the panel will name can land in that space.
        assert!(!crate::routes::is_valid_name("api.blue"));
        assert!(crate::routes::is_valid_name("api-blue"));
    }

    #[test]
    fn an_operators_own_container_is_not_ours_to_force_remove() {
        // Docker accepts a hand-typed `.` even though the panel does not.
        assert_eq!(blue_leftover(None), Owner::Unknown);
        assert!(!blue_leftover(None).may_delete());
        let handmade = labelled(&[("com.example.stack", "mine")]);
        assert!(!blue_leftover(Some(&handmade)).may_delete());
        let ours = labelled(&[("dockpanel.managed", "true")]);
        assert!(blue_leftover(Some(&ours)).may_delete());
    }

    /// A scratch vhost tree: an in-service directory and a parked one.
    struct TmpTree(std::path::PathBuf);

    impl Drop for TmpTree {
        fn drop(&mut self) {
            std::fs::remove_dir_all(&self.0).ok();
        }
    }

    fn tmptree() -> (TmpTree, std::path::PathBuf, std::path::PathBuf) {
        let root = std::env::temp_dir().join(format!("dp-reg-{}", uuid::Uuid::new_v4()));
        let live = root.join("sites-enabled");
        let parked = root.join("sites-available");
        std::fs::create_dir_all(&live).unwrap();
        std::fs::create_dir_all(&parked).unwrap();
        (TmpTree(root), live, parked)
    }

    #[test]
    fn a_registered_certificate_is_in_use_while_any_vhost_names_it() {
        let needle = format!("{}/wild/", super::super::ssl::SSL_REGISTRY_DIR);
        let (_t, live, parked) = tmptree();
        assert!(!registry_needle_in_use(&needle, &live, &parked));

        // An in-service vhost.
        std::fs::write(
            live.join("a.example.com.conf"),
            format!("server {{\n    ssl_certificate {needle}fullchain.pem;\n}}\n"),
        )
        .unwrap();
        assert!(registry_needle_in_use(&needle, &live, &parked));
        // A DIFFERENT alias whose name merely shares a prefix is not this one.
        assert!(!registry_needle_in_use(
            &format!("{}/wil/", super::super::ssl::SSL_REGISTRY_DIR),
            &live,
            &parked
        ));
        std::fs::remove_file(live.join("a.example.com.conf")).unwrap();

        // A parked vhost counts: enabling the site would bring the reference back.
        std::fs::write(
            parked.join("b.example.com.parked"),
            format!("ssl_certificate_key {needle}privkey.pem;\n"),
        )
        .unwrap();
        assert!(registry_needle_in_use(&needle, &live, &parked));
        std::fs::remove_file(parked.join("b.example.com.parked")).unwrap();
        assert!(!registry_needle_in_use(&needle, &live, &parked));
    }

    #[test]
    fn a_single_shared_directory_is_not_scanned_twice() {
        // The RHEL family has no separate parked directory — live and parked
        // are the SAME path (see `nginx::parked_dir`). Scanning it twice would
        // list a matching file twice, which is exactly what this pins against.
        let needle = format!("{}/wild/", super::super::ssl::SSL_REGISTRY_DIR);
        let (_t, live, _parked) = tmptree();
        std::fs::write(
            live.join("a.example.com.conf"),
            format!("server {{\n    ssl_certificate {needle}fullchain.pem;\n}}\n"),
        )
        .unwrap();
        let refs = registry_needle_references(&needle, &live, &live).unwrap();
        assert_eq!(refs.len(), 1, "a shared live/parked directory must be scanned once, not twice: {refs:?}");
    }

    #[test]
    fn an_unreadable_vhost_tree_is_assumed_to_reference_it() {
        let needle = format!("{}/wild/", super::super::ssl::SSL_REGISTRY_DIR);
        let (_t, live, parked) = tmptree();
        let missing = live.join("nope");
        assert!(registry_needle_in_use(&needle, &missing, &parked));
        // A parked tree that has never existed holds nothing parked.
        assert!(!registry_needle_in_use(&needle, &live, &parked.join("nope")));
    }
}
