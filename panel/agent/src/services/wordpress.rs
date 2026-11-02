use std::process::Stdio;
use crate::safe_cmd::{safe_command, safe_command_sync, safe_command_unsandboxed};

const WP_CLI: &str = "/usr/local/bin/wp";
const WP_ROOT: &str = "/var/www";

fn site_path(domain: &str) -> Result<String, String> {
    if domain.is_empty() || domain.contains("..") || domain.contains('/')
        || !domain.chars().all(|c| c.is_ascii_alphanumeric() || c == '.' || c == '-') {
        return Err("Invalid domain".to_string());
    }
    Ok(format!("{WP_ROOT}/{domain}/public"))
}

/// Ensure wp-cli is installed at /usr/local/bin/wp.
pub async fn ensure_cli() -> Result<(), String> {
    if std::path::Path::new(WP_CLI).exists() {
        return Ok(());
    }
    // curl writes to /usr/local/bin which isn't in the agent's ReadWritePaths
    // under ProtectSystem=strict — must run unsandboxed.
    let out = safe_command_unsandboxed("curl", &[])
        .args([
            "-sS",
            "-L",
            "-o",
            WP_CLI,
            "https://raw.githubusercontent.com/wp-cli/builds/gh-pages/phar/wp-cli.phar",
        ])
        .output()
        .await
        .map_err(|e| format!("Download failed: {e}"))?;
    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(format!("Failed to download wp-cli: {}", stderr.trim()));
    }
    safe_command_unsandboxed("chmod", &[])
        .args(["+x", WP_CLI])
        .output()
        .await
        .ok();
    Ok(())
}

/// Run a wp-cli command, return stdout on success.
/// Uses --skip-plugins --skip-themes by default to prevent RCE from compromised
/// plugins loading PHP during admin operations. Pass skip_safety=false only for
/// commands that explicitly need to interact with plugins/themes (list, activate).
async fn wp(domain: &str, args: &[&str]) -> Result<String, String> {
    wp_inner(domain, args, true).await
}

async fn wp_inner(domain: &str, args: &[&str], skip_plugins: bool) -> Result<String, String> {
    let path = site_path(domain)?;
    wp_at_root(&path, args, skip_plugins).await
}

/// Run a wp-cli command against an EXPLICIT filesystem root.
///
/// `wp_inner` derives the root from the domain and always lands on `public/`;
/// the vulnerability scanner resolves its own root because a WordPress install
/// is not always under `public/`. It therefore needs this same invocation with
/// a different path — and hand-rolling a second one is exactly what went wrong:
/// that copy shelled out to `php` against a phar under the agent's private
/// tmp — a file nothing in this tree ever writes, and which `PrivateTmp=yes`
/// puts out of reach of anyone who might place one there — and it
/// omitted `--allow-root`, which the agent needs because it runs as root and
/// wp-cli refuses outright without it. Both arms failed, and the scan reported
/// a clean site.
///
/// So: every wp-cli invocation in this crate goes through here. One place
/// decides the binary, `ensure_cli`, `--allow-root` and the skip policy.
pub(crate) async fn wp_at_root(
    root: &str,
    args: &[&str],
    skip_plugins: bool,
) -> Result<String, String> {
    ensure_cli().await?;
    let mut cmd = safe_command(WP_CLI);
    cmd.args(args)
        .arg("--allow-root")
        .arg(format!("--path={root}"));
    if skip_plugins {
        cmd.arg("--skip-plugins").arg("--skip-themes");
    }
    // This is the crate's single wp-cli choke point (see the doc comment above),
    // so it ran every plugin install, core update and db import unbounded — no
    // timeout at all, and no kill_on_drop either. A hang here (a stalled
    // download, a locked wp_options table) blocked the request forever, and even
    // an upstream cancellation (the connection closing, a future request-level
    // timeout) would have left the wp-cli child running orphaned rather than
    // stopped — the exact "timeout doesn't actually stop the thing" class fixed
    // elsewhere in the agent crate, just never reaching wordpress.rs's own only
    // subprocess entry point.
    let out = tokio::time::timeout(
        std::time::Duration::from_secs(600),
        cmd.stdout(Stdio::piped())
            .stderr(Stdio::piped())
            .kill_on_drop(true)
            .output(),
    )
    .await
    .map_err(|_| "wp-cli timed out".to_string())?
    .map_err(|e| format!("wp-cli error: {e}"))?;

    if !out.status.success() {
        let stderr = String::from_utf8_lossy(&out.stderr);
        return Err(stderr.trim().to_string());
    }
    Ok(String::from_utf8_lossy(&out.stdout).trim().to_string())
}

/// Check if WordPress is installed at the site's document root.
pub fn detect(domain: &str) -> bool {
    match site_path(domain) {
        Ok(path) => std::path::Path::new(&format!("{path}/wp-config.php")).exists(),
        Err(_) => false,
    }
}

