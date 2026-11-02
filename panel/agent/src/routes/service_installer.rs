use axum::{
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use std::time::Duration;
use crate::safe_cmd::{safe_command, safe_command_unsandboxed};

use super::AppState;

type ApiErr = (StatusCode, Json<serde_json::Value>);

fn err(status: StatusCode, msg: &str) -> ApiErr {
    (status, Json(serde_json::json!({ "error": msg })))
}

fn ok(msg: &str) -> Json<serde_json::Value> {
    Json(serde_json::json!({ "ok": true, "message": msg }))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/services/install-status", get(install_status))
        .route("/services/install/certbot", post(install_certbot))
        .route("/services/install/ufw", post(install_ufw))
        .route("/services/install/fail2ban", post(install_fail2ban))
        .route("/services/install/redis", post(install_redis))
        .route("/services/install/nodejs", post(install_nodejs))
        .route("/services/install/sshpass", post(install_sshpass))
        .route("/services/uninstall/certbot", post(uninstall_certbot))
        .route("/services/uninstall/ufw", post(uninstall_ufw))
        .route("/services/uninstall/fail2ban", post(uninstall_fail2ban))
        .route("/services/uninstall/redis", post(uninstall_redis))
        .route("/services/uninstall/nodejs", post(uninstall_nodejs))
        .route("/services/install/cloudflared", post(install_cloudflared))
        .route("/services/uninstall/cloudflared", post(uninstall_cloudflared))
        .route("/services/cloudflared/configure", post(configure_cloudflared))
        .route("/services/cloudflared/status", get(cloudflared_status))
}

// ── Status check ────────────────────────────────────────────────────────

async fn install_status() -> Result<Json<serde_json::Value>, ApiErr> {
    let certbot_installed = which("certbot").await;
    let ufw_installed = which("ufw").await;
    let ufw_active = is_ufw_active().await;
    let fail2ban_installed = is_installed("fail2ban").await;
    let fail2ban_running = is_active("fail2ban").await;

    let redis_installed = which("redis-server").await || is_installed("redis-server").await;
    let redis_running = is_active("redis-server").await;

    let nodejs_installed = which("node").await;

    let cloudflared_installed = which("cloudflared").await;
    let cloudflared_running = is_active("cloudflared").await;
    // No unit to probe: sshpass is a binary the backup path execs, not a daemon.
    let sshpass_installed = which("sshpass").await;

    Ok(Json(serde_json::json!({
        "certbot": { "installed": certbot_installed },
        "ufw": { "installed": ufw_installed, "active": ufw_active },
        "fail2ban": { "installed": fail2ban_installed, "running": fail2ban_running },
        "redis": { "installed": redis_installed, "running": redis_running },
        "nodejs": { "installed": nodejs_installed },
        "cloudflared": { "installed": cloudflared_installed, "running": cloudflared_running },
        "sshpass": { "installed": sshpass_installed },
    })))
}

// ── Certbot installer ───────────────────────────────────────────────────

async fn install_certbot() -> Result<Json<serde_json::Value>, ApiErr> {
    use crate::services::pkg;

    if let Some(why) = pkg::no_installer_reason("Installing Certbot").await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    tracing::info!("Installing Certbot...");

    // On the RHEL family EPEL packages certbot and its nginx plugin directly.
    // The snap-then-pip ladder below is a Debian/Ubuntu strategy for getting a
    // 4.x certbot with ARI support; snap is not the idiomatic route here, and
    // the whole ladder was unreachable anyway because the guard refused before
    // any of it ran — this refusal was over-broad, since its only apt call is
    // `python3-venv` inside the *fallback*.
    if pkg::manager().await == pkg::PkgMgr::Rpm {
        pkg::install(&["certbot", "python3-certbot-nginx"]).await.map_err(|e| {
            err(StatusCode::INTERNAL_SERVER_ERROR, &format!("Certbot install failed: {e}"))
        })?;
        // EPEL ships a renewal timer with the package.
        let _ = tokio::time::timeout(Duration::from_secs(30),
            safe_command("systemctl").args(["enable", "--now", "certbot-renew.timer"]).output()).await;
        tracing::info!("Certbot installed from EPEL with the nginx plugin");
        return Ok(ok("Certbot installed with the nginx plugin and automatic renewal"));
    }

    // Remove old apt-based certbot first (if present) to avoid conflicts
    let _ = tokio::time::timeout(
        Duration::from_secs(120),
        safe_command_unsandboxed("sh", &[])
            .args(["-c", "systemctl stop certbot.timer 2>/dev/null; systemctl disable certbot.timer 2>/dev/null; DEBIAN_FRONTEND=noninteractive apt-get purge -y certbot python3-certbot-nginx 2>/dev/null; true"])
            .output()
    ).await;

    // Strategy: snap (gets certbot 4.x with ARI support for 45-day certs)
    // Fallback: pip (works when snap is unavailable)
    let snap_ok = tokio::time::timeout(
        Duration::from_secs(300),
        safe_command_unsandboxed("sh", &[])
            .args(["-c", "snap install --classic certbot && ln -sf /snap/bin/certbot /usr/bin/certbot"])
            .output()
    ).await
        .ok()
        .and_then(|r| r.ok())
        .map(|o| o.status.success())
        .unwrap_or(false);

    // Install nginx plugin separately (non-fatal if it fails — certbot still works)
    if snap_ok {
        let _ = tokio::time::timeout(
            Duration::from_secs(120),
            safe_command_unsandboxed("sh", &[])
                .args(["-c", "snap set certbot trust-plugin-with-root=ok && snap install certbot-nginx"])
                .output()
        ).await;
    }

    if snap_ok {
        tracing::info!("Certbot installed via snap (4.x with ARI support)");
        // snap auto-renewal runs via snap.certbot.renew.timer
        let _ = tokio::time::timeout(Duration::from_secs(30),
            safe_command("systemctl").args(["enable", "snap.certbot.renew.timer"]).output()).await;
        let _ = tokio::time::timeout(Duration::from_secs(30),
            safe_command("systemctl").args(["start", "snap.certbot.renew.timer"]).output()).await;
        return Ok(ok("Certbot 4.x installed via snap with nginx plugin and auto-renewal (ARI-ready for 45-day certs)"));
    }

    tracing::warn!("Snap certbot failed, falling back to pip...");

    // Fallback: pip install (gets latest certbot from PyPI)
    let pip_ok = tokio::time::timeout(
        Duration::from_secs(300),
        safe_command_unsandboxed("sh", &[])
            .args(["-c", "apt-get update && DEBIAN_FRONTEND=noninteractive apt-get install -y python3-venv && \
                python3 -m venv /opt/certbot && \
                /opt/certbot/bin/pip install --upgrade pip && \
                /opt/certbot/bin/pip install certbot certbot-nginx && \
                ln -sf /opt/certbot/bin/certbot /usr/bin/certbot"])
            .output()
    ).await
        .ok()
        .and_then(|r| r.ok())
        .map(|o| o.status.success())
        .unwrap_or(false);

    if pip_ok {
        tracing::info!("Certbot installed via pip");
        // Create systemd timer for auto-renewal
        let timer_unit = "[Unit]\nDescription=Certbot renewal timer\n\n[Timer]\nOnCalendar=*-*-* 00,12:00:00\nRandomizedDelaySec=3600\nPersistent=true\n\n[Install]\nWantedBy=timers.target\n";
        let service_unit = "[Unit]\nDescription=Certbot renewal\n\n[Service]\nType=oneshot\nExecStart=/usr/bin/certbot renew --quiet --deploy-hook \"systemctl reload nginx\"\n";
        std::fs::write("/etc/systemd/system/certbot.timer", timer_unit).ok();
        std::fs::write("/etc/systemd/system/certbot.service", service_unit).ok();
        let _ = tokio::time::timeout(Duration::from_secs(30), safe_command("systemctl").args(["daemon-reload"]).output()).await;
        let _ = tokio::time::timeout(Duration::from_secs(30), safe_command("systemctl").args(["enable", "certbot.timer"]).output()).await;
        let _ = tokio::time::timeout(Duration::from_secs(30), safe_command("systemctl").args(["start", "certbot.timer"]).output()).await;
        return Ok(ok("Certbot installed via pip with nginx plugin and auto-renewal timer"));
    }

    Err(err(StatusCode::INTERNAL_SERVER_ERROR, "Certbot install failed: both snap and pip methods failed"))
}

// ── UFW installer ───────────────────────────────────────────────────────

/// Install UFW — on Debian/Ubuntu only, **deliberately**.
///
/// This is the one installer s266 did NOT give a `dnf` path, and the reason is
/// the s265 outage: the RHEL family boots with **firewalld** enforcing, and
/// installing UFW beside it produces two rule sets where the one nobody
/// configured is the one the kernel consults. That is how a box ended up with
/// 80/443 "open" in ufw, unreachable in practice, and no certificate — because
/// Let's Encrypt could not fetch the ACME challenge either.
///
/// UFW *is* installable from EPEL, so "the package exists" is true and beside
/// the point. Ports are opened through [`crate::services::firewall`], which
/// speaks to whichever filter is actually running, so refusing costs nothing.
async fn install_ufw() -> Result<Json<serde_json::Value>, ApiErr> {
    use crate::services::pkg;

    if let Some(why) = pkg::no_installer_reason("Installing UFW").await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    if let Some(why) = pkg::ufw_refusal_reason().await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    tracing::info!("Installing UFW...");

    pkg::install(&["ufw"]).await.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, &format!("UFW install failed: {e}"))
    })?;

    // Configure default rules
    let _ = tokio::time::timeout(Duration::from_secs(120), safe_command("ufw").args(["default", "deny", "incoming"]).output()).await;
    let _ = tokio::time::timeout(Duration::from_secs(120), safe_command("ufw").args(["default", "allow", "outgoing"]).output()).await;

    // Open essential ports. Routed through the firewall service rather than
    // `ufw` directly so the result is a fact we can report instead of assume —
    // `open_mail_ports()` used to discard every result and log success anyway.
    let failed = crate::services::firewall::allow_tcp_ports(
        &["22", "80", "443", "587", "993"],
    ).await;

    // Enable (--force to skip interactive prompt)
    let _ = tokio::time::timeout(Duration::from_secs(120), safe_command("ufw").args(["--force", "enable"]).output()).await;

    if !failed.is_empty() {
        tracing::warn!("UFW installed but these ports could not be opened: {}", failed.join(" "));
        return Ok(ok(&format!(
            "UFW installed, but these ports could not be opened: {}",
            failed.join(", ")
        )));
    }

    tracing::info!("UFW installed and enabled with default rules");
    Ok(ok("UFW installed — SSH, HTTP, HTTPS, SMTP, IMAPS ports opened"))
}

