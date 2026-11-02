pub mod agent_unit;
// R6: systemd-unit management for git-deployed apps; callers (nginx site handlers, mail) deleted. Retained pending an R7/R8 keep-or-delete decision; pins still assert its chown shape.
#[allow(dead_code)]
pub mod app_process;
pub mod app_sidecar;
pub mod command_filter;
pub mod backups;
pub mod backup_drill;
pub mod backup_verify;
pub mod compose;
pub mod crontab;
pub mod cpu_sampler;
pub mod database;
pub mod database_backup;
// R7: clone_or_pull deleted (zero Rust callers); the allow now protects the
// seven helpers below it, which production code no longer reaches but the
// module's own #[cfg(test)] escalation/adoption tests still exercise.
#[allow(dead_code)]
pub mod deploy;
pub mod diagnostics;
pub mod docker_apps;
pub mod encryption;
pub mod files;
pub mod firewall;
pub mod image_scanner;
pub mod logs;
pub mod sbom_scanner;
pub mod nginx;
pub mod ownership;
pub mod phone_home;
pub mod pkg;
pub mod remote_backup;
pub mod security;
pub mod security_scanner;
pub mod ssl;
// R7: its sole production caller was deploy.rs::clone_or_pull, deleted in R7
// (zero Rust callers). Module and tests retained as the SSRF guard surface;
// the guard entry point is still asserted by the git-clone-ssrf pin.
#[allow(dead_code)]
pub mod ssrf_guard;
pub mod traefik;
pub mod volume_backup;
pub mod wordpress;