/// What happened to a site's stored canonical URL when its certificate landed.
#[derive(Debug, Clone, PartialEq, Eq, serde::Serialize)]
#[serde(rename_all = "snake_case")]
pub enum CanonicalUrlOutcome {
    /// There is no WordPress at this vhost, or its URL is not ours to change.
    Untouched,
    /// `siteurl`/`home` moved from plain HTTP to HTTPS.
    Promoted,
    /// wp-cli refused. The certificate is live and nginx now redirects to it,
    /// but the site still tells every visitor to use HTTP.
    Failed(String),
}

/// Decide whether a stored canonical URL should be moved to HTTPS.
///
/// Returns the replacement only when the stored value is exactly the plain-HTTP
/// form of this vhost's own domain — the state DockPanel itself creates when it
/// installs a site before the certificate exists. Any other value (a different
/// host, a sub-path, an already-secure URL) was chosen by the operator and is
/// left alone: promoting it would silently repoint someone's site.
pub fn https_promotion_target(current: &str, domain: &str) -> Option<String> {
    let current = current.trim().trim_end_matches('/');
    let plain = format!("http://{domain}");
    if current.eq_ignore_ascii_case(&plain) {
        Some(format!("https://{domain}"))
    } else {
        None
    }
}

/// Move a WordPress site's canonical URL from HTTP to HTTPS.
///
/// Called once a certificate is in place. A site installed before its
/// certificate is reachable and correct on HTTP, but the moment nginx starts
/// redirecting to HTTPS the stored URL is the thing that decides what every
/// generated link, redirect and asset reference says — so this is what finishes
/// the job, not a cosmetic tidy-up.
pub async fn promote_site_url_to_https(domain: &str) -> CanonicalUrlOutcome {
    if !detect(domain) {
        return CanonicalUrlOutcome::Untouched;
    }
    let mut changed = false;
    for option in ["siteurl", "home"] {
        let current = match wp(domain, &["option", "get", option]).await {
            Ok(v) => v,
            Err(e) => return CanonicalUrlOutcome::Failed(format!("read {option}: {e}")),
        };
        let Some(target) = https_promotion_target(&current, domain) else {
            continue;
        };
        if let Err(e) = wp(domain, &["option", "update", option, &target]).await {
            return CanonicalUrlOutcome::Failed(format!("update {option}: {e}"));
        }
        changed = true;
    }
    if changed {
        CanonicalUrlOutcome::Promoted
    } else {
        CanonicalUrlOutcome::Untouched
    }
}

/// The comment a site's auto-update cron line ends with.
///
/// Compared with [`line_marked_for`], never with `contains`. The marker embeds a
/// domain and sits at the end of the line, so an unanchored test let one site
/// answer for another whose domain merely EXTENDS it: `# wp-auto-update-example.com`
/// is a substring of `# wp-auto-update-example.community`. Toggling auto-update
/// on `example.com`, or simply deleting that site, therefore stripped
/// `example.community`'s line — silently ending core, plugin and theme security
/// updates for a site the actor did not own, with nothing logged against it.
// R6: production callers (nginx site handlers) deleted in R6. Retained for the canonical_url_tests marker-format coverage.
#[allow(dead_code)]
fn auto_update_marker(domain: &str) -> String {
    format!("# wp-auto-update-{domain}")
}

/// Whether `line` is the auto-update cron line carrying exactly `marker`.
// R6: production callers deleted in R6. Retained for the canonical_url_tests marker-format coverage.
#[allow(dead_code)]
fn line_marked_for(line: &str, marker: &str) -> bool {
    line.trim_end().ends_with(marker)
}

/// Set or remove auto-update cron.
// R6: production caller (nginx site handler) deleted in R6. Retained: the sibling-parity pin asserts this function's fail-closed reader shape.
#[allow(dead_code)]
pub async fn set_auto_update(domain: &str, enabled: bool) -> Result<(), String> {
    let path = site_path(domain)?;
    let marker = auto_update_marker(domain);
    let cron_line = format!(
        "0 3 * * * {WP_CLI} core update --skip-plugins --skip-themes --allow-root --path={path} > /dev/null 2>&1 && \
         {WP_CLI} plugin update --all --skip-plugins --skip-themes --allow-root --path={path} > /dev/null 2>&1 && \
         {WP_CLI} theme update --all --skip-plugins --skip-themes --allow-root --path={path} > /dev/null 2>&1 \
         {marker}"
    );

    // Get current crontab, FAIL-CLOSED.
    //
    // This used to be `.output().await.map(|o| …stdout…).unwrap_or_default()`,
    // which collapsed two different things into the same empty string: a spawn
    // failure (swallowed by `unwrap_or_default`) and a non-zero exit (the `map`
    // never looked at `o.status`). Either one produced `""`, and the twenty lines
    // below then hand `""` straight back to `crontab -` as root's COMPLETE new
    // content — so a transient failure here rewrote root's entire crontab, every
    // tenant's jobs and every system entry, down to at most this one WordPress
    // line. Reached from an ordinary authenticated request naming ONE site.
    let current = crate::services::crontab::read_crontab().await?;

    // Remove existing auto-update line for this domain — and ONLY this domain.
    let filtered: Vec<&str> = current
        .lines()
        .filter(|l| !line_marked_for(l, &marker))
        .collect();

    let mut new_crontab = filtered.join("\n");
    if !new_crontab.ends_with('\n') && !new_crontab.is_empty() {
        new_crontab.push('\n');
    }

    if enabled {
        new_crontab.push_str(&cron_line);
        new_crontab.push('\n');
    }

    crate::services::crontab::write_crontab(&new_crontab).await
}

