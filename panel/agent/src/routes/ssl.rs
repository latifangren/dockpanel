use axum::{
    extract::{Path, State},
    http::StatusCode,
    routing::{get, post},
    Json, Router,
};
use serde::Deserialize;
use std::time::Duration;

use super::{is_valid_domain, AppState};
use crate::routes::nginx::SiteConfig;
use crate::services::ssl;

/// Split a certificate-issuance failure into "the CA said so", "the DNS provider
/// said so" and "this machine broke", and label only the first two.
///
/// Both come back from the same call as a 500, and the panel is right to hide a
/// 500 behind an incident id — an operator can do nothing with an unwritable
/// directory. But the commonest failure by far is the CA declining a challenge,
/// and answering THAT with a reference number throws away the only sentence that
/// would have helped. The label is how the panel tells them apart without
/// widening its rule to the status.
///
/// The marker is applied at the arms where the CA actually spoke, so anything
/// unmarked — including any arm added later — stays an internal fault. That is
/// the safe default: a missing label costs a reference number, a wrong one sends
/// somebody to check their DNS while their disk is full.
///
/// The DNS-01 door adds a THIRD party. Cloudflare refusing to publish the
/// challenge record — almost always a token without `DNS:Edit` — is the
/// operator's to fix and deserves its sentence, but attributing it to the CA
/// would name the wrong party in a message written to be trusted. It gets its
/// own marker and its own code, and the panel keeps them apart.
fn ca_or_internal(e: String) -> (StatusCode, Json<serde_json::Value>) {
    if let Some(reason) = e.strip_prefix(ssl::CA_DECLINED) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": reason, "code": "acme_order_failed" })),
        );
    }
    if let Some(reason) = e.strip_prefix(ssl::DNS_PROVIDER_DECLINED) {
        return (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": reason, "code": "dns_provider_failed" })),
        );
    }
    // A REFUSAL IS NOT A FAULT, and it must not arrive as one. Nothing went
    // wrong here: the agent looked at what is installed, found a certificate this
    // product did not issue, and declined to replace it. A 4xx says that; the 500
    // below would send the panel's own rule into action and answer the most
    // actionable message this door produces with an incident id.
    if let Some(reason) = e.strip_prefix(ssl::FOREIGN_CERT_REFUSED) {
        return (
            StatusCode::UNPROCESSABLE_ENTITY,
            Json(serde_json::json!({ "error": reason, "code": "foreign_certificate" })),
        );
    }
    (
        StatusCode::INTERNAL_SERVER_ERROR,
        Json(serde_json::json!({ "error": e })),
    )
}

/// GET /ssl/certificates — Every certificate on this host.
///
/// Unauthenticated in the same sense every agent route is: the agent listens on
/// the panel's private channel. It returns expiry metadata only — no key
/// material, no paths — so it says nothing an operator reading the box could not
/// already see.
async fn list_certificates() -> Json<Vec<ssl::CertStatus>> {
    Json(ssl::list_cert_status().await)
}

/// GET /ssl/status/{domain} — Get SSL certificate status.
async fn status(
    Path(domain): Path<String>,
) -> Result<Json<ssl::CertStatus>, (StatusCode, Json<serde_json::Value>)> {
    if !is_valid_domain(&domain) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Invalid domain format" })),
        ));
    }

    Ok(Json(ssl::get_cert_status(&domain).await))
}

// ──────────────────────────────────────────────────────────────
// Custom SSL Certificate Upload
// ──────────────────────────────────────────────────────────────

#[derive(Deserialize)]
struct RenewRequest {
    email: String,
    /// Absent when the caller has no `SiteConfig` to describe this domain with —
    /// a Compose stack's or a Docker app's certificate, neither of which has a
    /// `sites` row behind it. See `renew` for what its absence means.
    #[serde(default)]
    runtime: Option<String>,
    root: Option<String>,
    proxy_port: Option<u16>,
    php_socket: Option<String>,
    #[serde(default)]
    profile: Option<String>,
}

