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
// R6: clone_or_pull retained per the R6 keep decision although no Rust caller remains; revisit in R7/R8.
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
// R6: the git repo-URL validation chain lost its callers with git_build/migration/deploy routes; module and tests retained as the SSRF guard surface.
#[allow(dead_code)]
pub mod ssrf_guard;
pub mod staging;
pub mod traefik;
pub mod volume_backup;
pub mod wordpress;