// ── Fail2Ban installer ──────────────────────────────────────────────────

async fn install_fail2ban() -> Result<Json<serde_json::Value>, ApiErr> {
    use crate::services::pkg;

    if let Some(why) = pkg::no_installer_reason("Installing Fail2Ban").await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    tracing::info!("Installing Fail2Ban...");

    pkg::install(&["fail2ban"]).await.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, &format!("Fail2Ban install failed: {e}"))
    })?;

    // Write default jail config
    let jail_config = r#"[DEFAULT]
bantime = 3600
findtime = 600
maxretry = 5

[sshd]
enabled = true

[nginx-http-auth]
enabled = true

[nginx-limit-req]
enabled = true

[postfix]
enabled = true

[dovecot]
enabled = true
"#;

    let _ = tokio::fs::write("/etc/fail2ban/jail.local", jail_config).await;

    let _ = tokio::time::timeout(Duration::from_secs(120), safe_command("systemctl").args(["enable", "fail2ban"]).output()).await;
    let _ = tokio::time::timeout(Duration::from_secs(120), safe_command("systemctl").args(["restart", "fail2ban"]).output()).await;

    tracing::info!("Fail2Ban installed with default jails");
    Ok(ok("Fail2Ban installed with SSH, Nginx, Postfix, Dovecot jails"))
}

