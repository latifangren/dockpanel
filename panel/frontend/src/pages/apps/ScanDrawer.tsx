import type { Dispatch, SetStateAction } from "react";
import type { DeployedApp, ScanFinding } from "../Apps";
import { timeAgo } from "../../utils/format";

// Moved verbatim from pages/Apps.tsx (shell identifiers passed as props,
// destructured under the same names, so the body below is unchanged).
export function ScanDrawer({
  apps,
  downloadSbom,
  rescanApp,
  sbomLoading,
  scanDrawerImage,
  scanFindings,
  scanRescanning,
  setScanDrawerImage,
}: {
  apps: DeployedApp[];
  downloadSbom: (appName: string, image: string, forceRegenerate?: boolean) => void;
  rescanApp: (appName: string, image: string) => void;
  sbomLoading: string | null;
  scanDrawerImage: string;
  scanFindings: Record<string, ScanFinding>;
  scanRescanning: string | null;
  setScanDrawerImage: Dispatch<SetStateAction<string | null>>;
}) {
        const finding = scanFindings[scanDrawerImage];
        const matchedApp = apps.find(a => a.image === scanDrawerImage);
  return (
          <div
            className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 dp-modal-overlay"
            role="dialog"
            aria-modal="true"
            aria-labelledby="scan-dialog-title"
            tabIndex={-1}
            onClick={() => setScanDrawerImage(null)}
            onKeyDown={(e) => { if (e.key === "Escape") setScanDrawerImage(null); }}
          >
            <div className="bg-dark-800 rounded-lg shadow-xl p-6 w-full max-w-3xl max-h-[80vh] overflow-y-auto border border-dark-500 dp-modal" onClick={e => e.stopPropagation()}>
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 id="scan-dialog-title" className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Image Vulnerability Scan</h3>
                  <p className="text-sm text-dark-50 font-mono mt-1 break-all">{scanDrawerImage}</p>
                </div>
                <button type="button" onClick={() => setScanDrawerImage(null)} aria-label="Close" className="text-dark-300 hover:text-dark-50 text-2xl leading-none">&times;</button>
              </div>

              {finding ? (
                <>
                  <div className="grid grid-cols-5 gap-2 mb-4">
                    <div className="bg-danger-500/10 rounded p-3 text-center">
                      <div className="text-2xl font-bold text-danger-400">{finding.critical_count}</div>
                      <div className="text-[10px] uppercase font-mono text-danger-400 tracking-widest">Critical</div>
                    </div>
                    <div className="bg-warn-500/10 rounded p-3 text-center">
                      <div className="text-2xl font-bold text-warn-400">{finding.high_count}</div>
                      <div className="text-[10px] uppercase font-mono text-warn-400 tracking-widest">High</div>
                    </div>
                    <div className="bg-warn-500/5 rounded p-3 text-center">
                      <div className="text-2xl font-bold text-warn-500">{finding.medium_count}</div>
                      <div className="text-[10px] uppercase font-mono text-warn-500 tracking-widest">Medium</div>
                    </div>
                    <div className="bg-accent-500/10 rounded p-3 text-center">
                      <div className="text-2xl font-bold text-accent-400">{finding.low_count}</div>
                      <div className="text-[10px] uppercase font-mono text-accent-400 tracking-widest">Low</div>
                    </div>
                    <div className="bg-dark-700 rounded p-3 text-center">
                      <div className="text-2xl font-bold text-dark-200">{finding.unknown_count}</div>
                      <div className="text-[10px] uppercase font-mono text-dark-300 tracking-widest">Unknown</div>
                    </div>
                  </div>
                  <div className="flex items-center justify-between mb-3 text-xs text-dark-300">
                    <span>Scanner: <span className="font-mono text-dark-200">{finding.scanner}</span></span>
                    <span title={new Date(finding.scanned_at).toLocaleString()}>Scanned {timeAgo(finding.scanned_at)}</span>
                  </div>
                  {matchedApp && (
                    <div className="flex gap-2 mb-4">
                      <button
                        type="button"
                        onClick={() => rescanApp(matchedApp.name, scanDrawerImage)}
                        disabled={scanRescanning === matchedApp.name}
                        className="px-3 py-1.5 text-xs font-medium bg-rust-600 text-white rounded hover:bg-rust-700 disabled:opacity-50"
                      >
                        {scanRescanning === matchedApp.name ? "Scanning..." : "Rescan now"}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadSbom(matchedApp.name, scanDrawerImage)}
                        disabled={sbomLoading === matchedApp.name}
                        title="Download the stored SPDX 2.3 SBOM for this image, generating one first if none exists yet"
                        className="px-3 py-1.5 text-xs font-medium bg-dark-600 text-dark-50 rounded hover:bg-dark-500 disabled:opacity-50"
                      >
                        {sbomLoading === matchedApp.name ? "Generating SBOM..." : "Download SBOM"}
                      </button>
                      <button
                        type="button"
                        onClick={() => downloadSbom(matchedApp.name, scanDrawerImage, true)}
                        disabled={sbomLoading === matchedApp.name}
                        title="Force a fresh SBOM scan (syft) instead of using the stored one"
                        className="px-3 py-1.5 text-xs font-medium bg-dark-600 text-dark-50 rounded hover:bg-dark-500 disabled:opacity-50"
                      >
                        Regenerate
                      </button>
                    </div>
                  )}
                  {finding.vulnerabilities.length > 0 ? (
                    <div className="border border-dark-600 rounded overflow-hidden">
                      <table className="w-full text-xs">
                        <thead>
                          <tr className="bg-dark-900 text-dark-300 uppercase font-mono tracking-widest">
                            <th className="text-left px-3 py-2">CVE</th>
                            <th className="text-left px-3 py-2">Severity</th>
                            <th className="text-left px-3 py-2">Package</th>
                            <th className="text-left px-3 py-2">Installed</th>
                            <th className="text-left px-3 py-2">Fixed in</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-dark-600">
                          {finding.vulnerabilities.slice(0, 200).map((v, i) => {
                            const sev = (v.severity || "").toLowerCase();
                            const sevClass =
                              sev === "critical" ? "bg-danger-500/15 text-danger-400" :
                              sev === "high" ? "bg-warn-500/15 text-warn-400" :
                              sev === "medium" ? "bg-warn-500/10 text-warn-500" :
                              sev === "low" ? "bg-accent-500/10 text-accent-400" :
                              "bg-dark-700 text-dark-300";
                            const isCveId = /^CVE-\d{4}-\d{4,}$/i.test(v.cve);
                            return (
                              <tr key={`${v.cve}-${v.package}-${i}`} className="hover:bg-dark-700/30" title={v.description || undefined}>
                                <td className="px-3 py-2 font-mono">
                                  {isCveId ? (
                                    <a
                                      href={`https://nvd.nist.gov/vuln/detail/${encodeURIComponent(v.cve)}`}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-rust-400 hover:underline"
                                    >{v.cve}</a>
                                  ) : (
                                    <span className="text-dark-50">{v.cve}</span>
                                  )}
                                </td>
                                <td className="px-3 py-2">
                                  <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${sevClass}`}>{v.severity || "unknown"}</span>
                                </td>
                                <td className="px-3 py-2 text-dark-200">{v.package}</td>
                                <td className="px-3 py-2 text-dark-300 font-mono">{v.installed_version}</td>
                                <td className="px-3 py-2 text-dark-200 font-mono">{v.fixed_version || "—"}</td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                      {finding.vulnerabilities.length > 200 && (
                        <div className="px-3 py-2 text-[10px] text-dark-300 bg-dark-900 text-center">
                          Showing first 200 of {finding.vulnerabilities.length} findings
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-dark-300 text-sm">No findings recorded for this scan.</div>
                  )}
                </>
              ) : (
                <div className="text-center py-8">
                  <p className="text-dark-300 text-sm mb-4">No scan recorded for this image.</p>
                  {matchedApp && (
                    <button
                      type="button"
                      onClick={() => rescanApp(matchedApp.name, scanDrawerImage)}
                      disabled={scanRescanning === matchedApp.name}
                      className="px-4 py-2 text-sm font-medium bg-rust-600 text-white rounded hover:bg-rust-700 disabled:opacity-50"
                    >
                      {scanRescanning === matchedApp.name ? "Scanning..." : "Scan now"}
                    </button>
                  )}
                  {!matchedApp && (
                    <p className="text-xs text-dark-300">
                      Scanner not installed? Enable it in Settings → Image Scanning.
                    </p>
                  )}
                </div>
              )}
            </div>
          </div>
  );
}
