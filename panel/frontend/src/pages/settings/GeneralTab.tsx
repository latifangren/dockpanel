// Moved verbatim from panel/frontend/src/pages/Settings.tsx (general tab, original lines 651-1246).
// The shell in Settings.tsx keeps all state, loaders and helpers;
// this component destructures exactly the shell identifiers it uses,
// under the same names, so the JSX body below is unchanged.
import { api } from "../../api";
import { applyTheme } from "../../hooks/useLayoutState";
import { THEME_SWATCHES, DEFAULT_SWATCH } from "../Settings";
import type { CleanupResult, ExportConfig } from "../Settings";
import type { Dispatch, SetStateAction } from "react";

interface GeneralTabProps {
  settings: Record<string, string>;
  setSettings: Dispatch<SetStateAction<Record<string, string>>>;
  saving: string | null;
  setMessage: Dispatch<SetStateAction<{ text: string; type: string }>>;
  panelName: string;
  setPanelName: Dispatch<SetStateAction<string>>;
  baseUrl: string;
  setBaseUrl: Dispatch<SetStateAction<string>>;
  autoHealEnabled: boolean;
  setAutoHealEnabled: Dispatch<SetStateAction<boolean>>;
  autoHealReclaim: boolean;
  setAutoHealReclaim: Dispatch<SetStateAction<boolean>>;
  reverseProxy: string;
  setReverseProxy: Dispatch<SetStateAction<string>>;
  traefikInstalling: boolean;
  setTraefikInstalling: Dispatch<SetStateAction<boolean>>;
  showTraefikEmail: boolean;
  setShowTraefikEmail: Dispatch<SetStateAction<boolean>>;
  traefikEmail: string;
  setTraefikEmail: Dispatch<SetStateAction<string>>;
  hostname: string;
  setHostname: Dispatch<SetStateAction<string>>;
  currentTheme: string;
  setCurrentTheme: Dispatch<SetStateAction<string>>;
  showHeader: boolean;
  setShowHeader: Dispatch<SetStateAction<boolean>>;
  flatNav: boolean;
  setFlatNav: Dispatch<SetStateAction<boolean>>;
  setPendingConfirm: Dispatch<SetStateAction<{ type: string; label: string; data?: Record<string, unknown> } | null>>;
  saveGeneral: () => Promise<void>;
}