// ── Redis installer ────────────────────────────────────────────────

async fn install_redis() -> Result<Json<serde_json::Value>, ApiErr> {
    use crate::services::pkg;

    if let Some(why) = pkg::no_installer_reason("Installing Redis").await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    tracing::info!("Installing Redis...");

    pkg::refresh_index().await;
    pkg::install(&["redis-server"]).await.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, &format!("Redis install failed: {e}"))
    })?;

    // `redis-server` is the package AND the unit on Debian; on the RHEL family
    // both are `redis`, and they are translated by separate maps because a
    // package name and a unit name are not the same kind of string.
    let unit = pkg::service_name("redis-server").await;
    let _ = tokio::time::timeout(Duration::from_secs(120), safe_command("systemctl").args(["enable", &unit]).output()).await;
    let _ = tokio::time::timeout(Duration::from_secs(120), safe_command("systemctl").args(["start", &unit]).output()).await;

    // Verify Redis is responding
    let verify = tokio::time::timeout(
        Duration::from_secs(10),
        safe_command("redis-cli").arg("ping").output()
    ).await;
    let verified = verify
        .ok()
        .and_then(|r| r.ok())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_uppercase() == "PONG")
        .unwrap_or(false);

    tracing::info!("Redis installed, ping verified: {verified}");
    Ok(ok("Redis installed and started"))
}

