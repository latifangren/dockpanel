import type { Dispatch, SetStateAction } from "react";
import type { DeployedApp } from "../Apps";

// Moved verbatim from pages/Apps.tsx (shell identifiers passed as props,
// destructured under the same names, so the body below is unchanged).
export function StatsDrawer({
  apps,
  handleStats,
  setStatsData,
  setStatsTarget,
  statsData,
  statsHistory,
  statsLoading,
  statsTarget
}: {
  apps: DeployedApp[];
  handleStats: (containerId: string) => void;
  setStatsData: Dispatch<SetStateAction<{ cpu_percent?: string; memory_usage?: string; memory_percent?: string; network_io?: string; block_io?: string; pids?: string } | null>>;
  setStatsTarget: Dispatch<SetStateAction<string | null>>;
  statsData: { cpu_percent?: string; memory_usage?: string; memory_percent?: string; network_io?: string; block_io?: string; pids?: string } | null;
  statsHistory: Record<string, { cpu: number; mem: number }[]>;
  statsLoading: boolean;
  statsTarget: string
}) {
  return (
            <div className="mt-3 bg-dark-800 rounded-lg border border-dark-500 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">
                  Resource Stats: {apps.find(a => a.container_id === statsTarget)?.name}
                </h3>
                <div className="flex items-center gap-2">
                  <button onClick={() => handleStats(statsTarget)} className="text-xs text-dark-300 hover:text-dark-100">Refresh</button>
                  <button onClick={() => { setStatsTarget(null); setStatsData(null); }} className="text-dark-300 hover:text-dark-50">
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                  </button>
                </div>
              </div>
              {statsLoading ? (
                <div className="flex items-center gap-2 text-dark-300 text-sm">
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                  Loading stats...
                </div>
              ) : statsData?.cpu_percent ? (
                <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
                  <div className="bg-dark-900 rounded-lg p-3 border border-dark-600">
                    <div className="text-[10px] text-dark-300 uppercase">CPU</div>
                    <div className="text-lg font-mono text-dark-50 font-medium">{statsData.cpu_percent}%</div>
                  </div>
                  <div className="bg-dark-900 rounded-lg p-3 border border-dark-600">
                    <div className="text-[10px] text-dark-300 uppercase">Memory</div>
                    <div className="text-sm font-mono text-dark-50">{statsData.memory_usage}</div>
                    <div className="text-[10px] text-dark-300">{statsData.memory_percent}%</div>
                  </div>
                  <div className="bg-dark-900 rounded-lg p-3 border border-dark-600">
                    <div className="text-[10px] text-dark-300 uppercase">Network I/O</div>
                    <div className="text-sm font-mono text-dark-50">{statsData.network_io}</div>
                  </div>
                  <div className="bg-dark-900 rounded-lg p-3 border border-dark-600">
                    <div className="text-[10px] text-dark-300 uppercase">Block I/O</div>
                    <div className="text-sm font-mono text-dark-50">{statsData.block_io}</div>
                  </div>
                  <div className="bg-dark-900 rounded-lg p-3 border border-dark-600">
                    <div className="text-[10px] text-dark-300 uppercase">PIDs</div>
                    <div className="text-lg font-mono text-dark-50 font-medium">{statsData.pids}</div>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-dark-300">Container not running or stats unavailable</p>
              )}
              {/* Stats history sparkline (Feature #8) */}
              {statsTarget && (statsHistory[statsTarget] || []).length > 1 && (
                <div className="mt-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                  <div className="bg-dark-900 rounded-lg p-3 border border-dark-600">
                    <div className="text-[10px] text-dark-300 uppercase mb-1">CPU History ({(statsHistory[statsTarget] || []).length} samples)</div>
                    <svg viewBox={`0 0 ${(statsHistory[statsTarget] || []).length * 10} 40`} className="w-full h-10" preserveAspectRatio="none">
                      <polyline
                        fill="none"
                        stroke="#e8956a"
                        strokeWidth="1.5"
                        points={(statsHistory[statsTarget] || []).map((p, i) => `${i * 10},${40 - (p.cpu / 100) * 40}`).join(' ')}
                      />
                    </svg>
                  </div>
                  <div className="bg-dark-900 rounded-lg p-3 border border-dark-600">
                    <div className="text-[10px] text-dark-300 uppercase mb-1">Memory History ({(statsHistory[statsTarget] || []).length} samples)</div>
                    <svg viewBox={`0 0 ${(statsHistory[statsTarget] || []).length * 10} 40`} className="w-full h-10" preserveAspectRatio="none">
                      <polyline
                        fill="none"
                        stroke="#7c3aed"
                        strokeWidth="1.5"
                        points={(statsHistory[statsTarget] || []).map((p, i) => `${i * 10},${40 - (p.mem / 100) * 40}`).join(' ')}
                      />
                    </svg>
                  </div>
                </div>
              )}
            </div>
  );
}
