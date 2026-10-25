import type { Dispatch, RefObject, SetStateAction } from "react";
import type { DeployedApp } from "../Apps";

// Moved verbatim from pages/Apps.tsx (shell identifiers passed as props,
// destructured under the same names, so the body below is unchanged).
export function LogsDrawer({
  apps,
  closeLogs,
  downloadLogs,
  fetchLogs,
  logAutoRefresh,
  logAutoScroll,
  logEndRef,
  logLines,
  logSearch,
  logsTarget,
  setLogAutoRefresh,
  setLogAutoScroll,
  setLogSearch,
}: {
  apps: DeployedApp[];
  closeLogs: () => void;
  downloadLogs: () => void;
  fetchLogs: (containerId: string) => void;
  logAutoRefresh: boolean;
  logAutoScroll: boolean;
  logEndRef: RefObject<HTMLDivElement | null>;
  logLines: string[];
  logSearch: string;
  logsTarget: string | null;
  setLogAutoRefresh: Dispatch<SetStateAction<boolean>>;
  setLogAutoScroll: Dispatch<SetStateAction<boolean>>;
  setLogSearch: Dispatch<SetStateAction<string>>;
}) {
            const filtered = logSearch
              ? logLines.filter(l => l.toLowerCase().includes(logSearch.toLowerCase()))
              : logLines;
  return (
              <div
                className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 dp-modal-overlay"
                role="dialog"
                aria-labelledby="logs-dialog-title"
                onKeyDown={(e) => { if (e.key === "Escape") closeLogs(); }}
              >
                <div className="bg-dark-800 rounded-lg shadow-xl w-full max-w-4xl max-h-[85vh] flex flex-col overflow-hidden border border-dark-500 dp-modal">
                  {/* Header */}
                  <div className="flex items-center justify-between px-5 py-3 border-b border-dark-600">
                    <div className="flex items-center gap-3">
                      <svg className="w-4 h-4 text-dark-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                      <h3 id="logs-dialog-title" className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">
                        {apps.find(a => a.container_id === logsTarget)?.name}
                      </h3>
                      {logAutoRefresh && (
                        <span className="flex items-center gap-1 text-[10px] text-rust-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-rust-400 animate-pulse" />
                          Live
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] text-dark-300">{filtered.length} lines</span>
                      <button onClick={closeLogs} className="text-dark-300 hover:text-dark-50 p-1">
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                      </button>
                    </div>
                  </div>

                  {/* Toolbar */}
                  <div className="flex items-center gap-2 px-5 py-2 border-b border-dark-600 bg-dark-900/50">
                    <div className="relative flex-1 max-w-xs">
                      <svg className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-dark-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><circle cx="11" cy="11" r="8" /><path d="M21 21l-4.35-4.35" /></svg>
                      <input
                        type="text"
                        value={logSearch}
                        onChange={(e) => setLogSearch(e.target.value)}
                        placeholder="Filter logs..."
                        className="w-full pl-8 pr-3 py-1.5 bg-dark-800 border border-dark-500 rounded-lg text-xs text-dark-100 focus:ring-1 focus:ring-accent-500 focus:border-accent-500"
                      />
                    </div>
                    <button
                      onClick={() => setLogAutoRefresh(!logAutoRefresh)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                        logAutoRefresh ? "bg-rust-500/15 text-rust-400" : "bg-dark-700 text-dark-200 hover:bg-dark-600"
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>
                      Auto
                    </button>
                    <button
                      onClick={() => setLogAutoScroll(!logAutoScroll)}
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-medium flex items-center gap-1.5 ${
                        logAutoScroll ? "bg-accent-500/15 text-accent-400" : "bg-dark-700 text-dark-200 hover:bg-dark-600"
                      }`}
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M19 14l-7 7m0 0l-7-7m7 7V3" /></svg>
                      Scroll
                    </button>
                    <button
                      onClick={() => logsTarget && fetchLogs(logsTarget)}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-dark-700 text-dark-200 hover:bg-dark-600"
                    >
                      Refresh
                    </button>
                    <button
                      onClick={downloadLogs}
                      className="px-2.5 py-1.5 rounded-lg text-xs font-medium bg-dark-700 text-dark-200 hover:bg-dark-600 flex items-center gap-1.5"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>
                      Save
                    </button>
                  </div>

                  {/* Log content */}
                  <div className="flex-1 overflow-y-auto p-4 bg-dark-950 font-mono text-xs min-h-0">
                    {logLines.length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-dark-300">
                        <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                        Loading logs...
                      </div>
                    ) : filtered.length === 0 ? (
                      <div className="flex items-center justify-center h-32 text-dark-300">
                        No matching log lines
                      </div>
                    ) : (
                      filtered.map((line, i) => {
                        const ll = line.toLowerCase();
                        const lvl = ll.includes("error") || ll.includes("fatal") || ll.includes("panic")
                          ? "text-danger-400"
                          : ll.includes("warn")
                          ? "text-warn-400"
                          : ll.includes("info")
                          ? "text-accent-400"
                          : "text-dark-200";
                        return (
                          <div key={i} className={`py-0.5 whitespace-pre-wrap break-all leading-relaxed ${lvl}`}>
                            <span className="select-none text-dark-300 mr-3 inline-block w-8 text-right">{i + 1}</span>
                            {logSearch ? (() => {
                              const idx = line.toLowerCase().indexOf(logSearch.toLowerCase());
                              if (idx === -1) return line;
                              return <>{line.slice(0, idx)}<mark className="bg-warn-500/30 text-warn-400 rounded px-0.5">{line.slice(idx, idx + logSearch.length)}</mark>{line.slice(idx + logSearch.length)}</>;
                            })() : line}
                          </div>
                        );
                      })
                    )}
                    <div ref={logEndRef} />
                  </div>
                </div>
              </div>
  );
}
