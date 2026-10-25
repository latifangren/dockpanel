// Moved verbatim from panel/frontend/src/pages/Settings.tsx (subcomponent ImageScanSettings).
// Signature unchanged; only the module imports below are new.
import { useState, useEffect } from "react";
import { api } from "../../api";
import { timeAgo } from "../../utils/format";

// ── Image Vulnerability Scanning ────────────────────────────────────────

interface ImageScanSettingsState {
  enabled: boolean;
  on_deploy: boolean;
  deploy_gate: string;
  interval_hours: number;
  installed: boolean;
}

export function ImageScanSettings({ setMessage }: { setMessage: (m: { text: string; type: string }) => void }) {
  const [s, setS] = useState<ImageScanSettingsState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [uninstallConfirm, setUninstallConfirm] = useState(false);
  const [lastSweep, setLastSweep] = useState<{ scanned_at: string; image_count: number } | null>(null);

  const load = () => {
    setLoadError(null);
    api.get<ImageScanSettingsState>("/image-scan/settings")
      .then(setS)
      .catch((e: unknown) => {
        setS(null);
        setLoadError(e instanceof Error ? e.message : "Failed to load settings");
      });
    api.get<{ image: string; scanned_at: string }[]>("/image-scan/recent")
      .then(scans => {
        if (!scans || scans.length === 0) { setLastSweep(null); return; }
        const newest = scans.reduce((acc, x) =>
          new Date(x.scanned_at).getTime() > new Date(acc.scanned_at).getTime() ? x : acc
        );
        setLastSweep({ scanned_at: newest.scanned_at, image_count: scans.length });
      })
      .catch(() => setLastSweep(null));
  };

  useEffect(() => { load(); }, []);

  const update = async (patch: Partial<ImageScanSettingsState>) => {
    if (!s) return;
    const next = { ...s, ...patch };
    setS(next);
    setSaving(true);
    try {
      await api.put("/image-scan/settings", {
        enabled: next.enabled,
        on_deploy: next.on_deploy,
        deploy_gate: next.deploy_gate,
        interval_hours: next.interval_hours,
      });
      setMessage({ text: "Image scan settings saved", type: "success" });
    } catch (e) {
      setMessage({ text: `Save failed: ${(e as Error).message || "unknown"}`, type: "error" });
      load();
    } finally {
      setSaving(false);
    }
  };

  const install = async () => {
    setInstalling(true);
    try {
      await api.post("/image-scan/install", {});
      setMessage({ text: "Scanner installed (grype)", type: "success" });
      load();
    } catch (e) {
      setMessage({ text: `Install failed: ${(e as Error).message || "unknown"}`, type: "error" });
    } finally {
      setInstalling(false);
    }
  };

  const uninstall = async () => {
    setInstalling(true);
    try {
      await api.post("/image-scan/uninstall", {});
      setMessage({ text: "Scanner removed", type: "success" });
      load();
    } catch (e) {
      setMessage({ text: `Uninstall failed: ${(e as Error).message || "unknown"}`, type: "error" });
    } finally {
      setInstalling(false);
      setUninstallConfirm(false);
    }
  };

  if (!s) {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600">
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Image Vulnerability Scanning</h3>
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
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Image Vulnerability Scanning</h3>
        <p className="text-xs text-dark-200 mt-0.5">Scan deployed Docker images for known CVEs (grype). Per-app badges appear on the Apps page.</p>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between border border-dark-600 bg-dark-900/50 rounded p-4">
          <div>
            <div className="text-sm font-medium text-dark-50 flex items-center gap-2">
              Scanner (grype)
              <span
                className={`w-2 h-2 rounded-full ${s.installed ? "bg-rust-400" : "bg-dark-500"}`}
                role="img"
                aria-label={s.installed ? "Scanner installed" : "Scanner not installed"}
                title={s.installed ? "Installed" : "Not installed"}
              />
            </div>
            <p className="text-[10px] text-dark-300 mt-0.5">~70MB binary + vulnerability database. Required for any scanning.</p>
            {s.installed && (
              <p className="text-[10px] text-dark-300 mt-1">
                {lastSweep
                  ? <>Last scan <span title={new Date(lastSweep.scanned_at).toLocaleString()} className="text-dark-200">{timeAgo(lastSweep.scanned_at)}</span> · {lastSweep.image_count} image{lastSweep.image_count === 1 ? "" : "s"} on file</>
                  : <>No scans recorded yet.</>}
              </p>
            )}
          </div>
          {s.installed ? (
            uninstallConfirm ? (
              <div className="flex gap-2">
                <button type="button" onClick={uninstall} disabled={installing} className="px-2.5 py-1 bg-danger-500 text-white rounded-lg text-[10px] font-medium hover:bg-danger-600 disabled:opacity-50">
                  {installing ? "Removing..." : "Confirm uninstall"}
                </button>
                <button type="button" onClick={() => setUninstallConfirm(false)} className="px-2.5 py-1 bg-dark-600 text-dark-200 rounded-lg text-[10px] font-medium hover:bg-dark-500">
                  Cancel
                </button>
              </div>
            ) : (
              <button type="button" onClick={() => setUninstallConfirm(true)} aria-label="Uninstall image scanner" className="px-2.5 py-1 bg-danger-500/10 text-danger-400 border border-danger-500/20 rounded-lg text-[10px] font-medium hover:bg-danger-500/20">
                Uninstall
              </button>
            )
          ) : (
            <button type="button" onClick={install} disabled={installing} className="px-3 py-1.5 bg-rust-500 text-white rounded-lg text-xs font-medium hover:bg-rust-600 disabled:opacity-50">
              {installing ? "Installing..." : "Install Scanner"}
            </button>
          )}
        </div>

        {!s.installed && (
          <p className="text-[11px] text-dark-300 -mt-2 ml-1">Install the scanner above to enable scheduled scans and the deploy gate.</p>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <label className="flex items-start gap-3 border border-dark-600 bg-dark-900/50 rounded p-4 cursor-pointer hover:bg-dark-900">
            <input
              type="checkbox"
              checked={s.enabled}
              disabled={!s.installed || saving}
              onChange={e => update({ enabled: e.target.checked })}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-medium text-dark-50">Enable scheduled scans</div>
              <p className="text-[10px] text-dark-300 mt-0.5">Background sweep rescans every running app's image at the interval below.</p>
            </div>
          </label>

          <label className="flex items-start gap-3 border border-dark-600 bg-dark-900/50 rounded p-4 cursor-pointer hover:bg-dark-900">
            <input
              type="checkbox"
              checked={s.on_deploy}
              disabled={!s.installed || saving}
              onChange={e => update({ on_deploy: e.target.checked })}
              className="mt-1"
            />
            <div>
              <div className="text-sm font-medium text-dark-50">Gate deploys on scan results</div>
              <p className="text-[10px] text-dark-300 mt-0.5">Refuse an image whose last scan exceeds the threshold below &mdash; on deploys, image changes, compose and stacks. Updating an app is exempt: it re-pulls the same reference, so the scan on file describes the image being replaced.</p>
            </div>
          </label>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="border border-dark-600 bg-dark-900/50 rounded p-4">
            <label className="block text-xs font-mono text-dark-300 uppercase tracking-widest mb-2">Deploy gate threshold</label>
            <select
              value={s.deploy_gate}
              disabled={saving}
              onChange={e => update({ deploy_gate: e.target.value })}
              className="w-full px-3 py-2 bg-dark-800 border border-dark-500 rounded text-sm text-dark-50"
            >
              <option value="none">None — never block</option>
              <option value="critical">Critical only</option>
              <option value="high">High or Critical</option>
              <option value="medium">Medium, High, or Critical</option>
            </select>
            <p className="text-[10px] text-dark-300 mt-2">Only enforced when "Gate deploys" is on.</p>
          </div>

          <div className="border border-dark-600 bg-dark-900/50 rounded p-4">
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
            <p className="text-[10px] text-dark-300 mt-2">Background sweep skips images scanned within this window.</p>
          </div>
        </div>
      </div>
    </div>
  );
}
