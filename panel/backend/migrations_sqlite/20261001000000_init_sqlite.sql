-- DockPanel Lite — Clean SQLite Baseline Schema
-- Rebuilt for Alpine Linux / postmarketOS edge devices

PRAGMA foreign_keys = ON;

CREATE TABLE users (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  email TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  email_verified INTEGER NOT NULL DEFAULT 0,
  email_token TEXT,
  reset_token TEXT,
  reset_expires TEXT,
  stripe_subscription_id TEXT,
  plan TEXT NOT NULL DEFAULT 'free',
  plan_status TEXT NOT NULL DEFAULT 'active',
  plan_server_limit INTEGER NOT NULL DEFAULT 1,
  totp_secret TEXT,
  totp_enabled INTEGER NOT NULL DEFAULT 0,
  recovery_codes TEXT,
  oauth_provider TEXT,
  oauth_id TEXT,
  approved INTEGER DEFAULT 1,
  approved_at TEXT,
  approved_by TEXT,
  prior_role TEXT
);

CREATE TABLE servers (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  ip_address TEXT,
  agent_token TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_seen_at TEXT,
  os_info TEXT,
  cpu_cores INTEGER,
  ram_mb INTEGER,
  disk_gb INTEGER,
  agent_version TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  cpu_usage REAL,
  mem_used_mb INTEGER,
  uptime_secs INTEGER,
  team_id BLOB REFERENCES teams(id) ON DELETE SET NULL,
  disk_used_gb INTEGER,
  disk_usage_pct REAL,
  mem_usage_pct REAL,
  is_local INTEGER NOT NULL DEFAULT 0,
  agent_url TEXT,
  agent_token_hash TEXT,
  cert_fingerprint TEXT
);

CREATE TABLE activity_logs (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL,
  user_email TEXT NOT NULL,
  action TEXT NOT NULL,
  target_type TEXT,
  target_name TEXT,
  details TEXT,
  ip_address TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  server_id BLOB REFERENCES servers(id) ON DELETE SET NULL,
  api_key_id BLOB REFERENCES api_keys(id) ON DELETE SET NULL
);

CREATE TABLE agent_commands (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  server_id BLOB NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  payload TEXT NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending',
  result TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  picked_at TEXT,
  completed_at TEXT
);

CREATE TABLE alert_rules (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id BLOB REFERENCES servers(id) ON DELETE CASCADE,
  cpu_threshold INTEGER NOT NULL DEFAULT 90,
  cpu_duration INTEGER NOT NULL DEFAULT 5,
  memory_threshold INTEGER NOT NULL DEFAULT 90,
  memory_duration INTEGER NOT NULL DEFAULT 5,
  disk_threshold INTEGER NOT NULL DEFAULT 85,
  alert_cpu INTEGER NOT NULL DEFAULT 1,
  alert_memory INTEGER NOT NULL DEFAULT 1,
  alert_disk INTEGER NOT NULL DEFAULT 1,
  alert_offline INTEGER NOT NULL DEFAULT 1,
  alert_backup_failure INTEGER NOT NULL DEFAULT 1,
  alert_ssl_expiry INTEGER NOT NULL DEFAULT 1,
  alert_service_health INTEGER NOT NULL DEFAULT 1,
  ssl_warning_days TEXT NOT NULL DEFAULT '30,14,7,3,1',
  notify_email INTEGER NOT NULL DEFAULT 1,
  notify_slack_url TEXT,
  notify_discord_url TEXT,
  cooldown_minutes INTEGER NOT NULL DEFAULT 60,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  notify_pagerduty_key TEXT,
  notify_webhook_url TEXT,
  muted_types TEXT NOT NULL DEFAULT '',
  gpu_util_threshold INTEGER NOT NULL DEFAULT 95,
  gpu_util_duration INTEGER NOT NULL DEFAULT 5,
  gpu_temp_threshold INTEGER NOT NULL DEFAULT 85,
  gpu_vram_threshold INTEGER NOT NULL DEFAULT 95,
  alert_gpu INTEGER NOT NULL DEFAULT 1,
  escalation_policy_id BLOB NULL
        REFERENCES escalation_policies(id) ON DELETE SET NULL,
  UNIQUE(user_id, server_id)
);

