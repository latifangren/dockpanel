// Moved verbatim from panel/frontend/src/pages/Settings.tsx (account tab, original lines 1386-2049).
// The shell in Settings.tsx keeps all state, loaders and helpers;
// this component destructures exactly the shell identifiers it uses,
// under the same names, so the JSX body below is unchanged.
import { api } from "../../api";
import {
  TwoFactorCard,
  PasskeysCard,
  ChangePasswordCard,
  SessionsCard,
  ApiKeysCard,
  ExportMyDataCard,
} from "../../components/AccountSecurity";
import { OAUTH_PROVIDERS } from "../Settings";
import { SSHKeys } from "./SSHKeys";
import { AutoUpdates } from "./AutoUpdates";
import { CredentialEncryptionCard } from "./CredentialEncryptionCard";
import type { OAuthRedirects } from "../Settings";
import type { Dispatch, SetStateAction } from "react";

interface AccountTabProps {
  user: any;
  settings: Record<string, string>;
  setSettings: Dispatch<SetStateAction<Record<string, string>>>;
  setMessage: Dispatch<SetStateAction<{ text: string; type: string }>>;
  recordingLagging: { name: string; agent_version: string }[];
  panelIps: string;
  setPanelIps: Dispatch<SetStateAction<string>>;
  setPendingConfirm: Dispatch<SetStateAction<{ type: string; label: string; data?: Record<string, unknown> } | null>>;
  oauthCreds: Record<string, { id: string; secret: string }>;
  setOauthCreds: Dispatch<SetStateAction<Record<string, { id: string; secret: string }>>>;
  oauthRedirects: OAuthRedirects | null;
  copiedRedirect: string | null;
  setCopiedRedirect: Dispatch<SetStateAction<string | null>>;
  canary: { enabled: boolean; watching: number; total: number; armable: number; paths: { path: string; state: string; plantable: boolean; detail: string | null }[] } | null;
  canaryErr: string | null;
  arming: boolean;
  setArming: Dispatch<SetStateAction<boolean>>;
  loadCanary: () => Promise<void>;
}

