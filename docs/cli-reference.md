# CLI Reference

The `dockpanel` CLI provides full command-line access to all panel operations. It communicates with the agent via Unix socket using the token stored at `/etc/dockpanel/agent.token`.

## Global Options

| Option | Default | Description |
|--------|---------|-------------|
| `-o, --output <FORMAT>` | `table` | Output format: `table` or `json` |
| `--version` | | Print version and exit |
| `--help` | | Print help |

## Commands

---

### `dockpanel status`

Show server status including CPU, memory, disk, and uptime.

```bash
dockpanel status
```

```
SERVER STATUS
─────────────────────────────────
Hostname:    web-1
OS:          Ubuntu 22.04.4 LTS
Kernel:      6.8.0-106-generic
Uptime:      14 days, 3 hours
Load:        0.12 0.08 0.05

CPU:         3.2% (2 cores)
Memory:      847 MB / 2048 MB (41.4%)
Disk:        12.3 GB / 50.0 GB (24.6%)
```

JSON output:

```bash
dockpanel status -o json
```

---

### `dockpanel sites`

List the nginx vhosts present on this box. This is a **local, read-only
inventory**, not panel data: it reads `/etc/nginx/sites-enabled/` directly
and infers each entry's type (`proxy` if the config contains `proxy_pass`,
`php` if it contains `fastcgi_pass` or `php`, otherwise `static`) and
whether it carries an `ssl_certificate` line. The panel vhost itself
(`dockpanel-panel.conf`), `dockpanel.dev.conf` and `default` are skipped.
There are no `create`, `info` or `delete` subcommands — sites were removed
from the panel in R3, and this list is all that remains of the command.

```bash
dockpanel sites
```

```
DOMAIN                TYPE        SSL
example.com           php         yes
api.example.com       proxy       yes
blog.example.com      static      no

3 site(s)
```

Filter by domain substring (case-insensitive):

```bash
dockpanel sites -f blog
```

JSON output uses the keys `domain`, `runtime` and `ssl`:

```bash
dockpanel sites -o json
```

The listing is fully local: it reads `/etc/nginx/sites-enabled/` directly
and makes no agent call (the former `/system/info` round-trip, whose
result was discarded, was removed in R8).

---

### `dockpanel db`

List databases.

```bash
dockpanel db
```

```
NAME              ENGINE      PORT    STATUS     SIZE
mysite_db         mysql       3306    running    245 MB
analytics_db      postgres    5433    running    1.2 GB
```

Filter by name:

```bash
dockpanel db -f analytics
```

#### `dockpanel db create`

Create a new database in a Docker container.

```bash
# Prefer --password-stdin — a bare --password is visible to other local
# users via `ps`/`/proc` for the life of the process and lands in shell
# history.
echo -n "s3cureP@ss" | dockpanel db create blog_db --engine mysql --password-stdin --port 3307

# Or omit both --password and --password-stdin for an interactive, masked prompt.
dockpanel db create blog_db --engine mysql --port 3307
```

| Argument | Required | Description |
|----------|----------|-------------|
| `NAME` | Yes | Database name |
| `--engine` | Yes | Engine: `mysql`, `mariadb`, or `postgres` |
| `--password` | No | Root/admin password. Discouraged — visible via shell history and `ps`. |
| `--password-stdin` | No | Read the root/admin password from stdin instead |
| `--port` | Yes | Host port to expose |

If neither `--password` nor `--password-stdin` is given, the CLI prompts interactively.

```
Database created: blog_db
  Engine:    mysql
  Port:      3307
  Container: dockpanel-db-blog_db
```

#### `dockpanel db delete`

Delete a database container.

```bash
dockpanel db delete abc123def456
```

---

### `dockpanel apps`

List Docker apps.

```bash
dockpanel apps
```

```
NAME           IMAGE                   PORT    STATUS     DOMAIN
ghost          ghost:5-alpine          2368    running    blog.example.com
grafana        grafana/grafana:latest  3000    running    metrics.example.com
n8n            n8nio/n8n:latest        5678    running    —
```

Filter by name or domain:

```bash
dockpanel apps -f grafana
```