// ── Node.js installer ──────────────────────────────────────────────

async fn install_nodejs() -> Result<Json<serde_json::Value>, ApiErr> {
    use crate::services::pkg;

    if let Some(why) = pkg::no_installer_reason("Installing Node.js").await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    tracing::info!("Installing Node.js...");

    // NodeSource publishes a per-family setup script. `setup.sh` has branched to
    // the rpm one since s264; the agent still fetched the **deb** script on every
    // distro, which s265 recorded as a half-migration deliberately left alone
    // until there was a dnf path to migrate onto. This is that path.
    pkg::add_repo(pkg::Repo::NodeSource).await.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, &format!("NodeSource repository setup failed: {e}"))
    })?;
    pkg::install(&["nodejs"]).await.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, &format!("Node.js install failed: {e}"))
    })?;

    // Verify
    let ver = tokio::time::timeout(
        Duration::from_secs(10),
        safe_command("node").arg("--version").output()
    ).await
        .ok()
        .and_then(|r| r.ok())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    tracing::info!("Node.js {ver} installed");
    Ok(ok(&format!("Node.js {ver} with npm installed")))
}

// ── Certbot uninstaller ─────────────────────────────────────────────────

async fn uninstall_certbot() -> Result<Json<serde_json::Value>, ApiErr> {
    use crate::services::pkg;

    if let Some(why) = pkg::no_installer_reason("Removing Certbot").await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    tracing::info!("Uninstalling Certbot...");

    // Stop every renewal timer certbot might have arrived with — the apt/pip
    // one, the snap one, and EPEL's `certbot-renew.timer`. Which one exists
    // depends on how it was installed, so all are tried and none is required.
    for t in ["certbot.timer", "snap.certbot.renew.timer", "certbot-renew.timer"] {
        let _ = tokio::time::timeout(Duration::from_secs(30), safe_command("systemctl").args(["stop", t]).output()).await;
        let _ = tokio::time::timeout(Duration::from_secs(30), safe_command("systemctl").args(["disable", t]).output()).await;
    }

    // Remove snap certbot (if installed)
    let _ = tokio::time::timeout(
        Duration::from_secs(120),
        safe_command_unsandboxed("sh", &[])
            .args(["-c", "snap remove certbot 2>/dev/null; snap remove certbot-nginx 2>/dev/null; true"])
            .output()
    ).await;

    // Remove pip certbot (if installed)
    if std::path::Path::new("/opt/certbot").exists() {
        let _ = std::fs::remove_dir_all("/opt/certbot");
        let _ = std::fs::remove_file("/etc/systemd/system/certbot.timer");
        let _ = std::fs::remove_file("/etc/systemd/system/certbot.service");
        let _ = tokio::time::timeout(Duration::from_secs(30), safe_command("systemctl").args(["daemon-reload"]).output()).await;
    }

    // Remove the packaged certbot (if installed). Best-effort on purpose: the
    // snap and pip paths above may already have removed it, and a box that
    // never had the packaged one must not fail the uninstall.
    let _ = pkg::remove(&["certbot", "python3-certbot-nginx"]).await;

    // Clean up symlink
    let _ = std::fs::remove_file("/usr/bin/certbot");

    tracing::info!("Certbot uninstalled");
    Ok(ok("Certbot and auto-renewal timer removed"))
}

// ── UFW uninstaller ─────────────────────────────────────────────────────

/// Remove UFW.
///
/// Unlike [`install_ufw`], this is allowed on every family — and on the RHEL
/// family it is actively useful, because it is the cleanup for boxes that a
/// pre-v2.38.0 `setup.sh` left with ufw installed beside firewalld. Refusing to
/// remove a package we should never have installed would strand exactly the
/// operators worst affected.
async fn uninstall_ufw() -> Result<Json<serde_json::Value>, ApiErr> {
    use crate::services::pkg;

    if let Some(why) = pkg::no_installer_reason("Removing UFW").await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    tracing::info!("Uninstalling UFW...");

    // Disable UFW first
    let _ = tokio::time::timeout(Duration::from_secs(120), safe_command("ufw").arg("disable").output()).await;

    pkg::remove(&["ufw"]).await.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, &format!("UFW uninstall failed: {e}"))
    })?;

    tracing::info!("UFW uninstalled");
    Ok(ok("UFW disabled and removed"))
}

