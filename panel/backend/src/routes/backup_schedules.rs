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
// `setup_status`, rewritten in R7: the `backup_schedules` table and the
// `sites` table it joined are both dropped, so a "schedule" is now a
// `backup_policies` row owned by the caller, and a "backup" is a
// `database_backups`/`volume_backups` row (the site-backup term is gone
// with `backups.site_id` — see the note in the handler).


#[derive(serde::Serialize)]
pub struct BackupSetupStatus {
    pub has_schedule: bool,
    pub has_backup: bool,
}

/// GET /api/backup-setup-status — Whether the current user has any backup schedule
/// or any stored backup (database or volume). Used by the Dashboard onboarding
/// step "Set up backups" so a one-off manual backup or scheduled backup counts as done.
///
/// R7: `backup_schedules` (one row per site) and the `sites` join that
/// scoped it are gone. `has_schedule` now counts the caller's
/// `backup_policies` — the surviving schedule mechanism. `has_backup`
/// counts `database_backups` + `volume_backups` exactly as before (those
/// two counts were already unscoped globals); the site-backup term that
/// used to be scoped through `backups`/`sites` has no surviving source —
/// `backups.site_id` is dropped and site backup rows die with `sites` —
/// so it contributes 0. The response shape is unchanged.
pub async fn setup_status(
    State(state): State<AppState>,
    AuthUser(claims): AuthUser,
) -> Result<Json<BackupSetupStatus>, ApiError> {
    let (schedule_count,): (i64,) = sqlx::query_as(
        "SELECT COUNT(*) FROM backup_policies WHERE user_id = $1",
    )
    .bind(claims.sub)
    .fetch_one(&state.db)
    .await
    .map_err(|e| internal_error("setup-status schedules", e))?;

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
        has_backup: db_bk + vol_bk > 0,
    }))
}