/// POST /ssl/{domain}/renew — Renew a Let's Encrypt certificate via
/// `instant_acme`, passing the existing cert PEM as the ARI `replaces` hint.
///
/// The prior implementation shelled out to `certbot renew`, which didn't
/// work for certs originally issued via `instant_acme` (certbot had no
/// record of them) and couldn't participate in the ARI replacement chain.
async fn renew(
    State(state): State<AppState>,
    Path(domain): Path<String>,
    Json(body): Json<RenewRequest>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if !is_valid_domain(&domain) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Invalid domain format" })),
        ));
    }

    tracing::info!("Renewing SSL certificate for {domain}");

    let account = ssl::load_or_create_account(&body.email).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        )
    })?;

    // Read the existing cert (if any) so we can send it as the ARI replaces
    // hint. Missing or unreadable is fine — the renewal just becomes a
    // fresh issuance from the CA's perspective.
    let cert_path = format!("/etc/dockpanel/ssl/{domain}/fullchain.pem");
    let replaces_pem = tokio::fs::read_to_string(&cert_path).await.ok();

    let opts = ssl::ProvisionOpts {
        profile: body.profile.as_deref(),
        replaces_pem: replaces_pem.as_deref(),
        // ⛔ NEVER on a renewal, and it costs this door nothing. A renewal aimed
        //    at a certificate this product issued reads a Let's Encrypt issuer
        //    and passes the writer's check untouched; a renewal aimed at anything
        //    else is the destructive case the check exists for, whatever the
        //    panel believed when it called. There is no renewal that needs to
        //    replace a stranger's certificate.
        replace_foreign: false,
    };

    let cert_info = tokio::time::timeout(
        Duration::from_secs(120),
        ssl::provision_cert(&account, &domain, Some(&opts)),
    )
    .await
    .map_err(|_| {
        (
            StatusCode::GATEWAY_TIMEOUT,
            Json(serde_json::json!({ "error": "Certificate renewal timed out after 120s" })),
        )
    })?
    .map_err(|e| {
        tracing::error!("renew failed for {domain}: {e}");
        let (status, mut body) = ca_or_internal(e);
        // The wrapper every agent ever shipped puts on this route. A panel newer
        // than its agent recognises renewals by it alone, so it has to stay.
        if let Some(msg) = body.0.get("error").and_then(|m| m.as_str()) {
            let wrapped = format!("Renewal failed: {msg}");
            body.0["error"] = serde_json::json!(wrapped);
        }
        (status, body)
    })?;

    // `runtime` is the caller saying "I can describe this domain's vhost". When
    // it does, the vhost is rebuilt; when it doesn't, nginx is only told to
    // re-read what is already on disk.
    //
    // The renewal itself never needs the rebuild: `provision_cert` overwrites
    // fullchain.pem and privkey.pem inside the same `/etc/dockpanel/ssl/{domain}`
    // the existing vhost already names, so the paths did not move. The rebuild
    // exists to pick up config changes made since the original provision — which
    // is only meaningful for a domain the panel holds a config FOR.
    //
    // A Compose stack — or a Docker app — is the domain it isn't. Its acme vhost
    // is a proxy whose published port is derived HERE, from the compose file or
    // the container, and the panel has no row to send: renewing it from an
    // invented `SiteConfig` would overwrite a working proxy with one carrying
    // `proxy_port: None` and take it off the air to install a certificate. So
    // the panel sends no `runtime`, and the absence is the instruction.
    let mut canonical = None;
    match body.runtime {
        // Regenerate nginx config so any config changes since the original
        // provision are picked up.
        Some(runtime) => {
            let site_config = SiteConfig {
                runtime,
                root: body.root,
                proxy_port: body.proxy_port,
                php_socket: body.php_socket,
                ssl: None,
                ssl_cert: None,
                ssl_key: None,
                rate_limit: None,
                max_upload_mb: None,
                php_memory_mb: None,
                php_max_workers: None,
                custom_nginx: None,
                php_preset: None,
                app_command: None,
                fastcgi_cache: None,
                redis_cache: None,
                redis_db: None,
                waf_enabled: None,
                waf_mode: None,
                csp_policy: None,
                permissions_policy: None,
                bot_protection: None,
                pool_user: None,
                pool_group: None,
            };
            match ssl::enable_ssl_for_site(&state.templates, &domain, &site_config).await {
                Ok(outcome) => canonical = Some(outcome),
                Err(e) => tracing::warn!("Nginx reload after renewal failed for {domain}: {e}"),
            }
        }
        // Nothing was re-rendered, so there is no canonical URL to report having
        // moved either — `canonical` stays None rather than being invented.
        //
        // And a reload that fails is NOT a failed renewal. The certificate is
        // already written; answering with an error would have the panel record
        // the renewal as failed and order a replacement from the CA on its next
        // scan — burning rate limit every week over an nginx that needs one
        // `reload`, and never fixing the reload. A warning is the whole remedy
        // this door owes.
        None => {
            if let Err(e) = crate::services::nginx::reload().await {
                tracing::warn!("Nginx reload after in-place renewal failed for {domain}: {e}");
            }
        }
    }

    tracing::info!("SSL certificate renewed for {domain}");
    Ok(Json(serde_json::json!({
        "ok": true,
        "domain": domain,
        "expiry": cert_info.expiry,
        "profile": cert_info.profile,
        "canonical_url": canonical,
    })))
}