#### `dockpanel apps templates`

List all available app templates.

```bash
dockpanel apps templates
```

```
ID                CATEGORY      NAME             DESCRIPTION
ghost             cms           Ghost            Modern publishing platform
wordpress         cms           WordPress        Popular CMS and blogging platform
grafana           monitoring    Grafana          Observability dashboards
prometheus        monitoring    Prometheus       Metrics collection
uptime-kuma       monitoring    Uptime Kuma      Uptime monitoring
nextcloud         storage       Nextcloud        Self-hosted cloud storage
...
(147 templates across 14 categories)
```

#### `dockpanel apps deploy`

Deploy an app from a template.

```bash
dockpanel apps deploy ghost --name my-blog --port 2368 --domain blog.example.com --ssl-email admin@example.com
```

| Argument | Required | Description |
|----------|----------|-------------|
| `TEMPLATE` | Yes | Template ID (from `apps templates`) |
| `--name` | Yes | App name |
| `--port` | Yes | Host port |
| `--domain` | No | Domain for auto reverse proxy + SSL |
| `--ssl-email` | No | Email for Let's Encrypt (requires `--domain`) |

```
Deploying ghost as "my-blog"...
  Pulling image: ghost:5-alpine
  Starting container on port 2368
  Configuring reverse proxy: blog.example.com → localhost:2368
  Provisioning SSL for blog.example.com
App deployed: my-blog (blog.example.com)
```

#### `dockpanel apps stop`

```bash
dockpanel apps stop abc123def456
```

#### `dockpanel apps start`

```bash
dockpanel apps start abc123def456
```

#### `dockpanel apps restart`

```bash
dockpanel apps restart abc123def456
```

#### `dockpanel apps remove`

```bash
dockpanel apps remove abc123def456
```

#### `dockpanel apps logs`

View container logs.

```bash
dockpanel apps logs abc123def456
```

#### `dockpanel apps compose`

Deploy from a Docker Compose file.

```bash
dockpanel apps compose /path/to/docker-compose.yml
```

A stack deployed this way carries no domain. To front a stack with a domain — over
Let's Encrypt or a registered certificate — create it through the panel
(`POST /api/stacks`), which records how the domain is served. Registered
certificates are managed from the panel, not the CLI: the CLI speaks to the agent
alone, and a certificate the panel's database does not know cannot be referenced by
a stack.

---

### `dockpanel services`

Check service health.

```bash
dockpanel services
```

```
SERVICE              STATUS      PID     MEMORY
dockpanel-agent      ● running   1234    30 MB
dockpanel-api        ● running   1235    27 MB
nginx                ● running   1236    12 MB
docker               ● running   1237    45 MB
php8.3-fpm           ● running   1238    18 MB
fail2ban             ● running   1239    8 MB
ufw                  ● active    —       —
```

Filter by service name:

```bash
dockpanel services -f nginx
```

---

### `dockpanel ssl`

SSL certificate management. The only subcommand is `status`: there is no
`provision` or `renew` in the CLI. Certificate provisioning and renewal
for stacks and the panel itself are panel operations (ACME profiles and
contact email under `/api/ssl/*`, certificate renewal per stack); the CLI
only reads the certificate the agent sees for a domain.

#### `dockpanel ssl status`

Check certificate details for a domain.

```bash
dockpanel ssl status example.com
```

```
SSL Certificate: example.com
  Issuer:      R11
  Expires:     2026-06-13 09:41:07.0 +00:00:00
  Remaining:   85 days
```

The days remaining are coloured: green above 30, amber above 7, red at or below.
A domain with no certificate prints `No SSL certificate for example.com`.

---

### `dockpanel backup`

Backup management for **databases and Docker volumes only**. The site
backup commands (`create`/`list`/`restore`/`delete` taking a domain) were
removed with the hosting backend in R3/R6: there are no sites left to back
up, and the CLI exposes no restore or delete at all — restores of database
and volume backups are panel operations. The subcommands are:

