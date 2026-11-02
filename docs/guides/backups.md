# Backups Guide

> **Site backups are gone.** This guide used to describe backing up a
> website — its files plus its databases — from a Sites page. The hosting
> backend (sites, site backups, per-site schedules) was removed in R1–R7,
> and the `sites`/`backup_schedules` tables were dropped. What survives is
> backup of **databases and Docker volumes**: backup policies in the panel
> (Backup Orchestrator), remote destinations, the panel's own database
> dump, and the CLI commands below. Anything below that still says "site"
> is describing an archive from an older install, not something you can
> create now.

## Create a Backup

### From the Panel

1. Go to **Backup Manager** (backup policies) in the sidebar
2. Create a policy covering the databases and/or volumes you want
   protected, and pick a destination
3. Run the policy, or let its schedule run it

A policy covers databases and volumes only — `kind` is `database` or
`volume`; `kind=site` is rejected. The backup destinations (S3-compatible
or SFTP) configured under **Backup Manager > Destinations** receive the
uploads; see *Configure S3 / Remote Destination* below.

### From the CLI

Database and volume backups are separate commands — there is no single
"back up everything" command and no restore or delete in the CLI:

```bash
# Database: container name + database name; password via stdin
echo -n "s3cureP@ss" | dockpanel backup db-create dockpanel-db-blog_db blog_db --db-type postgres --password-stdin
dockpanel backup db-list blog_db

# Volume: volume name + owning container name
dockpanel backup vol-create mydata dockpanel-app-myapp
dockpanel backup vol-list dockpanel-app-myapp

# Verify one backup, and show local backup-file counts
dockpanel backup verify --type database blog_db blog_db-20260320-143022.sql.gz
dockpanel backup health
```

Restore and delete of database/volume backups are panel operations
(Backup Orchestrator endpoints); the CLI does not expose them.

## Set Up Scheduled Backups

Scheduled backup lives in **backup policies**, not per-site schedules
(the `backup_schedules` table is gone):

1. Go to **Backup Manager** in the sidebar
2. Create or edit a policy
3. Configure which databases/volumes it covers, the frequency, and the
   retention
4. Save

The policy executor runs policies on their schedule in the background.

## Configure S3 / Remote Destination

Store backups off-server for disaster recovery. DockPanel supports any S3-compatible storage (AWS S3, Backblaze B2, MinIO, Wasabi, DigitalOcean Spaces, etc.).

1. Go to **Backup Manager** > **Destinations**
2. Click **Add Destination**
3. Enter:
   - **Name**: A label (e.g., `backblaze-b2`)
   - **Type**: S3-compatible
   - **Endpoint**: `https://s3.us-west-001.backblazeb2.com` (varies by provider)
   - **Bucket**: `my-server-backups`
   - **Access Key**: Your access key ID
   - **Secret Key**: Your secret access key
   - **Region**: `us-west-001` (varies by provider)
4. Click **Create Destination**. Credentials are encrypted before they are stored.
5. Click **Test** on the saved destination to verify access — nothing is checked at
   save time, and the test runs against the stored credentials.

Use **Edit** to change a destination later. Secret fields come back masked as
`********`; leave them as they are to keep the stored credential, or type a new
value to rotate it. The transport (S3 or SFTP) cannot be changed on an existing
destination — delete it and add a new one instead.

Once a destination is configured, attach it to a backup policy. Backups will be uploaded after creation.

### Provider-specific endpoints

| Provider | Endpoint |
|----------|----------|
| AWS S3 | `https://s3.amazonaws.com` (or regional: `https://s3.us-east-1.amazonaws.com`) |
| Backblaze B2 | `https://s3.REGION.backblazeb2.com` |
| DigitalOcean Spaces | `https://REGION.digitaloceanspaces.com` |
| Wasabi | `https://s3.REGION.wasabisys.com` |
| MinIO (self-hosted) | `https://your-minio-server:9000` |

## Restore from Backup

Restore of a database or volume backup is a panel operation: find the
backup in the Backup Orchestrator lists and restore it from there. A
database restore loads the dump over the live database; the current state
is not automatically backed up before a restore — take a fresh backup
first if you want a safety net.

> **Old site archives.** A tarball made by an older install that holds a
> site's files (and, since v2.34.0, its database dumps) can no longer be
> restored through the panel — the site it belonged to has no record left
> to restore into. Its database dumps remain ordinary SQL dumps: extract
> them and import them into the database container by hand (see *Manual
> database-only backup* below, in reverse), or from the **Databases**
> page's import control.

## Delete a Backup

Delete a database or volume backup from the panel (Backup Orchestrator
lists). The CLI has no delete command.

## Database Backups

DockPanel runs an automatic daily database backup cron job for the panel's own PostgreSQL database:

- **Schedule**: Daily at 2:00 AM
- **Retention**: 7 days (older backups are automatically deleted)
- **Location**: `/var/backups/dockpanel/`

This covers the panel's own database only — not your databases. A
database container is captured by a backup policy (above) or by the manual
step below, or from the **Databases** page.

### Manual database-only backup

To back up a specific database container:

```bash
# PostgreSQL
docker exec CONTAINER_NAME pg_dump -U USERNAME DBNAME > /tmp/db-backup.sql

# MySQL / MariaDB
docker exec CONTAINER_NAME mysqldump -u root -pPASSWORD DBNAME > /tmp/db-backup.sql
```

Replace `CONTAINER_NAME`, `USERNAME`, `PASSWORD`, and `DBNAME` with your actual values. Find these in the panel under Databases.