export function AccountTab({
  user,
  settings,
  setSettings,
  setMessage,
  recordingLagging,
  panelIps,
  setPanelIps,
  setPendingConfirm,
  oauthCreds,
  setOauthCreds,
  oauthRedirects,
  copiedRedirect,
  setCopiedRedirect,
  canary,
  canaryErr,
  arming,
  setArming,
  loadCanary
}: AccountTabProps) {
  return (
    <>
        <TwoFactorCard />

        {/* 2FA Enforcement. The "(admin only)" in this comment was the ONLY
            thing asserting it — no role check existed, so the toggle rendered
            for every account that reached /settings by URL. `PUT /api/settings`
            is `AdminUser`, so it always refused; a control that refuses is a
            broken promise rather than a leak, which is why it survived. */}
        {user?.role === "admin" && (
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mt-4">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">2FA Enforcement</h3>
          </div>
          <div className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-dark-100">Require 2FA for all users</p>
              <p className="text-xs text-dark-300 mt-0.5">Users without 2FA will see a warning banner on every page</p>
            </div>
            <button
              onClick={async () => {
                const newVal = settings.enforce_2fa !== "true";
                try {
                  await api.put("/settings", { enforce_2fa: newVal ? "true" : "false" });
                  setSettings({ ...settings, enforce_2fa: newVal ? "true" : "false" });
                  setMessage({ text: `2FA enforcement ${newVal ? "enabled" : "disabled"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
              }}
              className={`relative w-11 h-6 rounded-full transition-colors ${settings.enforce_2fa === "true" ? "bg-rust-500" : "bg-dark-600"}`}
            >
              <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.enforce_2fa === "true" ? "translate-x-5" : ""}`} />
            </button>
          </div>
        </div>
        )}

        <PasskeysCard />

        {/* SSH Keys — Security tab */}
        <SSHKeys />

        {/* Auto-Updates — Security tab */}
        <AutoUpdates />

        {/* The "Panel IP Whitelist" card that stood here was removed in v2.90.0: it
            wrote a file on the agent host that nothing read, while telling the operator
            "Whitelist saved (N IPs)". The control that actually restricts panel access
            is Panel IP Allowlist, in Security Hardening further down this tab. */}

        <ChangePasswordCard />

        <SessionsCard />

        {/* Revoke every session PANEL-WIDE. Its own copy said "Admin only." and
            nothing enforced it: the row rendered for anyone who reached
            /settings, and only `POST /api/auth/revoke-all` (an `AdminUser`
            route writing a global `sessions_revoked_at`) refused them. A client
            revoking their OWN sessions is `SessionsCard` above; this is the
            different, panel-wide capability, so it stays here and is gated. */}
        {user?.role === "admin" && (
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Panel-Wide Sessions</h3>
          </div>
          <div className="p-5 flex items-center justify-between gap-4">
            <div>
              <p className="text-sm text-dark-100">Revoke every session, panel-wide</p>
              <p className="text-xs text-dark-300 mt-0.5">
                Logs out <span className="text-warn-400">every user of this panel</span>, not just you.
              </p>
            </div>
            <button onClick={() => setPendingConfirm({ type: "revoke_sessions", label: "Revoke all sessions? All users (including you) will be logged out." })}
              className="shrink-0 px-3 py-1.5 bg-danger-500/10 text-danger-400 rounded text-xs font-medium hover:bg-danger-500/20">Revoke All Sessions</button>
          </div>
        </div>
        )}

        <ExportMyDataCard />

        <ApiKeysCard />

        {/* Security Hardening Settings (admin only) */}
        {user?.role === "admin" && (
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mt-4">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Security Hardening</h3>
            <p className="text-xs text-dark-200 mt-0.5">Post-incident security features</p>
          </div>
          <div className="divide-y divide-dark-700">
            {/* Self-Registration */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Self-Registration</p>
                <p className="text-xs text-dark-400">Allow new users to register accounts</p>
              </div>
              <button onClick={async () => {
                const current = settings.self_registration_enabled === "true";
                const newVal = !current;
                try {
                  await api.put("/settings", { self_registration_enabled: newVal ? "true" : "false" });
                  setSettings(prev => ({ ...prev, self_registration_enabled: newVal ? "true" : "false" }));
                  setMessage({ text: `Registration ${newVal ? "enabled" : "disabled"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
              }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.self_registration_enabled === "true" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.self_registration_enabled === "true" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {/* OAuth Auto-Registration.
                Surfaced at s275. This setting existed and was writable through
                the settings API, but had NO control anywhere in the panel — so
                an operator could turn Self-Registration off above and still have
                new accounts created by anyone who could reach a configured OAuth
                provider, through a switch they could not see.

                Note the comparison: `!== "false"`, not `=== "true"`. The backend
                default for this key is OPEN (an absent row means allowed), which
                is the opposite of the toggle above it. Rendering it the same way
                would show OFF while the server still said yes — a control that
                lies in the reassuring direction. */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">OAuth Auto-Registration</p>
                <p className="text-xs text-dark-400">Create an account on first OAuth sign-in. Turning Self-Registration off also blocks this.</p>
              </div>
              <button onClick={async () => {
                const current = settings.oauth_auto_create !== "false";
                const newVal = !current;
                try {
                  await api.put("/settings", { oauth_auto_create: newVal ? "true" : "false" });
                  setSettings(prev => ({ ...prev, oauth_auto_create: newVal ? "true" : "false" }));
                  setMessage({ text: `OAuth auto-registration ${newVal ? "enabled" : "disabled"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
              }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.oauth_auto_create !== "false" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.oauth_auto_create !== "false" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {/* Registration Approval */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Require Approval for New Users</p>
                <p className="text-xs text-dark-400">New registrations need admin approval before login</p>
              </div>
              <button onClick={async () => {
                const current = settings.security_approval_required === "true";
                const newVal = !current;
                try {
                  await api.put("/settings", { security_approval_required: newVal ? "true" : "false" });
                  setSettings(prev => ({ ...prev, security_approval_required: newVal ? "true" : "false" }));
                  setMessage({ text: `Approval mode ${newVal ? "enabled" : "disabled"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
              }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.security_approval_required === "true" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.security_approval_required === "true" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {/* Geo-IP Alerts */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Geo-IP Login Alerts</p>
                <p className="text-xs text-dark-400">Alert on login from new IPs, VPNs, or datacenters</p>
              </div>
              <button onClick={async () => {
                const current = settings.security_geo_alert_enabled !== "false";
                const newVal = !current;
                try {
                  await api.put("/settings", { security_geo_alert_enabled: newVal ? "true" : "false" });
                  setSettings(prev => ({ ...prev, security_geo_alert_enabled: newVal ? "true" : "false" }));
                  setMessage({ text: `Geo-IP alerts ${newVal ? "enabled" : "disabled"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
              }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.security_geo_alert_enabled !== "false" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.security_geo_alert_enabled !== "false" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {/* Session Recording */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Terminal Session Recording</p>
                <p className="text-xs text-dark-400">Record all terminal sessions for forensic replay</p>
                {/* The toggle is one row in settings, but each server's agent enforces
                    it. An agent older than the gate release ignores the signed claim
                    and records regardless — so without this, switching recording off
                    reports a fleet-wide success that is false for those members. */}
                {recordingLagging.length > 0 && (
                  <p className="text-xs text-warn-400 mt-1">
                    {settings.security_session_recording === "false"
                      ? "Still recording on "
                      : "Not controlled by this toggle on "}
                    {recordingLagging.map((s) => `${s.name} (agent ${s.agent_version})`).join(", ")}
                    {" — update the agent there for this setting to apply."}
                  </p>
                )}
              </div>
              <button onClick={async () => {
                const current = settings.security_session_recording !== "false";
                const newVal = !current;
                try {
                  await api.put("/settings", { security_session_recording: newVal ? "true" : "false" });
                  setSettings(prev => ({ ...prev, security_session_recording: newVal ? "true" : "false" }));
                  setMessage({ text: `Session recording ${newVal ? "enabled" : "disabled"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
              }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.security_session_recording !== "false" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.security_session_recording !== "false" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {/* DB Auto-Backup */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Panel Database Auto-Backup</p>
                <p className="text-xs text-dark-400">Daily PostgreSQL backup with 7-day retention</p>
              </div>
              <button onClick={async () => {
                const current = settings.security_db_backup_enabled !== "false";
                const newVal = !current;
                try {
                  await api.put("/settings", { security_db_backup_enabled: newVal ? "true" : "false" });
                  setSettings(prev => ({ ...prev, security_db_backup_enabled: newVal ? "true" : "false" }));
                  setMessage({ text: `DB auto-backup ${newVal ? "enabled" : "disabled"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
              }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.security_db_backup_enabled !== "false" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.security_db_backup_enabled !== "false" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            {/* Canary Files */}
            <div className="px-5 py-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-dark-100">Canary File Monitoring</p>
                  <p className="text-xs text-dark-400">Detect unauthorized filesystem exploration</p>
                </div>
                <button onClick={async () => {
                  const current = settings.security_canary_enabled !== "false";
                  const newVal = !current;
                  try {
                    await api.put("/settings", { security_canary_enabled: newVal ? "true" : "false" });
                    setSettings(prev => ({ ...prev, security_canary_enabled: newVal ? "true" : "false" }));
                    setMessage({ text: `Canary monitoring ${newVal ? "enabled" : "disabled"}`, type: "success" });
                  } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
                }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.security_canary_enabled !== "false" ? "bg-rust-500" : "bg-dark-600"}`}>
                  <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.security_canary_enabled !== "false" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
                </button>
              </div>
              {/* The switch above reports the SETTING. This reports the TRIPWIRE.
                  They were the same control until v2.132.0, and because nothing in
                  the product planted a canary, "on" meant "watching nothing" on
                  every install — an intrusion detector whose only observable
                  behaviour was silence, which is what a working one looks like. */}
              {settings.security_canary_enabled !== "false" && (
                <div className="mt-2.5">
                  {canaryErr ? (
                    <p className="text-xs text-warn-400">Armed state unavailable ({canaryErr}) — this screen cannot confirm anything is being watched.</p>
                  ) : canary ? (
                    <>
                      <div className="flex items-center justify-between gap-3">
                        <p className={`text-xs ${canary.watching === 0 ? "text-danger-400" : "text-dark-300"}`}>
                          {canary.watching === 0
                            ? "NOT ARMED — no canary file is being watched, so no alert can ever fire."
                            : `Watching ${canary.watching} of ${canary.total} canary paths.`}
                        </p>
                        {canary.armable > 0 && (
                          <button
                            disabled={arming}
                            onClick={async () => {
                              setArming(true);
                              try {
                                const r = await api.post<{ armed: number; total: number; refused: { path: string; reason: string }[] }>("/security/canary/arm", {});
                                await loadCanary();
                                // Report the refusals too. The agent endpoint used to
                                // drop them, which is how three of its four paths went
                                // unplanted without anyone being told.
                                setMessage(
                                  r.refused && r.refused.length > 0
                                    ? { text: `Armed ${r.armed} of ${r.total}. Refused: ${r.refused.map(f => `${f.path} (${f.reason})`).join("; ")}`, type: "error" }
                                    : { text: `Armed ${r.armed} of ${r.total} canary files`, type: "success" }
                                );
                              } catch (e) {
                                setMessage({ text: e instanceof Error ? e.message : "Failed to arm canary files", type: "error" });
                              } finally { setArming(false); }
                            }}
                            className="shrink-0 px-2 py-1 rounded text-xs font-medium bg-rust-500/20 text-rust-400 hover:bg-rust-500/30 disabled:opacity-50"
                          >
                            {arming ? "Arming..." : `Arm ${canary.armable} canary file${canary.armable === 1 ? "" : "s"}`}
                          </button>
                        )}
                      </div>
                      <ul className="mt-1.5 space-y-0.5">
                        {canary.paths.map(p => (
                          <li key={p.path} className="text-xs font-mono flex items-baseline gap-2">
                            <span className={
                              p.state === "watching" ? "text-rust-400"
                                : p.state === "masked" ? "text-dark-400"
                                : "text-warn-400"
                            }>{p.state === "watching" ? "watching" : p.state}</span>
                            <span className="text-dark-300">{p.path}</span>
                            {p.detail && <span className="text-dark-400 font-sans">— {p.detail}</span>}
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <p className="text-xs text-dark-400">Checking what is armed...</p>
                  )}
                </div>
              )}
            </div>
            {/* Lockdown Threshold */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Auto-Lockdown Threshold</p>
                <p className="text-xs text-dark-400">Suspicious events before auto-lockdown triggers (default: 5 in 10 min)</p>
              </div>
              <input type="number" min="2" max="50" value={settings.security_lockdown_threshold || "5"}
                onChange={async (e) => {
                  try {
                    await api.put("/settings", { security_lockdown_threshold: e.target.value });
                    setSettings(prev => ({ ...prev, security_lockdown_threshold: e.target.value }));
                    setMessage({ text: "Threshold updated", type: "success" });
                  } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Failed to save", type: "error" }); }
                }}
                className="w-16 px-2 py-1 border border-dark-500 rounded text-sm text-center focus:ring-2 focus:ring-accent-500 outline-none bg-dark-700"
              />
            </div>
            {/* Lockdown window — the other half of the threshold rule. It had no
                control at all until v2.46.0, so the sentence "5 in 10 min" was
                only half adjustable. Default mirrors the server's own (10). */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Auto-Lockdown Window</p>
                <p className="text-xs text-dark-400">Minutes those suspicious events must fall within (default: 10)</p>
              </div>
              <input type="number" min="1" max="1440" value={settings.security_lockdown_window_minutes || "10"}
                onChange={async (e) => {
                  try {
                    await api.put("/settings", { security_lockdown_window_minutes: e.target.value });
                    setSettings(prev => ({ ...prev, security_lockdown_window_minutes: e.target.value }));
                    setMessage({ text: "Lockdown window updated", type: "success" });
                  } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Failed to save", type: "error" }); }
                }}
                className="w-16 px-2 py-1 border border-dark-500 rounded text-sm text-center focus:ring-2 focus:ring-accent-500 outline-none bg-dark-700"
              />
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Site Creation Rate Limit</p>
                <p className="text-xs text-dark-400">Max sites one user may create per hour (default: 3, 0 = no limit)</p>
              </div>
              <input type="number" min="0" max="999" value={settings.security_site_rate_limit || "3"}
                onChange={async (e) => {
                  try {
                    await api.put("/settings", { security_site_rate_limit: e.target.value });
                    setSettings(prev => ({ ...prev, security_site_rate_limit: e.target.value }));
                    setMessage({ text: "Rate limit updated", type: "success" });
                  } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Failed to save", type: "error" }); }
                }}
                className="w-16 px-2 py-1 border border-dark-500 rounded text-sm text-center focus:ring-2 focus:ring-accent-500 outline-none bg-dark-700"
              />
            </div>
            {/* Server terminal kill switch. The stored key is INVERTED
                (`server_terminal_disabled`) and the server treats an absent row as
                "not disabled", so the toggle reads `!== "true"` — writing it the
                other way round would draw this OFF on every fresh install while
                the terminal was in fact open. */}
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Server Terminal</p>
                <p className="text-xs text-dark-400">Full-server shell for admins. Off leaves per-site terminals working.</p>
              </div>
              <button onClick={async () => {
                const enabled = settings.server_terminal_disabled !== "true";
                const next = enabled ? "true" : "false";
                try {
                  await api.put("/settings", { server_terminal_disabled: next });
                  setSettings(prev => ({ ...prev, server_terminal_disabled: next }));
                  setMessage({ text: `Server terminal ${enabled ? "disabled" : "enabled"}`, type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
              }} className={`relative w-11 h-6 rounded-full transition-colors ${settings.server_terminal_disabled !== "true" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.server_terminal_disabled !== "true" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            <div className="px-5 py-3">
              <p className="text-sm text-dark-100">Panel IP Allowlist</p>
              <p className="text-xs text-dark-400 mb-2">
                Comma-separated IPs or CIDR ranges that may log in. Empty allows every address.
                Requires your reverse proxy to send <code className="font-mono">X-Real-IP</code>; if it does not,
                a non-empty list locks everyone out and only a database edit restores access.
              </p>
              <div className="flex gap-2">
                <input type="text" value={panelIps} onChange={e => setPanelIps(e.target.value)}
                  placeholder="203.0.113.4, 10.0.0.0/8, 2001:db8::/32"
                  className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
                <button onClick={async () => {
                  try {
                    await api.put("/settings", { allowed_panel_ips: panelIps });
                    setSettings(prev => ({ ...prev, allowed_panel_ips: panelIps }));
                    setMessage({ text: panelIps.trim() ? "IP allowlist saved" : "IP allowlist cleared — all addresses allowed", type: "success" });
                  } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
                }} className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600">Save</button>
              </div>
            </div>
          </div>
        </div>
        )}

        {/* Data retention windows. The reader (auto_healer.rs's run_retention_cleanup,
            GAP 67) has existed for a while but had no ALLOWED_KEYS entry and no
            control here — every install was stuck at the hardcoded defaults with no
            way to change them. Found by the first dockpanel loose-ends audit. */}
        {user?.role === "admin" && (
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mt-4">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Data Retention</h3>
            <p className="text-xs text-dark-200 mt-0.5">How long each log/history table keeps rows before the nightly cleanup deletes them.</p>
          </div>
          <div className="divide-y divide-dark-700">
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Activity Log</p>
                <p className="text-xs text-dark-400">Days to keep (default: 365)</p>
              </div>
              <input type="number" min="1" max="3650" value={settings.retention_activity_days || "365"}
                onChange={async (e) => {
                  try {
                    await api.put("/settings", { retention_activity_days: e.target.value });
                    setSettings(prev => ({ ...prev, retention_activity_days: e.target.value }));
                    setMessage({ text: "Activity Log retention updated", type: "success" });
                  } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Failed to save", type: "error" }); }
                }}
                className="w-20 px-2 py-1 border border-dark-500 rounded text-sm text-center focus:ring-2 focus:ring-accent-500 outline-none bg-dark-700"
              />
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">System Logs</p>
                <p className="text-xs text-dark-400">Days to keep (default: 30)</p>
              </div>
              <input type="number" min="1" max="3650" value={settings.retention_system_log_days || "30"}
                onChange={async (e) => {
                  try {
                    await api.put("/settings", { retention_system_log_days: e.target.value });
                    setSettings(prev => ({ ...prev, retention_system_log_days: e.target.value }));
                    setMessage({ text: "System Logs retention updated", type: "success" });
                  } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Failed to save", type: "error" }); }
                }}
                className="w-20 px-2 py-1 border border-dark-500 rounded text-sm text-center focus:ring-2 focus:ring-accent-500 outline-none bg-dark-700"
              />
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Alert History</p>
                <p className="text-xs text-dark-400">Days to keep (default: 90)</p>
              </div>
              <input type="number" min="1" max="3650" value={settings.retention_alert_days || "90"}
                onChange={async (e) => {
                  try {
                    await api.put("/settings", { retention_alert_days: e.target.value });
                    setSettings(prev => ({ ...prev, retention_alert_days: e.target.value }));
                    setMessage({ text: "Alert History retention updated", type: "success" });
                  } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Failed to save", type: "error" }); }
                }}
                className="w-20 px-2 py-1 border border-dark-500 rounded text-sm text-center focus:ring-2 focus:ring-accent-500 outline-none bg-dark-700"
              />
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Security Scan History</p>
                <p className="text-xs text-dark-400">Days to keep (default: 90)</p>
              </div>
              <input type="number" min="1" max="3650" value={settings.retention_scan_days || "90"}
                onChange={async (e) => {
                  try {
                    await api.put("/settings", { retention_scan_days: e.target.value });
                    setSettings(prev => ({ ...prev, retention_scan_days: e.target.value }));
                    setMessage({ text: "Security Scan History retention updated", type: "success" });
                  } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Failed to save", type: "error" }); }
                }}
                className="w-20 px-2 py-1 border border-dark-500 rounded text-sm text-center focus:ring-2 focus:ring-accent-500 outline-none bg-dark-700"
              />
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Webhook Delivery Log</p>
                <p className="text-xs text-dark-400">Days to keep (default: 7)</p>
              </div>
              <input type="number" min="1" max="3650" value={settings.retention_webhook_days || "7"}
                onChange={async (e) => {
                  try {
                    await api.put("/settings", { retention_webhook_days: e.target.value });
                    setSettings(prev => ({ ...prev, retention_webhook_days: e.target.value }));
                    setMessage({ text: "Webhook Delivery Log retention updated", type: "success" });
                  } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Failed to save", type: "error" }); }
                }}
                className="w-20 px-2 py-1 border border-dark-500 rounded text-sm text-center focus:ring-2 focus:ring-accent-500 outline-none bg-dark-700"
              />
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Notification History</p>
                <p className="text-xs text-dark-400">Days to keep (default: 30)</p>
              </div>
              <input type="number" min="1" max="3650" value={settings.retention_notification_days || "30"}
                onChange={async (e) => {
                  try {
                    await api.put("/settings", { retention_notification_days: e.target.value });
                    setSettings(prev => ({ ...prev, retention_notification_days: e.target.value }));
                    setMessage({ text: "Notification History retention updated", type: "success" });
                  } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Failed to save", type: "error" }); }
                }}
                className="w-20 px-2 py-1 border border-dark-500 rounded text-sm text-center focus:ring-2 focus:ring-accent-500 outline-none bg-dark-700"
              />
            </div>
            <div className="px-5 py-3 flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Monitor Check History</p>
                <p className="text-xs text-dark-400">Days to keep (default: 7)</p>
              </div>
              <input type="number" min="1" max="3650" value={settings.retention_monitor_days || "7"}
                onChange={async (e) => {
                  try {
                    await api.put("/settings", { retention_monitor_days: e.target.value });
                    setSettings(prev => ({ ...prev, retention_monitor_days: e.target.value }));
                    setMessage({ text: "Monitor Check History retention updated", type: "success" });
                  } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Failed to save", type: "error" }); }
                }}
                className="w-20 px-2 py-1 border border-dark-500 rounded text-sm text-center focus:ring-2 focus:ring-accent-500 outline-none bg-dark-700"
              />
            </div>
          </div>
        </div>
        )}

        {user?.role === "admin" && <CredentialEncryptionCard setMessage={setMessage} />}

        {/* OAuth Sign-In Providers.
            The six oauth_*_client_id/_client_secret keys were in ALLOWED_KEYS,
            masked on read, encrypted on write and consumed by routes/oauth.rs —
            every part of the path built except the screen. So the panel's one
            unconfigurable setting was a login door, which s277 had just finished
            putting the IP allowlist and lockdown gates on.

            The redirect URI below is fetched from the server, not composed from
            window.location: it is built from BASE_URL, and a panel reached at an
            address other than its configured one would otherwise print a URI the
            server never sends. */}
        {user?.role === "admin" && (
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mt-4">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">OAuth Sign-In</h3>
            <p className="text-xs text-dark-200 mt-0.5">Let users sign in with an external provider. Each configured provider adds a button to the login page.</p>
          </div>
          {oauthRedirects && !oauthRedirects.base_url_configured && (
            <div className="px-5 py-3 border-b border-dark-600 bg-danger-500/5">
              <p className="text-xs text-danger-400">
                <span className="font-medium">BASE_URL is not set</span> in <code className="font-mono">/etc/dockpanel/api.env</code>.
                Redirect URIs are relative without it and no provider will accept one, so sign-in fails after the operator
                has already registered the app. Set it and restart <code className="font-mono">dockpanel-api</code> before configuring below.
              </p>
            </div>
          )}
          <div className="divide-y divide-dark-700">
            {OAUTH_PROVIDERS.map(p => {
              const creds = oauthCreds[p.id] || { id: "", secret: "" };
              const idSet = creds.id.trim() !== "";
              const secretSet = creds.secret.trim() !== "";
              const status = idSet && secretSet ? "active" : idSet || secretSet ? "incomplete" : "unset";
              const redirect = oauthRedirects?.redirect_uris?.[p.id] || "";
              return (
                <div key={p.id} className="px-5 py-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <p className="text-sm text-dark-100">{p.label}</p>
                      <span className={`px-1.5 py-0.5 rounded text-[10px] font-mono uppercase tracking-wider ${
                        status === "active" ? "bg-rust-500/10 text-rust-400"
                        : status === "incomplete" ? "bg-danger-500/10 text-danger-400"
                        : "bg-dark-700 text-dark-400"
                      }`}>
                        {status === "active" ? "Active" : status === "incomplete" ? "Incomplete" : "Not configured"}
                      </span>
                    </div>
                    <a href={p.console} target="_blank" rel="noreferrer" className="text-xs text-rust-400 hover:text-rust-300">
                      {p.label} console →
                    </a>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      <label htmlFor={`oauth-${p.id}-id`} className="block text-xs font-medium text-dark-300 mb-1">Client ID</label>
                      <input
                        id={`oauth-${p.id}-id`}
                        type="text"
                        value={creds.id}
                        onChange={e => setOauthCreds(prev => ({ ...prev, [p.id]: { ...prev[p.id], id: e.target.value } }))}
                        placeholder="Client ID from the provider"
                        className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                      />
                    </div>
                    <div>
                      <label htmlFor={`oauth-${p.id}-secret`} className="block text-xs font-medium text-dark-300 mb-1">Client Secret</label>
                      <input
                        id={`oauth-${p.id}-secret`}
                        type="password"
                        value={creds.secret}
                        onChange={e => setOauthCreds(prev => ({ ...prev, [p.id]: { ...prev[p.id], secret: e.target.value } }))}
                        placeholder="Client secret"
                        className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                      />
                    </div>
                  </div>
                  {redirect && (
                    <div>
                      <p className="text-xs text-dark-400 mb-1">Register this redirect URI at {p.label}:</p>
                      <div className="flex gap-2">
                        <code className="flex-1 px-2 py-1.5 bg-dark-900 rounded text-xs font-mono text-dark-100 break-all">{redirect}</code>
                        <button
                          onClick={() => { navigator.clipboard.writeText(redirect); setCopiedRedirect(p.id); }}
                          className="px-2 py-1 bg-dark-700 rounded text-xs text-dark-200 shrink-0 hover:bg-dark-600"
                        >{copiedRedirect === p.id ? "Copied" : "Copy"}</button>
                      </div>
                    </div>
                  )}
                  <div className="flex justify-end">
                    <button
                      onClick={async () => {
                        const id = creds.id.trim();
                        const secret = creds.secret.trim();
                        // A client ID alone is the trap worth refusing: the public
                        // branding endpoint lists a provider as soon as its
                        // client_id is non-empty, so a half-save puts a working
                        // button on the login page that dead-ends at the callback
                        // with "OAuth not fully configured" — visible to every
                        // logged-out visitor, diagnosable by nobody.
                        if (id && !secret) {
                          setMessage({ text: `${p.label}: a client secret is required — with only a client ID the button appears on the login page and sign-in fails at the callback`, type: "error" });
                          return;
                        }
                        if (!id && secret && secret !== "********") {
                          setMessage({ text: `${p.label}: a client ID is required to use this secret`, type: "error" });
                          return;
                        }
                        const body: Record<string, string> = { [`oauth_${p.id}_client_id`]: id };
                        // The mask means "unchanged" — the backend skips it. Send
                        // the secret only when it is a real new value, and clear
                        // it explicitly when the ID is being removed, so disabling
                        // a provider does not leave its secret behind.
                        if (!id) {
                          body[`oauth_${p.id}_client_secret`] = "";
                        } else if (secret && secret !== "********") {
                          body[`oauth_${p.id}_client_secret`] = secret;
                        }
                        try {
                          await api.put("/settings", body);
                          setSettings(prev => ({ ...prev, ...body }));
                          if (!id) {
                            setOauthCreds(prev => ({ ...prev, [p.id]: { id: "", secret: "" } }));
                            setMessage({ text: `${p.label} sign-in disabled`, type: "success" });
                          } else {
                            setOauthCreds(prev => ({ ...prev, [p.id]: { ...prev[p.id], secret: "********" } }));
                            setMessage({ text: `${p.label} sign-in configured`, type: "success" });
                          }
                        } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
                      }}
                      className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
                    >{idSet ? "Save" : "Save / Disable"}</button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        )}
    </>
  );
}
