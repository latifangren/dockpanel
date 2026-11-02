-- Drop the hosting schema (R7 terminal migration).
--
-- This is the single terminal migration for the removal of the hosting
-- backend. It drops every hosting-only table, removes every `site_id`
-- reference to `sites` from the tables that stay, denormalises database
-- ownership onto `databases` itself, renames stored `reseller` roles to
-- `user`, and deletes the two dead WordPress-vulnerability-scan settings
-- keys. It touches no shared table's surviving columns and no retained
-- object: `tls_certificates`, `docker_stacks`, `docker_app_domains`,
-- `app_migrations`, `_sqlx_migrations`, the `chk_users_role` CHECK, and
-- the `iac_tokens.scopes` default string in migration history are all
-- left exactly as they are.
--
-- D6: the phone path is a clean install (the `dockpanel-pgdata` volume is
-- recreated and only the login user is recreated), so on that path this
-- migration runs against an empty schema and every DROP is a no-op. It
-- exists as a safety net for any other install that upgrades with
-- hosting rows already present: the denormalisation backfill in step 1
-- must run while `sites` still exists, because after `sites` is dropped
-- the backfill is impossible.
--
-- Deleting the hosting-only migration files is safe at startup because
-- the migrator runs with `set_ignore_missing(true)` (see main.rs): an
-- applied migration with no file is tolerated, and missing migrations
-- are still applied. Do not edit already-applied migration files to
-- "clean up" history; cleanup happens only through this new file.
--
-- Every statement below is idempotent-guarded (`IF EXISTS`, `IF NOT
-- EXISTS`, or a `DO` block that no-ops when its constraint is already
-- gone) so the migration is safe to run twice. No `DROP TABLE` uses
-- `CASCADE`: the drop order below respects the foreign-key graph, so a
-- leftover dependency fails this migration loudly instead of silently
-- deleting something it should not.

-- 1. Denormalise `databases` ownership.
--
-- `databases` had no owner of its own: ownership and server came only
-- through `LEFT JOIN sites` (via `site_id`) or `LEFT JOIN docker_stacks`
-- (via `stack_id`), and `chk_databases_owner` guaranteed exactly one of
-- the two joins matched. Give each row its own nullable `user_id` /
-- `server_id` first, backfill them from the joins, and only then make
-- them NOT NULL: the NOT NULL is the guard -- it fails hard if the
-- backfill was not total, which is deliberate. Column names are the
-- contract: `user_id` and `server_id`, no renaming.
ALTER TABLE databases ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES users(id) ON DELETE CASCADE;
ALTER TABLE databases ADD COLUMN IF NOT EXISTS server_id UUID REFERENCES servers(id) ON DELETE CASCADE;

-- Backfill from the two owner joins. Written as UPDATE..FROM over a
-- derived table so both LEFT JOINs keep their meaning: a row owned by a
-- site matches only `sites`, a row owned by a stack matches only
-- `docker_stacks`, and `chk_databases_owner` guarantees exactly one of
-- them matches, so COALESCE picks the one real owner.
--
-- Idempotency guard: this UPDATE names `sites` and `databases.site_id`,
-- both of which this same file drops (steps 9-10), so a second run
-- would fail parsing it. The DO block below runs it through EXECUTE
-- only while both objects still exist; on a re-run it no-ops instead
-- of erroring, which is what makes the file safe to run twice.
DO $$
BEGIN
    IF to_regclass('public.sites') IS NOT NULL
       AND EXISTS (SELECT 1 FROM information_schema.columns
                    WHERE table_schema = 'public' AND table_name = 'databases'
                      AND column_name = 'site_id') THEN
        EXECUTE $upd$
            UPDATE databases d
               SET user_id = src.user_id,
                   server_id = src.server_id
              FROM (
                SELECT d2.id AS id,
                       COALESCE(s.user_id, st.user_id) AS user_id,
                       COALESCE(s.server_id, st.server_id) AS server_id
                  FROM databases d2
                  LEFT JOIN sites s ON s.id = d2.site_id
                  LEFT JOIN docker_stacks st ON st.id = d2.stack_id
              ) AS src
             WHERE d.id = src.id
        $upd$;
    END IF;
END $$;

-- Guard: fails hard if the backfill was not total. Deliberate.
ALTER TABLE databases ALTER COLUMN user_id SET NOT NULL;
ALTER TABLE databases ALTER COLUMN server_id SET NOT NULL;

