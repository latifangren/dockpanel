// Shared Security page types. Moved verbatim from pages/Security.tsx so
// the shell and the tab components share one definition (no duplicates).
import type { UnreachableServer } from "../../components/PanicReport";

export const SEC_TABS = ["overview", "scans", "diagnostics", "audit", "lockdown", "recordings", "approvals"] as const;
export type SecTab = typeof SEC_TABS[number];

export interface PendingConfirm {
  type: string;
  label: string;
  data?: Record<string, unknown>;
}

export interface SecurityOverview {
  firewall_active: boolean;
  firewall_rules_count: number;
  fail2ban_running: boolean;
  fail2ban_banned_total: number;
  ssh_port: number;
  ssh_password_auth: boolean;
  ssh_root_login: boolean;
  ssl_certs_count: number;
}

export interface FirewallRule {
  number: number;
  to: string;
  action: string;
  from: string;
}

export interface FirewallStatus {
  active: boolean;
  default_policy: string;
  rules: FirewallRule[];
}

export interface JailInfo {
  name: string;
  banned_count: number;
}

export interface Fail2banStatus {
  running: boolean;
  jails: JailInfo[];
}

export interface ScanSummary {
  id: string;
  scan_type: string;
  status: string;
  findings_count: number;
  critical_count: number;
  warning_count: number;
  info_count: number;
  started_at: string;
  completed_at: string | null;
}

export interface ScanFinding {
  id: string;
  check_type: string;
  severity: string;
  title: string;
  description: string | null;
  file_path: string | null;
  remediation: string | null;
}

export interface Posture {
  score: number;
  total_scans: number;
  latest_scan: ScanSummary | null;
}

export interface SshLoginEntry {
  time: string;
  user: string;
  ip: string;
  method: string;
  success: boolean;
  // Which machine's auth.log this row came from. The SSH half is now the
  // concatenation of every host in the fleet, and `time` is a year-less syslog
  // stamp ("Mar 18 12:34:56") — so the origin is the only thing that tells two
  // identical-looking failed logins apart. Optional so a panel whose backend
  // predates the fan-out still type-checks.
  server_id?: string;
  server_name?: string;
  is_local?: boolean;
}

/**
 * Per-host coverage for the SSH half. Present for the hosts that answered AND
 * the hosts that did not: `entries` is null exactly when `reached` is false,
 * because nobody read that machine's auth.log and its absence from the table is
 * therefore not evidence of anything.
 */
export interface SshServerCoverage {
  server_id: string;
  server_name: string;
  is_local: boolean;
  reached: boolean;
  entries: number | null;
  error?: string;
}

/**
 * GET /security/login-audit.
 *
 * `panel` and `ssh` are the legacy pair; everything else says how much of the
 * fleet the SSH half actually covers and whether the panel half was readable at
 * all. Both degraded states are silent by default — an un-asked host and a
 * failed database query each render as an empty table, which is the single most
 * reassuring thing this page can show. The flags are what stops "we could not
 * ask" from reading as "nothing happened".
 */
export interface LoginAudit {
  panel: PanelLoginEntry[];
  ssh: SshLoginEntry[];
  /** True whenever at least one machine's auth.log went unread. Do not ignore. */
  ssh_partial?: boolean;
  ssh_servers?: SshServerCoverage[];
  ssh_servers_total?: number;
  ssh_servers_reached?: number;
  ssh_servers_unreachable?: number;
  /** Same shape as the panic button's un-swept list, and the same meaning. */
  ssh_unreachable_servers?: UnreachableServer[];
  ssh_unreachable_names?: string[];
  /** The panel half cannot be partial by host — it can only fail outright. */
  panel_query_failed?: boolean;
}

export interface PanelLoginEntry {
  time: string;
  action: string;
  success: boolean;
  user: string;
  ip: string | null;
  /** The attempt named an email with no account — the enumeration signature. */
  unknown_user: boolean;
}

// `target_type`, `target_name` and `details` are the payload — the WHICH and the
// WHY. The endpoint has always sent all three (routes/security.rs:1020) and this
// interface did not declare them, so they were dropped at parse and the table
// showed six columns of metadata about events whose substance was never rendered.
// A canary trip read `critical · canary.triggered` and never named the file; a
// deploy-protection change never said which direction it went or on what.
// This is the only surface where a security_audit_log row is ever seen.
export interface AuditLogEntry {
  id: string;
  severity: string;
  event_type: string;
  actor_email: string | null;
  actor_ip: string | null;
  target_type: string | null;
  target_name: string | null;
  details: string | null;
  geo_country: string | null;
  created_at: string;
}

// The feed that trips auto-lockdown. Written by `record_suspicious_event[_at]`
// (proxy/datacenter logins, staging-clone abuse, deploy anomalies) since the
// 2026-03-24 security-hardening migration — until now the only reader
// anywhere was a bare COUNT() against the threshold, so an admin could see
// lockdown fire and never see what actually happened.
export interface SuspiciousEvent {
  id: string;
  event_type: string;
  actor_email: string | null;
  actor_ip: string | null;
  details: string | null;
  created_at: string;
}

export interface RecordingEntry {
  filename: string;
  size_bytes: number;
  created: string | null;
}

export interface PendingUser {
  id: string;
  email: string;
  created_at: string;
}

export interface UnverifiedUser {
  id: string;
  email: string;
  role: string;
  /** FALSE means the account holds no token, so no verification link exists or can
   *  be resent — the admin override is the only way in short of a database edit. */
  can_self_verify: boolean;
  created_at: string;
}

export interface LockdownStatus {
  active: boolean;
  triggered_by?: string;
  triggered_at?: string;
  reason?: string;
  /**
   * The stored column. NOT the answer to "are terminals blocked": it is
   * `DEFAULT TRUE` in the migration and `deactivate_lockdown` never clears it,
   * so on a panel that has never been locked down it already reads TRUE.
   * Rendering this one would tell an operator that shells are blocked on a
   * system that is wide open. Kept for completeness; never displayed.
   */
  terminals_disabled?: boolean;
  /**
   * `active && terminals_disabled`, computed by the same function the terminal
   * ticket mint gates on — so the page and the gate cannot drift apart. This is
   * the field that answers "can anyone open a shell right now". Render this one.
   */
  terminals_blocked?: boolean;
}
