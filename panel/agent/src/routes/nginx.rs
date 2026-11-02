use crate::safe_cmd::safe_command;
use axum::{
    extract::Path,
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::{Deserialize, Serialize};

use super::AppState;
use crate::services;

#[derive(Deserialize)]
pub struct SiteConfig {
    /// Site runtime: "static", "php", "proxy"
    pub runtime: String,
    /// Document root (for static/PHP) relative to site dir
    pub root: Option<String>,
    /// Upstream port (for proxy/Docker sites)
    pub proxy_port: Option<u16>,
    /// PHP-FPM socket path (for PHP sites)
    pub php_socket: Option<String>,
    /// Whether SSL is enabled
    pub ssl: Option<bool>,
    /// SSL certificate path
    pub ssl_cert: Option<String>,
    /// SSL key path
    pub ssl_key: Option<String>,
    /// Rate limit: requests per second per IP (None = no limit)
    pub rate_limit: Option<u32>,
    /// Max upload body size in MB
    pub max_upload_mb: Option<u32>,
    /// PHP memory_limit in MB (for PHP-FPM pool config)
    pub php_memory_mb: Option<u32>,
    /// PHP-FPM pm.max_children
    pub php_max_workers: Option<u32>,
    /// Custom nginx directives injected into server block
    pub custom_nginx: Option<String>,
    /// PHP framework preset: "laravel", "wordpress", "drupal", "joomla", "symfony", "codeigniter", "magento", "generic"
    pub php_preset: Option<String>,
    /// App start command (for node/python runtimes)
    #[serde(default)]
    pub app_command: Option<String>,
    /// Enable FastCGI cache for PHP sites
    #[serde(default)]
    pub fastcgi_cache: Option<bool>,
    /// Enable Redis object cache for PHP sites
    #[serde(default)]
    pub redis_cache: Option<bool>,
    /// Redis DB number (0-15) for per-site isolation
    #[serde(default)]
    pub redis_db: Option<i32>,
    /// Enable WAF (ModSecurity) for this site
    #[serde(default)]
    pub waf_enabled: Option<bool>,
    /// WAF mode: "detection" (log only) or "prevention" (block)
    #[serde(default)]
    pub waf_mode: Option<String>,
    /// Content-Security-Policy header value
    #[serde(default)]
    pub csp_policy: Option<String>,
    /// Permissions-Policy header value
    #[serde(default)]
    pub permissions_policy: Option<String>,
    /// Bot protection mode: "off", "rate-limit", "challenge", "block"
    #[serde(default)]
    pub bot_protection: Option<String>,
    /// PHP-FPM pool user (SFTP-enabled sites only — see `services::sftp_accounts`).
    /// `None` keeps the shared `www-data` identity every other site uses.
    #[serde(default)]
    pub pool_user: Option<String>,
    #[serde(default)]
    pub pool_group: Option<String>,
}

#[derive(Serialize)]
struct NginxResponse {
    success: bool,
    message: String,
}

#[derive(Serialize)]
struct NginxTestResponse {
    success: bool,
    output: String,
}

/// POST /nginx/test — Test nginx configuration.
async fn test_nginx() -> Json<NginxTestResponse> {
    match services::nginx::test_config().await {
        Ok(output) => Json(NginxTestResponse {
            success: output.success,
            output: if output.success {
                output.stdout
            } else {
                output.stderr
            },
        }),
        Err(e) => Json(NginxTestResponse {
            success: false,
            output: format!("Error: {e}"),
        }),
    }
}

/// POST /nginx/reload — Reload nginx.
async fn reload_nginx() -> Result<Json<NginxResponse>, (StatusCode, Json<NginxResponse>)> {
    match services::nginx::reload().await {
        Ok(_) => Ok(Json(NginxResponse {
            success: true,
            message: "Nginx reloaded".into(),
        })),
        Err(e) => Err((
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(NginxResponse {
                success: false,
                message: format!("Reload failed: {e}"),
            }),
        )),
    }
}

type ApiErr = (StatusCode, Json<serde_json::Value>);

fn api_err(status: StatusCode, msg: &str) -> ApiErr {
    (status, Json(serde_json::json!({ "error": msg })))
}

// ──────────────────────────────────────────────────────────────
// Password Protection (htpasswd)
// ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct PasswordProtectRequest {
    domain: String,
    path: String,
    username: String,
    password: String,
}

