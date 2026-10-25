import type { PendingConfirm, ScanFinding, ScanSummary } from "./types";

interface ScansTabProps {
  scans: ScanSummary[];
  selectedScan: string | null;
  handleViewScan: (id: string) => void;
  findings: ScanFinding[];
  severityBadge: (severity: string) => string;
  checkTypeBadge: (type: string) => string;
  getFixAction: (finding: ScanFinding) => { type: string; target: string; label: string } | null;
  setPendingConfirm: (v: PendingConfirm | null) => void;
}

export default function ScansTab({
  scans, selectedScan, handleViewScan, findings, severityBadge,
  checkTypeBadge, getFixAction, setPendingConfirm,
}: ScansTabProps) {
  return (
    <>
      <div className="space-y-4">
        {scans.length === 0 ? (
          <div className="bg-dark-800 rounded-lg border border-dark-500 p-8 text-center">
            <p className="text-dark-300 text-sm">No security scans yet. Click "Run Security Scan" to start.</p>
          </div>
        ) : (
          scans.map((scan) => (
            <div key={scan.id} className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
              <button
                onClick={() => handleViewScan(scan.id)}
                className="w-full px-5 py-4 flex items-center justify-between hover:bg-dark-800 transition-colors text-left"
              >
                <div className="flex items-center gap-4">
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    scan.critical_count > 0 ? "bg-danger-500/15" : scan.warning_count > 0 ? "bg-warn-500/15" : "bg-rust-500/15"
                  }`}>
                    <svg className={`w-5 h-5 ${
                      scan.critical_count > 0 ? "text-danger-400" : scan.warning_count > 0 ? "text-warn-400" : "text-rust-400"
                    }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-sm font-medium text-dark-50">
                      {scan.scan_type === "full" ? "Full Security Scan" : scan.scan_type}
                    </p>
                    <p className="text-xs text-dark-300 font-mono">
                      {new Date(scan.started_at).toLocaleString()}
                      {scan.status === "running" && " (running...)"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  {scan.critical_count > 0 && (
                    <span className="px-2 py-0.5 bg-danger-500/15 text-danger-400 rounded text-xs font-medium">{scan.critical_count} critical</span>
                  )}
                  {scan.warning_count > 0 && (
                    <span className="px-2 py-0.5 bg-warn-500/15 text-warn-400 rounded text-xs font-medium">{scan.warning_count} warning</span>
                  )}
                  {scan.info_count > 0 && (
                    <span className="px-2 py-0.5 bg-accent-500/15 text-accent-400 rounded text-xs font-medium">{scan.info_count} info</span>
                  )}
                  {scan.findings_count === 0 && (
                    <span className="px-2 py-0.5 bg-rust-500/15 text-rust-400 rounded text-xs font-medium">Clean</span>
                  )}
                  <svg className={`w-4 h-4 text-dark-300 transition-transform ${selectedScan === scan.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                  </svg>
                </div>
              </button>

              {selectedScan === scan.id && (
                <div className="border-t border-dark-600">
                  {findings.length === 0 ? (
                    <div className="p-6 text-center text-sm text-dark-300">No findings — all checks passed</div>
                  ) : (
                    <div className="divide-y divide-dark-600">
                      {findings.map((f) => (
                        <div key={f.id} className="px-5 py-3">
                          <div className="flex items-start gap-3">
                            <span className={`mt-0.5 px-2 py-0.5 rounded text-[10px] font-semibold uppercase border ${severityBadge(f.severity)}`}>
                              {f.severity}
                            </span>
                            <div className="flex-1 min-w-0">
                              <p className="text-sm font-medium text-dark-50">{f.title}</p>
                              {f.description && (
                                <p className="text-xs text-dark-200 mt-0.5">{f.description}</p>
                              )}
                              <div className="flex items-center gap-3 mt-1.5">
                                <span className={`px-1.5 py-0.5 rounded text-[10px] font-medium font-mono ${checkTypeBadge(f.check_type)}`}>
                                  {f.check_type.replace("_", " ")}
                                </span>
                                {f.file_path && (
                                  <span className="text-[11px] text-dark-300 font-mono truncate">{f.file_path}</span>
                                )}
                              </div>
                              {f.remediation && (
                                <p className="text-xs text-rust-500 mt-1 inline-flex items-center gap-1">
                                  {f.remediation}
                                  {(() => {
                                    // Malware findings get Quarantine + Delete buttons
                                    if (f.check_type === "malware" && f.file_path) {
                                      return (
                                        <span className="flex gap-1 ml-2">
                                          <button
                                            onClick={() => setPendingConfirm({
                                              type: "quarantine",
                                              label: `Quarantine ${f.file_path}? (moves to /var/lib/dockpanel/quarantine/)`,
                                              data: { path: f.file_path }
                                            })}
                                            className="px-2 py-0.5 bg-warn-500/15 text-warn-400 rounded text-xs font-medium hover:bg-warn-500/25"
                                          >
                                            Quarantine
                                          </button>
                                          <button
                                            onClick={() => setPendingConfirm({
                                              type: "delete_file",
                                              label: `DELETE ${f.file_path}? This cannot be undone!`,
                                              data: { path: f.file_path }
                                            })}
                                            className="px-2 py-0.5 bg-danger-500/15 text-danger-400 rounded text-xs font-medium hover:bg-danger-500/25"
                                          >
                                            Delete
                                          </button>
                                        </span>
                                      );
                                    }
                                    const fix = getFixAction(f);
                                    if (!fix) return null;
                                    return (
                                      <button
                                        onClick={() => setPendingConfirm({
                                          type: "apply_fix",
                                          label: `Apply fix: ${fix.label}? This will ${fix.type === "block_port" ? `block port ${fix.target}/tcp` : fix.label.toLowerCase()}`,
                                          data: { fix_type: fix.type, target: fix.target, fix_label: fix.label }
                                        })}
                                        className="ml-2 px-2 py-0.5 bg-rust-500/15 text-rust-400 rounded text-xs font-medium hover:bg-rust-500/25 transition-colors"
                                      >
                                        Fix
                                      </button>
                                    );
                                  })()}
                                </p>
                              )}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>
    </>
  );
}
