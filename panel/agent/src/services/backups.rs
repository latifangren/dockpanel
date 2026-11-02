use std::path::{Path, PathBuf};
use crate::safe_cmd::safe_command;

const BACKUP_DIR: &str = "/var/backups/dockpanel";

// The root below is indirected through a function ONLY so the unit tests
// can run hermetically under a temp directory: the real path needs root and a
// provisioned box, which CI is neither. The override exists exclusively in
// `cfg(test)` builds — a release binary has no way to relocate it.
#[cfg(not(test))]
fn backups_root() -> PathBuf { PathBuf::from(BACKUP_DIR) }

#[cfg(test)]
fn test_root() -> PathBuf { std::env::temp_dir().join("dockpanel-agent-tests") }
#[cfg(test)]
fn backups_root() -> PathBuf { test_root().join("backups") }

/// Make the whole backup tree root-only, repairing what is already on disk.
///
/// Everything under `/var/backups/dockpanel` is a restorable copy of something
/// secret: the panel's own database — which carries `servers.agent_token` in
/// CLEARTEXT, and that token is both the Bearer credential for every
/// authenticated agent endpoint and the HMAC key the agent verifies its own
/// root-PTY tickets with (`routes/terminal.rs`) — plus every tenant's database
/// dump and every site archive, `wp-config.php` included.
///
/// The tree was created `0755` and each writer used a plain shell redirect or
/// `fs::write`, so files landed `0644`. Both panel services run as root, so
/// nothing legitimate ever needed the world bits — but on a panel host that
/// also serves sites, `www-data` is the uid EVERY hosted site's PHP runs as,
/// and `services/command_filter.rs` already records that every site resolves to
/// that one uid. Measured on the demo box at v2.87.0: **17 of 17 files readable
/// as www-data**, the newest being a full `pg_dump` of the panel database.
///
/// The directory bit is the load-bearing half: at `0700` nothing under the tree
/// is reachable by a non-root uid whatever the individual files say. The file
/// bits are defence in depth for anything that gets moved out.
///
/// Repairing on every start rather than only fixing the writers is deliberate.
/// Three writers produce these files — this agent, the panel's auto-healer, and
/// a root crontab line `setup.sh` installs — and a fix that only corrects new
/// writes would leave every install that already holds a backup exposed for
/// ever. That is the same delivery shape as the s280 install-template lesson.
/// Idempotent, cheap, and it walks a directory that holds tens of files.
pub fn secure_backup_tree() {
    secure_tree_at(&backups_root());
}

/// The body of [`secure_backup_tree`], parameterized on the root.
///
/// Split out for ONE reason: the tests must not share `backups_root()`. Nine
/// tests in this module use that single fixed path and cargo runs them
/// concurrently, so an arm written against it races another test's
/// `remove_dir_all` — which is exactly what happened. The first symlink arm
/// written here PASSED against a deliberately broken `tighten()`, twice, and
/// only a mutation revealed it was measuring an empty directory.
fn secure_tree_at(root: &Path) {
    use std::os::unix::fs::PermissionsExt;

    fn tighten(path: &Path, want: u32) {
        // Compare before writing so a correct tree costs one stat per entry and
        // the log line below only ever fires on a box that was actually exposed.
        let Ok(meta) = std::fs::symlink_metadata(path) else { return };
        // Never follow a symlink here: chmod would apply to its target, which is
        // an arbitrary path a writer could have aimed anywhere.
        if meta.file_type().is_symlink() {
            return;
        }
        if meta.permissions().mode() & 0o777 != want {
            let _ = std::fs::set_permissions(path, std::fs::Permissions::from_mode(want));
        }
    }

    fn walk(dir: &Path, loosened: &mut u32) {
        let Ok(entries) = std::fs::read_dir(dir) else { return };
        for entry in entries.flatten() {
            let path = entry.path();
            let Ok(meta) = std::fs::symlink_metadata(&path) else { continue };
            if meta.file_type().is_symlink() {
                continue;
            }
            if meta.is_dir() {
                if meta.permissions().mode() & 0o777 != 0o700 {
                    *loosened += 1;
                }
                tighten(&path, 0o700);
                walk(&path, loosened);
            } else {
                if meta.permissions().mode() & 0o007 != 0 {
                    *loosened += 1;
                }
                tighten(&path, 0o600);
            }
        }
    }

    if !root.exists() {
        return;
    }
    let mut loosened = 0u32;
    tighten(root, 0o700);
    walk(root, &mut loosened);
    if loosened > 0 {
        tracing::warn!(
            "Tightened {loosened} world-readable entries under {} — a backup there \
             carries the panel database, which holds agent tokens in cleartext",
            root.display()
        );
    }
}

#[cfg(all(test, unix))]
mod backup_perm_tests {
    use super::*;
    use std::os::unix::fs::PermissionsExt;

    fn mode_of(p: &Path) -> u32 {
        std::fs::symlink_metadata(p).unwrap().permissions().mode() & 0o777
    }