/// POST /nginx/password-protect — Enable basic auth on a path.
async fn password_protect(
    Json(body): Json<PasswordProtectRequest>,
) -> Result<Json<serde_json::Value>, ApiErr> {
    if body.domain.is_empty() || body.username.is_empty() || body.password.is_empty() {
        return Err(api_err(StatusCode::BAD_REQUEST, "Missing fields"));
    }
    if !super::is_valid_domain(&body.domain) {
        return Err(api_err(StatusCode::BAD_REQUEST, "Invalid domain format"));
    }

    let htpasswd_dir = "/etc/nginx/htpasswd";
    std::fs::create_dir_all(htpasswd_dir).ok();
    let htpasswd_file = format!("{htpasswd_dir}/{}", body.domain);

    // Generate htpasswd entry using openssl
    let output = safe_command("openssl")
        .args(["passwd", "-apr1", &body.password])
        .output()
        .await
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &format!("{e}")))?;

    let hash = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if hash.is_empty() {
        return Err(api_err(
            StatusCode::INTERNAL_SERVER_ERROR,
            "Failed to generate password hash",
        ));
    }
    let entry = format!("{}:{}", body.username, hash);

    // Append or create htpasswd file, removing existing entry for this username
    let existing = std::fs::read_to_string(&htpasswd_file).unwrap_or_default();
    let mut lines: Vec<&str> = existing
        .lines()
        .filter(|l| !l.is_empty() && !l.starts_with(&format!("{}:", body.username)))
        .collect();
    lines.push(&entry);
    std::fs::write(&htpasswd_file, lines.join("\n") + "\n")
        .map_err(|e| api_err(StatusCode::INTERNAL_SERVER_ERROR, &format!("{e}")))?;

    // Add auth_basic to nginx config via include
    let auth_conf_dir = "/etc/nginx/auth";
    std::fs::create_dir_all(auth_conf_dir).ok();
    let auth_file = format!("{auth_conf_dir}/{}.conf", body.domain);

    let path = if body.path.is_empty() { "/" } else { &body.path };
    if !path.starts_with('/') || path.contains(|c: char| c.is_whitespace() || c == ';' || c == '{' || c == '}' || c == '\n' || c == '\r') {
        return Err(api_err(StatusCode::BAD_REQUEST, "Invalid path format"));
    }
    let auth_block = format!(
        "location {} {{\n    auth_basic \"Restricted\";\n    auth_basic_user_file {};\n    try_files $uri $uri/ =404;\n}}\n",
        path, htpasswd_file
    );

    // Check if auth block for this path already exists
    let existing_auth = std::fs::read_to_string(&auth_file).unwrap_or_default();
    if !existing_auth.contains(&format!("location {} ", path)) {
        std::fs::write(&auth_file, format!("{existing_auth}{auth_block}")).ok();
    }

    // Include in site config if not already
    let site_conf = format!("{}/{}.conf", services::nginx::sites_dir(), body.domain);
    let site_content = std::fs::read_to_string(&site_conf).unwrap_or_default();
    if !site_content.contains(&format!("include /etc/nginx/auth/{}.conf", body.domain)) {
        if let Some(pos) = site_content.rfind('}') {
            let include_line = format!(
                "    include /etc/nginx/auth/{}.conf;\n",
                body.domain
            );
            let new_content = format!(
                "{}{}{}",
                &site_content[..pos],
                include_line,
                &site_content[pos..]
            );
            std::fs::write(&site_conf, new_content).ok();
        }
    }

    match services::nginx::test_config().await {
        Ok(output) if output.success => {
            if let Err(e) = services::nginx::reload().await {
                return Err(api_err(
                    StatusCode::INTERNAL_SERVER_ERROR,
                    &format!("Config saved but nginx reload failed: {e}"),
                ));
            }
        }
        _ => {
            return Err(api_err(
                StatusCode::BAD_REQUEST,
                "Nginx config test failed",
            ));
        }
    }

    tracing::info!(
        "Password protection enabled on {} path {} for user {}",
        body.domain,
        path,
        body.username
    );
    Ok(Json(serde_json::json!({ "ok": true })))
}

/// GET /nginx/last-activity/{domain} — When this domain last served a request.
///
/// The access log's mtime, as seconds since the epoch. That is deliberately not
/// a parse of the log: the only consumer is the auto-sleep timer, which asks
/// "has anyone visited recently?" every two minutes for every configured
/// container, and reading the last write time of a file answers that exactly,
/// in constant time, no matter how large the log has grown.
///
/// `seconds_ago` is `null` when the domain has no access log at all — a vhost
/// that has never been written, or an app with no domain. That is "unknown",
/// not "idle", and callers must treat it as such: reporting a silent zero here
/// is what would let a timer stop a container it knows nothing about.
async fn last_activity(Path(domain): Path<String>) -> Result<Json<serde_json::Value>, ApiErr> {
    if !super::is_valid_domain(&domain) {
        return Err(api_err(StatusCode::BAD_REQUEST, "Invalid domain format"));
    }
    let log_file = format!("/var/log/nginx/{domain}.access.log");

    let seconds_ago = std::fs::metadata(&log_file)
        .and_then(|m| m.modified())
        .ok()
        .and_then(|t| t.elapsed().ok())
        .map(|d| d.as_secs());

    Ok(Json(serde_json::json!({
        "domain": domain,
        "seconds_ago": seconds_ago,
        "log_file": log_file,
    })))
}

pub fn router() -> Router<AppState> {
    Router::new()
        .route("/nginx/test", post(test_nginx))
        .route("/nginx/reload", post(reload_nginx))
        // Password Protection — kept: backend docker_apps calls POST
        // /nginx/password-protect for TEMPLATE_SIDECAR apps (Dozzle).
        .route("/nginx/password-protect", post(password_protect))
        // Access-log activity — kept: backend auto_healer auto-sleep reads it.
        .route("/nginx/last-activity/{domain}", get(last_activity))
}