| Subcommand | Purpose |
|------------|---------|
| `backup db-create <CONTAINER> <DB_NAME>` | Dump one database via the agent (`--db-type`, `--user`, `--password`/`--password-stdin`) |
| `backup db-list <DB_NAME>` | List dumps for a database |
| `backup vol-create <VOLUME> <CONTAINER>` | Back up one Docker volume |
| `backup vol-list <CONTAINER>` | List volume backups for a container |
| `backup verify --type database\|volume <NAME> <FILENAME>` | Verify one backup (`--db-type` for databases) |
| `backup health` | Local counts of database/volume backup files under `/var/backups/dockpanel` |

```bash
# Database backup (password via stdin; a bare --password is visible via ps/history)
echo -n "s3cureP@ss" | dockpanel backup db-create dockpanel-db-blog_db blog_db --db-type postgres --password-stdin
dockpanel backup db-list blog_db

# Volume backup
dockpanel backup vol-create mydata dockpanel-app-myapp
dockpanel backup vol-list dockpanel-app-myapp

# Verify + health
dockpanel backup verify --type database blog_db blog_db-20260320-143022.sql.gz
dockpanel backup health
```

`backup db-create` prints the dump filename and size. `backup db-list`
reports files the agent cannot import, with the reason, instead of hiding
them. `backup verify` prints `Verification PASSED/FAILED` with the
per-check detail the agent returns.

---

### `dockpanel logs`

View system and site logs.

```bash
dockpanel logs
```

| Option | Default | Description |
|--------|---------|-------------|
| `-d, --domain` | | Domain for site-specific logs |
| `-t, --type` | `syslog` | Log type: `syslog`, `nginx`, `auth`, `php`, `mysql` |
| `-n, --lines` | `50` | Number of lines to show |
| `-f, --filter` | | Filter text (substring match) |
| `-s, --search` | | Search pattern (regex) |

Examples:

```bash
# View system log
dockpanel logs

# View Nginx error log for a site
dockpanel logs -d example.com -t nginx -n 100

# Search for errors in auth log
dockpanel logs -t auth -s "Failed password"

# Filter PHP logs
dockpanel logs -t php -f "Fatal error" -n 200
```

---

### `dockpanel security`

Security overview.

```bash
dockpanel security
```

```
Security Overview
  Firewall:    active
  Fail2ban:    active
  SSH root:    disabled
  SSH password: disabled
```

#### `dockpanel security scan`

Run a security scan.

```bash
dockpanel security scan
```

```
Running security scan...
Scan Results
  Risk level:  warning

  [warning] Unexpected open port: 3306
  [warning] SSH password authentication still enabled
  [info]    Unattended upgrades not configured

3 finding(s)
```

Risk level and each finding's severity are one of `critical`/`warning`/`info`,
derived from the findings the scan actually returns — there is no
separate numeric score.

#### `dockpanel security firewall`

List firewall rules.

```bash
dockpanel security firewall
```

```
#      TO           ACTION     FROM
1      22/tcp       ALLOW IN   Anywhere
2      80/tcp       ALLOW IN   Anywhere
3      443/tcp      ALLOW IN   Anywhere
4      8443/tcp     ALLOW IN   Anywhere
```

#### `dockpanel security firewall add`

Add a firewall rule.

```bash
dockpanel security firewall add --port 3000 --proto tcp --action allow
dockpanel security firewall add --port 5432 --proto tcp --action allow --from 10.0.0.0/8
```

| Option | Default | Description |
|--------|---------|-------------|
| `--port` | | Port number |
| `--proto` | `tcp` | Protocol: `tcp` or `udp` |
| `--action` | `allow` | Action: `allow` or `deny` |
| `--from` | | Source IP or CIDR (optional) |

#### `dockpanel security firewall remove`

Remove a rule by number.

```bash
dockpanel security firewall remove 4
```

---

### `dockpanel top`

Show top processes by CPU usage.

```bash
dockpanel top
```

```
PID      CPU%    MEM%    COMMAND
1234     12.3    2.1     /usr/sbin/mysqld
5678     8.7     1.4     php-fpm: pool www
9012     3.2     0.8     nginx: worker process
1357     2.1     1.2     dockpanel-agent
2468     1.8     1.1     dockpanel-api
```

---

### `dockpanel php` — removed