// ── Fail2Ban uninstaller ────────────────────────────────────────────────

async fn uninstall_fail2ban() -> Result<Json<serde_json::Value>, ApiErr> {
    use crate::services::pkg;

    if let Some(why) = pkg::no_installer_reason("Removing Fail2Ban").await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    tracing::info!("Uninstalling Fail2Ban...");

    // Stop and disable fail2ban
    let _ = tokio::time::timeout(Duration::from_secs(120), safe_command("systemctl").args(["stop", "fail2ban"]).output()).await;
    let _ = tokio::time::timeout(Duration::from_secs(120), safe_command("systemctl").args(["disable", "fail2ban"]).output()).await;

    pkg::remove(&["fail2ban"]).await.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, &format!("Fail2Ban uninstall failed: {e}"))
    })?;

    // Remove custom jail config
    let _ = tokio::fs::remove_file("/etc/fail2ban/jail.local").await;

    tracing::info!("Fail2Ban uninstalled");
    Ok(ok("Fail2Ban stopped and purged with jail config removed"))
}

// ── Redis uninstaller ───────────────────────────────────────────────────

async fn uninstall_redis() -> Result<Json<serde_json::Value>, ApiErr> {
    use crate::services::pkg;

    if let Some(why) = pkg::no_installer_reason("Removing Redis").await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    tracing::info!("Uninstalling Redis...");

    let unit = pkg::service_name("redis-server").await;
    let _ = tokio::time::timeout(Duration::from_secs(120), safe_command("systemctl").args(["stop", &unit]).output()).await;
    let _ = tokio::time::timeout(Duration::from_secs(120), safe_command("systemctl").args(["disable", &unit]).output()).await;

    pkg::remove(&["redis-server"]).await.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, &format!("Redis uninstall failed: {e}"))
    })?;

    tracing::info!("Redis uninstalled");
    Ok(ok("Redis stopped and purged"))
}

// ── Node.js uninstaller ─────────────────────────────────────────────────

async fn uninstall_nodejs() -> Result<Json<serde_json::Value>, ApiErr> {
    use crate::services::pkg;

    if let Some(why) = pkg::no_installer_reason("Removing Node.js").await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    tracing::info!("Uninstalling Node.js...");

    pkg::remove(&["nodejs"]).await.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, &format!("Node.js uninstall failed: {e}"))
    })?;

    // Remove the NodeSource repo on whichever family added it. This used to
    // delete the apt sources file only, so an RPM box would have kept a repo
    // definition for a package it no longer has.
    pkg::remove_repo(pkg::Repo::NodeSource).await;

    tracing::info!("Node.js uninstalled");
    Ok(ok("Node.js purged and nodesource repo removed"))
}

// ── Helpers ─────────────────────────────────────────────────────────────

/// Package presence, on dpkg and rpm boxes alike — see `services::pkg`.
/// This used to shell out to `dpkg` directly, which answered `false` for
/// every package on the entire RHEL family (s265).
async fn is_installed(package: &str) -> bool {
    crate::services::pkg::is_installed(package).await
}

async fn is_active(service: &str) -> bool {
    tokio::time::timeout(
        Duration::from_secs(120),
        safe_command("systemctl").args(["is-active", "--quiet", service]).output()
    ).await
        .ok()
        .and_then(|r| r.ok())
        .map(|o| o.status.success())
        .unwrap_or(false)
}

