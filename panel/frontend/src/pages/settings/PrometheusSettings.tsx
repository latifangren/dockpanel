// Moved verbatim from panel/frontend/src/pages/Settings.tsx (subcomponent PrometheusSettings).
// Signature unchanged; only the module imports below are new.
import { useState, useEffect } from "react";
import { api } from "../../api";

// ── Prometheus scrape endpoint ──────────────────────────────────────────

interface PromSettingsState {
  enabled: boolean;
  token_configured: boolean;
  token_prefix: string | null;
}

export function PrometheusSettings({ setMessage }: { setMessage: (m: { text: string; type: string }) => void }) {
  const [s, setS] = useState<PromSettingsState | null>(null);
  const [saving, setSaving] = useState(false);
  const [newToken, setNewToken] = useState<string | null>(null);
  const [rotateConfirm, setRotateConfirm] = useState(false);

  const load = () => {
    api.get<PromSettingsState>("/prometheus/settings")
      .then(setS)
      .catch(() => setS(null));
  };

  useEffect(() => { load(); }, []);

  const save = async (enabled: boolean, rotate: boolean) => {
    setSaving(true);
    try {
      const res = await api.post<{ token: string | null; message: string }>("/prometheus/settings", {
        enabled,
        rotate_token: rotate,
      });
      if (res.token) setNewToken(res.token);
      setMessage({ text: res.message, type: "success" });
      load();
    } catch (e) {
      setMessage({ text: `Failed: ${(e as Error).message || "unknown"}`, type: "error" });
    } finally {
      setSaving(false);
      setRotateConfirm(false);
    }
  };

  const copy = (text: string) => {
    navigator.clipboard.writeText(text).then(
      () => setMessage({ text: "Copied to clipboard", type: "success" }),
      () => setMessage({ text: "Copy failed", type: "error" }),
    );
  };

  if (!s) {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600">
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Prometheus Metrics</h3>
        </div>
        <div className="p-5 text-sm text-dark-300">Loading...</div>
      </div>
    );
  }

  const scrapeUrl = `${window.location.origin}/api/metrics`;
  const scrapeConfig = `scrape_configs:
  - job_name: 'dockpanel'
    metrics_path: /api/metrics
    scheme: ${window.location.protocol.replace(":", "")}
    bearer_token: ${newToken ?? "<your-scrape-token>"}
    static_configs:
      - targets: ['${window.location.host}']`;

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Prometheus Metrics</h3>
        <p className="text-xs text-dark-200 mt-0.5">
          Expose CPU, memory, disk, GPU, sites, and alerts in Prometheus exposition format at <span className="font-mono text-dark-50">/api/metrics</span> for external monitoring stacks to scrape.
        </p>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between border border-dark-600 bg-dark-900/50 rounded p-4">
          <div>
            <div className="text-sm font-medium text-dark-50 flex items-center gap-2">
              Scrape endpoint
              <span className={`w-2 h-2 rounded-full ${s.enabled ? "bg-rust-400" : "bg-dark-500"}`} title={s.enabled ? "Enabled" : "Disabled"} />
            </div>
            <p className="text-[10px] text-dark-300 mt-0.5">
              {s.enabled
                ? "Active. Scrapers need the bearer token below."
                : "Disabled. When disabled, /api/metrics returns 404 (hides the endpoint)."}
            </p>
          </div>
          <button
            onClick={() => save(!s.enabled, false)}
            disabled={saving}
            className={`px-3 py-1.5 text-xs font-medium rounded-md disabled:opacity-50 ${
              s.enabled
                ? "bg-danger-500/10 text-danger-400 border border-danger-500/20 hover:bg-danger-500/20"
                : "bg-rust-500 text-white hover:bg-rust-600"
            }`}
          >
            {saving ? "..." : s.enabled ? "Disable" : "Enable"}
          </button>
        </div>

        {s.enabled && (
          <>
            <div className="border border-dark-600 bg-dark-900/50 rounded p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <div className="text-sm font-medium text-dark-50">Scrape token</div>
                  <p className="text-[10px] text-dark-300 mt-0.5">
                    {s.token_configured
                      ? <>Active token starts with <span className="font-mono text-dark-50">{s.token_prefix ?? "dpms_…"}</span>. Rotate invalidates the old one immediately.</>
                      : "No token configured."}
                  </p>
                </div>
                {rotateConfirm ? (
                  <div className="flex gap-2">
                    <button onClick={() => save(s.enabled, true)} disabled={saving} className="px-3 py-1.5 bg-danger-500 text-white text-xs font-bold uppercase tracking-wider hover:bg-danger-600 disabled:opacity-50">
                      {saving ? "..." : "Confirm Rotate"}
                    </button>
                    <button onClick={() => setRotateConfirm(false)} className="px-3 py-1.5 bg-dark-600 text-dark-200 text-xs font-bold uppercase tracking-wider hover:bg-dark-500">
                      Cancel
                    </button>
                  </div>
                ) : (
                  <button onClick={() => setRotateConfirm(true)} className="px-2.5 py-1 bg-dark-600 text-dark-100 border border-dark-500 rounded-lg text-[10px] font-medium hover:bg-dark-500">
                    Rotate
                  </button>
                )}
              </div>

              {newToken && (
                <div className="border border-warn-500/30 bg-warn-500/5 rounded p-3">
                  <div className="text-[10px] font-medium text-warn-400 uppercase tracking-wider mb-1">Save this token — it won't be shown again</div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 text-xs font-mono text-dark-50 break-all">{newToken}</code>
                    <button
                      onClick={() => copy(newToken)}
                      className="px-2 py-1 bg-dark-700 border border-dark-500 text-dark-100 rounded text-[10px] hover:bg-dark-600 shrink-0"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              )}
            </div>

            <div className="border border-dark-600 bg-dark-900/50 rounded p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-dark-50">Endpoint URL</div>
                <button
                  onClick={() => copy(scrapeUrl)}
                  className="px-2 py-1 bg-dark-700 border border-dark-500 text-dark-100 rounded text-[10px] hover:bg-dark-600"
                >
                  Copy URL
                </button>
              </div>
              <code className="block text-xs font-mono text-dark-100 break-all">{scrapeUrl}</code>
            </div>

            <div className="border border-dark-600 bg-dark-900/50 rounded p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div className="text-sm font-medium text-dark-50">Prometheus scrape config</div>
                <button
                  onClick={() => copy(scrapeConfig)}
                  className="px-2 py-1 bg-dark-700 border border-dark-500 text-dark-100 rounded text-[10px] hover:bg-dark-600"
                >
                  Copy YAML
                </button>
              </div>
              <pre className="text-[11px] font-mono text-dark-100 whitespace-pre-wrap break-all">{scrapeConfig}</pre>
              <p className="text-[10px] text-dark-300">
                Drop this block under <span className="font-mono">scrape_configs:</span> in your <span className="font-mono">prometheus.yml</span>.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