/// GET /ssl/profiles — List ACME profiles advertised by the CA.
async fn profiles(
    axum::extract::Query(q): axum::extract::Query<ProfilesQuery>,
) -> Result<Json<Vec<ssl::ProfileInfo>>, (StatusCode, Json<serde_json::Value>)> {
    let account = ssl::load_or_create_account(&q.email).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        )
    })?;
    Ok(Json(ssl::list_profiles(&account)))
}

#[derive(Deserialize)]
struct ProfilesQuery {
    email: String,
}

#[derive(Deserialize)]
struct AriQuery {
    email: String,
}

/// GET /ssl/{domain}/renewal-info — Fetch the ARI suggestion for a cert.
/// Always returns JSON. `suggestion: null` means the CA doesn't advertise
/// ARI or the cert couldn't be located on disk.
async fn renewal_info(
    Path(domain): Path<String>,
    axum::extract::Query(q): axum::extract::Query<AriQuery>,
) -> Result<Json<serde_json::Value>, (StatusCode, Json<serde_json::Value>)> {
    if !is_valid_domain(&domain) {
        return Err((
            StatusCode::BAD_REQUEST,
            Json(serde_json::json!({ "error": "Invalid domain format" })),
        ));
    }

    let account = ssl::load_or_create_account(&q.email).await.map_err(|e| {
        (
            StatusCode::INTERNAL_SERVER_ERROR,
            Json(serde_json::json!({ "error": e })),
        )
    })?;

    let cert_path = format!("/etc/dockpanel/ssl/{domain}/fullchain.pem");
    let suggestion = ssl::fetch_ari(&account, &cert_path).await;
    Ok(Json(serde_json::json!({ "suggestion": suggestion })))
}

pub fn router() -> Router<AppState> {
    Router::new()
        // Registered BEFORE the `{domain}` routes it shares a prefix with, and
        // named `certificates` rather than a bare `/ssl` for the same reason the
        // db-backups router pins `/db-backups/dump` above `{db_name}`: a static
        // segment that could also be read as a parameter is a collision waiting
        // for a domain with that name.
        .route("/ssl/certificates", get(list_certificates))
        .route("/ssl/status/{domain}", get(status))
        .route("/ssl/profiles", get(profiles))
        .route("/ssl/{domain}/renewal-info", get(renewal_info))
        .route("/ssl/{domain}/renew", post(renew))
}

// ── the renewal payload, from the panel's side of the wire ──────────────────
//
// At the END of the file on purpose: a `#[cfg(test)]` module in the middle of a
// source file truncates every pin arm that reads the production body below it
// (dockpanel-ops-p7), and this file is a subject of four suites.
#[cfg(test)]
mod renew_request_tests {
    use super::*;

    // The absence of `runtime` is a cross-crate contract, so this is the panel's
    // stack payload byte for byte — an `email` and nothing else. Written to fail
    // if a future edit makes the field required again, which would 422 every
    // stack renewal the scanner attempts, weekly, on every install.
    #[test]
    fn a_payload_without_runtime_parses_and_asks_for_no_re_render() {
        let body: RenewRequest =
            serde_json::from_str(r#"{"email":"ops@example.com"}"#).expect("stack payload parses");

        assert_eq!(body.email, "ops@example.com");
        assert!(body.runtime.is_none(), "absent runtime must stay absent");
        // The rest of the vhost description is absent with it — there is nothing
        // here a SiteConfig could have been built from.
        assert!(body.root.is_none());
        assert!(body.proxy_port.is_none());
        assert!(body.php_socket.is_none());
        assert!(body.profile.is_none());
    }

    // And the site payload is unchanged: a caller that CAN describe the vhost
    // still gets the re-render arm.
    #[test]
    fn a_payload_carrying_runtime_still_describes_a_vhost() {
        let body: RenewRequest = serde_json::from_str(
            r#"{"email":"ops@example.com","runtime":"php","root":"/var/www/x","php_socket":"unix:/run/php/php8.3-fpm.sock","profile":"classic"}"#,
        )
        .expect("site payload parses");

        assert_eq!(body.runtime.as_deref(), Some("php"));
        assert_eq!(body.root.as_deref(), Some("/var/www/x"));
        assert_eq!(body.profile.as_deref(), Some("classic"));
    }
}