/// Install `sshpass`, which password-authenticated SFTP backup destinations
/// shell out to.
///
/// Servers added through `install-agent.sh` get it at install time. A box that
/// was already running when that landed never did, and `update.sh` upgrades
/// binaries without installing packages — so before this route the only way to
/// fix such a server was to tell its operator to run a package manager by hand,
/// which is exactly what issue #93 was left open until we stopped doing.
async fn install_sshpass() -> Result<Json<serde_json::Value>, ApiErr> {
    use crate::services::pkg;

    if let Some(why) = pkg::no_installer_reason("Installing sshpass").await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    tracing::info!("Installing sshpass...");

    // An already-running server is precisely the box whose package index is
    // months stale — that is the population this route exists for.
    pkg::refresh_index().await;
    pkg::install(&["sshpass"]).await.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, &format!("sshpass install failed: {e}"))
    })?;

    // Report the thing the caller actually depends on: whether the binary the
    // backup path shells out to is now on PATH. A package manager reporting
    // success is a different claim, and `remote_backup` fails on ENOENT of the
    // binary, not on the package's absence.
    if !which("sshpass").await {
        return Err(err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "The sshpass package reported a successful install but no sshpass binary is on \
             PATH. Password-authenticated SFTP destinations will still fail from this server.",
        ));
    }

    Ok(Json(serde_json::json!({
        "success": true,
        "message": "sshpass installed. Password-authenticated SFTP backup destinations can \
                    now run from this server."
    })))
}

async fn which(cmd: &str) -> bool {
    tokio::time::timeout(
        Duration::from_secs(120),
        safe_command("which").arg(cmd).output()
    ).await
        .ok()
        .and_then(|r| r.ok())
        .map(|o| o.status.success())
        .unwrap_or(false)
}

async fn is_ufw_active() -> bool {
    tokio::time::timeout(
        Duration::from_secs(120),
        safe_command("ufw").arg("status").output()
    ).await
        .ok()
        .and_then(|r| r.ok())
        .map(|o| String::from_utf8_lossy(&o.stdout).contains("Status: active"))
        .unwrap_or(false)
}

// ── Cloudflare Tunnel (cloudflared) ─────────────────────────────────

async fn install_cloudflared() -> Result<Json<serde_json::Value>, ApiErr> {
    use crate::services::pkg;

    if let Some(why) = pkg::no_installer_reason("Installing Cloudflare Tunnel").await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    tracing::info!("Installing cloudflared...");

    // The codename lookup that used to live here — and hard-errored with
    // "Cannot detect OS codename" on every RHEL release, none of which carries
    // VERSION_CODENAME — now sits inside `pkg::add_repo`, on the apt branch
    // only. Cloudflare publishes a codename-keyed apt repo and a single flat
    // rpm repo, so on the RPM side the codename is not defaulted or guessed:
    // it is not part of the question. `add_repo` also removes a half-written
    // repo file on failure, which is what stops a partial install from breaking
    // every later transaction on the operator's box (Lesson #73C).
    pkg::add_repo(pkg::Repo::Cloudflared).await.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, &format!("cloudflared repository setup failed: {e}"))
    })?;
    pkg::install(&["cloudflared"]).await.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, &format!("cloudflared install failed: {e}"))
    })?;

    std::fs::create_dir_all("/etc/cloudflared").ok();

    let verify = tokio::time::timeout(
        Duration::from_secs(5),
        safe_command("cloudflared").args(["version"]).output()
    ).await;
    let version = verify.ok()
        .and_then(|r| r.ok())
        .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
        .unwrap_or_default();

    tracing::info!("cloudflared installed: {version}");
    Ok(ok(&format!("cloudflared installed: {version}")))
}

async fn uninstall_cloudflared() -> Result<Json<serde_json::Value>, ApiErr> {
    use crate::services::pkg;

    if let Some(why) = pkg::no_installer_reason("Removing Cloudflare Tunnel").await {
        return Err(err(StatusCode::NOT_IMPLEMENTED, &why));
    }
    tracing::info!("Uninstalling cloudflared...");

    let _ = tokio::time::timeout(Duration::from_secs(30), safe_command("systemctl").args(["stop", "cloudflared"]).output()).await;
    let _ = tokio::time::timeout(Duration::from_secs(30), safe_command("systemctl").args(["disable", "cloudflared"]).output()).await;

    pkg::remove(&["cloudflared"]).await.map_err(|e| {
        err(StatusCode::INTERNAL_SERVER_ERROR, &format!("cloudflared uninstall failed: {e}"))
    })?;

    // Drop the repo definition on whichever family added it, so an operator who
    // removes the tunnel is not left carrying Cloudflare's repo forever.
    pkg::remove_repo(pkg::Repo::Cloudflared).await;

    let _ = std::fs::remove_dir_all("/etc/cloudflared");
    tracing::info!("cloudflared uninstalled");
    Ok(ok("cloudflared uninstalled"))
}

