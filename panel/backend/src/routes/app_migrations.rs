// App migration between servers — moved verbatim from `routes/whmcs.rs` in
// R2 (backend-hosting removal). The migration endpoints are generic
// (container moves between servers, tables `app_migrations` + `servers`),
// not WHMCS billing; the WHMCS part of that file was deleted with R2.
// NOTE: `start_migration` only writes a row — no background task anywhere
// in the tree performs the transfer, so rows stay stuck at
// `status='in_progress'`. That pre-existing limitation is preserved here
// verbatim; withdrawing the feature is a separate, explicit decision.

use axum::{
    extract::{Path, State},
    http::StatusCode,
    Json,
};
use serde::Deserialize;

use crate::auth::AuthUser;
use crate::error::{internal_error, err, require_admin, ApiError};
use crate::services::activity;
use crate::AppState;

// ─── App Migration Between Servers ─────────────────────────────

#[derive(Deserialize)]
pub struct MigrateRequest {
    pub container_id: String,
    pub container_name: String,
    pub target_server_id: uuid::Uuid,
}

/// POST /api/migrations/apps — Start migrating a container to another server.
pub async fn start_migration(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Json(body): Json<MigrateRequest>,
) -> Result<(StatusCode, Json<serde_json::Value>), ApiError> {
    require_admin(&claims.role)?;

    if body.container_id.is_empty() || body.container_id.len() > 64 {
        return Err(err(StatusCode::BAD_REQUEST, "Invalid container ID"));
    }

    // Verify target server exists and user owns it
    let target: Option<(uuid::Uuid,)> = sqlx::query_as(
        "SELECT id FROM servers WHERE id = $1"
    ).bind(body.target_server_id).fetch_optional(&state.db).await
    .map_err(|e| internal_error("verify target server", e))?;

    if target.is_none() {
        return Err(err(StatusCode::NOT_FOUND, "Target server not found"));
    }

    // Get source server (local)
    let source_id: Option<(uuid::Uuid,)> = sqlx::query_as(
        "SELECT id FROM servers WHERE is_local = true LIMIT 1"
    ).fetch_optional(&state.db).await
    .map_err(|e| internal_error("get local server", e))?;

    // Guarded like `target` above, rather than laundered into a sentinel. This
    // used to be `.unwrap_or_else(uuid::Uuid::nil)`, and `app_migrations.
    // source_server_id` is NOT NULL with a foreign key to `servers(id)`, so a
    // panel with no local server row answered a migration request with an opaque
    // 500 from a constraint violation three statements later instead of saying
    // what was wrong. (It also hid from the obvious audit: `Uuid::nil()` greps
    // find the call with parentheses, not this one without them.)
    let source_server_id = match source_id {
        Some((id,)) => id,
        None => {
            return Err(err(
                StatusCode::CONFLICT,
                "This panel has no local server registered, so there is nothing to migrate from",
            ))
        }
    };

    if source_server_id == body.target_server_id {
        return Err(err(StatusCode::BAD_REQUEST, "Source and target servers are the same"));
    }

    let mig_id: (uuid::Uuid,) = sqlx::query_as(
        "INSERT INTO app_migrations (container_id, container_name, source_server_id, target_server_id, status, started_at) \
         VALUES ($1, $2, $3, $4, 'in_progress', CURRENT_TIMESTAMP) RETURNING id"
    )
    .bind(&body.container_id)
    .bind(&body.container_name)
    .bind(source_server_id)
    .bind(body.target_server_id)
    .fetch_one(&state.db)
    .await
    .map_err(|e| internal_error("create migration", e))?;

    // No background task exists anywhere in the tree to do the actual container
    // export/transfer/import this would need — the row above is written once
    // and never updated again (confirmed by the loose-ends audit: zero writers
    // touch `app_migrations` besides this INSERT). It is permanently stuck at
    // `status='in_progress'`. See FEATURES.md §Withdrawn Claims ("App Migration").

    activity::log_activity(
        &state.db, claims.sub, &claims.email, "migration.started",
        Some("container"), Some(&body.container_name),
        Some(&format!("to server {}", body.target_server_id)), None, claims.key_id,
    ).await;

    Ok((StatusCode::CREATED, Json(serde_json::json!({
        "ok": true,
        "migration_id": mig_id.0,
        "status": "in_progress",
    }))))
}

/// GET /api/migrations/apps — List all app migrations.
pub async fn list_migrations(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> Result<Json<serde_json::Value>, ApiError> {
    require_admin(&claims.role)?;

    let migrations: Vec<(uuid::Uuid, String, String, uuid::Uuid, uuid::Uuid, String, i32, Option<String>, Option<chrono::DateTime<chrono::Utc>>, Option<chrono::DateTime<chrono::Utc>>)> =
        sqlx::query_as(
            "SELECT id, container_id, container_name, source_server_id, target_server_id, \
             status, progress_pct, error_message, started_at, completed_at \
             FROM app_migrations ORDER BY created_at DESC LIMIT 50"
        )
        .fetch_all(&state.db)
        .await
        .map_err(|e| internal_error("list migrations", e))?;

    let items: Vec<serde_json::Value> = migrations.iter().map(|(id, cid, name, src, tgt, status, pct, err_msg, started, completed)| {
        serde_json::json!({
            "id": id,
            "container_id": cid,
            "container_name": name,
            "source_server_id": src,
            "target_server_id": tgt,
            "status": status,
            "progress_pct": pct,
            "error_message": err_msg,
            "started_at": started,
            "completed_at": completed,
        })
    }).collect();

    Ok(Json(serde_json::json!({ "migrations": items })))
}

/// GET /api/migrations/apps/{id} — Get migration status.
pub async fn migration_status(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
    Path(id): Path<uuid::Uuid>,
) -> Result<Json<serde_json::Value>, ApiError> {
    require_admin(&claims.role)?;

    let mig: Option<(String, String, String, i32, Option<String>)> = sqlx::query_as(
        "SELECT container_name, status, COALESCE(error_message, ''), progress_pct, \
         CASE WHEN completed_at IS NOT NULL THEN to_char(completed_at, 'YYYY-MM-DD HH24:MI:SS') END \
         FROM app_migrations WHERE id = $1"
    )
    .bind(id)
    .fetch_optional(&state.db)
    .await
    .map_err(|e| internal_error("migration status", e))?;

    match mig {
        Some((name, status, err_msg, pct, completed)) => {
            Ok(Json(serde_json::json!({
                "container_name": name,
                "status": status,
                "error_message": if err_msg.is_empty() { None } else { Some(err_msg) },
                "progress_pct": pct,
                "completed_at": completed,
            })))
        }
        None => Err(err(StatusCode::NOT_FOUND, "Migration not found")),
    }
}
