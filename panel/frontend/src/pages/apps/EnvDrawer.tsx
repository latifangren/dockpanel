import type { Dispatch, SetStateAction } from "react";
import type { DeployedApp } from "../Apps";

// Moved verbatim from pages/Apps.tsx (shell identifiers passed as props,
// destructured under the same names, so the body below is unchanged).
export function EnvDrawer({
  ENV_MASK,
  apps,
  envEditRows,
  envEditing,
  envLoading,
  envSaving,
  envTarget,
  envVars,
  handleEnvSave,
  setEnvEditRows,
  setEnvEditing,
  setEnvTarget
}: {
  ENV_MASK: string;
  apps: DeployedApp[];
  envEditRows: { key: string; value: string }[];
  envEditing: boolean;
  envLoading: boolean;
  envSaving: boolean;
  envTarget: string | null;
  envVars: { key: string; value: string }[];
  handleEnvSave: () => void;
  setEnvEditRows: Dispatch<SetStateAction<{ key: string; value: string }[]>>;
  setEnvEditing: Dispatch<SetStateAction<boolean>>;
  setEnvTarget: Dispatch<SetStateAction<string | null>>
}) {
  return (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 dp-modal-overlay"
          role="dialog"
          aria-labelledby="env-dialog-title"
          onKeyDown={(e) => { if (e.key === "Escape") { setEnvTarget(null); setEnvEditing(false); }}}
        >
          <div className="bg-dark-800 rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto border border-dark-500 dp-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 id="env-dialog-title" className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">
                Environment Variables
              </h3>
              <div className="flex items-center gap-2">
                {/* Deliberately ungated on how many variables are already set:
                    a container with none is exactly the case that needs the
                    editor most, and that gate was half of why an arbitrary key
                    could never be added. The condition is not spelled in this
                    comment because a pin arm greps raw source and a quotation
                    here would satisfy it while the code changed. */}
                {!envEditing && (
                  <button
                    onClick={() => {
                      setEnvEditing(true);
                      setEnvEditRows(envVars.map(ev => ({ key: ev.key, value: ev.value })));
                    }}
                    className="px-2 py-1 text-xs font-medium bg-accent-600/15 text-accent-400 rounded hover:bg-accent-600/25"
                  >
                    Edit
                  </button>
                )}
                <button onClick={() => { setEnvTarget(null); setEnvEditing(false); }} className="text-dark-300 hover:text-dark-50">
                  <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
                </button>
              </div>
            </div>
            <p className="text-xs text-dark-300 mb-3">
              {apps.find(a => a.container_id === envTarget)?.name}
            </p>
            {envEditing && (
              <div className="mb-3 px-3 py-2 bg-warn-500/10 border border-warn-500/20 rounded-lg">
                <p className="text-xs text-warn-400">Container will be recreated with the new environment variables. This causes brief downtime.</p>
                {envVars.some(ev => ev.value === ENV_MASK) && (
                  <p className="text-xs text-warn-400/80 mt-1">
                    Values shown as <span className="font-mono">{ENV_MASK}</span> are hidden, not empty. Leave one as it is to keep the stored value; type over it to replace it.
                  </p>
                )}
              </div>
            )}
            {envLoading ? (
              <div className="flex items-center justify-center py-8 text-dark-300">
                <svg className="w-5 h-5 animate-spin mr-2" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                Loading...
              </div>
            ) : envEditing ? (
              /* Editing is checked BEFORE the empty case: a container with no
                 variables set is precisely where Add is needed, and testing
                 emptiness first would render "none set" over the editor. */
              <div className="space-y-2">
                {envEditRows.map((row, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <input
                      type="text"
                      value={row.key}
                      placeholder="KEY"
                      spellCheck={false}
                      onChange={(e) => {
                        const n = [...envEditRows];
                        n[i] = { ...n[i], key: e.target.value };
                        setEnvEditRows(n);
                      }}
                      className="w-1/3 text-xs font-mono text-dark-100 bg-dark-900 rounded px-2 py-1.5 border border-dark-600 focus:ring-1 focus:ring-accent-500 focus:border-accent-500"
                    />
                    <input
                      type="text"
                      value={row.value}
                      placeholder="value"
                      spellCheck={false}
                      onChange={(e) => {
                        const n = [...envEditRows];
                        n[i] = { ...n[i], value: e.target.value };
                        setEnvEditRows(n);
                      }}
                      className="flex-1 min-w-0 text-xs font-mono text-dark-100 bg-dark-900 rounded px-2 py-1.5 border border-dark-600 focus:ring-1 focus:ring-accent-500 focus:border-accent-500"
                    />
                    <button
                      onClick={() => setEnvEditRows(envEditRows.filter((_, j) => j !== i))}
                      aria-label={`Remove ${row.key || "variable"}`}
                      className="px-1.5 py-1.5 text-danger-400 hover:text-danger-300 text-sm"
                    >
                      &times;
                    </button>
                  </div>
                ))}
                <button
                  onClick={() => setEnvEditRows([...envEditRows, { key: "", value: "" }])}
                  className="text-xs text-accent-400 hover:text-accent-300"
                >
                  + Add variable
                </button>
                {/* The container is the only store of an app's environment, so
                    a value the read masked comes back as the mask and means
                    "leave this one alone" — the server resolves it. Removing a
                    row removes the variable. */}
                <p className="text-[11px] text-dark-400 pt-1">
                  Saving recreates the container. Values shown as
                  {" "}<span className="font-mono">{ENV_MASK}</span>{" "}
                  are unchanged unless you edit them.
                </p>
                <div className="flex justify-end gap-2 mt-4 pt-3 border-t border-dark-600">
                  <button onClick={() => setEnvEditing(false)} className="px-3 py-1.5 text-xs text-dark-300 border border-dark-600 rounded hover:text-dark-100">
                    Cancel
                  </button>
                  <button
                    onClick={handleEnvSave}
                    disabled={envSaving}
                    className="px-3 py-1.5 text-xs bg-accent-600 text-white rounded hover:bg-accent-700 disabled:opacity-50"
                  >
                    {envSaving ? "Saving..." : "Save & Recreate"}
                  </button>
                </div>
              </div>
            ) : envVars.length === 0 ? (
              <div className="text-center py-8 text-dark-300 text-sm">No environment variables set</div>
            ) : (
              <div className="space-y-2">
                {envVars.map((ev, i) => (
                  <div key={i} className="flex gap-2 items-start">
                    <div className="flex-1 min-w-0">
                      <div className="text-xs font-mono text-dark-200 truncate">{ev.key}</div>
                      <div className="text-xs font-mono text-dark-100 break-all bg-dark-900 rounded px-2 py-1 mt-0.5 border border-dark-600">
                        {ev.key.toLowerCase().includes("password") || ev.key.toLowerCase().includes("secret") || ev.key.toLowerCase().includes("token") || ev.key.toLowerCase().includes("key")
                          ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022"
                          : ev.value}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {/* Volumes */}
            {!envEditing && (() => {
              const app = apps.find(a => a.container_id === envTarget);
              return app && app.volumes && app.volumes.length > 0 ? (
                <div className="mt-4 pt-3 border-t border-dark-600">
                  <p className="text-xs font-medium text-dark-200 mb-2">Persistent Volumes</p>
                  <div className="space-y-1.5">
                    {app.volumes.map((v, i) => (
                      <div key={i} className="text-xs font-mono text-dark-100 bg-dark-900 rounded px-2 py-1.5 border border-dark-600 flex items-center gap-2">
                        <svg className="w-3.5 h-3.5 text-dark-300 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" /></svg>
                        {v}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null;
            })()}
            {!envEditing && (
              <div className="mt-4 pt-3 border-t border-dark-600">
                <p className="text-[10px] text-dark-300">
                  Click "Edit" to modify environment variables. The container will be recreated with updated values.
                </p>
              </div>
            )}
          </div>
        </div>
  );
}