CREATE TABLE alert_runbooks (
  alert_type TEXT PRIMARY KEY,
  runbook_md TEXT NOT NULL,
  severity_default TEXT NOT NULL CHECK (severity_default IN ('info', 'warning', 'critical')),
  updated_by BLOB REFERENCES users(id) ON DELETE SET NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE alert_state (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  server_id BLOB REFERENCES servers(id) ON DELETE CASCADE,
  alert_type TEXT NOT NULL,
  state_key TEXT NOT NULL DEFAULT '',
  current_state TEXT NOT NULL DEFAULT 'ok',
  fired_at TEXT,
  last_notified_at TEXT,
  consecutive_count INTEGER NOT NULL DEFAULT 0,
  metadata TEXT
);

CREATE TABLE alerts (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id BLOB REFERENCES servers(id) ON DELETE SET NULL,
  alert_type TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'warning',
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'firing',
  notified_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  acknowledged_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  escalated_at TEXT,
  acknowledged_by TEXT NULL
        REFERENCES users(id) ON DELETE SET NULL,
  acknowledged_comment TEXT NULL,
  escalation_step_index INTEGER NOT NULL DEFAULT 0,
  state_key TEXT NOT NULL DEFAULT ''
);

CREATE TABLE api_keys (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  key_hash TEXT NOT NULL,
  key_prefix TEXT NOT NULL,
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  scopes TEXT
);

CREATE TABLE app_migrations (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  container_id TEXT NOT NULL,
  container_name TEXT NOT NULL,
  source_server_id BLOB NOT NULL REFERENCES servers(id),
  target_server_id BLOB NOT NULL REFERENCES servers(id),
  status TEXT NOT NULL DEFAULT 'pending',
  progress_pct INTEGER NOT NULL DEFAULT 0,
  error_message TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE autoscale_rules (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  container_id TEXT NOT NULL,
  container_name TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  min_replicas INTEGER NOT NULL DEFAULT 1,
  max_replicas INTEGER NOT NULL DEFAULT 5,
  cpu_threshold_up INTEGER NOT NULL DEFAULT 80,
  cpu_threshold_down INTEGER NOT NULL DEFAULT 20,
  cooldown_seconds INTEGER NOT NULL DEFAULT 300,
  current_replicas INTEGER NOT NULL DEFAULT 1,
  last_scale_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE backup_destinations (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  name TEXT NOT NULL,
  dtype TEXT NOT NULL CHECK (dtype IN ('s3', 'sftp')),
  config TEXT NOT NULL DEFAULT '{}',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  server_id BLOB REFERENCES servers(id) ON DELETE SET NULL,
  encryption_enabled INTEGER NOT NULL DEFAULT 0,
  encryption_key TEXT
);

CREATE TABLE backup_drills (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  backup_type TEXT NOT NULL,
  backup_id BLOB NOT NULL,
  server_id BLOB REFERENCES servers(id) ON DELETE SET NULL,
  triggered_by BLOB REFERENCES users(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  http_status INTEGER,
  body_excerpt TEXT,
  error_message TEXT,
  duration_ms INTEGER,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE backup_policies (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  server_id BLOB REFERENCES servers(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  backup_databases INTEGER NOT NULL DEFAULT 1,
  backup_volumes INTEGER NOT NULL DEFAULT 0,
  schedule TEXT NOT NULL DEFAULT '0 2 * * *',
  destination_id BLOB REFERENCES backup_destinations(id) ON DELETE SET NULL,
  retention_count INTEGER NOT NULL DEFAULT 7 CHECK (retention_count BETWEEN 1 AND 365),
  encrypt INTEGER NOT NULL DEFAULT 0,
  verify_after_backup INTEGER NOT NULL DEFAULT 0,
  enabled INTEGER NOT NULL DEFAULT 1,
  last_run TEXT,
  last_status TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  drill_enabled INTEGER NOT NULL DEFAULT 0,
  drill_schedule TEXT NOT NULL DEFAULT '0 4 * * 0',
  last_drill_at TEXT
);

CREATE TABLE backup_verifications (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  backup_type TEXT NOT NULL,
  backup_id BLOB NOT NULL,
  server_id BLOB REFERENCES servers(id) ON DELETE SET NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  details TEXT NOT NULL DEFAULT '{}',
  error_message TEXT,
  duration_ms INTEGER,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  checks_run INTEGER NOT NULL DEFAULT 0,
  checks_passed INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE backups (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sha256_hash TEXT,
  previous_hash TEXT,
  chain_valid INTEGER DEFAULT 1,
  destination_id BLOB REFERENCES backup_destinations(id) ON DELETE SET NULL,
  uploaded INTEGER NOT NULL DEFAULT 0,
  databases_included INTEGER NOT NULL DEFAULT 0,
  databases_expected INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE container_expected_stops (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  server_id BLOB NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  container_name TEXT NOT NULL,
  reason TEXT NOT NULL,
  actor_email TEXT,
  stopped_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (server_id, container_name)
);

CREATE TABLE container_policies (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE UNIQUE,
  max_containers INTEGER NOT NULL DEFAULT 10,
  max_memory_mb INTEGER NOT NULL DEFAULT 4096,
  max_cpu_percent INTEGER NOT NULL DEFAULT 400,
  network_isolation INTEGER NOT NULL DEFAULT 0,
  allowed_images TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE container_sleep_config (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  container_id TEXT NOT NULL UNIQUE,
  container_name TEXT NOT NULL,
  domain TEXT,
  auto_sleep_enabled INTEGER NOT NULL DEFAULT 0,
  sleep_after_minutes INTEGER NOT NULL DEFAULT 30,
  is_sleeping INTEGER NOT NULL DEFAULT 0,
  last_activity_at TEXT,
  last_slept_at TEXT,
  last_woken_at TEXT,
  total_sleeps INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  gpu_enabled INTEGER NOT NULL DEFAULT 0,
  server_id BLOB REFERENCES servers(id) ON DELETE CASCADE
);

CREATE TABLE database_backups (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  database_id BLOB NOT NULL REFERENCES databases(id) ON DELETE CASCADE,
  server_id BLOB REFERENCES servers(id) ON DELETE SET NULL,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  db_type TEXT NOT NULL,
  db_name TEXT NOT NULL,
  encrypted INTEGER NOT NULL DEFAULT 0,
  policy_id BLOB REFERENCES backup_policies(id) ON DELETE SET NULL,
  destination_id BLOB REFERENCES backup_destinations(id) ON DELETE SET NULL,
  uploaded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sha256_hash TEXT,
  previous_hash TEXT,
  chain_valid INTEGER DEFAULT 1,
  encryption_key_version INTEGER NOT NULL DEFAULT 1
);

CREATE TABLE databases (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  name TEXT NOT NULL UNIQUE,
  engine TEXT NOT NULL DEFAULT 'postgres',
  db_user TEXT NOT NULL,
  db_password_enc TEXT NOT NULL,
  container_id TEXT,
  port INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  stack_id BLOB REFERENCES docker_stacks(id) ON DELETE CASCADE,
  user_id BLOB REFERENCES users(id) ON DELETE CASCADE,
  server_id BLOB REFERENCES servers(id) ON DELETE CASCADE
);

CREATE TABLE db_pitr_config (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  database_id BLOB NOT NULL REFERENCES databases(id) ON DELETE CASCADE UNIQUE,
  pitr_enabled INTEGER NOT NULL DEFAULT 0,
  retention_hours INTEGER NOT NULL DEFAULT 24,
  last_backup_at TEXT,
  last_wal_at TEXT,
  backup_size_bytes INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE docker_app_domains (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  server_id BLOB NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  app_name TEXT NOT NULL,
  domain TEXT NOT NULL,
  ssl_email TEXT,
  tls_mode TEXT CHECK (tls_mode IN ('none', 'acme', 'provided')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (server_id, domain)
);

CREATE TABLE docker_stacks (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  yaml TEXT NOT NULL,
  service_count INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  server_id BLOB REFERENCES servers(id) ON DELETE CASCADE,
  domain TEXT,
  ssl_email TEXT,
  tls_mode TEXT CHECK (tls_mode IN ('none', 'acme', 'provided')),
  tls_certificate_id BLOB REFERENCES tls_certificates(id) ON DELETE SET NULL,
  ssl_expiry TEXT
);

CREATE TABLE escalation_policies (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  name TEXT NOT NULL,
  steps TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id BLOB REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE extension_events (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  extension_id BLOB NOT NULL REFERENCES extensions(id) ON DELETE CASCADE,
  event_type TEXT NOT NULL,
  payload TEXT NOT NULL,
  response_status INTEGER,
  response_body TEXT,
  duration_ms INTEGER,
  delivered_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE extensions (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  author TEXT NOT NULL DEFAULT '',
  version TEXT NOT NULL DEFAULT '1.0.0',
  webhook_url TEXT NOT NULL,
  webhook_secret TEXT NOT NULL,
  api_key_hash TEXT,
  api_key_prefix TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  event_subscriptions TEXT NOT NULL DEFAULT '[]',
  api_scopes TEXT NOT NULL DEFAULT '[]',
  last_webhook_at TEXT,
  last_webhook_status INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE file_integrity_baselines (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  server_id BLOB REFERENCES servers(id) ON DELETE CASCADE,
  file_path TEXT NOT NULL,
  sha256_hash TEXT NOT NULL,
  file_size INTEGER NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(server_id, file_path)
);

CREATE TABLE fleet_update_runs (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  target_version TEXT NOT NULL,
  plan TEXT NOT NULL,
  progress TEXT NOT NULL DEFAULT '[]',
  halt_on_failure INTEGER NOT NULL DEFAULT 1,
  include_panel INTEGER NOT NULL DEFAULT 0,
  started_by BLOB NULL REFERENCES users(id) ON DELETE SET NULL,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  finished_at TEXT NULL,
  outcome TEXT NULL
);

CREATE TABLE gpu_metrics_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  gpu_index INTEGER NOT NULL,
  utilization_pct REAL NOT NULL,
  memory_used_mb REAL NOT NULL,
  memory_total_mb REAL NOT NULL,
  temperature_c REAL,
  power_draw_w REAL,
  server_id BLOB REFERENCES servers(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE iac_tokens (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  token_hash TEXT NOT NULL UNIQUE,
  scopes TEXT NOT NULL DEFAULT 'sites,databases,dns',
  last_used_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE image_sbom (
  image TEXT PRIMARY KEY,
  format TEXT NOT NULL DEFAULT 'spdx-TEXT',
  spdx TEXT NOT NULL,
  generated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  server_id BLOB REFERENCES servers(id) ON DELETE CASCADE
);

CREATE TABLE image_scan_findings (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  image TEXT NOT NULL,
  scanner TEXT NOT NULL DEFAULT 'grype',
  critical_count INTEGER NOT NULL DEFAULT 0,
  high_count INTEGER NOT NULL DEFAULT 0,
  medium_count INTEGER NOT NULL DEFAULT 0,
  low_count INTEGER NOT NULL DEFAULT 0,
  unknown_count INTEGER NOT NULL DEFAULT 0,
  vulnerabilities TEXT NOT NULL DEFAULT '[]',
  scanned_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  server_id BLOB REFERENCES servers(id) ON DELETE CASCADE
);

CREATE TABLE incident_updates (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  incident_id BLOB NOT NULL REFERENCES managed_incidents(id) ON DELETE CASCADE,
  status TEXT NOT NULL,
  message TEXT NOT NULL,
  author_email TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE incidents (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  monitor_id BLOB NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  cause TEXT,
  alerted INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE lockdown_state (
  id INTEGER PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  active INTEGER NOT NULL DEFAULT 0,
  triggered_by BLOB,
  triggered_at TEXT,
  reason TEXT,
  terminals_disabled INTEGER DEFAULT 1,
  registration_disabled INTEGER DEFAULT 1,
  non_admin_blocked INTEGER DEFAULT 1,
  unlocked_at TEXT,
  unlocked_by TEXT
);

CREATE TABLE maintenance_windows (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id),
  name TEXT NOT NULL,
  starts_at TEXT NOT NULL,
  ends_at TEXT NOT NULL,
  monitor_ids TEXT[],
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE managed_incident_components (
  incident_id BLOB NOT NULL REFERENCES managed_incidents(id) ON DELETE CASCADE,
  component_id BLOB NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,
  PRIMARY KEY (incident_id, component_id)
);

CREATE TABLE managed_incidents (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'investigating',
  severity TEXT NOT NULL DEFAULT 'major',
  description TEXT,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  resolved_at TEXT,
  postmortem TEXT,
  postmortem_published INTEGER NOT NULL DEFAULT 0,
  visible_on_status_page INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE metrics (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  server_id BLOB NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  metric_type TEXT NOT NULL,
  value REAL NOT NULL,
  metadata TEXT,
  recorded_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE metrics_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  cpu_pct REAL NOT NULL,
  mem_pct REAL NOT NULL,
  disk_pct REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  server_id BLOB REFERENCES servers(id) ON DELETE CASCADE
);

CREATE TABLE monitor_checks (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  monitor_id BLOB NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  status_code INTEGER,
  response_time INTEGER,
  error TEXT,
  checked_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE monitors (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  name TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  last_checked_at TEXT,
  last_response_time INTEGER,
  last_status_code INTEGER,
  enabled INTEGER NOT NULL DEFAULT 1,
  alert_email INTEGER NOT NULL DEFAULT 1,
  alert_slack_url TEXT,
  alert_discord_url TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  monitor_type TEXT NOT NULL DEFAULT 'http',
  port INTEGER,
  keyword TEXT,
  keyword_must_contain INTEGER NOT NULL DEFAULT 1,
  custom_headers TEXT,
  server_id BLOB REFERENCES servers(id) ON DELETE SET NULL,
  heartbeat_token TEXT,
  check_interval INTEGER NOT NULL DEFAULT 60
);

CREATE TABLE on_call_schedules (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  name TEXT NOT NULL,
  members TEXT[] NOT NULL,
  cadence_days INTEGER NOT NULL CHECK (cadence_days BETWEEN 1 AND 90),
  anchor_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  user_id BLOB REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE panel_notifications (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  message TEXT NOT NULL,
  severity TEXT NOT NULL DEFAULT 'info',
  category TEXT NOT NULL DEFAULT 'system',
  link TEXT,
  read_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE panel_snapshots (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  file_path TEXT NOT NULL,
  from_version TEXT NOT NULL,
  to_version TEXT,
  trigger TEXT NOT NULL,
  operator TEXT,
  size_bytes INTEGER NOT NULL,
  sha256 TEXT NOT NULL,
  rolled_back_at TEXT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE passkeys (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  credential_id TEXT NOT NULL UNIQUE,
  public_key_cbor BLOB NOT NULL,
  sign_count INTEGER NOT NULL DEFAULT 0,
  name TEXT NOT NULL DEFAULT 'My Passkey',
  transports TEXT,
  aaguid TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  uv_capable INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE secret_vaults (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  server_id BLOB REFERENCES servers(id) ON DELETE SET NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE secret_versions (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  secret_id BLOB NOT NULL REFERENCES secrets(id) ON DELETE CASCADE,
  version INTEGER NOT NULL,
  encrypted_value TEXT NOT NULL,
  changed_by TEXT,
  change_type TEXT NOT NULL DEFAULT 'update',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE secrets (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  vault_id BLOB NOT NULL REFERENCES secret_vaults(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  encrypted_value TEXT NOT NULL,
  description TEXT,
  secret_type TEXT NOT NULL DEFAULT 'env',
  auto_inject INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  updated_by BLOB,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(vault_id, key)
);

CREATE TABLE security_audit_log (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  event_type TEXT NOT NULL,
  actor_email TEXT,
  actor_ip TEXT,
  target_type TEXT,
  target_name TEXT,
  details TEXT,
  geo_country TEXT,
  geo_city TEXT,
  geo_isp TEXT,
  severity TEXT DEFAULT 'info',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  api_key_id BLOB REFERENCES api_keys(id) ON DELETE SET NULL,
  actor_user_id BLOB REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE security_findings (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  scan_id BLOB NOT NULL REFERENCES security_scans(id) ON DELETE CASCADE,
  severity TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  file_path TEXT,
  remediation TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  check_type TEXT NOT NULL
);

CREATE TABLE security_scans (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  server_id BLOB REFERENCES servers(id) ON DELETE CASCADE,
  scan_type TEXT NOT NULL DEFAULT 'full',
  status TEXT NOT NULL DEFAULT 'running',
  findings_count INTEGER NOT NULL DEFAULT 0,
  critical_count INTEGER NOT NULL DEFAULT 0,
  warning_count INTEGER NOT NULL DEFAULT 0,
  info_count INTEGER NOT NULL DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE status_page_component_monitors (
  component_id BLOB NOT NULL REFERENCES status_page_components(id) ON DELETE CASCADE,
  monitor_id BLOB NOT NULL REFERENCES monitors(id) ON DELETE CASCADE,
  PRIMARY KEY (component_id, monitor_id)
);

CREATE TABLE status_page_components (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  sort_order INTEGER NOT NULL DEFAULT 0,
  status_override TEXT,
  group_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE status_page_config (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT 'Service Status',
  description TEXT NOT NULL DEFAULT 'Current status of our services',
  logo_url TEXT,
  custom_css TEXT,
  timezone TEXT NOT NULL DEFAULT 'UTC',
  accent_color TEXT NOT NULL DEFAULT '#22c55e',
  show_subscribe INTEGER NOT NULL DEFAULT 1,
  show_incident_history INTEGER NOT NULL DEFAULT 1,
  history_days INTEGER NOT NULL DEFAULT 90,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE status_page_subscribers (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  email TEXT NOT NULL,
  verified INTEGER NOT NULL DEFAULT 0,
  verify_token TEXT,
  notify_incidents INTEGER NOT NULL DEFAULT 1,
  notify_maintenance INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  owner_id BLOB REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE(email)
);

CREATE TABLE suspicious_events (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  event_type TEXT NOT NULL,
  actor_email TEXT,
  actor_ip TEXT,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE system_logs (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  level TEXT NOT NULL CHECK (level IN ('error', 'warning', 'info')),
  source TEXT NOT NULL,
  message TEXT NOT NULL,
  details TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE team_invites (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  team_id BLOB NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer',
  token TEXT NOT NULL,
  expires_at TEXT NOT NULL DEFAULT (datetime('now', '+7 days')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE team_members (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  team_id BLOB NOT NULL REFERENCES teams(id) ON DELETE CASCADE,
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL DEFAULT 'viewer',
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(team_id, user_id)
);

CREATE TABLE teams (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  name TEXT NOT NULL,
  owner_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE telemetry_events (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  event_type TEXT NOT NULL DEFAULT 'error',
  category TEXT NOT NULL DEFAULT 'general',
  message TEXT NOT NULL,
  context TEXT DEFAULT '{}',
  system_info TEXT DEFAULT '{}',
  sent_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE terminal_recordings (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_email TEXT NOT NULL,
  domain TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_bytes INTEGER DEFAULT 0,
  duration_secs INTEGER DEFAULT 0,
  started_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  ended_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE tls_certificates (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id)   ON DELETE CASCADE,
  server_id BLOB NOT NULL REFERENCES servers(id) ON DELETE CASCADE,
  alias TEXT NOT NULL,
  dns_names TEXT[] NOT NULL DEFAULT '{}',
  issuer TEXT,
  not_before TEXT,
  not_after TEXT,
  fingerprint_sha256 TEXT,
  cert_path TEXT NOT NULL,
  key_path TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (server_id, alias)
);

CREATE TABLE token_blacklist (
  jti TEXT PRIMARY KEY,
  expires_at TEXT NOT NULL
);

CREATE TABLE user_sessions (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  jti TEXT NOT NULL UNIQUE,
  ip_address TEXT,
  user_agent TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_seen_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE volume_backups (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  container_id TEXT NOT NULL,
  container_name TEXT NOT NULL,
  server_id BLOB REFERENCES servers(id) ON DELETE SET NULL,
  volume_name TEXT NOT NULL,
  filename TEXT NOT NULL,
  size_bytes INTEGER NOT NULL DEFAULT 0,
  encrypted INTEGER NOT NULL DEFAULT 0,
  policy_id BLOB REFERENCES backup_policies(id) ON DELETE SET NULL,
  destination_id BLOB REFERENCES backup_destinations(id) ON DELETE SET NULL,
  uploaded INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  sha256_hash TEXT,
  previous_hash TEXT,
  chain_valid INTEGER DEFAULT 1
);

CREATE TABLE webhook_deliveries (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  endpoint_id BLOB NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  method TEXT NOT NULL DEFAULT 'POST',
  headers TEXT NOT NULL DEFAULT '{}',
  body TEXT,
  query_string TEXT,
  source_ip TEXT,
  signature_valid INTEGER,
  forwarded INTEGER NOT NULL DEFAULT 0,
  forward_status INTEGER,
  forward_response TEXT,
  forward_duration_ms INTEGER,
  received_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE webhook_endpoints (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  user_id BLOB NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  token TEXT NOT NULL UNIQUE,
  verify_secret TEXT,
  verify_mode TEXT NOT NULL DEFAULT 'none',
  verify_header TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  total_received INTEGER NOT NULL DEFAULT 0,
  last_received_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE webhook_routes (
  id BLOB PRIMARY KEY DEFAULT (randomblob(16)),
  endpoint_id BLOB NOT NULL REFERENCES webhook_endpoints(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  destination_url TEXT NOT NULL,
  filter_path TEXT,
  filter_value TEXT,
  extra_headers TEXT NOT NULL DEFAULT '{}',
  retry_count INTEGER NOT NULL DEFAULT 3,
  retry_delay_secs INTEGER NOT NULL DEFAULT 5,
  enabled INTEGER NOT NULL DEFAULT 1,
  total_forwarded INTEGER NOT NULL DEFAULT 0,
  last_forwarded_at TEXT,
  last_status INTEGER,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_activity_logs_created ON activity_logs(created_at);

CREATE INDEX idx_activity_logs_user ON activity_logs(user_id);

CREATE UNIQUE INDEX IF NOT EXISTS idx_databases_port_unique
    ON databases(port) WHERE port IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_databases_container_id ON databases(container_id) WHERE container_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_activity_logs_action ON activity_logs(action);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_id ON activity_logs(user_id) WHERE user_id IS NOT NULL;

CREATE INDEX idx_api_keys_user ON api_keys(user_id);

CREATE INDEX idx_api_keys_prefix ON api_keys(key_prefix);

CREATE INDEX idx_servers_user ON servers(user_id);

CREATE INDEX idx_servers_token ON servers(agent_token);

CREATE INDEX idx_agent_commands_pending ON agent_commands(server_id, status) WHERE status = 'pending';

CREATE INDEX idx_agent_commands_server ON agent_commands(server_id, created_at DESC);

CREATE INDEX idx_monitors_user ON monitors(user_id);

CREATE INDEX idx_monitors_enabled ON monitors(enabled, status) WHERE enabled = TRUE;

CREATE INDEX idx_monitor_checks_monitor ON monitor_checks(monitor_id, checked_at DESC);

CREATE INDEX idx_incidents_monitor ON incidents(monitor_id, started_at DESC);

CREATE INDEX idx_teams_owner ON teams(owner_id);

CREATE INDEX idx_team_members_user ON team_members(user_id);

CREATE INDEX idx_team_members_team ON team_members(team_id);

CREATE INDEX idx_team_invites_token ON team_invites(token);

CREATE INDEX idx_servers_team ON servers(team_id) WHERE team_id IS NOT NULL;

CREATE INDEX idx_metrics_server_type ON metrics(server_id, metric_type, recorded_at DESC);

CREATE INDEX idx_security_scans_server ON security_scans(server_id, created_at DESC);

CREATE INDEX idx_security_findings_scan ON security_findings(scan_id);

CREATE INDEX idx_alert_rules_user ON alert_rules(user_id);

CREATE INDEX idx_alerts_user_status ON alerts(user_id, status, created_at DESC);

CREATE INDEX idx_alerts_server ON alerts(server_id, alert_type, created_at DESC);

CREATE UNIQUE INDEX idx_alert_state_server ON alert_state(server_id, alert_type, state_key) WHERE server_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_monitor_checks_checked ON monitor_checks(checked_at);

CREATE INDEX IF NOT EXISTS idx_alerts_created_status ON alerts(created_at, status);

CREATE INDEX IF NOT EXISTS idx_activity_logs_user_action ON activity_logs(user_id, action, created_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_rules_user_global
    ON alert_rules(user_id) WHERE server_id IS NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_alert_rules_user_server
    ON alert_rules(user_id, server_id) WHERE server_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_servers_user_name
    ON servers(user_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_teams_owner_name
    ON teams(owner_id, name);

CREATE UNIQUE INDEX IF NOT EXISTS idx_team_invites_team_email
    ON team_invites(team_id, email);

CREATE INDEX IF NOT EXISTS idx_alert_state_type_state
    ON alert_state(alert_type, current_state);

CREATE INDEX idx_metrics_history_created_at ON metrics_history(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_history_server ON metrics_history(server_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_created ON system_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_system_logs_level ON system_logs(level, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_docker_stacks_user_id ON docker_stacks(user_id);

CREATE INDEX IF NOT EXISTS idx_docker_stacks_server_id ON docker_stacks(server_id);

CREATE INDEX IF NOT EXISTS idx_monitors_server_id ON monitors(server_id);

CREATE INDEX IF NOT EXISTS idx_activity_logs_server_id ON activity_logs(server_id);

CREATE INDEX IF NOT EXISTS idx_users_oauth ON users(oauth_provider, oauth_id)
    WHERE oauth_provider IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_extensions_user ON extensions(user_id);

CREATE INDEX IF NOT EXISTS idx_extensions_enabled ON extensions(enabled) WHERE enabled = TRUE;

CREATE INDEX IF NOT EXISTS idx_extensions_api_key ON extensions(api_key_prefix);

CREATE INDEX IF NOT EXISTS idx_ext_events_extension ON extension_events(extension_id, delivered_at DESC);

CREATE INDEX IF NOT EXISTS idx_servers_token_hash ON servers(agent_token_hash);

CREATE INDEX IF NOT EXISTS idx_backup_policies_user ON backup_policies(user_id);

CREATE INDEX IF NOT EXISTS idx_backup_policies_enabled ON backup_policies(enabled);

CREATE INDEX IF NOT EXISTS idx_database_backups_db ON database_backups(database_id);

CREATE INDEX IF NOT EXISTS idx_database_backups_created ON database_backups(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_volume_backups_container ON volume_backups(container_name);

CREATE INDEX IF NOT EXISTS idx_volume_backups_created ON volume_backups(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backup_verifications_type ON backup_verifications(backup_type, backup_id);

CREATE INDEX IF NOT EXISTS idx_backup_verifications_status ON backup_verifications(status);

CREATE INDEX IF NOT EXISTS idx_backup_verifications_created ON backup_verifications(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_status_page_components_user ON status_page_components(user_id);

CREATE INDEX IF NOT EXISTS idx_managed_incidents_user ON managed_incidents(user_id);

CREATE INDEX IF NOT EXISTS idx_managed_incidents_status ON managed_incidents(status);

CREATE INDEX IF NOT EXISTS idx_managed_incidents_started ON managed_incidents(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_incident_updates_incident ON incident_updates(incident_id, created_at ASC);

CREATE INDEX IF NOT EXISTS idx_status_page_subscribers_verified ON status_page_subscribers(verified) WHERE verified = TRUE;

CREATE INDEX IF NOT EXISTS idx_secret_vaults_user ON secret_vaults(user_id);

CREATE INDEX IF NOT EXISTS idx_secrets_vault ON secrets(vault_id);

CREATE INDEX IF NOT EXISTS idx_secret_versions_secret ON secret_versions(secret_id, version DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_user ON webhook_endpoints(user_id);

CREATE INDEX IF NOT EXISTS idx_webhook_endpoints_token ON webhook_endpoints(token);

CREATE INDEX IF NOT EXISTS idx_webhook_deliveries_endpoint ON webhook_deliveries(endpoint_id, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_webhook_routes_endpoint ON webhook_routes(endpoint_id);

CREATE INDEX IF NOT EXISTS idx_alerts_escalation
    ON alerts(status, acknowledged_at, created_at)
    WHERE status = 'firing' AND acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_user_sessions_user ON user_sessions(user_id);

CREATE INDEX IF NOT EXISTS idx_user_sessions_jti ON user_sessions(jti);

CREATE INDEX IF NOT EXISTS idx_panel_notifications_user ON panel_notifications(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_panel_notifications_unread ON panel_notifications(user_id) WHERE read_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_token_blacklist_expires ON token_blacklist (expires_at);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_created ON security_audit_log(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_event ON security_audit_log(event_type);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_actor ON security_audit_log(actor_email);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_severity ON security_audit_log(severity);

CREATE INDEX IF NOT EXISTS idx_terminal_recordings_user ON terminal_recordings(user_email);

CREATE INDEX IF NOT EXISTS idx_terminal_recordings_created ON terminal_recordings(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_suspicious_events_created ON suspicious_events(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_monitors_user_created ON monitors (user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_secret_vaults_user_created ON secret_vaults (user_id, created_at DESC);

CREATE INDEX idx_passkeys_user_id ON passkeys(user_id);

CREATE INDEX idx_passkeys_credential_id ON passkeys(credential_id);

CREATE INDEX idx_container_policies_user_id ON container_policies(user_id);

CREATE INDEX idx_container_sleep_config_container_id ON container_sleep_config(container_id);

CREATE INDEX idx_container_sleep_config_auto_sleep ON container_sleep_config(auto_sleep_enabled) WHERE auto_sleep_enabled = true;

CREATE INDEX idx_db_pitr_config_database_id ON db_pitr_config(database_id);

CREATE INDEX idx_app_migrations_status ON app_migrations(status);

CREATE INDEX idx_iac_tokens_user_id ON iac_tokens(user_id);

CREATE INDEX idx_iac_tokens_hash ON iac_tokens(token_hash);

CREATE INDEX idx_autoscale_rules_container_id ON autoscale_rules(container_id);

CREATE INDEX idx_telemetry_events_created ON telemetry_events (created_at DESC);

CREATE INDEX idx_telemetry_events_unsent ON telemetry_events (sent_at) WHERE sent_at IS NULL;

CREATE INDEX idx_telemetry_events_category ON telemetry_events (category, event_type);

CREATE INDEX idx_image_scan_findings_scanned_at ON image_scan_findings (scanned_at);

CREATE INDEX idx_image_sbom_generated_at ON image_sbom (generated_at);

CREATE INDEX idx_gpu_metrics_created ON gpu_metrics_history(created_at DESC);

CREATE INDEX idx_gpu_metrics_server ON gpu_metrics_history(server_id, gpu_index, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_servers_cert_fingerprint
    ON servers(cert_fingerprint)
    WHERE cert_fingerprint IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_backup_drills_target ON backup_drills(backup_type, backup_id);

CREATE INDEX IF NOT EXISTS idx_backup_drills_status ON backup_drills(status);

CREATE INDEX IF NOT EXISTS idx_backup_drills_created ON backup_drills(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_backup_policies_drill_enabled
    ON backup_policies(drill_enabled) WHERE drill_enabled = TRUE;

CREATE INDEX idx_panel_snapshots_created ON panel_snapshots(created_at DESC);

CREATE INDEX idx_fleet_update_runs_started ON fleet_update_runs(started_at DESC);

CREATE INDEX IF NOT EXISTS idx_alerts_escalation_sweep
    ON alerts (COALESCE(escalated_at, created_at))
    WHERE status = 'firing' AND acknowledged_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_docker_stacks_domain ON docker_stacks (lower(domain));

CREATE INDEX IF NOT EXISTS idx_security_scans_server_created
    ON security_scans (server_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_image_scan_findings_server_image
    ON image_scan_findings (server_id, image, scanned_at DESC);

CREATE UNIQUE INDEX IF NOT EXISTS idx_status_page_config_user
    ON status_page_config(user_id);

CREATE INDEX IF NOT EXISTS idx_container_sleep_config_server_id
    ON container_sleep_config(server_id);

CREATE INDEX IF NOT EXISTS idx_backup_destinations_server_id
    ON backup_destinations(server_id);

CREATE INDEX IF NOT EXISTS idx_alerts_resolve
    ON alerts (user_id, server_id, alert_type, state_key)
    WHERE status = 'firing';

CREATE INDEX IF NOT EXISTS idx_container_expected_stops_server
    ON container_expected_stops(server_id);

CREATE INDEX IF NOT EXISTS idx_tls_certificates_user   ON tls_certificates(user_id);

CREATE INDEX IF NOT EXISTS idx_tls_certificates_server ON tls_certificates(server_id);

CREATE INDEX IF NOT EXISTS idx_docker_stacks_tls_certificate
    ON docker_stacks (tls_certificate_id) WHERE tls_certificate_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_docker_stacks_ssl_expiry
    ON docker_stacks (ssl_expiry) WHERE ssl_expiry IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_docker_stacks_user_server_name
    ON docker_stacks(user_id, server_id, lower(name));

CREATE INDEX IF NOT EXISTS idx_status_page_subscribers_owner ON status_page_subscribers(owner_id);

CREATE INDEX IF NOT EXISTS idx_escalation_policies_user ON escalation_policies(user_id);

CREATE INDEX IF NOT EXISTS idx_on_call_schedules_user ON on_call_schedules(user_id);

CREATE UNIQUE INDEX idx_api_keys_hash ON api_keys(key_hash);

CREATE INDEX IF NOT EXISTS idx_docker_app_domains_domain ON docker_app_domains (lower(domain));

CREATE INDEX IF NOT EXISTS idx_activity_logs_api_key ON activity_logs(api_key_id);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_api_key ON security_audit_log(api_key_id);

CREATE INDEX IF NOT EXISTS idx_security_audit_log_actor_user ON security_audit_log(actor_user_id);

CREATE INDEX IF NOT EXISTS idx_databases_stack_id ON databases(stack_id);


-- Baseline seed settings
INSERT OR IGNORE INTO settings (key, value) VALUES
    ('panel_name', 'DockPanel'),
    ('session_timeout', '7d'),
    ('auto_heal_enabled', 'false'),
    ('enforce_2fa', 'false'),
    ('security_geo_alert_enabled', 'true'),
    ('image_scan_enabled', 'false'),
    ('update_channel', 'stable'),
    ('agent_auto_update_enabled', 'false');

-- Lockdown state initial record
INSERT OR IGNORE INTO lockdown_state (id, active) VALUES (1, 0);