-- The `site_id` foreign key to `sites` is dead weight once ownership is
-- denormalised. Drop the constraint here -- not the column: the column
-- is dropped last, in step 10 -- because dropping `sites` in step 9
-- would otherwise be refused for the leftover dependency. The FK was
-- declared inline with no explicit name, so it carries Postgres'
-- auto-generated name; resolve it through pg_constraint instead of
-- assuming the spelling.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = to_regclass('databases')
           AND c.contype = 'f'
           AND c.confrelid = to_regclass('sites')
           AND a.attname = 'site_id'
    LOOP
        EXECUTE format('ALTER TABLE databases DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;

-- The XOR owner CHECK cannot survive the loss of `site_id`: the new
-- invariant is simply that both denormalised columns are NOT NULL and
-- `stack_id` marks a stack-owned row. No replacement CHECK is added.
ALTER TABLE databases DROP CONSTRAINT IF EXISTS chk_databases_owner;

-- The per-site name uniqueness no longer has a `site_id` to key on.
ALTER TABLE databases DROP CONSTRAINT IF EXISTS databases_site_name_unique;
DROP INDEX IF EXISTS idx_databases_site_id;

-- No replacement uniqueness index is added for user-owned rows, on
-- purpose (coordinator merge decision, R7): creation requires
-- `stack_id` (see routes/databases.rs), so no new stack-less row can
-- appear, and per-stack uniqueness is already enforced by
-- `databases_stack_name_unique`, retained untouched. A per-user unique
-- index here would fail the whole migration on plausible legacy data
-- (one user with the same database name on two former sites, legal
-- under the old per-`site_id` uniqueness), bricking upgrades for no
-- runtime benefit.

-- 2. Drop hosting child tables (no remaining children of their own).
-- `deploy_logs` and `crons` are dropped here with the other children;
-- their retained-code readers are a companion code-surgery concern, not
-- a schema dependency.
DROP TABLE IF EXISTS git_deploy_history;
DROP TABLE IF EXISTS git_previews;
DROP TABLE IF EXISTS deploy_approvals;
DROP TABLE IF EXISTS mail_accounts;
DROP TABLE IF EXISTS mail_aliases;
DROP TABLE IF EXISTS wp_vuln_scans;
DROP TABLE IF EXISTS wp_hardening;
DROP TABLE IF EXISTS site_traffic_offsets;
DROP TABLE IF EXISTS site_traffic_usage;
DROP TABLE IF EXISTS deploy_logs;
DROP TABLE IF EXISTS crons;

-- 3. Drop `git_deploys`, then `deploy_configs`, once their children
-- in step 2 are gone. `git_deploys` only referenced the retained
-- `tls_certificates` registry (SET NULL); the registry itself stays.
DROP TABLE IF EXISTS git_deploys;
DROP TABLE IF EXISTS deploy_configs;

-- 4. Drop `backup_schedules`. Every row in this table was per-site
-- (`UNIQUE(site_id)`, no kind column); volume/database schedules live
-- in `backup_policies`, which is untouched.
DROP TABLE IF EXISTS backup_schedules;

-- 5. Pull the `site_id` column out of the tables that stay.
--
-- Each column: drop its foreign-key constraint first (auto-named, so
-- resolved through pg_constraint), then drop the column. Indexes over
-- the column are dropped explicitly where they exist.

-- `monitors.site_id` (SET NULL; no index over `site_id`).
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = to_regclass('monitors')
           AND c.contype = 'f'
           AND c.confrelid = to_regclass('sites')
           AND a.attname = 'site_id'
    LOOP
        EXECUTE format('ALTER TABLE monitors DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;
ALTER TABLE monitors DROP COLUMN IF EXISTS site_id;

-- `alerts.site_id` (SET NULL; no index over `site_id`).
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = to_regclass('alerts')
           AND c.contype = 'f'
           AND c.confrelid = to_regclass('sites')
           AND a.attname = 'site_id'
    LOOP
        EXECUTE format('ALTER TABLE alerts DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;
ALTER TABLE alerts DROP COLUMN IF EXISTS site_id;

-- `alert_state.site_id` (CASCADE; its partial unique index goes first).
DROP INDEX IF EXISTS idx_alert_state_site;
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = to_regclass('alert_state')
           AND c.contype = 'f'
           AND c.confrelid = to_regclass('sites')
           AND a.attname = 'site_id'
    LOOP
        EXECUTE format('ALTER TABLE alert_state DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;
ALTER TABLE alert_state DROP COLUMN IF EXISTS site_id;

-- `secret_vaults.site_id` (CASCADE; its index goes first).
DROP INDEX IF EXISTS idx_secret_vaults_site;
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = to_regclass('secret_vaults')
           AND c.contype = 'f'
           AND c.confrelid = to_regclass('sites')
           AND a.attname = 'site_id'
    LOOP
        EXECUTE format('ALTER TABLE secret_vaults DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;
ALTER TABLE secret_vaults DROP COLUMN IF EXISTS site_id;

-- `backups.site_id` (CASCADE; the table stays, the column goes). The
-- composite index over the column goes first; the older single-column
-- index was already replaced by it in an earlier migration.
DROP INDEX IF EXISTS idx_backups_site_created;
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = to_regclass('backups')
           AND c.contype = 'f'
           AND c.confrelid = to_regclass('sites')
           AND a.attname = 'site_id'
    LOOP
        EXECUTE format('ALTER TABLE backups DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;
ALTER TABLE backups DROP COLUMN IF EXISTS site_id;

-- `backup_policies.backup_sites`: the site arm of the orchestrator is
-- gone; the column was forced FALSE since R3. The table stays.
ALTER TABLE backup_policies DROP COLUMN IF EXISTS backup_sites;

-- `users.reseller_id`: the self-FK to `users` (SET NULL) and its
-- partial index go with the column. The role rename itself is step 6.
DROP INDEX IF EXISTS idx_users_reseller;
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = to_regclass('users')
           AND c.contype = 'f'
           AND c.confrelid = to_regclass('users')
           AND a.attname = 'reseller_id'
    LOOP
        EXECUTE format('ALTER TABLE users DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;
ALTER TABLE users DROP COLUMN IF EXISTS reseller_id;

-- The per-site SFTP uid sequence. There never was an `sftp_accounts`
-- table: SFTP scoping was `sites.sftp_*` columns plus this sequence,
-- and the columns die with `sites` in step 9.
DROP SEQUENCE IF EXISTS sftp_id_seq;

-- 6. Rename the stored `reseller` role and delete the dead settings.
--
-- Stored `reseller` values are renamed to `user` (the auth boundary has
-- mapped them to `user` since R2; this makes the stored value match).
-- `prior_role` holds the same role vocabulary and is renamed the same
-- way where it holds `reseller`. `chk_users_role` is NOT rewritten:
-- it already lists all five values (`admin`, `reseller`, `user`,
-- `suspended`, `client`), and `user` is a legal value under it.
UPDATE users SET role = 'user' WHERE role = 'reseller';
UPDATE users SET prior_role = 'user' WHERE prior_role = 'reseller';

-- The WordPress vulnerability scanner is gone (R3/R6); its two settings
-- keys have no reader left. No other settings key is hosting-only and
-- still live, so no other key is deleted here.
DELETE FROM settings WHERE key IN ('wp_vuln_scan_enabled', 'wp_vuln_scan_interval_hours');

-- 7. Drop the reseller / WHMCS / CDN / wizard tables.
--
-- These reference only `users` / `servers` (and, for
-- `whmcs_service_map`, `sites` through a column that dies with this
-- table), so they drop in any order once step 5 has removed the
-- `users.reseller_id` column. The wizard table is `migrations` --
-- verified by name from `20260319200000_migration_wizard.sql`. It is
-- NOT `app_migrations` (the retained container-move table) and NOT
-- `_sqlx_migrations` (sqlx's own history, never touched).
DROP TABLE IF EXISTS reseller_profiles;
DROP TABLE IF EXISTS reseller_servers;
DROP TABLE IF EXISTS whmcs_config;
DROP TABLE IF EXISTS whmcs_service_map;
DROP TABLE IF EXISTS cdn_zones;
DROP TABLE IF EXISTS migrations;

-- 8. Drop `mail_domains`, then `dns_zones`.
--
-- `mail_domains` is safe once its children (`mail_accounts`,
-- `mail_aliases`) are gone in step 2. `dns_zones` is safe only once
-- the `sites.ssl_dns_zone_id` foreign key pointing at it is dropped
-- first: without CASCADE, that leftover dependency would refuse the
-- drop. The column itself dies with `sites` in step 9.
DROP TABLE IF EXISTS mail_domains;
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = to_regclass('sites')
           AND c.contype = 'f'
           AND c.confrelid = to_regclass('dns_zones')
           AND a.attname = 'ssl_dns_zone_id'
    LOOP
        EXECUTE format('ALTER TABLE sites DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;
DROP TABLE IF EXISTS dns_zones;

-- 9. Drop `sites` LAST.
--
-- Every foreign key into `sites` is gone by now: child tables dropped
-- (steps 2-4), shared-table `site_id` columns pulled (step 5),
-- `databases.site_id` FK dropped (step 1), and the `dns_zones` FK
-- dropped (step 8). What dies with the table: the self-FK
-- `parent_site_id` (staging), the `ssl_dns_zone_id` column, every site
-- column added across the hosting migrations, and all site indexes.
DROP TABLE IF EXISTS sites;

-- 10. Drop the `site_id` column in `databases`, last of all.
--
-- The column was read by the step 1 backfill, so it must not be
-- dropped any earlier. Its foreign key was already dropped in step 1;
-- the guarded repeat below is a no-op when it is already gone, and
-- keeps this step correct on its own if the file is ever re-run
-- against a schema where step 1's constraint drop did not happen.
DO $$
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        SELECT c.conname
          FROM pg_constraint c
          JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY (c.conkey)
         WHERE c.conrelid = to_regclass('databases')
           AND c.contype = 'f'
           AND c.confrelid = to_regclass('sites')
           AND a.attname = 'site_id'
    LOOP
        EXECUTE format('ALTER TABLE databases DROP CONSTRAINT %I', r.conname);
    END LOOP;
END $$;
ALTER TABLE databases DROP COLUMN IF EXISTS site_id;
