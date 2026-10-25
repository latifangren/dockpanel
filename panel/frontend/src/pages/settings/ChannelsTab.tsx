// Moved verbatim from panel/frontend/src/pages/Settings.tsx (channels tab, original lines 2054-2425).
// The shell in Settings.tsx keeps all state, loaders and helpers;
// this component destructures exactly the shell identifiers it uses,
// under the same names, so the JSX body below is unchanged.
import { api } from "../../api";
import { SUPPRESSIBLE_ALERT_TYPES, RECORD_COLUMN_BY_TYPE, NOTIF_CHANNELS, NOTIF_PLACEHOLDERS } from "../Settings";
import type { Dispatch, SetStateAction } from "react";

interface ChannelsTabProps {
  user: any;
  setSettings: Dispatch<SetStateAction<Record<string, string>>>;
  saving: string | null;
  setSaving: Dispatch<SetStateAction<string | null>>;
  setMessage: Dispatch<SetStateAction<{ text: string; type: string }>>;
  notifySlackUrl: string;
  setNotifySlackUrl: Dispatch<SetStateAction<string>>;
  notifyDiscordUrl: string;
  setNotifyDiscordUrl: Dispatch<SetStateAction<string>>;
  notifyPagerdutyKey: string;
  setNotifyPagerdutyKey: Dispatch<SetStateAction<string>>;
  notifyEmail: boolean;
  setNotifyEmail: Dispatch<SetStateAction<boolean>>;
  testingWebhook: string | null;
  setTestingWebhook: Dispatch<SetStateAction<string | null>>;
  webhookResult: { type: string; msg: string };
  setWebhookResult: Dispatch<SetStateAction<{ type: string; msg: string }>>;
  mutedTypes: string[];
  setMutedTypes: Dispatch<SetStateAction<string[]>>;
  recordTypes: Record<string, boolean>;
  setRecordTypes: Dispatch<SetStateAction<Record<string, boolean>>>;
  alertRuleId: string | null;
  escalationPolicyId: string;
  setEscalationPolicyId: Dispatch<SetStateAction<string>>;
  escalationPolicies: { id: string; name: string }[];
  gpuAlertEnabled: boolean;
  setGpuAlertEnabled: Dispatch<SetStateAction<boolean>>;
  gpuUtilThreshold: number;
  setGpuUtilThreshold: Dispatch<SetStateAction<number>>;
  gpuUtilDuration: number;
  setGpuUtilDuration: Dispatch<SetStateAction<number>>;
  gpuTempThreshold: number;
  setGpuTempThreshold: Dispatch<SetStateAction<number>>;
  gpuVramThreshold: number;
  setGpuVramThreshold: Dispatch<SetStateAction<number>>;
  notifTemplates: Record<string, string>;
  setNotifTemplates: Dispatch<SetStateAction<Record<string, string>>>;
  loadNotifyChannels: () => Promise<void>;
}

