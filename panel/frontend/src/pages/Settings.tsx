import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import ProvisionLog from "../components/ProvisionLog";
import UpdatesContent from "./Updates";
import { timeAgo } from "../utils/format";
import { applyTheme, readStoredTheme } from "../hooks/useLayoutState";
import ConfirmDialog from "../components/ConfirmDialog";
import {
  TwoFactorCard,
  PasskeysCard,
  ChangePasswordCard,
  SessionsCard,
  ApiKeysCard,
  ExportMyDataCard,
} from "../components/AccountSecurity";
import { GeneralTab } from "./settings/GeneralTab";
import { EmailTab } from "./settings/EmailTab";
import { AccountTab } from "./settings/AccountTab";
import { ChannelsTab } from "./settings/ChannelsTab";
import { ServicesTab } from "./settings/ServicesTab";

// Every alert type the panel can suppress from external channels, in the order
// the grid renders them. This list is the frontend half of a pair: the backend
// rejects a stored value naming anything outside it, so the two must agree
// exactly, and a pin arm compares them.
//
// It was ten entries while the panel had grown to twenty producers, so half the
// alert types that page an operator had no control here at all — including
// every certificate-renewal failure. Adding a producer means adding it here.
//
// No exemptions: a pin arm compares this list against the alert types the
// backend actually raises, reading the call sites rather than either list.
export const SUPPRESSIBLE_ALERT_TYPES: { key: string; label: string }[] = [
  { key: "cpu", label: "CPU" },
  { key: "memory", label: "Memory" },
  { key: "disk", label: "Disk" },
  { key: "disk_forecast", label: "Disk forecast" },
  { key: "memory_leak", label: "Memory leak" },
  { key: "offline", label: "Offline" },
  { key: "service_down", label: "Service" },
  { key: "container_down", label: "Container down" },
  { key: "container_crashloop", label: "Container crashloop" },
  { key: "container_unhealthy", label: "Container unhealthy" },
  { key: "gpu_utilization", label: "GPU Util" },
  { key: "gpu_temperature", label: "GPU Temp" },
  { key: "gpu_vram", label: "GPU VRAM" },
  { key: "backup_failure", label: "Backup" },
  { key: "backup_verification_failed", label: "Backup verification" },
  { key: "cron_failure", label: "Cron" },
  { key: "ssl_expiry", label: "SSL expiry" },
  { key: "ssl_renewal_failure", label: "SSL renewal" },
  { key: "security", label: "Security scan" },
  { key: "image_scan", label: "Image scan" },
  { key: "wp_vuln_scan", label: "WordPress vuln scan" },
  { key: "slow_response", label: "Slow response" },
];

/** Which `alert_rules` column governs whether a type is RECORDED at all.
 *
 * Distinct from muting, and the distinction is the whole point of the two
 * columns in the grid below. `muted_types` suppresses the external send while
 * the `alerts` row and the admin bell still happen; these columns are read by
 * `is_alert_enabled` BEFORE the INSERT, so the event never exists — no row, no
 * bell, no status-page incident. A type absent from this map has no such
 * column and is always recorded.
 *
 * The three GPU types deliberately share ONE column: the backend maps
 * gpu_utilization / gpu_temperature / gpu_vram all to `alert_gpu`, so those
 * three checkboxes move together and the GPU Alert Thresholds card further
 * down edits the same value.
 */
export const RECORD_COLUMN_BY_TYPE: Record<string, string> = {
  cpu: "alert_cpu",
  memory: "alert_memory",
  disk: "alert_disk",
  offline: "alert_offline",
  service_down: "alert_service_health",
  backup_failure: "alert_backup_failure",
  ssl_expiry: "alert_ssl_expiry",
  gpu_utilization: "alert_gpu",
  gpu_temperature: "alert_gpu",
  gpu_vram: "alert_gpu",
};


/** Preview colours for the theme picker and the layout thumbnails.
 *
 *  Hand-copied out of index.css, field for field:
 *    bg → --color-dark-900 · sidebar → --color-dark-950 · card → --color-dark-800
 *    bar → --color-dark-700 · text → --color-dark-500
 *    accent → --color-rust-400 on the dark themes, --color-rust-500 on the two
 *             light ones (arctic, clean) — rust-400 is a light tint there and
 *             would not clear the 3.0 non-text floor against the swatch card.
 *
 *  It is a copy on purpose: a getComputedStyle probe cannot work while terminal's
 *  ramp lives in @theme on :root with no [data-theme="terminal"] block, because a
 *  probe element inherits the CURRENT theme and would report ember's colours for
 *  Terminal while you are on ember. A pin asserts these stay in step with
 *  index.css — update both together, or the pin goes red.
 *
 *  Previously drifted: every one of ember's six fields was invented (none of the
 *  values appeared in index.css at all), terminal's and midnight's `text` had been
 *  hand-brightened, arctic's accent still held the pre-retune #0d9488, and the
 *  layout thumbnails below had no branch for clean or clean-dark and so rendered
 *  a black terminal preview inside a white card on both. */
