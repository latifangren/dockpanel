// Moved verbatim from panel/frontend/src/pages/Settings.tsx (subcomponent AutoUpdates).
// Signature unchanged; only the module imports below are new.
import { useState, useEffect } from "react";
import { api } from "../../api";

// ── Auto-Updates Component ──────────────────────────────────────────────

export function AutoUpdates() {
  const [status, setStatus] = useState<{ installed: boolean; enabled: boolean } | null>(null);
  const [toggling, setToggling] = useState(false);
  // Local, and rendered under the toggle on purpose. A page-level banner on a
  // page this long is a message the operator never sees next to the control
  // they clicked — the #120 shape. Keep the answer where the question was.
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<{ installed: boolean; enabled: boolean }>("/auto-updates/status").then(setStatus).catch(() => {});
  }, []);

  const toggle = async () => {
    if (!status) return;
    setToggling(true);
    setError("");
    try {
      await api.post(status.enabled ? "/auto-updates/disable" : "/auto-updates/enable", {});
      setStatus({ ...status, installed: true, enabled: !status.enabled });
    } catch (e) {
      // The switch used to slide back with no explanation, which on a host
      // family where unattended-upgrades is not the mechanism is the ONLY
      // outcome it can have. Silence there reads as "done".
      setError(e instanceof Error ? e.message : "Could not change automatic security updates");
    }
    finally { setToggling(false); }
  };

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Auto-Updates</h3>
        <p className="text-xs text-dark-200 mt-0.5">Automatically install security patches</p>
      </div>
      <div className="p-5">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-sm text-dark-100">Automatic security updates</p>
            <p className="text-xs text-dark-300 mt-0.5">Uses unattended-upgrades to apply security patches automatically</p>
          </div>
          <button onClick={toggle} disabled={toggling} className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0 ${status?.enabled ? "bg-rust-500" : "bg-dark-600"}`}>
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${status?.enabled ? "translate-x-6" : "translate-x-1"}`} />
          </button>
        </div>
        {error && <p className="text-xs text-danger-400 mt-3">{error}</p>}
      </div>
    </div>
  );
}
