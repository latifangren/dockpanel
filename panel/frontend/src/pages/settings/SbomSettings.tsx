// Moved verbatim from panel/frontend/src/pages/Settings.tsx (subcomponent SbomSettings).
// Signature unchanged; only the module imports below are new.
import { useState, useEffect } from "react";
import { api } from "../../api";

// ── SBOM (syft) ─────────────────────────────────────────────────────────

interface SbomSettingsState {
  installed: boolean;
}

export function SbomSettings({ setMessage }: { setMessage: (m: { text: string; type: string }) => void }) {
  const [s, setS] = useState<SbomSettingsState | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [installing, setInstalling] = useState(false);
  const [uninstallConfirm, setUninstallConfirm] = useState(false);

  const load = () => {
    setLoadError(null);
    api.get<SbomSettingsState>("/sbom/settings")
      .then(setS)
      .catch((e: unknown) => {
        setS(null);
        setLoadError(e instanceof Error ? e.message : "Failed to load settings");
      });
  };

  useEffect(() => { load(); }, []);

  const install = async () => {
    setInstalling(true);
    try {
      await api.post("/sbom/install", {});
      setMessage({ text: "SBOM generator installed (syft)", type: "success" });
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
      await api.post("/sbom/uninstall", {});
      setMessage({ text: "SBOM generator removed", type: "success" });
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
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">SBOM Generation</h3>
        </div>
        {loadError ? (
          <div className="p-5 flex items-center justify-between gap-3">
            <p className="text-sm text-danger-400">Could not load SBOM settings: {loadError}</p>
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
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">SBOM Generation</h3>
        <p className="text-xs text-dark-200 mt-0.5">Generate SPDX 2.3 SBOMs for deployed images on demand (syft). Use the "Download SBOM" button on any app's scan drawer.</p>
        <p className="text-[10px] text-dark-300 mt-1 italic">On-demand only — no schedule, no deploy gate. Install or uninstall is the only configuration.</p>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between border border-dark-600 bg-dark-900/50 rounded p-4">
          <div>
            <div className="text-sm font-medium text-dark-50 flex items-center gap-2">
              Generator (syft)
              <span
                className={`w-2 h-2 rounded-full ${s.installed ? "bg-rust-400" : "bg-dark-500"}`}
                role="img"
                aria-label={s.installed ? "Generator installed" : "Generator not installed"}
                title={s.installed ? "Installed" : "Not installed"}
              />
            </div>
            <p className="text-[10px] text-dark-300 mt-0.5">~80MB binary. Required to generate SBOMs from container images.</p>
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
              <button type="button" onClick={() => setUninstallConfirm(true)} aria-label="Uninstall SBOM generator" className="px-2.5 py-1 bg-danger-500/10 text-danger-400 border border-danger-500/20 rounded-lg text-[10px] font-medium hover:bg-danger-500/20">
                Uninstall
              </button>
            )
          ) : (
            <button type="button" onClick={install} disabled={installing} className="px-3 py-1.5 bg-rust-500 text-white rounded-lg text-xs font-medium hover:bg-rust-600 disabled:opacity-50">
              {installing ? "Installing..." : "Install Generator"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