export const THEME_SWATCHES = [
  // Lite themes first (2026-10-25 redesign): these are the selectable set.
  // Upstream entries below are kept for compatibility only.
  { id: "lite-mix", name: "Lite Mix", desc: "Warm light, amber — default", bg: "#faf7f2", sidebar: "#fffdf9", accent: "#d97706", card: "#ffffff", text: "#a8a29e", bar: "#f0e6d6" },
  { id: "lite-warm", name: "Lite Warm", desc: "Warm charcoal, amber", bg: "#1c1917", sidebar: "#171412", accent: "#f59e0b", card: "#292524", text: "#78716c", bar: "#44403c" },
  { id: "lite-clean", name: "Lite Clean", desc: "White, blue", bg: "#f8fafc", sidebar: "#ffffff", accent: "#2563eb", card: "#f1f5f9", text: "#94a3b8", bar: "#e2e8f0" },
  { id: "lite-midnight", name: "Lite Midnight", desc: "Navy, teal & violet", bg: "#0a1628", sidebar: "#050a18", accent: "#14b8a6", card: "#0f1f3a", text: "#3a5785", bar: "#182d50" },
  { id: "terminal", name: "Terminal", desc: "Hacker aesthetic", bg: "#111113", sidebar: "#09090b", accent: "#22c55e", card: "#18181b", text: "#52525b", bar: "#27272a" },
  { id: "midnight", name: "Midnight", desc: "Deep navy, modern", bg: "#0a1628", sidebar: "#050a18", accent: "#3b82f6", card: "#0f1f3a", text: "#3a5785", bar: "#182d50" },
  { id: "ember", name: "Ember", desc: "Warm & premium", bg: "#1c1917", sidebar: "#100e0d", accent: "#fb923c", card: "#292524", text: "#78716c", bar: "#3b3533" },
  { id: "clean-dark", name: "Clean Dark", desc: "GitHub-dark, rounded", bg: "#161b22", sidebar: "#0d1117", accent: "#3b82f6", card: "#1c2333", text: "#636e7b", bar: "#2d333b" },
  { id: "arctic", name: "Arctic", desc: "Teal & light", bg: "#f7f9fc", sidebar: "#ffffff", accent: "#0d7970", card: "#edf1f7", text: "#8d9bb0", bar: "#dce3ed" },
  { id: "clean", name: "Clean Light", desc: "Modern SaaS, blue", bg: "#f8fafc", sidebar: "#ffffff", accent: "#2563eb", card: "#f1f5f9", text: "#94a3b8", bar: "#e2e8f0" },
] as const;

export const DEFAULT_SWATCH = THEME_SWATCHES[0]; // lite-mix — the default theme

export interface HealthStatus {
  db: string;
  agent: string;
  uptime: string;
  database: boolean; // computed
  agentOk: boolean;  // computed
}

export interface ExportConfig {
  settings: Record<string, string>;
  [key: string]: unknown;
}

export interface CleanupResult {
  cleaned?: string[];
}

/**
 * `PUT /settings` when SMTP keys were among them.
 *
 * The setting is panel-global, so the push is fleet-wide: `smtp` says where the
 * config actually landed, host by host, and `warning` is the API's own sentence
 * for the partial case. Everything below `ok` is absent when the save touched no
 * SMTP key or when no host was configured — hence every field optional.
 */
export interface SmtpSaveResult {
  ok: boolean;
  /** Present only on a partial push. Complete sentence, safe to render as-is. */
  warning?: string;
  smtp?: {
    /** Hosts that took the configuration. */
    configured: string[];
    /** Hosts that were asked and refused. */
    failed: { server: string; error: string }[];
    /** Registered hosts no agent could be resolved for — never asked at all. */
    not_asked: { server: string; status: string }[];
  };
}

/** WebAuthn PublicKeyCredentialCreationOptions as returned by the server (base64url-encoded) */
export type ServiceStatus = Record<string, { installed?: boolean; running?: boolean; active?: boolean; version?: string | null }>;

export interface OAuthRedirects {
  base_url: string;
  base_url_configured: boolean;
  redirect_uris: Record<string, string>;
}

