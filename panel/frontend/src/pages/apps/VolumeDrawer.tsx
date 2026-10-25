import type { Dispatch, SetStateAction } from "react";
import type { DeployedApp } from "../Apps";

// Moved verbatim from pages/Apps.tsx (shell identifiers passed as props,
// destructured under the same names, so the body below is unchanged).
export function VolumeDrawer({
  apps,
  setVolumeTarget,
  volumeData,
  volumeLoading,
  volumeTarget
}: {
  apps: DeployedApp[];
  setVolumeTarget: Dispatch<SetStateAction<string | null>>;
  volumeData: { source: string; destination: string; type: string; size_bytes: number; size_mb: number; listing: string }[];
  volumeLoading: boolean;
  volumeTarget: string | null
}) {
  return (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 dp-modal-overlay"
          onKeyDown={(e) => { if (e.key === "Escape") setVolumeTarget(null); }}
        >
          <div className="bg-dark-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[80vh] overflow-y-auto border border-dark-500 dp-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">
                Volume Browser: {apps.find(a => a.container_id === volumeTarget)?.name}
              </h3>
              <button onClick={() => setVolumeTarget(null)} className="text-dark-300 hover:text-dark-50">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            {volumeLoading ? (
              <div className="flex items-center justify-center py-8 text-dark-300">
                <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Loading volumes...
              </div>
            ) : volumeData.length === 0 ? (
              <div className="text-center py-8 text-dark-300 text-sm">No volumes mounted</div>
            ) : (
              <div className="space-y-4">
                {volumeData.map((vol, i) => (
                  <div key={i} className="bg-dark-900 rounded-lg border border-dark-600 p-4">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <svg className="w-4 h-4 text-warn-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                        <span className="text-xs font-mono text-dark-100">{vol.destination}</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-1.5 py-0.5 text-[10px] rounded ${vol.type === "bind" ? "bg-accent-500/15 text-accent-400" : "bg-accent-600/15 text-accent-400"}`}>
                          {vol.type}
                        </span>
                        <span className="text-xs text-dark-300">{vol.size_mb} MB</span>
                      </div>
                    </div>
                    <div className="text-[10px] text-dark-300 mb-2 font-mono">{vol.source}</div>
                    {vol.listing && (
                      <pre className="text-[10px] font-mono text-dark-200 bg-dark-800 rounded p-2 overflow-x-auto max-h-40 overflow-y-auto border border-dark-700">
                        {vol.listing}
                      </pre>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
  );
}
