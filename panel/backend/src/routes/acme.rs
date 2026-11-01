//! Panel-wide ACME (Let's Encrypt) settings and the shared DNS-01 budget.
//!
//! Split out of `routes/ssl.rs` verbatim in R3 (hosting removal): the
//! site-scoped SSL doors died with sites, but these settings doors serve
//! stack and Docker-app issuance too, so they moved here unchanged — same
//! paths, same bodies:
//! `/api/ssl/profiles`, `/api/ssl/contact-email`,
//! `/api/ssl/default-profile`, `/api/preflight/dns`.
//! `DNS01_ORDER_TIMEOUT_SECS` is the shared `post_long` budget the stack and
//! Docker-app renewal arms in `stacks.rs` and `security_scanner.rs` already
//! used through `ssl.rs`.
//!
//! Convention carried over from `ssl.rs`: production items above the first
//! `#[cfg(test)]`; test modules at the end.

use axum::{
    extract::{Query, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use crate::auth::{AdminUser, AuthUser, ServerScope};
use crate::error::{agent_error, err, internal_error, ApiError};
use crate::AppState;
use crate::services::activity;

pub(crate) const DNS01_ORDER_TIMEOUT_SECS: u64 = 300;

/// Top-level labels reserved by RFC 2606 / RFC 6761 / RFC 8375, plus the
/// conventional private-network ones. None of these appear on the Public Suffix
/// List, so Let's Encrypt refuses an account contact in any of them with
/// `contact email has invalid domain: Domain name does not end with a valid
/// public suffix`.
const NON_PUBLIC_TLDS: &[&str] = &[
    "test", "local", "localhost", "internal", "invalid", "example",
    "localdomain", "lan", "home", "corp", "intranet", "private", "arpa", "onion",
];

/// Check that an address is usable as an ACME account contact.
///
/// This is deliberately not a general-purpose email validator — it only rejects
/// what Let's Encrypt itself rejects, so we never refuse an address the CA would
/// have accepted.
pub(crate) fn validate_acme_contact(email: &str) -> Result<(), String> {
    let email = email.trim();
    if email.is_empty() {
        return Err("no contact address is set".to_string());
    }

    let mut parts = email.split('@');
    let local = parts.next().unwrap_or("");
    let domain = parts.next().unwrap_or("");
    if local.is_empty() || domain.is_empty() || parts.next().is_some() {
        return Err(format!("\"{email}\" is not a valid email address"));
    }

    if !domain.contains('.') || domain.starts_with('.') || domain.ends_with('.') {
        return Err(format!(
            "\"{email}\" has no valid public domain — Let's Encrypt will reject it as a contact address"
        ));
    }

    let tld = domain.rsplit('.').next().unwrap_or("").to_ascii_lowercase();
    if tld.len() < 2 || !tld.chars().all(|c| c.is_ascii_alphabetic()) {
        return Err(format!(
            "\"{email}\" has no valid public domain — Let's Encrypt will reject it as a contact address"
        ));
    }
    if NON_PUBLIC_TLDS.contains(&tld.as_str()) {
        return Err(format!(
            "\"{email}\" uses the reserved .{tld} domain, which Let's Encrypt rejects as a contact address"
        ));
    }

    Ok(())
}

/// Resolve the Let's Encrypt account contact for an issuance.
///
/// The panel used to hand `claims.email` straight to the agent, unvalidated. An
/// operator who registered the panel with e.g. `admin@dockpanel.test` therefore
/// had EVERY certificate fail at the CA with a contact-validation error that
/// surfaced neither in the UI nor in `journalctl` — four silent retries, then a
/// permanent give-up (s252 F4).
///
/// Order: the user's own address when it is usable, otherwise the panel-wide
/// `acme_contact_email` setting as a rescue. Keeping the user's address first
/// means installs that already work are completely unaffected.
pub(crate) async fn resolve_acme_contact(
    pool: &sqlx::PgPool,
    user_email: &str,
) -> Result<String, String> {
    let user_err = match validate_acme_contact(user_email) {
        Ok(()) => return Ok(user_email.trim().to_string()),
        Err(e) => e,
    };

    let fallback = sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'acme_contact_email'",
    )
    .fetch_optional(pool)
    .await
    .ok()
    .flatten()
    .filter(|s| !s.trim().is_empty());

    match fallback {
        Some(addr) if validate_acme_contact(&addr).is_ok() => Ok(addr.trim().to_string()),
        _ => Err(format!(
            "Cannot request a certificate: {user_err}. \
             Set a valid contact address under Settings → SSL (ACME contact email), \
             or sign in with an account whose email uses a real domain."
        )),
    }
}

#[derive(Deserialize)]
pub struct PreflightQuery {
    pub domain: String,
}

/// GET /api/preflight/dns?domain=… — Evaluate the DNS prerequisite for a domain.
///
/// The shared prerequisite UI calls this before the user commits, and the
/// SSL panel calls it to explain a gated button. Same checker issuance
/// uses, so the advice and the enforcement cannot disagree. (R3: the
/// create-site form that used to call this died with sites; the checker
/// itself is domain-generic and serves mail and stack/app flows too.)
pub async fn preflight_dns(
    _auth: AuthUser,
    Query(q): Query<PreflightQuery>,
) -> Json<crate::services::prerequisites::PrereqResult> {
    Json(crate::services::prerequisites::check_dns_points_here(&q.domain).await)
}

/// GET /api/ssl/profiles — List ACME profiles advertised by the CA.
///
/// Requires an admin (the ACME account is a panel-wide resource). Returns
/// the server directory's profile list plus the currently configured
/// default. When the CA doesn't support the profiles extension, `profiles`
/// is empty; callers should hide the dropdown.
pub async fn profiles(
    State(state): State<AppState>,
    AdminUser(claims): AdminUser,
    ServerScope(_server_id, agent): ServerScope,
) -> Result<Json<serde_json::Value>, ApiError> {
    // Use the admin's own email for ACME directory lookup. Safe because we
    // only read the server directory; no order is created.
    let email = &claims.email;
    let agent_path = format!("/ssl/profiles?email={}", urlencoding::encode(email));
    let list = agent
        .get(&agent_path)
        .await
        .map_err(|e| agent_error("ACME profiles", e))?;

    let default = sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'acme_default_profile'",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| internal_error("read default profile", e))?;

    let contact_email = sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'acme_contact_email'",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| internal_error("read acme contact", e))?;

    // Tell the operator, up front, which address will actually reach the CA and
    // whether their own is usable — the whole point of F4 is that this was
    // invisible until every certificate had already failed.
    let effective = resolve_acme_contact(&state.db, &claims.email).await;

    Ok(Json(serde_json::json!({
        "profiles": list,
        "default": default,
        "contact_email": contact_email,
        "login_email": claims.email,
        "login_email_usable": validate_acme_contact(&claims.email).is_ok(),
        "effective_contact": effective.as_ref().ok(),
        "contact_problem": effective.as_ref().err(),
    })))
}

/// GET /api/ssl/contact-email — Report the ACME contact situation.
///
/// Deliberately does NOT touch the agent, unlike `profiles` above. The whole
/// point of this surface is to be readable when issuance is broken, and a bad
/// contact is one of the reasons the agent's ACME directory call fails — putting
/// it behind that call would hide it exactly when it is needed.
pub async fn get_contact_email(
    State(state): State<AppState>,
    AdminUser(claims): AdminUser,
) -> Result<Json<serde_json::Value>, ApiError> {
    let contact_email = sqlx::query_scalar::<_, String>(
        "SELECT value FROM settings WHERE key = 'acme_contact_email'",
    )
    .fetch_optional(&state.db)
    .await
    .map_err(|e| internal_error("read acme contact", e))?;

    let effective = resolve_acme_contact(&state.db, &claims.email).await;

    Ok(Json(serde_json::json!({
        "contact_email": contact_email,
        "login_email": claims.email,
        "login_email_usable": validate_acme_contact(&claims.email).is_ok(),
        "effective_contact": effective.as_ref().ok(),
        "contact_problem": effective.as_ref().err(),
    })))
}

#[derive(Deserialize)]
pub struct ContactEmailReq {
    pub email: Option<String>,
}

/// POST /api/ssl/contact-email — Set the panel-wide fallback ACME contact.
///
/// Used when the operator's own login address cannot be a Let's Encrypt contact
/// (a reserved TLD, a typo). Pass `{"email": null}` to clear it.
pub async fn set_contact_email(
    State(state): State<AppState>,
    AdminUser(claims): AdminUser,
    Json(body): Json<ContactEmailReq>,
) -> Result<Json<serde_json::Value>, ApiError> {
    match body.email.as_deref().map(str::trim) {
        Some(e) if !e.is_empty() => {
            // Validate before storing: a rescue address that is itself invalid
            // would just move the silent failure one level down.
            validate_acme_contact(e)
                .map_err(|msg| err(StatusCode::BAD_REQUEST, &msg))?;
            sqlx::query(
                "INSERT INTO settings (key, value) VALUES ('acme_contact_email', $1) \
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
            )
            .bind(e)
            .execute(&state.db)
            .await
            .map_err(|e| internal_error("set acme contact", e))?;
        }
        _ => {
            sqlx::query("DELETE FROM settings WHERE key = 'acme_contact_email'")
                .execute(&state.db)
                .await
                .map_err(|e| internal_error("clear acme contact", e))?;
        }
    }

    activity::log_activity(
        &state.db, claims.sub, &claims.email, "ssl.contact_email",
        None, None,
        Some(&format!("email={:?}", body.email)),
        None,
        claims.key_id,
    ).await;

    Ok(Json(serde_json::json!({ "ok": true, "contact_email": body.email })))
}

#[derive(Deserialize)]
pub struct DefaultProfileReq {
    pub profile: Option<String>,
}

/// POST /api/ssl/default-profile — Set the panel-wide default ACME profile.
/// Pass `{"profile": null}` or omit to reset to CA default.
pub async fn set_default_profile(
    State(state): State<AppState>,
    AdminUser(claims): AdminUser,
    Json(body): Json<DefaultProfileReq>,
) -> Result<Json<serde_json::Value>, ApiError> {
    match body.profile.as_deref() {
        Some(p) if !p.is_empty() => {
            sqlx::query(
                "INSERT INTO settings (key, value) VALUES ('acme_default_profile', $1) \
                 ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = NOW()",
            )
            .bind(p)
            .execute(&state.db)
            .await
            .map_err(|e| internal_error("set default profile", e))?;
        }
        _ => {
            sqlx::query("DELETE FROM settings WHERE key = 'acme_default_profile'")
                .execute(&state.db)
                .await
                .map_err(|e| internal_error("clear default profile", e))?;
        }
    }

    activity::log_activity(
        &state.db, claims.sub, &claims.email, "ssl.default_profile",
        None, None,
        Some(&format!("profile={:?}", body.profile)),
        None,
        claims.key_id,
    ).await;

    Ok(Json(serde_json::json!({
        "ok": true,
        "default": body.profile,
    })))
}

#[cfg(test)]
mod acme_contact_tests {
    use super::validate_acme_contact;

    /// The exact address that broke every issuance on the s252 audit box.
    #[test]
    fn rejects_the_address_that_broke_the_audit_box() {
        let e = validate_acme_contact("admin@dockpanel.test").unwrap_err();
        assert!(e.contains(".test"), "error must name the offending TLD: {e}");
    }

    #[test]
    fn rejects_the_other_reserved_tlds() {
        for addr in [
            "a@box.local",
            "a@box.internal",
            "a@box.localhost",
            "a@box.invalid",
            "a@host.example",
            "a@box.lan",
            "a@box.home",
            "a@box.corp",
        ] {
            assert!(validate_acme_contact(addr).is_err(), "{addr} must be rejected");
        }
    }

    #[test]
    fn rejects_malformed_addresses() {
        for addr in ["", "   ", "admin", "admin@", "@example.com", "a@b@c.com", "admin@localhost"] {
            assert!(validate_acme_contact(addr).is_err(), "{addr:?} must be rejected");
        }
    }

    #[test]
    fn rejects_a_bare_or_numeric_tld() {
        assert!(validate_acme_contact("admin@example.c").is_err());
        assert!(validate_acme_contact("admin@example.123").is_err());
        assert!(validate_acme_contact("admin@.com").is_err());
        assert!(validate_acme_contact("admin@example.").is_err());
    }

    /// The guard must not be stricter than the CA — these all issue fine today.
    #[test]
    fn accepts_real_addresses() {
        for addr in [
            "admin@example.com",
            "admin@example.dev",
            "someone+le@example.co.uk",
            "a.b-c_d@sub.domain.io",
            "  spaced@example.com  ",
        ] {
            assert!(validate_acme_contact(addr).is_ok(), "{addr} must be accepted");
        }
    }
}