export function ChannelsTab({
  user,
  setSettings,
  saving,
  setSaving,
  setMessage,
  notifySlackUrl,
  setNotifySlackUrl,
  notifyDiscordUrl,
  setNotifyDiscordUrl,
  notifyPagerdutyKey,
  setNotifyPagerdutyKey,
  notifyEmail,
  setNotifyEmail,
  testingWebhook,
  setTestingWebhook,
  webhookResult,
  setWebhookResult,
  mutedTypes,
  setMutedTypes,
  recordTypes,
  setRecordTypes,
  alertRuleId,
  escalationPolicyId,
  setEscalationPolicyId,
  escalationPolicies,
  gpuAlertEnabled,
  setGpuAlertEnabled,
  gpuUtilThreshold,
  setGpuUtilThreshold,
  gpuUtilDuration,
  setGpuUtilDuration,
  gpuTempThreshold,
  setGpuTempThreshold,
  gpuVramThreshold,
  setGpuVramThreshold,
  notifTemplates,
  setNotifTemplates,
  loadNotifyChannels
}: ChannelsTabProps) {
  return (
    <>
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Notification Channels</h3>
            <p className="text-xs text-dark-200 mt-0.5">Where to send alert notifications</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-3">
              <input
                type="checkbox"
                id="notify-email"
                checked={notifyEmail}
                onChange={(e) => setNotifyEmail(e.target.checked)}
                className="rounded border-dark-500 text-rust-500 focus:ring-accent-500"
              />
              <label htmlFor="notify-email" className="text-sm text-dark-100">Email notifications</label>
            </div>
            <div>
              <label htmlFor="notify-slack" className="block text-sm font-medium text-dark-100 mb-1">Slack Webhook URL</label>
              <div className="flex gap-2">
                <input
                  id="notify-slack"
                  type="url"
                  value={notifySlackUrl}
                  onChange={(e) => setNotifySlackUrl(e.target.value)}
                  className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none font-mono"
                  placeholder="https://hooks.slack.com/services/..."
                />
                <button
                  disabled={!notifySlackUrl || testingWebhook === "slack"}
                  onClick={async () => {
                    setTestingWebhook("slack");
                    setWebhookResult({ type: "", msg: "" });
                    try {
                      await api.post("/settings/test-webhook", { url: notifySlackUrl, service: "slack" });
                      setWebhookResult({ type: "slack-ok", msg: "Sent!" });
                    } catch (e) {
                      setWebhookResult({ type: "slack-err", msg: e instanceof Error ? e.message : "Failed" });
                    } finally {
                      setTestingWebhook(null);
                    }
                  }}
                  className="px-3 py-2 bg-dark-700 text-dark-100 rounded-lg text-xs font-medium hover:bg-dark-600 disabled:opacity-50 shrink-0"
                >
                  {testingWebhook === "slack" ? "Testing..." : "Test"}
                </button>
              </div>
              {webhookResult.type === "slack-ok" && <p className="text-xs text-rust-400 mt-1">{webhookResult.msg}</p>}
              {webhookResult.type === "slack-err" && <p className="text-xs text-danger-400 mt-1">{webhookResult.msg}</p>}
            </div>
            <div>
              <label htmlFor="notify-discord" className="block text-sm font-medium text-dark-100 mb-1">Discord Webhook URL</label>
              <div className="flex gap-2">
                <input
                  id="notify-discord"
                  type="url"
                  value={notifyDiscordUrl}
                  onChange={(e) => setNotifyDiscordUrl(e.target.value)}
                  className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none font-mono"
                  placeholder="https://discord.com/api/webhooks/..."
                />
                <button
                  disabled={!notifyDiscordUrl || testingWebhook === "discord"}
                  onClick={async () => {
                    setTestingWebhook("discord");
                    setWebhookResult({ type: "", msg: "" });
                    try {
                      await api.post("/settings/test-webhook", { url: notifyDiscordUrl, service: "discord" });
                      setWebhookResult({ type: "discord-ok", msg: "Sent!" });
                    } catch (e) {
                      setWebhookResult({ type: "discord-err", msg: e instanceof Error ? e.message : "Failed" });
                    } finally {
                      setTestingWebhook(null);
                    }
                  }}
                  className="px-3 py-2 bg-dark-700 text-dark-100 rounded-lg text-xs font-medium hover:bg-dark-600 disabled:opacity-50 shrink-0"
                >
                  {testingWebhook === "discord" ? "Testing..." : "Test"}
                </button>
              </div>
              {webhookResult.type === "discord-ok" && <p className="text-xs text-rust-400 mt-1">{webhookResult.msg}</p>}
              {webhookResult.type === "discord-err" && <p className="text-xs text-danger-400 mt-1">{webhookResult.msg}</p>}
            </div>
            <div>
              <label htmlFor="notify-pagerduty" className="block text-sm font-medium text-dark-100 mb-1">PagerDuty Integration Key</label>
              <input
                id="notify-pagerduty"
                type="text"
                value={notifyPagerdutyKey}
                onChange={(e) => setNotifyPagerdutyKey(e.target.value)}
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none font-mono"
                placeholder="Integration key from PagerDuty service"
              />
              <p className="text-xs text-dark-300 mt-1">Events API v2 integration key. Get it from PagerDuty &gt; Services &gt; Integrations.</p>
            </div>
            {/* Escalation policy — attached through its own admin-only endpoint, so it
                applies the moment it is picked rather than waiting on Save below. */}
            <div className="bg-dark-800 rounded-lg border border-dark-600 p-5 space-y-2">
              <label htmlFor="escalation-policy" className="block text-sm font-medium text-dark-100">Escalation Policy</label>
              <select
                id="escalation-policy"
                value={escalationPolicyId}
                disabled={!alertRuleId}
                onChange={async (e) => {
                  const next = e.target.value;
                  const previous = escalationPolicyId;
                  setEscalationPolicyId(next);
                  try {
                    await api.put(`/alert-rules/${alertRuleId}/escalation-policy`, { policy_id: next || null });
                    setMessage({ text: next ? "Escalation policy attached" : "Escalation policy removed", type: "success" });
                  } catch (err) {
                    // Put the picker back where it was — leaving it showing a policy the
                    // rule does not carry is the same lie this release is about.
                    setEscalationPolicyId(previous);
                    setMessage({ text: err instanceof Error ? err.message : "Failed to attach policy", type: "error" });
                  }
                }}
                className="w-full px-3 py-2 bg-dark-900 border border-dark-500 rounded-lg text-sm text-dark-50 outline-none disabled:opacity-50"
              >
                <option value="">No escalation (default cadence)</option>
                {escalationPolicies.map(p => <option key={p.id} value={p.id}>{p.name}</option>)}
              </select>
              <p className="text-xs text-dark-300">
                {!alertRuleId
                  ? "Save your notification settings once to create an alert rule, then choose a policy."
                  : escalationPolicies.length === 0
                    ? "No policies yet — build one on the Alerts page under Escalation."
                    : "Unacknowledged alerts follow this chain instead of the built-in reminder cadence, then keep re-paging its last step every 30 minutes until acknowledged."}
              </p>
            </div>
            {/* Alert Behaviour — one row per type, Record and Notify side by side.
                These are two different switches and were previously two different
                shapes: a checkbox grid for muting, and nothing at all for the
                record columns, which were reachable only through Export/Import
                Config. A single row per type is what makes the difference
                legible — the alternative on the table was a second grid beside
                the first, one meaning "don't page me" and the other "don't
                record it".
                Both columns read positively: ticked = it happens. The mute grid
                this replaces was inverted (ticked = suppressed), which could not
                survive sitting next to a Record column without misreading. */}
            <div className="bg-dark-800 rounded-lg border border-dark-600 p-5 space-y-3">
              <h3 className="text-sm font-medium text-dark-100 font-mono">Alert Behaviour</h3>
              <p className="text-xs text-dark-400">
                <span className="text-dark-200">Record</span> keeps the alert inside the panel — the alert row, the
                bell, and any status-page incident. Switched off, the event is never created at all.{" "}
                <span className="text-dark-200">Notify</span> governs only the external send — Slack, Discord,
                PagerDuty, webhooks. Switched off, the alert is still recorded; you just are not paged for it.
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-xs font-mono uppercase tracking-widest text-dark-400">
                      <th className="text-left font-normal py-2">Type</th>
                      <th className="text-center font-normal py-2 w-24">Record</th>
                      <th className="text-center font-normal py-2 w-24">Notify</th>
                    </tr>
                  </thead>
                  <tbody>
                    {SUPPRESSIBLE_ALERT_TYPES.map(({ key, label }) => {
                      const column = RECORD_COLUMN_BY_TYPE[key];
                      const recorded = column === "alert_gpu" ? gpuAlertEnabled : column ? recordTypes[column] : true;
                      return (
                        <tr key={key} className="border-t border-dark-700">
                          <td className="py-2 text-dark-200">{label}</td>
                          <td className="py-2 text-center">
                            {column ? (
                              <input
                                type="checkbox"
                                aria-label={`Record ${label} alerts`}
                                checked={recorded}
                                onChange={e => {
                                  if (column === "alert_gpu") setGpuAlertEnabled(e.target.checked);
                                  else setRecordTypes({ ...recordTypes, [column]: e.target.checked });
                                }}
                                className="rounded border-dark-500 bg-dark-900 text-rust-500 focus:ring-rust-500"
                              />
                            ) : (
                              <span className="text-dark-500" title="Always recorded — this type has no record switch">&mdash;</span>
                            )}
                          </td>
                          <td className="py-2 text-center">
                            <input
                              type="checkbox"
                              aria-label={`Notify externally for ${label} alerts`}
                              checked={!mutedTypes.includes(key)}
                              onChange={e => setMutedTypes(
                                e.target.checked ? mutedTypes.filter(t => t !== key) : [...mutedTypes, key]
                              )}
                              className="rounded border-dark-500 bg-dark-900 text-rust-500 focus:ring-rust-500"
                            />
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              <p className="text-xs text-dark-500">
                &mdash; means the type is always recorded and has no switch. The three GPU rows share a single
                switch, the same one the GPU card below uses.
              </p>
            </div>
            {/* GPU Alert Thresholds */}
            <div className="bg-dark-800 rounded-lg border border-dark-600 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-medium text-dark-100 font-mono">GPU Alert Thresholds</h3>
                  <p className="text-xs text-dark-400 mt-0.5">Configure when GPU alerts fire. Only applies to servers with NVIDIA GPUs. The Enabled box is the same switch as the three GPU rows in the grid above &mdash; one value, shown in both places.</p>
                </div>
                <label className="flex items-center gap-2 text-sm text-dark-200 cursor-pointer">
                  <input type="checkbox" checked={gpuAlertEnabled} onChange={e => setGpuAlertEnabled(e.target.checked)}
                    className="rounded border-dark-500 bg-dark-900 text-rust-500 focus:ring-rust-500" />
                  Enabled
                </label>
              </div>
              {gpuAlertEnabled && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono text-dark-300 uppercase tracking-widest mb-1">Utilization threshold</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="50" max="100" value={gpuUtilThreshold} onChange={e => setGpuUtilThreshold(Number(e.target.value))}
                        className="flex-1 accent-rust-500" />
                      <span className="text-sm text-dark-100 font-mono w-12 text-right">{gpuUtilThreshold}%</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-dark-300 uppercase tracking-widest mb-1">Utilization duration</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="1" max="30" value={gpuUtilDuration} onChange={e => setGpuUtilDuration(Number(e.target.value))}
                        className="flex-1 accent-rust-500" />
                      <span className="text-sm text-dark-100 font-mono w-16 text-right">{gpuUtilDuration} min</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-dark-300 uppercase tracking-widest mb-1">Temperature threshold</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="60" max="110" value={gpuTempThreshold} onChange={e => setGpuTempThreshold(Number(e.target.value))}
                        className="flex-1 accent-rust-500" />
                      <span className="text-sm text-dark-100 font-mono w-12 text-right">{gpuTempThreshold}°C</span>
                    </div>
                  </div>
                  <div>
                    <label className="block text-xs font-mono text-dark-300 uppercase tracking-widest mb-1">VRAM threshold</label>
                    <div className="flex items-center gap-2">
                      <input type="range" min="50" max="100" value={gpuVramThreshold} onChange={e => setGpuVramThreshold(Number(e.target.value))}
                        className="flex-1 accent-rust-500" />
                      <span className="text-sm text-dark-100 font-mono w-12 text-right">{gpuVramThreshold}%</span>
                    </div>
                  </div>
                </div>
              )}
            </div>
            <div className="flex justify-end">
              <button
                onClick={async () => {
                  setSaving("notify");
                  setMessage({ text: "", type: "" });
                  try {
                    // Send the field exactly as the operator left it, empty included.
                    // Substituting a null for an empty box made clearing a destination
                    // impossible: the handler COALESCEs a null onto the stored value, so
                    // the old webhook survived, alerts kept being posted to it, and the
                    // save still answered "Notification channels saved". An empty string
                    // is the safe sentinel at both ends — the SSRF validators skip a
                    // blank field rather than rejecting it, and every sender guards on
                    // the value being non-empty before it delivers.
                    await api.put("/alert-rules", {
                      notify_email: notifyEmail,
                      notify_slack_url: notifySlackUrl,
                      notify_discord_url: notifyDiscordUrl,
                      notify_pagerduty_key: notifyPagerdutyKey,
                      muted_types: mutedTypes.join(','),
                      // Explicit booleans, never omitted: upsert_rules COALESCEs
                      // a null onto the stored value, so a missing field would
                      // make switching a type OFF silently impossible.
                      alert_cpu: recordTypes.alert_cpu,
                      alert_memory: recordTypes.alert_memory,
                      alert_disk: recordTypes.alert_disk,
                      alert_offline: recordTypes.alert_offline,
                      alert_backup_failure: recordTypes.alert_backup_failure,
                      alert_ssl_expiry: recordTypes.alert_ssl_expiry,
                      alert_service_health: recordTypes.alert_service_health,
                      alert_gpu: gpuAlertEnabled,
                      gpu_util_threshold: gpuUtilThreshold,
                      gpu_util_duration: gpuUtilDuration,
                      gpu_temp_threshold: gpuTempThreshold,
                      gpu_vram_threshold: gpuVramThreshold,
                    });
                    setMessage({ text: "Notification channels saved", type: "success" });
                    // Re-read so the escalation picker learns the rule id on the first
                    // save, when the row is created rather than updated.
                    await loadNotifyChannels();
                  } catch (e) {
                    setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" });
                  } finally {
                    setSaving(null);
                  }
                }}
                disabled={saving === "notify"}
                className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
              >
                {saving === "notify" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* An "Additional Settings" card lived here until v2.46.0 with two inputs:
            an email footer "appended to notification emails" and an events webhook
            that "receives POST for site.create, app.deploy, security.scan". Both
            saved successfully and neither was ever read — no code appends the
            footer, and nothing POSTs anywhere. Removed rather than left lying;
            they come back with the code that honours them. */}

        {/* Notification Templates (Gap #70).
            The mirror image of the card removed above: these four keys ARE read
            — services/notifications.rs::format_message looks up
            notif_template_{channel} on every alert and substitutes into it — and
            had no control, so the feature existed only for whoever could reach
            the settings API by hand. */}
        {user?.role === "admin" && (
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mt-4">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Notification Templates</h3>
            <p className="text-xs text-dark-200 mt-0.5">Custom message format per channel. Leave a field empty to use the built-in format.</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-dark-400">Placeholders:</span>
              {NOTIF_PLACEHOLDERS.map(ph => (
                <code key={ph} className="px-1.5 py-0.5 bg-dark-900 rounded text-xs font-mono text-rust-400">{ph}</code>
              ))}
              <span className="text-xs text-dark-400">— anything else is sent literally.</span>
            </div>
            {NOTIF_CHANNELS.map(c => (
              <div key={c.id}>
                <label htmlFor={`notif-tmpl-${c.id}`} className="block text-sm font-medium text-dark-100 mb-1">{c.label}</label>
                <p className="text-xs text-dark-400 mb-1">{c.hint}</p>
                <textarea
                  id={`notif-tmpl-${c.id}`}
                  rows={c.rows}
                  value={notifTemplates[c.id] || ""}
                  onChange={e => setNotifTemplates(prev => ({ ...prev, [c.id]: e.target.value }))}
                  placeholder="Leave empty for the default format"
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                />
              </div>
            ))}
            <div className="flex justify-end">
              <button
                onClick={async () => {
                  setSaving("templates");
                  try {
                    const body = Object.fromEntries(
                      NOTIF_CHANNELS.map(c => [`notif_template_${c.id}`, notifTemplates[c.id] || ""])
                    );
                    await api.put("/settings", body);
                    setSettings(prev => ({ ...prev, ...body }));
                    setMessage({ text: "Notification templates saved", type: "success" });
                  } catch (e) {
                    setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" });
                  } finally {
                    setSaving(null);
                  }
                }}
                disabled={saving === "templates"}
                className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
              >{saving === "templates" ? "Saving..." : "Save Templates"}</button>
            </div>
          </div>
        </div>
        )}
    </>
  );
}