/// POST /services/cloudflared/configure — Configure tunnel with token and ingress rules.
async fn configure_cloudflared(
    Json(body): Json<serde_json::Value>,
) -> Result<Json<serde_json::Value>, ApiErr> {
    let token = body.get("token").and_then(|v| v.as_str()).unwrap_or("");
    if token.is_empty() {
        return Err(err(StatusCode::BAD_REQUEST, "Missing tunnel token"));
    }

    // Validate token format: must be base64-like, no newlines/specifiers/shell chars
    if token.len() < 50 || token.len() > 4096
        || token.contains('\n') || token.contains('\r') || token.contains('\0')
        || token.contains('%') || token.contains('\'') || token.contains('"')
        || token.contains(';') || token.contains('|') || token.contains('&')
        || !token.chars().all(|c| c.is_ascii_alphanumeric() || c == '-' || c == '_' || c == '.' || c == '=')
    {
        return Err(err(StatusCode::BAD_REQUEST, "Invalid tunnel token format"));
    }

    std::fs::create_dir_all("/etc/cloudflared").ok();

    // Write the tunnel token to a root-only (0600) EnvironmentFile so it is NOT
    // world-readable in the unit file and NOT exposed on the process command line
    // (cloudflared reads TUNNEL_TOKEN from the environment for `tunnel run`).
    let token_env_path = "/etc/cloudflared/token.env";
    {
        use std::io::Write;
        use std::os::unix::fs::OpenOptionsExt;
        let mut f = std::fs::OpenOptions::new()
            .write(true)
            .create(true)
            .truncate(true)
            .mode(0o600)
            .open(token_env_path)
            .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &format!("Write token file: {e}")))?;
        f.write_all(format!("TUNNEL_TOKEN={token}\n").as_bytes())
            .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &format!("Write token file: {e}")))?;
    }
    // Harden perms even if the file already existed with a looser mode.
    {
        use std::os::unix::fs::PermissionsExt;
        let _ = std::fs::set_permissions(token_env_path, std::fs::Permissions::from_mode(0o600));
    }

    // Write systemd service. The token is supplied via the 0600 EnvironmentFile
    // (TUNNEL_TOKEN), never on the ExecStart command line.
    let service = format!(
        "[Unit]\n\
         Description=Cloudflare Tunnel\n\
         After=network-online.target\n\
         Wants=network-online.target\n\n\
         [Service]\n\
         Type=simple\n\
         EnvironmentFile={token_env_path}\n\
         ExecStart=/usr/bin/cloudflared tunnel run\n\
         Restart=on-failure\n\
         RestartSec=5\n\
         LimitNOFILE=65536\n\n\
         [Install]\n\
         WantedBy=multi-user.target\n"
    );

    std::fs::write("/etc/systemd/system/cloudflared.service", &service)
        .map_err(|e| err(StatusCode::INTERNAL_SERVER_ERROR, &format!("Write service: {e}")))?;

    // Reload systemd and start
    let _ = tokio::time::timeout(Duration::from_secs(10), safe_command("systemctl").args(["daemon-reload"]).output()).await;
    let _ = tokio::time::timeout(Duration::from_secs(10), safe_command("systemctl").args(["enable", "cloudflared"]).output()).await;
    let _ = tokio::time::timeout(Duration::from_secs(15), safe_command("systemctl").args(["restart", "cloudflared"]).output()).await;

    // Check if running
    tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    let running = is_active("cloudflared").await;

    tracing::info!("Cloudflare Tunnel configured, running: {running}");
    Ok(Json(serde_json::json!({
        "ok": true,
        "running": running,
    })))
}

/// GET /services/cloudflared/status — Get tunnel connection status.
async fn cloudflared_status() -> Result<Json<serde_json::Value>, ApiErr> {
    let installed = which("cloudflared").await;
    let running = is_active("cloudflared").await;

    let version = if installed {
        tokio::time::timeout(
            Duration::from_secs(5),
            safe_command("cloudflared").args(["version"]).output()
        ).await.ok()
            .and_then(|r| r.ok())
            .map(|o| String::from_utf8_lossy(&o.stdout).trim().to_string())
    } else {
        None
    };

    let has_service = std::path::Path::new("/etc/systemd/system/cloudflared.service").exists();

    Ok(Json(serde_json::json!({
        "installed": installed,
        "running": running,
        "version": version,
        "configured": has_service,
    })))
}
