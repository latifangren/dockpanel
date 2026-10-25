// Moved verbatim from panel/frontend/src/pages/Settings.tsx (subcomponent WpVulnScanSettings).
// Signature unchanged; only the module imports below are new.
import { useState, useEffect } from "react";
import { api } from "../../api";

// ── WordPress vulnerability scanning ────────────────────────────────────
// Direct peer of ImageScanSettings above — same shape, same "off by
// default" posture. Before this, a critically-vulnerable plugin stayed
// invisible until an operator manually reopened a site's toolkit and
// clicked Scan; there was no schedule and no alert.

interface WpScanSettingsState {
  enabled: boolean;
  interval_hours: number;
}

export function WpVulnScanSettings({ setMessage }: { setMessage: (m: { text: string; type: string }) => void }) {
  const [s, setS] = useState<WpScanSettingsState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = () => {
    setLoadError(null);
    api.get<WpScanSettingsState>("/wordpress/vuln-scan-settings")
      .then(setS)
      .catch((e: unknown) => {
        setS(null);
        setLoadError(e instanceof Error ? e.message : "Failed to load settings");
      });
  };

  useEffect(() => { load(); }, []);

  const update = async (patch: Partial<WpScanSettingsState>) => {
    if (!s) return;
    const next = { ...s, ...patch };
    setS(next);
    setSaving(true);
    try {
      await api.put("/wordpress/vuln-scan-settings", {
        enabled: next.enabled,
        interval_hours: next.interval_hours,
      });
      setMessage({ text: "WordPress vulnerability scan settings saved", type: "success" });
    } catch (e) {
      setMessage({ text: `Save failed: ${(e as Error).message || "unknown"}`, type: "error" });
      load();
    } finally {
      setSaving(false);
    }
  };

  if (!s) {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600">
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">WordPress Vulnerability Scanning</h3>
        </div>
        {loadError ? (
          <div className="p-5 flex items-center justify-between gap-3">
            <p className="text-sm text-danger-400">Could not load scanner settings: {loadError}</p>
            <button type="button" onClick={load} className="px-3 py-1.5 bg-dark-600 text-dark-50 rounded-lg text-xs font-medium hover:bg-dark-500 shrink-0">Retry</button>
          </div>
        ) : (
          <div className="p-5 text-sm text-dark-300">Loading...</div>
        )}
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">WordPress Vulnerability Scanning</h3>
        <p className="text-xs text-dark-200 mt-0.5">Scan every WordPress site's plugins for known CVEs on a schedule. Manual scans (site toolkit &rarr; Vuln Scan) are unaffected either way.</p>
      </div>
      <div className="p-5 space-y-4">
        <label className="flex items-start gap-3 border border-dark-600 bg-dark-900/50 rounded p-4 cursor-pointer hover:bg-dark-900">
          <input
            type="checkbox"
            checked={s.enabled}
            disabled={saving}
            onChange={e => update({ enabled: e.target.checked })}
            className="mt-1"
          />
          <div>
            <div className="text-sm font-medium text-dark-50">Enable scheduled scans</div>
            <p className="text-[10px] text-dark-300 mt-0.5">Background sweep rescans every WordPress site at the interval below and alerts on critical or high severity findings.</p>
          </div>
        </label>

        <div className="border border-dark-600 bg-dark-900/50 rounded p-4 max-w-xs">
          <label className="block text-xs font-mono text-dark-300 uppercase tracking-widest mb-2">Rescan interval (hours)</label>
          <input
            type="number"
            min={1}
            max={720}
            value={s.interval_hours}
            disabled={saving}
            onChange={e => {
              const v = parseInt(e.target.value, 10);
              if (!Number.isNaN(v)) update({ interval_hours: v });
            }}
            className="w-full px-3 py-2 bg-dark-800 border border-dark-500 rounded text-sm text-dark-50 font-mono"
          />
          <p className="text-[10px] text-dark-300 mt-2">Background sweep skips sites scanned within this window.</p>
        </div>
      </div>
    </div>
  );
}