/** Must stay the set routes/oauth.rs::OAUTH_PROVIDERS accepts — a card for a
 *  provider `get_provider` does not know is a control that cannot work. */
export const OAUTH_PROVIDERS = [
  { id: "google", label: "Google", console: "https://console.cloud.google.com/apis/credentials" },
  { id: "github", label: "GitHub", console: "https://github.com/settings/developers" },
  { id: "gitlab", label: "GitLab", console: "https://gitlab.com/-/user_settings/applications" },
] as const;

/** The four channels services/notifications.rs looks up a template for. */
export const NOTIF_CHANNELS = [
  { id: "email", label: "Email", hint: "HTML body. Replaces the default alert email entirely.", rows: 5 },
  { id: "slack", label: "Slack", hint: "Sent as the `text` field. Default: *{{title}}* then the message.", rows: 3 },
  { id: "discord", label: "Discord", hint: "Sent as `content`. Default: **{{title}}** then the message.", rows: 3 },
  { id: "webhook", label: "Generic webhook", hint: "Becomes the `message` field of the JSON payload.", rows: 3 },
] as const;

/** Placeholders services/notifications.rs::format_message substitutes. Anything
 *  else is passed through verbatim — an operator typing {{host}} gets "{{host}}". */
export const NOTIF_PLACEHOLDERS = ["{{title}}", "{{message}}", "{{severity}}", "{{timestamp}}"] as const;

