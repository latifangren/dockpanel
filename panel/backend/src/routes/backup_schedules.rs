use axum::{
    extract::State,
    Json,
};

use crate::auth::AuthUser;
use crate::error::{internal_error, ApiError};
use crate::AppState;

// R3: this file held only per-site backup schedules
// (`GET/PUT/DELETE /api/sites/{id}/backup-schedule`). Those handlers are
// removed with the site kind; volume/database scheduling lives in
// backup policies (`backup_orchestrator.rs`). What remains is
// `setup_status`, whose two JOINs against `sites` are the R1 leftover,
// deliberately left untouched until the `sites` table drops in R7
// (see the queries below).


#[derive(serde::Serialize)]
pub struct BackupSetupStatus {
    pub has_schedule: bool,
    pub has_backup: bool,
}

/// GET /api/backup-setup-status — Whether the current user has any backup schedule
/// or any stored backup (site, database, or volume). Used by the Dashboard onboarding
/// step "Set up backups" so a one-off manual backup or scheduled backup counts as done.
pub async fn setup_status(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> Result<Json<BackupSetupStatus>, ApiError> {
    let (schedule_count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM backup_schedules bs \
         JOIN sites s ON s.id = bs.site_id \
         WHERE s.user_id = $1",
    )
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await
    .map_err(|e| internal_error("setup-status schedules", e))?;

    let (site_bk,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM backups b \
         JOIN sites s ON s.id = b.site_id \
         WHERE s.user_id = $1",
    )
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await
    .map_err(|e| internal_error("setup-status backups", e))?;

    let (db_bk,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM database_backups")
        .fetch_one(&state.db)
        .await
        .map_err(|e| internal_error("setup-status db_backups", e))?;

    let (vol_bk,): (i64,) = sqlx::query_as("SELECT COUNT(*) FROM volume_backups")
        .fetch_one(&state.db)
        .await
        .map_err(|e| internal_error("setup-status volume_backups", e))?;

    Ok(Json(BackupSetupStatus {
        has_schedule: schedule_count > 0,
        has_backup: site_bk + db_bk + vol_bk > 0,
    }))
}