export function GeneralTab({
  settings,
  setSettings,
  saving,
  setMessage,
  panelName,
  setPanelName,
  baseUrl,
  setBaseUrl,
  autoHealEnabled,
  setAutoHealEnabled,
  autoHealReclaim,
  setAutoHealReclaim,
  reverseProxy,
  setReverseProxy,
  traefikInstalling,
  setTraefikInstalling,
  showTraefikEmail,
  setShowTraefikEmail,
  traefikEmail,
  setTraefikEmail,
  hostname,
  setHostname,
  currentTheme,
  setCurrentTheme,
  showHeader,
  setShowHeader,
  flatNav,
  setFlatNav,
  setPendingConfirm,
  saveGeneral
}: GeneralTabProps) {
  return (
    <>
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">General Settings</h3>
          </div>
          <div className="p-5 space-y-4">
            <div>
              <label htmlFor="panel_name" className="block text-sm font-medium text-dark-100 mb-1">Panel Name</label>
              <input
                id="panel_name"
                type="text"
                value={panelName}
                onChange={(e) => setPanelName(e.target.value)}
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                placeholder="DockPanel"
              />
            </div>
            <div>
              <label htmlFor="base_url" className="block text-sm font-medium text-dark-100 mb-1">Panel URL</label>
              <input
                id="base_url"
                type="url"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                placeholder="https://panel.example.com"
              />
              <p className="text-xs text-dark-200 mt-1">
                Where this panel is reachable. Alert notifications use it to link to the
                matching runbook — leave it empty and alerts are still delivered, but
                without the link.
              </p>
            </div>
            <div className="flex justify-end">
              <button
                onClick={saveGeneral}
                disabled={saving === "general"}
                className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
              >
                {saving === "general" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>

        {/* Auto-Healing — part of General tab */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Auto-Healing</h3>
            <p className="text-xs text-dark-200 mt-0.5">Automatically fix common issues when detected</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Enable auto-healing</p>
                <p className="text-xs text-dark-300 mt-0.5">
                  Auto-restarts crashed services, frees disk space on the server whose disk alert is firing, renews expiring SSL certs
                </p>
              </div>
              <button
                onClick={async () => {
                  const newVal = !autoHealEnabled;
                  try {
                    await api.put("/settings", { auto_heal_enabled: newVal ? "true" : "false" });
                    setAutoHealEnabled(newVal);
                    setMessage({ text: `Auto-healing ${newVal ? "enabled" : "disabled"}`, type: "success" });
                  } catch (e) {
                    setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" });
                  }
                }}
                role="switch"
                aria-checked={autoHealEnabled}
                aria-label="Enable auto-healing"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoHealEnabled ? "bg-rust-500" : "bg-dark-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoHealEnabled ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
            {autoHealEnabled && (
              <>
                <div className="text-xs text-dark-300 space-y-1 pl-4 border-l-2 border-dark-600">
                  <p>Crashed services are restarted (max once per 10 minutes)</p>
                  <p>Oversized logs and <span className="font-mono">/tmp</span> files older than 7 days are cleaned when a server crosses its disk threshold (default 85%) — on that server, at most once per hour</p>
                  <p>SSL certs are renewed on the CA's ACME Renewal Information (ARI) schedule, or a profile-aware fallback (2d for shortlived, 15d for tlsserver, 30d for classic). Max once per 6 hours per domain.</p>
                  <p>All actions are logged in the Audit Log page</p>
                </div>

                {/* Docker reclamation is a SEPARATE consent. Until v2.56.0 this ran as
                    part of "cleans logs" and was `docker system prune -af --volumes`. */}
                <div className="flex items-center justify-between pt-2">
                  <div className="pr-4">
                    <p className="text-sm text-dark-100">Also reclaim unused Docker resources</p>
                    <p className="text-xs text-dark-300 mt-0.5">
                      When a disk alert triggers cleanup, additionally remove <span className="font-medium">dangling images, build cache and unattached networks that DockPanel does not manage</span>.
                      Containers, volumes and images belonging to your apps are never touched — including apps that are only sleeping.
                    </p>
                  </div>
                  <button
                    onClick={async () => {
                      const newVal = !autoHealReclaim;
                      try {
                        await api.put("/settings", { auto_heal_docker_reclaim: newVal ? "true" : "false" });
                        setAutoHealReclaim(newVal);
                        setMessage({ text: `Docker reclamation ${newVal ? "enabled" : "disabled"}`, type: "success" });
                      } catch (e) {
                        setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" });
                      }
                    }}
                    role="switch"
                    aria-checked={autoHealReclaim}
                    aria-label="Reclaim unused Docker resources during disk cleanup"
                    className={`relative shrink-0 inline-flex h-6 w-11 items-center rounded-full transition-colors ${autoHealReclaim ? "bg-rust-500" : "bg-dark-600"}`}
                  >
                    <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${autoHealReclaim ? "translate-x-6" : "translate-x-1"}`} />
                  </button>
                </div>
              </>
            )}
          </div>
        </div>

        {/* Reverse Proxy — Traefik option */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Reverse Proxy</h3>
            <p className="text-xs text-dark-200 mt-0.5">Choose nginx or Traefik for Docker app routing</p>
          </div>
          <div className="p-5 space-y-4">
            <div className="flex items-center gap-4">
              <button
                onClick={async () => {
                  if (reverseProxy === "traefik") {
                    setPendingConfirm({ type: "traefik_uninstall", label: "Switch back to nginx? Existing Docker apps with domains will need redeployment." });
                  }
                }}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-mono text-center transition-colors ${reverseProxy === "nginx" ? "border-rust-500 bg-rust-500/10 text-rust-400" : "border-dark-600 bg-dark-900 text-dark-300 hover:border-dark-400 cursor-pointer"}`}
              >
                <div className="font-bold">nginx</div>
                <div className="text-xs text-dark-400 mt-1">Default, serves PHP/static + proxy</div>
              </button>
              <button
                onClick={() => {
                  if (reverseProxy === "nginx") {
                    setShowTraefikEmail(true);
                    setTraefikEmail("admin@example.com");
                  }
                }}
                disabled={traefikInstalling || showTraefikEmail}
                className={`flex-1 px-4 py-3 rounded-lg border text-sm font-mono text-center transition-colors ${reverseProxy === "traefik" ? "border-rust-500 bg-rust-500/10 text-rust-400" : "border-dark-600 bg-dark-900 text-dark-300 hover:border-dark-400 cursor-pointer"} disabled:opacity-50`}
              >
                <div className="font-bold">{traefikInstalling ? "Installing..." : "Traefik"}</div>
                <div className="text-xs text-dark-400 mt-1">Docker-native, auto-SSL, dashboard</div>
              </button>
            </div>
            {showTraefikEmail && (
              <div className="flex items-center gap-2 mt-3 px-1">
                <label className="text-xs text-dark-300">ACME email for Let's Encrypt:</label>
                <input
                  type="email"
                  value={traefikEmail}
                  onChange={(e) => setTraefikEmail(e.target.value)}
                  onKeyDown={async (e) => {
                    if (e.key === "Enter") {
                      if (!traefikEmail.includes("@") || !traefikEmail.includes(".")) { setMessage({ text: "Invalid email address", type: "error" }); return; }
                      setShowTraefikEmail(false);
                      setTraefikInstalling(true);
                      try {
                        await api.post("/traefik/install", { acme_email: traefikEmail });
                        setReverseProxy("traefik");
                        setMessage({ text: "Traefik installed and active", type: "success" });
                      } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Failed", type: "error" }); }
                      finally { setTraefikInstalling(false); }
                    }
                    if (e.key === "Escape") setShowTraefikEmail(false);
                  }}
                  autoFocus
                  className="flex-1 px-3 py-1.5 bg-dark-900 border border-dark-500 rounded text-sm text-dark-100"
                  placeholder="you@example.com"
                />
                <button
                  onClick={async () => {
                    if (!traefikEmail.includes("@") || !traefikEmail.includes(".")) { setMessage({ text: "Invalid email address", type: "error" }); return; }
                    setShowTraefikEmail(false);
                    setTraefikInstalling(true);
                    try {
                      await api.post("/traefik/install", { acme_email: traefikEmail });
                      setReverseProxy("traefik");
                      setMessage({ text: "Traefik installed and active", type: "success" });
                    } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Failed", type: "error" }); }
                    finally { setTraefikInstalling(false); }
                  }}
                  className="px-3 py-1.5 bg-rust-500 text-white rounded text-xs font-medium"
                >Install</button>
                <button onClick={() => setShowTraefikEmail(false)} className="px-3 py-1.5 bg-dark-600 text-dark-200 rounded text-xs font-medium">Cancel</button>
              </div>
            )}
            {reverseProxy === "traefik" && (
              <div className="text-xs text-dark-300 space-y-1 pl-4 border-l-2 border-rust-500/30">
                <p>Traefik handles Docker app routing via container labels</p>
                <p>Auto-SSL via Let's Encrypt (no manual cert provisioning)</p>
                <p>Dashboard: <a href="http://127.0.0.1:8080" target="_blank" rel="noreferrer" className="text-rust-400 hover:text-rust-300">http://127.0.0.1:8080</a></p>
                <p>Sites (PHP/static) still use nginx</p>
              </div>
            )}
          </div>
        </div>

        {/* Public Status Page — part of General tab */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Public Status Page</h3>
            <p className="text-xs text-dark-200 mt-0.5">The master switch for everything served publicly at /status — off by default</p>
          </div>
          <div className="p-5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Enable public status page</p>
                <p className="text-xs text-dark-300 mt-0.5">
                  Publishes, to anyone on the internet with no login: every enabled monitor's name and
                  status, your status-page components, and any incident marked visible on the status page —
                  including the ones the alert engine files for you, whose titles name your servers and
                  services. Appearance and history are configured under Incidents.
                </p>
              </div>
              <button
                onClick={async () => {
                  const newVal = settings.status_page_enabled !== "true";
                  try {
                    await api.put("/settings", { status_page_enabled: newVal ? "true" : "false" });
                    setSettings({ ...settings, status_page_enabled: newVal ? "true" : "false" });
                    setMessage({ text: `Status page ${newVal ? "enabled" : "disabled"}`, type: "success" });
                  } catch (e) {
                    setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" });
                  }
                }}
                role="switch"
                aria-checked={settings.status_page_enabled === "true"}
                aria-label="Enable public status page"
                className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${settings.status_page_enabled === "true" ? "bg-rust-500" : "bg-dark-600"}`}
              >
                <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${settings.status_page_enabled === "true" ? "translate-x-6" : "translate-x-1"}`} />
              </button>
            </div>
          </div>
        </div>

        {/* A timezone selector lived here until v2.46.0, claiming to "affect
            displayed timestamps throughout the panel". Nothing read the key —
            not the backend, not this frontend — so every timestamp stayed UTC.
            Removed rather than left lying; re-add it together with the
            formatting it promises, not before. */}

        {/* Feature #2: Branding */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Branding</h3>
          </div>
          <div className="p-5 space-y-3">
            <div>
              <label className="block text-sm font-medium text-dark-100 mb-1">Logo URL</label>
              <input type="url" value={settings.logo_url || ""} onChange={e => setSettings({ ...settings, logo_url: e.target.value })}
                placeholder="https://example.com/logo.png — or upload below" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none" />
              <div className="mt-2 flex items-center gap-3">
                <label className="px-3 py-1.5 bg-dark-700 hover:bg-dark-600 border border-dark-500 rounded-lg text-xs font-medium cursor-pointer">
                  Upload image…
                  <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={async (e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    if (file.size > 2 * 1024 * 1024) {
                      setMessage({ text: "Image too large (max 2 MB)", type: "error" });
                      return;
                    }
                    try {
                      const buf = await file.arrayBuffer();
                      const res = await fetch("/api/branding/logo", {
                        method: "POST",
                        credentials: "same-origin",
                        headers: { "Content-Type": file.type, "X-Requested-With": "DockPanel" },
                        body: buf,
                      });
                      const data = await res.json().catch(() => ({}));
                      if (!res.ok) throw new Error(data.error || `Upload failed (${res.status})`);
                      const newUrl = data.logo_url as string;
                      setSettings({ ...settings, logo_url: newUrl });
                      await api.put("/settings", { logo_url: newUrl });
                      setMessage({ text: "Logo uploaded", type: "success" });
                    } catch (err) {
                      setMessage({ text: err instanceof Error ? err.message : "Upload failed", type: "error" });
                    } finally {
                      e.target.value = "";
                    }
                  }} />
                </label>
                <span className="text-xs text-dark-300">PNG, JPEG, or WebP — up to 2 MB</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-dark-100 mb-1">Accent Color</label>
              <div className="flex gap-2">
                {["#22c55e", "#3b82f6", "#8b5cf6", "#ec4899", "#f59e0b", "#ef4444"].map(color => (
                  <button key={color} onClick={() => setSettings({ ...settings, accent_color: color })}
                    className={`w-8 h-8 rounded-full border-2 ${settings.accent_color === color ? "border-white" : "border-transparent"}`}
                    style={{ backgroundColor: color }} />
                ))}
              </div>
            </div>
            {/* hide_branding was the third key in this card's own family with no
                control: GET /api/branding returns it, and NexusLayout,
                CommandLayout and Login all hide the DockPanel mark when it is
                set — a white-label switch every consumer honoured and nobody
                could throw. Default is closed (an absent row reads false), so
                this compares === "true", unlike the default-open toggles in the
                Security Hardening card. */}
            <div className="flex items-center justify-between pt-1">
              <div>
                <p className="text-sm text-dark-100">Hide DockPanel Branding</p>
                <p className="text-xs text-dark-400">Remove the DockPanel name from the sidebar, header and login page</p>
              </div>
              <button onClick={() => setSettings({ ...settings, hide_branding: settings.hide_branding === "true" ? "false" : "true" })}
                className={`relative w-11 h-6 rounded-full transition-colors shrink-0 ${settings.hide_branding === "true" ? "bg-rust-500" : "bg-dark-600"}`}>
                <div className={`absolute top-0.5 w-5 h-5 bg-white rounded-full transition-transform ${settings.hide_branding === "true" ? "translate-x-5.5 left-0.5" : "left-0.5"}`} />
              </button>
            </div>
            <button onClick={async () => {
              try {
                await api.put("/settings", {
                  logo_url: settings.logo_url || "",
                  accent_color: settings.accent_color || "",
                  hide_branding: settings.hide_branding === "true" ? "true" : "false",
                });
                setMessage({ text: "Branding saved", type: "success" });
              } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Failed", type: "error" }); }
            }} className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50">Save Branding</button>
          </div>
        </div>


        {/* Feature #5: Configuration Backup */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Configuration Backup</h3>
          </div>
          <div className="p-5 flex gap-3">
            <button onClick={async () => {
              try {
                const data = await api.get<ExportConfig>("/settings/export");
                const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
                const url = URL.createObjectURL(blob);
                const a = document.createElement("a"); a.href = url; a.download = "dockpanel-config.json"; a.click();
                URL.revokeObjectURL(url);
              } catch (err) { setMessage({ text: err instanceof Error ? err.message : "Export failed", type: "error" }); }
            }} className="px-4 py-2 bg-dark-700 text-dark-100 rounded-lg text-sm font-medium hover:bg-dark-600">Export Config</button>
            <label className="px-4 py-2 bg-dark-700 text-dark-100 rounded-lg text-sm font-medium hover:bg-dark-600 cursor-pointer">
              Import Config
              <input type="file" accept=".json" className="hidden" onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const text = await file.text();
                try {
                  const data = JSON.parse(text);
                  setPendingConfirm({
                    type: "import_config",
                    label: `Import ${Object.keys(data.settings || {}).length} settings? This will overwrite existing values.`,
                    data: { config: data }
                  });
                } catch { setMessage({ text: "Invalid config file", type: "error" }); }
                e.target.value = "";
              }} />
            </label>
          </div>
        </div>

        {/* Feature #9: Disk Cleanup */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Disk Cleanup</h3>
          </div>
          <div className="p-5 flex items-center justify-between">
            <div>
              <p className="text-sm text-dark-100">Free disk space</p>
              <p className="text-xs text-dark-300 mt-0.5">Clears apt cache, old logs, temp files, dangling Docker images</p>
            </div>
            <button onClick={async () => {
              try {
                const result = await api.post<CleanupResult>("/system/cleanup");
                setMessage({ text: `Cleaned: ${result.cleaned?.join(", ") || "done"}`, type: "success" });
              } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
            }} className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600">Clean Up</button>
          </div>
        </div>

        {/* Feature #10: Hostname */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Server Hostname</h3>
          </div>
          <div className="p-5">
            <div className="flex gap-2">
              <input type="text" value={hostname} onChange={e => setHostname(e.target.value)}
                placeholder="server.example.com" className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
              <button onClick={async () => {
                try {
                  await api.post("/system/hostname", { hostname });
                  setMessage({ text: "Hostname updated", type: "success" });
                } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
              }} className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 shrink-0">Save</button>
            </div>
            <p className="text-xs text-dark-300 mt-1">Only alphanumeric characters, hyphens, and dots allowed</p>
          </div>
        </div>

        {/* Feature #11: Theme Picker */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Appearance</h3>
          </div>
          <div className="p-5 space-y-6">
            {/* Layout selector */}
            <div>
              <p className="text-sm text-dark-100 mb-3">Layout</p>
              <div className="grid grid-cols-3 gap-3">
                {([
                  { id: "command", name: "Sidebar", desc: "Full sidebar, grouped nav",
                    preview: (c: { bg: string; bar: string; accent: string; text: string }) => (
                      <div className="flex gap-1" style={{ height: "44px" }}>
                        <div style={{ background: c.bar, width: "22%", borderRadius: "2px" }} className="flex flex-col gap-0.5 p-1">
                          <div style={{ background: c.accent, height: "2px", width: "80%" }} />
                          <div style={{ background: c.text, height: "1.5px", opacity: 0.4 }} />
                          <div style={{ background: c.text, height: "1.5px", width: "70%", opacity: 0.4 }} />
                          <div style={{ background: c.text, height: "1.5px", width: "85%", opacity: 0.4 }} />
                        </div>
                        <div style={{ width: "78%" }} className="flex flex-col gap-0.5 p-0.5">
                          <div style={{ background: c.bar, height: "14px", borderRadius: "1px" }} />
                          <div style={{ background: c.bar, flex: 1, borderRadius: "1px" }} />
                        </div>
                      </div>
                    )},
                  { id: "glass", name: "Compact", desc: "Collapsible icon sidebar",
                    preview: (c: { bg: string; bar: string; accent: string; text: string }) => (
                      <div className="flex gap-1" style={{ height: "44px" }}>
                        <div style={{ background: c.bar, width: "10%", borderRadius: "2px", opacity: 0.6 }} className="flex flex-col items-center gap-1.5 pt-1.5">
                          <div style={{ background: c.accent, width: "5px", height: "5px", borderRadius: "1px" }} />
                          <div style={{ background: c.text, width: "4px", height: "4px", borderRadius: "1px", opacity: 0.4 }} />
                          <div style={{ background: c.text, width: "4px", height: "4px", borderRadius: "1px", opacity: 0.4 }} />
                        </div>
                        <div style={{ width: "90%" }} className="flex flex-col gap-0.5 p-0.5">
                          <div style={{ background: c.bar, height: "14px", borderRadius: "1px" }} />
                          <div style={{ background: c.bar, flex: 1, borderRadius: "1px" }} />
                        </div>
                      </div>
                    )},
                  { id: "atlas", name: "Topbar", desc: "Horizontal navbar, breadcrumbs",
                    preview: (c: { bg: string; bar: string; accent: string; text: string }) => (
                      <div className="flex flex-col gap-0.5" style={{ height: "44px" }}>
                        <div style={{ background: c.bar, height: "10px", borderRadius: "1px" }} className="flex items-center gap-1 px-1">
                          <div style={{ background: c.accent, width: "8px", height: "3px", borderRadius: "1px" }} />
                          <div style={{ background: c.text, width: "6px", height: "2px", opacity: 0.4 }} />
                          <div style={{ background: c.text, width: "6px", height: "2px", opacity: 0.4 }} />
                          <div style={{ background: c.text, width: "6px", height: "2px", opacity: 0.4 }} />
                        </div>
                        <div style={{ background: c.bar, height: "5px", borderRadius: "1px", opacity: 0.5 }} />
                        <div style={{ background: c.bar, flex: 1, borderRadius: "1px" }} />
                      </div>
                    )},
                ] as const).map(l => {
                  const currentLayout = localStorage.getItem("dp-layout") || "command";
                  const isActive = currentLayout === l.id;
                  // Same table as the theme picker below. The ternary chain this
                  // replaces branched on midnight/arctic/ember only, so both Clean
                  // themes fell through to terminal's dark values.
                  const sw = THEME_SWATCHES.find(s => s.id === currentTheme) ?? DEFAULT_SWATCH;
                  const { accent, bg, bar, text } = sw;
                  return (
                    <button key={l.id} onClick={() => {
                      localStorage.setItem("dp-layout", l.id);
                      document.documentElement.setAttribute("data-layout", l.id);
                      window.dispatchEvent(new Event("dp-layout-change"));
                    }}
                      className="text-left transition-all duration-150"
                      style={{
                        borderRadius: "8px",
                        border: isActive ? `2px solid ${accent}` : "2px solid transparent",
                        boxShadow: isActive ? `0 0 12px ${accent}33` : "none",
                      }}
                    >
                      <div style={{ background: bg, borderRadius: "6px 6px 0 0", overflow: "hidden", padding: "6px" }}>
                        {l.preview({ bg, bar, accent, text })}
                      </div>
                      <div style={{ background: bar, borderRadius: "0 0 6px 6px", padding: "6px 10px" }}>
                        <div style={{ color: isActive ? accent : text, fontSize: "12px", fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>{l.name}</div>
                        <div style={{ color: text, fontSize: "10px", fontFamily: "'Inter', sans-serif", opacity: 0.7 }}>{l.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Layout options */}
            <div className="flex gap-6 text-sm">
              <label className="flex items-center gap-2 text-dark-100 cursor-pointer">
                <input type="checkbox"
                  checked={showHeader}
                  onChange={e => {
                    const val = e.target.checked;
                    setShowHeader(val);
                    localStorage.setItem("dp-show-header", val ? "true" : "false");
                    window.dispatchEvent(new Event("dp-layout-options-change"));
                  }}
                />
                Show top header bar
              </label>
              <label className="flex items-center gap-2 text-dark-100 cursor-pointer">
                <input type="checkbox"
                  checked={flatNav}
                  onChange={e => {
                    const val = e.target.checked;
                    setFlatNav(val);
                    localStorage.setItem("dp-flat-nav", val ? "true" : "false");
                    window.dispatchEvent(new Event("dp-layout-options-change"));
                  }}
                />
                Flat navigation (no groups)
              </label>
            </div>

            {/* Theme selector */}
            <div>
              <p className="text-sm text-dark-100 mb-3">Theme</p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {THEME_SWATCHES.map(t => {
                  const active = currentTheme === t.id;
                  return (
                    <button key={t.id} onClick={() => {
                      // Goes through applyTheme so the layout's useLayoutState
                      // re-seeds. Writing the DOM here directly left that hook on
                      // its mount-time value, so the header cycle button computed
                      // its next theme from a stale one and looked dead for a click.
                      applyTheme(t.id);
                      setCurrentTheme(t.id);
                    }}
                      className="group text-left transition-all duration-150"
                      style={{
                        borderRadius: "8px",
                        border: active ? `2px solid ${t.accent}` : "2px solid transparent",
                        boxShadow: active ? `0 0 12px ${t.accent}33` : "none",
                      }}
                    >
                      {/* Mini preview */}
                      <div style={{ background: t.bg, borderRadius: "6px 6px 0 0", overflow: "hidden" }} className="p-1.5">
                        <div className="flex gap-1" style={{ height: "52px" }}>
                          {/* Mini sidebar */}
                          <div style={{ background: t.sidebar, width: "20%", borderRadius: "3px" }} className="flex flex-col gap-1 p-1">
                            <div style={{ background: t.accent, height: "3px", borderRadius: "1px", width: "80%" }} />
                            <div style={{ background: t.bar, height: "2px", borderRadius: "1px" }} />
                            <div style={{ background: t.bar, height: "2px", borderRadius: "1px", width: "70%" }} />
                            <div style={{ background: t.bar, height: "2px", borderRadius: "1px", width: "85%" }} />
                          </div>
                          {/* Mini content */}
                          <div style={{ width: "80%" }} className="flex flex-col gap-1 p-1">
                            <div className="flex gap-1">
                              <div style={{ background: t.card, height: "16px", borderRadius: "2px", flex: 1 }}>
                                <div style={{ background: t.accent, height: "2px", borderRadius: "1px", width: "40%", margin: "4px" }} />
                              </div>
                              <div style={{ background: t.card, height: "16px", borderRadius: "2px", flex: 1 }}>
                                <div style={{ background: t.text, height: "2px", borderRadius: "1px", width: "60%", margin: "4px" }} />
                              </div>
                            </div>
                            <div style={{ background: t.card, flex: 1, borderRadius: "2px" }}>
                              <div style={{ background: t.text, height: "2px", borderRadius: "1px", width: "70%", margin: "4px" }} />
                              <div style={{ background: t.text, height: "2px", borderRadius: "1px", width: "50%", margin: "2px 4px" }} />
                            </div>
                          </div>
                        </div>
                      </div>
                      {/* Label */}
                      <div style={{ background: t.sidebar, borderRadius: "0 0 6px 6px", padding: "6px 10px" }}>
                        <div style={{ color: active ? t.accent : t.text, fontSize: "12px", fontWeight: 600, fontFamily: "'Inter', sans-serif" }}>{t.name}</div>
                        <div style={{ color: t.text, fontSize: "10px", fontFamily: "'Inter', sans-serif", opacity: 0.7 }}>{t.desc}</div>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
            {/* Feature #12: Locale Selector */}
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-dark-100">Language</p>
                <p className="text-xs text-dark-300">More languages coming soon</p>
              </div>
              <select disabled className="px-2 py-1.5 border border-dark-500 rounded text-sm opacity-50">
                <option>English</option>
              </select>
            </div>
          </div>
        </div>
    </>
  );
}