export default function Settings() {
  const { user } = useAuth();
  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState<string | null>(null);
  const [health, setHealth] = useState<HealthStatus | null>(null);
  const [healthLoading, setHealthLoading] = useState(true);
  const [message, setMessage] = useState({ text: "", type: "" });
  // Servers whose agent predates the recording gate and so keep recording no
  // matter what the toggle says. Empty on a single-server install.
  const [recordingLagging, setRecordingLagging] = useState<{ name: string; agent_version: string }[]>([]);
  const healthTimer = useRef<ReturnType<typeof setInterval>>(undefined);

  // Form state
  const [panelName, setPanelName] = useState("");
  const [baseUrl, setBaseUrl] = useState("");
  const [panelIps, setPanelIps] = useState("");
  const [smtpProvider, setSmtpProvider] = useState("custom");
  const [smtpHost, setSmtpHost] = useState("");
  const [smtpPort, setSmtpPort] = useState("");
  const [smtpUser, setSmtpUser] = useState("");
  const [smtpPass, setSmtpPass] = useState("");
  const [smtpFrom, setSmtpFrom] = useState("");
  const [smtpFromName, setSmtpFromName] = useState("");
  const [smtpEncryption, setSmtpEncryption] = useState("starttls");
  const [testingEmail, setTestingEmail] = useState(false);

  // Update count for tab badge
  const [updateCount, setUpdateCount] = useState(0);

  // Auto-healing
  const [autoHealEnabled, setAutoHealEnabled] = useState(false);
  const [autoHealReclaim, setAutoHealReclaim] = useState(false);
  const [reverseProxy, setReverseProxy] = useState("nginx");
  const [traefikInstalling, setTraefikInstalling] = useState(false);
  const [showTraefikEmail, setShowTraefikEmail] = useState(false);
  const [traefikEmail, setTraefikEmail] = useState("admin@example.com");

  // PowerDNS
  const [pdnsApiUrl, setPdnsApiUrl] = useState("");
  const [pdnsApiKey, setPdnsApiKey] = useState("");
  const [showPdnsGuide, setShowPdnsGuide] = useState(false);

  // Notification channels
  const [notifySlackUrl, setNotifySlackUrl] = useState("");
  const [notifyDiscordUrl, setNotifyDiscordUrl] = useState("");
  const [notifyPagerdutyKey, setNotifyPagerdutyKey] = useState("");
  const [notifyEmail, setNotifyEmail] = useState(true);
  const [testingWebhook, setTestingWebhook] = useState<string | null>(null);
  const [webhookResult, setWebhookResult] = useState<{ type: string; msg: string }>({ type: "", msg: "" });
  const [mutedTypes, setMutedTypes] = useState<string[]>([]);
  // Defaults mirror the schema, which declares every one of these NOT NULL
  // DEFAULT TRUE — so an unsaved page shows what the backend would do.
  const [recordTypes, setRecordTypes] = useState<Record<string, boolean>>({
    alert_cpu: true,
    alert_memory: true,
    alert_disk: true,
    alert_offline: true,
    alert_backup_failure: true,
    alert_ssl_expiry: true,
    alert_service_health: true,
  });
  // The Alerts page builds escalation policies and then tells the operator, in its own
  // words, to "attach a policy to an alert rule from the alert-rules editor". This is
  // that editor, and until now it had no such control: the attach endpoint had zero
  // callers, so every rule kept escalation_policy_id NULL and every alert fell back to
  // the hardcoded cadence no matter how many chains had been built.
  const [alertRuleId, setAlertRuleId] = useState<string | null>(null);
  const [escalationPolicyId, setEscalationPolicyId] = useState("");
  const [escalationPolicies, setEscalationPolicies] = useState<{ id: string; name: string }[]>([]);
  // GPU alert thresholds
  const [gpuAlertEnabled, setGpuAlertEnabled] = useState(true);
  const [gpuUtilThreshold, setGpuUtilThreshold] = useState(95);
  const [gpuUtilDuration, setGpuUtilDuration] = useState(5);
  const [gpuTempThreshold, setGpuTempThreshold] = useState(85);
  const [gpuVramThreshold, setGpuVramThreshold] = useState(95);

  // Hostname
  const [hostname, setHostname] = useState("");

  // Theme. Read through readStoredTheme so a legacy stored id ("nexus", "dark")
  // resolves to the theme actually on screen — this used to be the one reader
  // that skipped the migration, so such a user saw NO swatch marked active.
  const [currentTheme, setCurrentTheme] = useState(readStoredTheme);
  const [showHeader, setShowHeader] = useState(() => localStorage.getItem("dp-show-header") === "true");
  const [flatNav, setFlatNav] = useState(() => localStorage.getItem("dp-flat-nav") === "true");

  const [pendingConfirm, setPendingConfirm] = useState<{ type: string; label: string; data?: Record<string, unknown> } | null>(null);

  // OAuth sign-in providers. The keys behind these were writable through the
  // settings API and read by routes/oauth.rs since the feature shipped, with no
  // control anywhere — so the panel's only unconfigurable door was an
  // authentication one. Same shape as the s275 note on OAuth Auto-Registration
  // below: the switch existed, the operator could not see it.
  const [oauthCreds, setOauthCreds] = useState<Record<string, { id: string; secret: string }>>(
    Object.fromEntries(OAUTH_PROVIDERS.map(p => [p.id, { id: "", secret: "" }]))
  );
  const [oauthRedirects, setOauthRedirects] = useState<OAuthRedirects | null>(null);
  const [copiedRedirect, setCopiedRedirect] = useState<string | null>(null);

  // Notification templates (Gap #70) — read by services/notifications.rs.
  const [notifTemplates, setNotifTemplates] = useState<Record<string, string>>(
    Object.fromEntries(NOTIF_CHANNELS.map(c => [c.id, ""]))
  );

  const [canary, setCanary] = useState<{ enabled: boolean; watching: number; total: number; armable: number; paths: { path: string; state: string; plantable: boolean; detail: string | null }[] } | null>(null);
  const [canaryErr, setCanaryErr] = useState<string | null>(null);
  const [arming, setArming] = useState(false);

  const loadSettings = async () => {
    try {
      const data = await api.get<Record<string, string>>("/settings");
      setSettings(data);
      setPanelName(data.panel_name || "");
      setBaseUrl(data.base_url || "");
      setPanelIps(data.allowed_panel_ips || "");
      setSmtpHost(data.smtp_host || "");
      setSmtpPort(data.smtp_port || "");
      setSmtpUser(data.smtp_username || "");
      setSmtpPass(data.smtp_password || "");
      setSmtpFrom(data.smtp_from || "");
      setSmtpFromName(data.smtp_from_name || "");
      setSmtpEncryption(data.smtp_encryption || "starttls");
      setAutoHealEnabled(data.auto_heal_enabled === "true");
      setAutoHealReclaim(data.auto_heal_docker_reclaim === "true");
      setReverseProxy(data.reverse_proxy || "nginx");
      setPdnsApiUrl(data.pdns_api_url || "");
      setPdnsApiKey(data.pdns_api_key || "");
      setOauthCreds(Object.fromEntries(OAUTH_PROVIDERS.map(p => [p.id, {
        id: data[`oauth_${p.id}_client_id`] || "",
        // Arrives as the mask when stored; the backend skips that sentinel on
        // write, so an untouched field cannot blank a configured secret.
        secret: data[`oauth_${p.id}_client_secret`] || "",
      }])));
      setNotifTemplates(Object.fromEntries(
        NOTIF_CHANNELS.map(c => [c.id, data[`notif_template_${c.id}`] || ""])
      ));
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Failed to load settings",
        type: "error",
      });
    } finally {
      setLoading(false);
    }
  };

  const loadHealth = async () => {
    try {
      const raw = await api.get<{ db: string; agent: string; uptime: string }>("/settings/health");
      setHealth({ ...raw, database: raw.db === "ok", agentOk: raw.agent === "ok" });
    } catch {
      setHealth(null);
    } finally {
      setHealthLoading(false);
    }
  };

  const executeConfirm = async () => {
    if (!pendingConfirm) return;
    const { type, data } = pendingConfirm;
    setPendingConfirm(null);
    try {
      switch (type) {
        case "traefik_uninstall": {
          setTraefikInstalling(true);
          await api.post("/traefik/uninstall");
          setReverseProxy("nginx");
          setMessage({ text: "Switched to nginx", type: "success" });
          setTraefikInstalling(false);
          break;
        }
        case "import_config": {
          if (!data) break;
          await api.post("/settings/import", data.config);
          setMessage({ text: "Config imported", type: "success" });
          window.location.reload();
          break;
        }
        case "revoke_sessions": {
          await api.post("/auth/revoke-all");
          setMessage({ text: "All sessions revoked", type: "success" });
          setTimeout(() => { window.location.href = "/login"; }, 2000);
          break;
        }
      }
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Action failed", type: "error" });
      if (type === "traefik_uninstall") setTraefikInstalling(false);
    }
  };

  // What the canary tripwire is ACTUALLY watching, as opposed to whether its
  // setting is on. The row below rendered "on" from the setting alone, and the
  // setting is seeded true, so a panel watching zero files looked identical to a
  // panel watching all of them.
  type CanaryPath = { path: string; state: string; plantable: boolean; detail: string | null };
  type CanaryStatus = { enabled: boolean; watching: number; total: number; armable: number; paths: CanaryPath[] };
  const loadCanary = async () => {
    try {
      setCanary(await api.get<CanaryStatus>("/security/canary-status"));
      setCanaryErr(null);
    } catch (e) {
      // Deliberately NOT a silent catch: a status this screen cannot read is the
      // one state the row must never paint as protected.
      setCanary(null);
      setCanaryErr(e instanceof Error ? e.message : "unavailable");
    }
  };

  const loadNotifyChannels = async () => {
    try {
      const rules = await api.get<{ id?: string; escalation_policy_id?: string | null; notify_email?: boolean; notify_slack_url?: string; notify_discord_url?: string; notify_pagerduty_key?: string; muted_types?: string; alert_cpu?: boolean; alert_memory?: boolean; alert_disk?: boolean; alert_offline?: boolean; alert_backup_failure?: boolean; alert_ssl_expiry?: boolean; alert_service_health?: boolean; alert_gpu?: boolean; gpu_util_threshold?: number; gpu_util_duration?: number; gpu_temp_threshold?: number; gpu_vram_threshold?: number }[]>("/alert-rules");
      if (rules.length > 0) {
        const r = rules[0];
        setAlertRuleId(r.id ?? null);
        setEscalationPolicyId(r.escalation_policy_id ?? "");
        setNotifyEmail(r.notify_email !== false);
        setNotifySlackUrl(r.notify_slack_url || "");
        setNotifyDiscordUrl(r.notify_discord_url || "");
        setNotifyPagerdutyKey(r.notify_pagerduty_key || "");
        if (r.muted_types) {
          // Drop tokens this build cannot suppress before they reach the
          // checkboxes. A stale one would otherwise survive every Save — it
          // round-trips through the payload untouched — and the backend now
          // refuses the write, so a settings page carrying one could never be
          // saved again. Filtering here lets the next Save heal the row.
          const known = new Set(SUPPRESSIBLE_ALERT_TYPES.map(t => t.key));
          setMutedTypes(r.muted_types.split(',').map((t: string) => t.trim()).filter((t: string) => known.has(t)));
        }
        // `!== false` so an absent column reads as the schema default (TRUE)
        // rather than as "switched off" — the reassuring direction here is the
        // WRONG one: showing a box ticked for a type the operator had silenced
        // would invite them to save it back on without noticing.
        setRecordTypes({
          alert_cpu: r.alert_cpu !== false,
          alert_memory: r.alert_memory !== false,
          alert_disk: r.alert_disk !== false,
          alert_offline: r.alert_offline !== false,
          alert_backup_failure: r.alert_backup_failure !== false,
          alert_ssl_expiry: r.alert_ssl_expiry !== false,
          alert_service_health: r.alert_service_health !== false,
        });
        if (r.alert_gpu !== undefined) setGpuAlertEnabled(r.alert_gpu);
        if (r.gpu_util_threshold) setGpuUtilThreshold(r.gpu_util_threshold);
        if (r.gpu_util_duration) setGpuUtilDuration(r.gpu_util_duration);
        if (r.gpu_temp_threshold) setGpuTempThreshold(r.gpu_temp_threshold);
        if (r.gpu_vram_threshold) setGpuVramThreshold(r.gpu_vram_threshold);
      }
    } catch { /* ignore */ }
    // A missing policy list must not break the notification tab — the picker just has
    // nothing to offer, which is also the honest state when no policies exist yet.
    try {
      const policies = await api.get<{ id: string; name: string }[]>("/escalation-policies");
      setEscalationPolicies(policies.map(({ id, name }) => ({ id, name })));
    } catch { setEscalationPolicies([]); }
  };

  useEffect(() => {
    loadSettings();
    loadHealth();
    loadNotifyChannels();
    loadCanary();
    api.get<{ count: number }>("/system/updates/count")
      .then((d) => setUpdateCount(d.count))
      .catch(() => {});
    api.get<{ lagging: { name: string; agent_version: string }[] }>("/settings/recording-coverage")
      .then((d) => setRecordingLagging(d.lagging || []))
      .catch(() => {});
    api.get<{ hostname?: string }>("/system/info")
      .then((d) => { if (d.hostname) setHostname(d.hostname); })
      .catch(() => {});
    api.get<OAuthRedirects>("/settings/oauth-redirects")
      .then(setOauthRedirects)
      .catch(() => {});
    healthTimer.current = setInterval(loadHealth, 30000);
    return () => clearInterval(healthTimer.current);
  }, []);

  const saveGeneral = async () => {
    setSaving("general");
    setMessage({ text: "", type: "" });
    try {
      await api.put("/settings", { panel_name: panelName, base_url: baseUrl.trim() });
      setMessage({ text: "General settings saved", type: "success" });
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Failed to save settings",
        type: "error",
      });
    } finally {
      setSaving(null);
    }
  };

  const saveSMTP = async () => {
    setSaving("smtp");
    setMessage({ text: "", type: "" });
    try {
      // Saving SMTP pushes the config at EVERY member of the fleet, and the
      // write to `settings` succeeding says nothing about whether it landed.
      // `warning` is a complete sentence from the API naming the hosts that
      // rejected it and the hosts that were never asked — the ones whose mail
      // will keep using stale credentials until SMTP is saved again. Same
      // response shape and same handling as BackupOrchestrator's deleteDest.
      const res = await api.put<SmtpSaveResult>("/settings", {
        smtp_host: smtpHost,
        smtp_port: smtpPort,
        smtp_username: smtpUser,
        smtp_password: smtpPass,
        smtp_from: smtpFrom,
        smtp_from_name: smtpFromName,
        smtp_encryption: smtpEncryption,
      });
      const configured = res?.smtp?.configured ?? [];
      setMessage(
        res?.warning
          ? { text: res.warning, type: "warning" }
          : {
              // Name the hosts on the way through: "saved" on its own is the
              // claim that let one box's success stand for the fleet's.
              text: configured.length > 1
                ? `SMTP settings saved and pushed to all ${configured.length} servers (${configured.join(", ")})`
                : "SMTP settings saved",
              type: "success",
            },
      );
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Failed to save SMTP settings",
        type: "error",
      });
    } finally {
      setSaving(null);
    }
  };

  const handleTestEmail = async () => {
    setTestingEmail(true);
    setMessage({ text: "", type: "" });
    try {
      const result = await api.post<{ message: string }>("/settings/smtp/test", {});
      setMessage({ text: result.message || "Test email sent!", type: "success" });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Test email failed", type: "error" });
    } finally {
      setTestingEmail(false);
    }
  };

  const SMTP_PRESETS: Record<string, { host: string; port: string; encryption: string }> = {
    custom: { host: "", port: "", encryption: "starttls" },
    mailgun: { host: "smtp.mailgun.org", port: "587", encryption: "starttls" },
    ses: { host: "email-smtp.us-east-1.amazonaws.com", port: "587", encryption: "starttls" },
    sendgrid: { host: "smtp.sendgrid.net", port: "587", encryption: "starttls" },
    resend: { host: "smtp.resend.com", port: "465", encryption: "tls" },
    gmail: { host: "smtp.gmail.com", port: "587", encryption: "starttls" },
    outlook: { host: "smtp-mail.outlook.com", port: "587", encryption: "starttls" },
    zoho: { host: "smtp.zoho.com", port: "465", encryption: "tls" },
  };

  const applyPreset = (provider: string) => {
    setSmtpProvider(provider);
    const preset = SMTP_PRESETS[provider];
    if (preset && provider !== "custom") {
      setSmtpHost(preset.host);
      setSmtpPort(preset.port);
      setSmtpEncryption(preset.encryption);
    }
  };

  // Deep-linkable tab, the same shape Monitoring.tsx and Security.tsx already
  // use. Without it this page always opened on "general", so every control
  // anywhere in the panel that said "configure X in Settings" landed the
  // operator one tab short of X and left them to find it — and there was no way
  // to write a correct link even if you wanted to, because nothing here read the
  // URL. "Configure alert channels →" on the notifications page was the instance
  // that surfaced it; there are several more.
  const SETTINGS_TABS: readonly string[] = ["general", "email", "account", "channels", "services"];
  const [searchParams] = useSearchParams();
  const resolveSettingsTab = (raw: string | null): string =>
    raw && SETTINGS_TABS.includes(raw) ? raw : "general";
  const [tab, setTab] = useState(() => resolveSettingsTab(searchParams.get("tab")));
  useEffect(() => {
    setTab(resolveSettingsTab(searchParams.get("tab")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);

  if (loading) {
    return (
      <div className="p-6 lg:p-8">
        <h1 className="text-sm font-medium text-dark-300 uppercase font-mono tracking-widest mb-6">Settings</h1>
        <div className="space-y-4">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="bg-dark-800 rounded-lg border border-dark-500 p-6 animate-pulse">
              <div className="h-5 bg-dark-700 rounded w-40 mb-4" />
              <div className="h-10 bg-dark-700 rounded w-full" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Settings</h1>
          <p className="page-header-subtitle">Manage panel configuration</p>
        </div>
      </div>

      <div className="p-6 lg:p-8">
      <div className="flex gap-1 mb-6 border-b border-dark-600 pb-1 overflow-x-auto">
        {[
          { id: "general", label: "General" },
          { id: "email", label: "Email" },
          { id: "account", label: "Account" },
          { id: "channels", label: "Alert Channels" },
          { id: "services", label: "Services" },
        ].map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            className={`flex items-center gap-1.5 px-3 py-2 text-sm font-medium rounded-t-lg transition-colors whitespace-nowrap shrink-0 ${
              tab === t.id ? "text-rust-400 border-b-2 border-rust-400" : "text-dark-300 hover:text-dark-100"
            }`}>
            {t.label}
          </button>
        ))}
      </div>

      {message.text && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
            message.type === "success"
              ? "bg-rust-500/10 text-rust-400 border-rust-500/20"
              : message.type === "warning"
                // A fleet operation that partly landed is neither. Red would say
                // the save failed; green would say every host has the new config.
                ? "bg-warn-500/10 text-warn-400 border-warn-500/20"
                : "bg-danger-500/10 text-danger-400 border-danger-500/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Issue #120: this used to be an inline bar rendered here, at the top of
          the page. The Reverse Proxy control that arms it sits near the bottom,
          so switching back to nginx looked like it did nothing at all. It is a
          portalled dialog now — see components/ConfirmDialog. */}
      {pendingConfirm && (
        <ConfirmDialog
          label={pendingConfirm.label}
          tone={pendingConfirm.type === "revoke_sessions" ? "danger" : "warn"}
          onConfirm={executeConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      <div className="space-y-6">
        {/* General Settings */}
        {tab === "general" && (
          <GeneralTab
            settings={settings}
            setSettings={setSettings}
            saving={saving}
            setMessage={setMessage}
            panelName={panelName}
            setPanelName={setPanelName}
            baseUrl={baseUrl}
            setBaseUrl={setBaseUrl}
            autoHealEnabled={autoHealEnabled}
            setAutoHealEnabled={setAutoHealEnabled}
            autoHealReclaim={autoHealReclaim}
            setAutoHealReclaim={setAutoHealReclaim}
            reverseProxy={reverseProxy}
            setReverseProxy={setReverseProxy}
            traefikInstalling={traefikInstalling}
            setTraefikInstalling={setTraefikInstalling}
            showTraefikEmail={showTraefikEmail}
            setShowTraefikEmail={setShowTraefikEmail}
            traefikEmail={traefikEmail}
            setTraefikEmail={setTraefikEmail}
            hostname={hostname}
            setHostname={setHostname}
            currentTheme={currentTheme}
            setCurrentTheme={setCurrentTheme}
            showHeader={showHeader}
            setShowHeader={setShowHeader}
            flatNav={flatNav}
            setFlatNav={setFlatNav}
            setPendingConfirm={setPendingConfirm}
            saveGeneral={saveGeneral}
          />
        )}

        {/* SMTP Configuration */}
        {tab === "email" && (
          <EmailTab
            saving={saving}
            smtpProvider={smtpProvider}
            smtpHost={smtpHost}
            setSmtpHost={setSmtpHost}
            smtpPort={smtpPort}
            setSmtpPort={setSmtpPort}
            smtpUser={smtpUser}
            setSmtpUser={setSmtpUser}
            smtpPass={smtpPass}
            setSmtpPass={setSmtpPass}
            smtpFrom={smtpFrom}
            setSmtpFrom={setSmtpFrom}
            smtpFromName={smtpFromName}
            setSmtpFromName={setSmtpFromName}
            smtpEncryption={smtpEncryption}
            setSmtpEncryption={setSmtpEncryption}
            testingEmail={testingEmail}
            saveSMTP={saveSMTP}
            handleTestEmail={handleTestEmail}
            applyPreset={applyPreset}
          />
        )}

        {/* The self-service cards below are SHARED with `pages/Account.tsx`, the
            non-adminOnly door every role can reach. One implementation, two
            callers — a copy here would drift the moment either side changed. */}
        {tab === "account" && (
          <AccountTab
            user={user}
            settings={settings}
            setSettings={setSettings}
            setMessage={setMessage}
            recordingLagging={recordingLagging}
            panelIps={panelIps}
            setPanelIps={setPanelIps}
            setPendingConfirm={setPendingConfirm}
            oauthCreds={oauthCreds}
            setOauthCreds={setOauthCreds}
            oauthRedirects={oauthRedirects}
            copiedRedirect={copiedRedirect}
            setCopiedRedirect={setCopiedRedirect}
            canary={canary}
            canaryErr={canaryErr}
            arming={arming}
            setArming={setArming}
            loadCanary={loadCanary}
          />
        )}

        {/* Notification Channels */}
        {tab === "channels" && (
          <ChannelsTab
            user={user}
            setSettings={setSettings}
            saving={saving}
            setSaving={setSaving}
            setMessage={setMessage}
            notifySlackUrl={notifySlackUrl}
            setNotifySlackUrl={setNotifySlackUrl}
            notifyDiscordUrl={notifyDiscordUrl}
            setNotifyDiscordUrl={setNotifyDiscordUrl}
            notifyPagerdutyKey={notifyPagerdutyKey}
            setNotifyPagerdutyKey={setNotifyPagerdutyKey}
            notifyEmail={notifyEmail}
            setNotifyEmail={setNotifyEmail}
            testingWebhook={testingWebhook}
            setTestingWebhook={setTestingWebhook}
            webhookResult={webhookResult}
            setWebhookResult={setWebhookResult}
            mutedTypes={mutedTypes}
            setMutedTypes={setMutedTypes}
            recordTypes={recordTypes}
            setRecordTypes={setRecordTypes}
            alertRuleId={alertRuleId}
            escalationPolicyId={escalationPolicyId}
            setEscalationPolicyId={setEscalationPolicyId}
            escalationPolicies={escalationPolicies}
            gpuAlertEnabled={gpuAlertEnabled}
            setGpuAlertEnabled={setGpuAlertEnabled}
            gpuUtilThreshold={gpuUtilThreshold}
            setGpuUtilThreshold={setGpuUtilThreshold}
            gpuUtilDuration={gpuUtilDuration}
            setGpuUtilDuration={setGpuUtilDuration}
            gpuTempThreshold={gpuTempThreshold}
            setGpuTempThreshold={setGpuTempThreshold}
            gpuVramThreshold={gpuVramThreshold}
            setGpuVramThreshold={setGpuVramThreshold}
            notifTemplates={notifTemplates}
            setNotifTemplates={setNotifTemplates}
            loadNotifyChannels={loadNotifyChannels}
          />
        )}

        {/* Services tab: Service Installers (incl. PowerDNS config), System Health */}
        {tab === "services" && (
          <ServicesTab
            saving={saving}
            setSaving={setSaving}
            health={health}
            healthLoading={healthLoading}
            setHealthLoading={setHealthLoading}
            setMessage={setMessage}
            pdnsApiUrl={pdnsApiUrl}
            setPdnsApiUrl={setPdnsApiUrl}
            pdnsApiKey={pdnsApiKey}
            setPdnsApiKey={setPdnsApiKey}
            showPdnsGuide={showPdnsGuide}
            setShowPdnsGuide={setShowPdnsGuide}
            loadHealth={loadHealth}
            setTab={setTab}
          />
        )}

      </div>
      </div>
    </div>
  );
}