There is no `dockpanel php` command. PHP version management (and the
host PHP-FPM / Composer / WAF installers behind it) was removed with the
hosting backend in R6. PHP appears in the CLI only as read-only inventory
on the agent side: the agent's `/iac/export` still emits a `php` key
listing the PHP-FPM versions present on the box, but `dockpanel export`
filters it (and `sites`) out before printing. Do not install a PHP version
expecting the panel to serve a site with it — there is no site surface
left to serve.

---

### `dockpanel diagnose`

Run server diagnostics across 6 categories.

```bash
dockpanel diagnose
```

```
DIAGNOSTICS
─────────────────────────────────
[✓] Nginx configuration valid
[✓] All SSL certificates valid (next expiry: 85 days)
[✓] Disk usage: 24.6% (12.3 GB / 50 GB)
[✓] Memory usage: 41.4% (847 MB / 2048 MB)
[✓] Docker: 5 containers running, 0 unhealthy
[!] PHP-FPM: high average response time (320ms)
[✓] Fail2Ban: 3 jails active
[✓] Firewall: active

Score: 95/100 (1 warning)
```

---

### `dockpanel export`

Export server configuration as YAML (Infrastructure as Code).

```bash
# Print to stdout
dockpanel export

# Save to file
dockpanel export -O config.yml
```

Sample output:

```yaml
version: "1"
databases:
  - name: mysite_db
    engine: mysql
    port: 3306
apps:
  - name: ghost
    template: ghost
    port: 2368
    domain: blog.example.com
crons:
  - id: nightly-backup
    schedule: "0 2 * * *"
    command: /opt/scripts/backup.sh
firewall:
  enabled: true
  rules:
    - to: "80/tcp"
      action: ALLOW
```

`export` prints the agent's `/iac/export` as YAML after filtering out two
read-only inventory keys, `sites` (the nginx vhosts found in the box's
site-config directory) and `php` (the PHP-FPM versions present on the
box). The agent still emits both; the CLI drops them, so neither appears
in the output above. Neither is a panel resource any more, and `apply`
warns and ignores both — see below. Do not hand-edit them into an `apply`
file expecting anything to happen.

---

### `dockpanel apply`

Apply server configuration from a YAML file.

```bash
# Dry run (show what would change)
dockpanel apply config.yml --dry-run

# Apply changes
dockpanel apply config.yml --email admin@example.com
```

| Argument | Required | Description |
|----------|----------|-------------|
| `FILE` | Yes | Path to YAML config file |
| `--dry-run` | No | Show changes without applying |
| `--email` | No | Email for Let's Encrypt SSL provisioning on app deploys with a domain |

`apply` only handles three sections of the file: `databases`, `apps` and
`crons`. Databases and apps are create-only — something that already exists
is never diffed or updated, even if the file describes it differently now.
Cron jobs are the one exception: a matching `id` already in the crontab is
compared and re-synced if its schedule or command changed (via the agent's
`/crons/sync`). Firewall rules in an exported file are shown for reference
only — `apply` never creates, updates, or removes them; manage those with
`dockpanel security firewall`.

`sites` and `php` sections in a file are **ignored with a warning**: `apply`
reads only the three sections above and prints a "no longer supported"
warning for each non-empty `sites`/`php` section it drops, in dry-run as
well as on a real apply. A file exported from an older panel that still
lists sites will apply its databases, apps and crons, warn about the site
entries, and drop them. Do not rely on `apply` to recreate a site or
install a PHP version — neither operation exists any more.

Dry run output:

```
Plan:
  + database: staging_db (postgres, port 5434)
  + cron: nightly-backup (0 2 * * * /opt/scripts/backup.sh)
  = cron: log-rotate (already exists, unchanged)

2 to create, 1 existing
```

---

### `dockpanel completions`

Generate shell completions.

```bash
# Bash
dockpanel completions bash > /etc/bash_completion.d/dockpanel

# Zsh
dockpanel completions zsh > ~/.zfunc/_dockpanel

# Fish
dockpanel completions fish > ~/.config/fish/completions/dockpanel.fish
```

Supported shells: `bash`, `zsh`, `fish`, `powershell`, `elvish`.