    /// A root of this arm's OWN, never `backups_root()` — see `secure_tree_at`.
    fn isolated_root() -> PathBuf {
        let d = std::env::temp_dir().join(format!("dp-bkperm-{}", uuid::Uuid::new_v4()));
        std::fs::create_dir_all(&d).unwrap();
        d
    }

    /// The defect, reproduced: a 0755 tree of 0644 dumps is readable by any uid
    /// on the box — and on a panel host that also serves sites, that uid is
    /// `www-data`, which runs every tenant's PHP. Measured on the demo box at
    /// v2.87.0: 17 of 17 files readable as www-data, the newest a full pg_dump
    /// carrying `servers.agent_token` in cleartext.
    #[test]
    fn a_world_readable_backup_tree_is_repaired() {
        let root = isolated_root();
        std::fs::create_dir_all(root.join("db")).unwrap();
        std::fs::write(root.join("dockpanel-db-x.sql.gz"), b"dump").unwrap();
        std::fs::write(root.join("db/nested.sql.gz"), b"dump").unwrap();
        // Exactly what the three writers leave behind today.
        for (p, m) in [
            (root.clone(), 0o755),
            (root.join("db"), 0o755),
            (root.join("dockpanel-db-x.sql.gz"), 0o644),
            (root.join("db/nested.sql.gz"), 0o644),
        ] {
            std::fs::set_permissions(&p, std::fs::Permissions::from_mode(m)).unwrap();
        }
        // The arm can only mean something if the tree really is exposed first.
        assert_eq!(mode_of(&root.join("dockpanel-db-x.sql.gz")), 0o644, "setup did not land");

        secure_tree_at(&root);

        assert_eq!(mode_of(&root), 0o700, "the backup root is still traversable");
        assert_eq!(mode_of(&root.join("db")), 0o700, "a nested backup dir is still traversable");
        assert_eq!(mode_of(&root.join("dockpanel-db-x.sql.gz")), 0o600, "the panel dump is still world-readable");
        assert_eq!(mode_of(&root.join("db/nested.sql.gz")), 0o600, "a nested dump is still world-readable");
        let _ = std::fs::remove_dir_all(&root);
    }

    /// It must never chmod THROUGH a symlink: a writer that dropped one in the
    /// tree could otherwise aim a root-owned `set_permissions` at any path.
    #[test]
    fn it_does_not_follow_a_symlink_out_of_the_tree() {
        let root = isolated_root();
        let outside = std::env::temp_dir().join(format!("dp-outside-{}", uuid::Uuid::new_v4()));
        std::fs::write(&outside, b"not ours").unwrap();
        std::fs::set_permissions(&outside, std::fs::Permissions::from_mode(0o644)).unwrap();
        std::os::unix::fs::symlink(&outside, root.join("link")).unwrap();
        // Non-vacuity: prove the link resolves before asserting it is not followed.
        assert_eq!(std::fs::read_to_string(root.join("link")).unwrap(), "not ours");

        secure_tree_at(&root);

        assert_eq!(mode_of(&outside), 0o644, "chmod followed a symlink out of the backup tree");
        let _ = std::fs::remove_file(&outside);
        let _ = std::fs::remove_dir_all(&root);
    }
}

/// A database that could not be dumped or restored, and why. Never swallowed —
/// a backup that silently lost a database is the defect this whole path exists
/// to close.
#[derive(serde::Serialize, serde::Deserialize, Clone, Debug)]
pub struct DbFailure {
    pub db_name: String,
    pub error: String,
}

#[derive(serde::Serialize, Default)]
pub struct BackupInfo {
    pub filename: String,
    pub size_bytes: u64,
    pub created_at: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub sha256: Option<String>,
    /// Databases whose dump is inside this archive. Empty (and omitted) for a
    /// files-only backup, which is what every archive made before v2.34.0 is.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub databases_included: Vec<String>,
    /// Databases the panel asked for that are NOT in the archive.
    #[serde(default, skip_serializing_if = "Vec::is_empty")]
    pub databases_failed: Vec<DbFailure>,
    /// Why a file sitting in a backup directory cannot be used, and how to fix it.
    ///
    /// `None` for every real backup, and omitted from the JSON when absent, so the
    /// site- and volume-backup responses — which share this struct — are byte-identical
    /// to what they were before this field existed. Only the database listing sets it,
    /// and only for a file it would otherwise have dropped on the floor: an operator who
    /// copies a dump into the directory and gets an empty list back has been told
    /// nothing, which is the failure this whole release is about.
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub unsupported: Option<String>,
}

/// Compute SHA256 hash of a file (for backup integrity chain).
/// Shared by site / database / volume backup paths.
pub(crate) async fn compute_file_sha256(path: &str) -> Option<String> {
    let output = safe_command("sha256sum")
        .arg(path)
        .output()
        .await
        .ok()?;
    if output.status.success() {
        let stdout = String::from_utf8_lossy(&output.stdout);
        Some(stdout.split_whitespace().next()?.to_string())
    } else {
        None
    }
}
