/// Resolve a site the caller is allowed to act on, and return its domain.
///
/// Ownership decides whose a site is; the caller's role decides what may be
/// reached. A site still belongs to exactly one account and a transfer still
/// moves it — but an administrator may act on any site on the server in front of
/// them, because an operator who runs a box has to be able to repair anything
/// running on it. That is the same boundary the admin all-sites read already
/// draws: what that view lists, its owner may now also act on. It stops at the
/// server in scope and does not reach a machine somebody else registered.
///
/// This replaces six separately-named private copies of one query — two called
/// `site_domain`, four called `get_site_domain` — plus the inline repeats beside
/// them. They had drifted: exactly one of the set was also server-scoped. A
/// guard duplicated per module is a guard that gets widened in one module.
///
/// ⚠ The non-admin arm is deliberately left as it was, predicate for predicate,
/// and must NOT also become server-scoped. No non-admin can own a `servers` row
/// — the only INSERT is admin-gated — so their scope always resolves to the
/// local machine. Adding `server_id` on this arm would hide a client's own site
/// whenever it lives on any other server, and it would do it by returning an
/// empty list rather than an error, which is the direction nobody checks.
///
/// ⚠ That paragraph is true and its conclusion — do not filter this predicate by
/// server — is still the right call. But it was read for years as though it also
/// said the SITE is always local, and it does not say that. A caller's scope being
/// local is a fact about the CALLER; the site's row names its own host and the two
/// part company as soon as a fleet exists. Resolving WHICH SITE from here and WHICH
/// HOST from the caller's selection is the actual defect, and filtering cannot fix
/// it — the row has to choose the host. (R3: the `site_agent_for_caller`
/// companion that then talked to an agent died with the last site handler.)
pub async fn site_domain_for_caller(
    state: &crate::AppState,
    site_id: uuid::Uuid,
    claims: &crate::auth::Claims,
) -> Result<String, crate::error::ApiError> {
    let row: Option<(String,)> =
        sqlx::query_as(&format!("SELECT s.domain FROM sites s WHERE {SITE_CALLER_PREDICATE}"))
            .bind(site_id)
            .bind(claims.sub)
            .fetch_optional(&state.db)
            .await
            .map_err(|e| crate::error::internal_error("resolve site for caller", e))?;

    row.map(|(d,)| d)
        .ok_or_else(|| crate::error::err(axum::http::StatusCode::NOT_FOUND, "Site not found"))
}


/// The one predicate that decides whether a caller may act on a site.
///
/// Binds `$1` = site id, `$2` = the caller's own id — the same two parameters the
/// owner-only predicate it replaces took, which is what let every call site adopt
/// it without touching its binds.
///
/// Two ways to satisfy it: own the row, or be an administrator of the machine the
/// row runs on. `is_local` is this box; `sv.user_id` is a member this same
/// administrator registered. So it stops at the hardware the reader operates and
/// does not reach a server somebody else added.
///
/// ⚠ The admin arm reads `users.role` from the DATABASE, deliberately, and not
/// `claims.role` from the token. A JWT keeps asserting whatever role it was minted
/// with until it expires, so trusting the claim would leave a demoted account
/// acting as an administrator for the rest of its session. This costs one indexed
/// lookup inside a query that was already running.
pub const SITE_CALLER_PREDICATE: &str = "s.id = $1 AND (s.user_id = $2 OR EXISTS (\
    SELECT 1 FROM users u, servers sv WHERE u.id = $2 AND u.role = 'admin' \
    AND sv.id = s.server_id AND (sv.is_local OR sv.user_id = u.id)))";
