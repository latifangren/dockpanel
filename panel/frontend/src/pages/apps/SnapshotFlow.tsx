import type { Dispatch, SetStateAction } from "react";
import type { DeployedApp } from "../Apps";

// Moved verbatim from pages/Apps.tsx (inline per-app snapshot control;
// `app` is the list row it renders in, passed as a prop).
export function SnapshotFlow({
  app,
  handleSnapshot,
  setSnapshotTag,
  setSnapshotTarget,
  snapshotTag,
  snapshotTarget,
}: {
  app: DeployedApp;
  handleSnapshot: () => void;
  setSnapshotTag: Dispatch<SetStateAction<string>>;
  setSnapshotTarget: Dispatch<SetStateAction<{ id: string; name: string } | null>>;
  snapshotTag: string;
  snapshotTarget: { id: string; name: string } | null;
}) {
  return (
                        snapshotTarget?.id === app.container_id ? (
                          <span className="inline-flex items-center gap-1">
                            <input
                              type="text"
                              value={snapshotTag}
                              onChange={(e) => setSnapshotTag(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleSnapshot(); if (e.key === "Escape") { setSnapshotTarget(null); setSnapshotTag(""); } }}
                              autoFocus
                              className="w-32 px-1.5 py-0.5 bg-dark-900 border border-dark-500 rounded text-xs font-mono text-dark-100"
                              placeholder="Tag name"
                            />
                            <button onClick={handleSnapshot} disabled={!snapshotTag} className="px-1.5 py-0.5 bg-rust-500 text-white rounded text-[10px] font-medium disabled:opacity-50">Save</button>
                            <button onClick={() => { setSnapshotTarget(null); setSnapshotTag(""); }} className="px-1.5 py-0.5 bg-dark-600 text-dark-200 rounded text-[10px]">Cancel</button>
                          </span>
                        ) : (
                          <button
                            onClick={() => { setSnapshotTarget({ id: app.container_id, name: app.name }); setSnapshotTag(`snapshot-${app.name}-${Date.now()}`); }}
                            className="px-2 py-1 rounded text-xs font-medium bg-dark-700 text-dark-300 hover:bg-dark-600"
                          >
                            Snapshot
                          </button>
                        )
  );
}