/// Check if auto-update cron is enabled for a domain.
///
/// Line-anchored for the same reason the removal is: the unanchored form
/// reported `example.com` as enabled off `example.community`'s line, and
/// `delete_site` used that answer to decide whether to run the strip — so the
/// mis-read and the destructive act were the same bug twice.
// R6: production caller (nginx site handler) deleted in R6. Retained: the sibling-parity pin asserts this function's fail-closed reader shape.
#[allow(dead_code)]
pub fn is_auto_update_enabled(domain: &str) -> bool {
    let marker = auto_update_marker(domain);
    safe_command_sync("crontab")
        .args(["-l", "-u", "root"])
        .output()
        .map(|o| {
            String::from_utf8_lossy(&o.stdout)
                .lines()
                .any(|l| line_marked_for(l, &marker))
        })
        .unwrap_or(false)
}

#[cfg(test)]
mod canonical_url_tests {
    use super::{auto_update_marker, https_promotion_target, line_marked_for};

    #[test]
    fn promotes_this_vhost_own_plain_http_url() {
        assert_eq!(
            https_promotion_target("http://example.com", "example.com").as_deref(),
            Some("https://example.com")
        );
    }

    #[test]
    fn tolerates_a_trailing_slash_and_odd_casing() {
        // wp-cli prints what is stored, and what is stored has been through
        // however many admin screens and migrations.
        assert!(https_promotion_target("http://example.com/", "example.com").is_some());
        assert!(https_promotion_target("  http://example.com  ", "example.com").is_some());
        assert!(https_promotion_target("HTTP://EXAMPLE.COM", "example.com").is_some());
    }

    #[test]
    fn leaves_an_already_secure_url_alone() {
        assert_eq!(https_promotion_target("https://example.com", "example.com"), None);
    }

    #[test]
    fn never_repoints_a_url_the_operator_chose() {
        // Each of these is a working configuration somebody set on purpose.
        // Rewriting any of them would move a live site to an address the
        // operator never picked — a worse bug than the one being fixed.
        for stored in [
            "http://other-domain.com",       // headless / separate front end
            "http://example.com/blog",       // WordPress in a subdirectory
            "http://www.example.com",        // canonical host is the www one
            "http://sub.example.com",        // a different vhost entirely
            "",                              // nothing stored
        ] {
            assert_eq!(
                https_promotion_target(stored, "example.com"),
                None,
                "must not promote {stored:?}"
            );
        }
    }

    #[test]
    fn a_suffix_lookalike_is_not_this_domain() {
        // The comparison is whole-string, so a domain that merely starts with
        // ours cannot borrow the promotion.
        assert_eq!(
            https_promotion_target("http://example.com.attacker.net", "example.com"),
            None
        );
    }

    /// The prefix-collision that let one site strip another's security updates.
    /// `example.com` and `example.community` are separately registerable, and
    /// the marker sits at the END of the cron line, so the old `contains` test
    /// matched the longer domain's line from the shorter domain's marker.
    #[test]
    fn a_prefix_domain_cannot_match_a_longer_domains_cron_line() {
        let victim = format!(
            "0 3 * * * wp core update --path=/var/www/example.community/public {}",
            auto_update_marker("example.community")
        );
        assert!(line_marked_for(&victim, &auto_update_marker("example.community")));
        assert!(!line_marked_for(&victim, &auto_update_marker("example.com")));
        // The other direction is safe too: a longer marker cannot match a
        // shorter domain's line.
        let short = format!(
            "0 3 * * * wp core update --path=/var/www/a.co/public {}",
            auto_update_marker("a.co")
        );
        assert!(!line_marked_for(&short, &auto_update_marker("a.com")));
    }

    #[test]
    fn trailing_whitespace_does_not_hide_the_marker() {
        let line = format!("0 3 * * * wp core update {}   ", auto_update_marker("a.com"));
        assert!(line_marked_for(&line, &auto_update_marker("a.com")));
    }
}
