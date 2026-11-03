use sqlx::SqlitePool;
use uuid::Uuid;

/// Insert a system log entry. Fire-and-forget — never fails the caller.
pub async fn log_event(pool: &SqlitePool, level: &str, source: &str, message: &str, details: Option<&str>) {
    let _ = sqlx::query(
        "INSERT INTO system_logs (id, level, source, message, details) VALUES ($1, $2, $3, $4, $5)"
    )
    .bind(Uuid::new_v4())
    .bind(level)
    .bind(source)
    .bind(message)
    .bind(details)
    .execute(pool)
    .await;
}
