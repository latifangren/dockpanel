import type { Dispatch, SetStateAction } from "react";
import { api } from "../../api";
import { maskRepoCredentials, statusBadge } from "./helpers";
import type { GitDeploy, GitPreview, DeployHistory } from "../GitDeploys";

export default function DeployDetail({
  selected,
  history,
  previews,
  deploying,
  generatingKey,
  showDeployKey,
  showLogs,
  showSecret,
  containerLogs,
  expandedLog,
  aiExplain,
  setExpandedLog,
  setShowDeployKey,
  setShowLogs,
  setShowSecret,
  setMessage,
  openEdit,
  handleDeploy,
  handleDelete,
  handleKeygen,
  loadContainerLogs,
  copyText,
  handleRollback,
  explainWithAi,
  deletePreview,
  loadDeploys,
}: {
  selected: GitDeploy | null;
  history: DeployHistory[];
  previews: GitPreview[];
  deploying: string | null;
  generatingKey: boolean;
  showDeployKey: boolean;
  showLogs: boolean;
  showSecret: boolean;
  containerLogs: string;
  expandedLog: string | null;
  aiExplain: Record<string, { loading: boolean; text?: string; error?: string; provider?: string }>;
  setExpandedLog: Dispatch<SetStateAction<string | null>>;
  setShowDeployKey: Dispatch<SetStateAction<boolean>>;
  setShowLogs: Dispatch<SetStateAction<boolean>>;
  setShowSecret: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<{ text: string; type: string }>>;
  openEdit: () => void;
  handleDeploy: (id: string) => void;
  handleDelete: (id: string) => void;
  handleKeygen: () => void;
  loadContainerLogs: () => void;
  copyText: (text: string) => void;
  handleRollback: (historyId: string) => void;
  explainWithAi: (historyId: string) => void;
  deletePreview: (previewId: string) => void;
  loadDeploys: () => void;
}) {
  return (
    <>
      {/* Detail panel */}
      {selected && (
        <div className="mt-6 space-y-6 animate-fade-up">
          {/* Config section */}
          <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
            <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
              <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Configuration</h2>
              <button
                onClick={openEdit}
                className="px-3 py-1 bg-dark-700 text-dark-100 rounded-md text-xs font-medium hover:bg-dark-600 transition-colors"
              >
                Edit
              </button>
            </div>
            <div className="p-5">
              <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
                {[
                  { label: "Name", value: selected.name },
                  { label: "Repository", value: maskRepoCredentials(selected.repo_url) },
                  { label: "Branch", value: selected.branch },
                  { label: "Dockerfile", value: selected.dockerfile },
                  { label: "Container Port", value: String(selected.container_port) },
                  { label: "Host Port", value: String(selected.host_port) },
                  { label: "Domain", value: selected.domain || "\u2014" },
                  { label: "Auto-deploy", value: selected.auto_deploy ? "Enabled" : "Disabled" },
                  { label: "Status", value: selected.status },
                  { label: "Last Commit", value: selected.last_commit ? selected.last_commit.substring(0, 8) : "\u2014" },
                  { label: "Memory Limit", value: selected.memory_mb ? `${selected.memory_mb} MB` : "None" },
                  { label: "CPU Limit", value: selected.cpu_percent ? `${selected.cpu_percent}%` : "None" },
                  {
                    label: "HTTPS",
                    value:
                      (selected.tls_mode ?? (selected.ssl_email ? "acme" : "none")) === "provided"
                        ? `Registered certificate (${selected.tls_certificate || "\u2014"})`
                        : (selected.tls_mode ?? (selected.ssl_email ? "acme" : "none")) === "acme"
                        ? `Let's Encrypt (${selected.ssl_email || "\u2014"})`
                        : "None",
                  },
                  { label: "Pre-build Cmd", value: selected.pre_build_cmd || "\u2014" },
                  { label: "Post-deploy Cmd", value: selected.post_deploy_cmd || "\u2014" },
                  { label: "Build Method", value: selected.build_method === "nixpacks" ? "Nixpacks" : selected.build_method === "auto-detect" ? "Auto-detect" : selected.build_method === "compose" ? "Docker Compose" : "Dockerfile" },
                  { label: "Preview TTL", value: selected.preview_ttl_hours > 0 ? `${selected.preview_ttl_hours}h` : "No auto-cleanup" },
                  { label: "Build Context", value: selected.build_context || "." },
                  { label: "GitHub", value: selected.github_token ? "Connected" : "Not configured" },
                  { label: "Deploy Schedule", value: selected.deploy_cron || "\u2014" },
                  { label: "Deploy Protection", value: selected.deploy_protected ? "Second admin must approve" : "Disabled" },
                ].map((field) => (
                  <div key={field.label}>
                    <span className="block text-xs font-medium text-dark-300 mb-0.5">{field.label}</span>
                    <span className="text-sm text-dark-50 font-mono break-all">{field.value}</span>
                  </div>
                ))}
              </div>
              {Object.keys(selected.env_vars).length > 0 && (
                <div className="mt-4">
                  <span className="block text-xs font-medium text-dark-300 mb-1">Environment Variables</span>
                  <div className="bg-dark-900 border border-dark-500 rounded-lg p-3 space-y-1">
                    {Object.entries(selected.env_vars).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-dark-100">{k}</span>
                        <span className="text-dark-300">=</span>
                        <span className="text-dark-200">{"*".repeat(Math.min(v.length, 12))}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {(selected.volumes || []).length > 0 && (
                <div className="mt-4">
                  <span className="block text-xs font-medium text-dark-300 mb-1">Persistent Volumes</span>
                  <div className="bg-dark-900 border border-dark-500 rounded-lg p-3 space-y-1">
                    {selected.volumes.map((path) => (
                      <div key={path} className="text-xs font-mono text-dark-100">{path}</div>
                    ))}
                  </div>
                </div>
              )}
              {Object.keys(selected.build_args || {}).length > 0 && (
                <div className="mt-4">
                  <span className="block text-xs font-medium text-dark-300 mb-1">Build Arguments</span>
                  <div className="bg-dark-900 border border-dark-500 rounded-lg p-3 space-y-1">
                    {Object.entries(selected.build_args).map(([k, v]) => (
                      <div key={k} className="flex items-center gap-2 text-xs font-mono">
                        <span className="text-dark-100">{k}</span>
                        <span className="text-dark-300">=</span>
                        <span className="text-dark-200">{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Actions bar */}
          <div className="flex items-center gap-3">
            <button
              onClick={() => handleDeploy(selected.id)}
              disabled={deploying === selected.id}
              className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {deploying === selected.id && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {deploying === selected.id ? "Deploying..." : "Deploy Now"}
            </button>
            {selected.status === "running" && (
              <>
                <button onClick={async () => { await api.post(`/git-deploys/${selected.id}/stop`); loadDeploys(); }} className="px-3 py-2 bg-dark-700 text-dark-100 rounded-lg text-sm font-medium hover:bg-dark-600 transition-colors">Stop</button>
                <button onClick={async () => { await api.post(`/git-deploys/${selected.id}/restart`); loadDeploys(); }} className="px-3 py-2 bg-dark-700 text-dark-100 rounded-lg text-sm font-medium hover:bg-dark-600 transition-colors">Restart</button>
              </>
            )}
            {selected.status === "stopped" && (
              <button onClick={async () => { await api.post(`/git-deploys/${selected.id}/start`); loadDeploys(); setMessage({ text: "Container started", type: "success" }); }} className="px-3 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 transition-colors">Start</button>
            )}
            <button
              onClick={() => handleDelete(selected.id)}
              className="px-4 py-2 bg-danger-500/10 text-danger-400 rounded-lg text-sm font-medium hover:bg-danger-500/20 transition-colors"
            >
              Delete
            </button>
          </div>

          {/* Deploy Key */}
          <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
            <button
              onClick={() => setShowDeployKey(!showDeployKey)}
              className="w-full px-5 py-4 flex items-center justify-between hover:bg-dark-700/30 transition-colors"
            >
              <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Deploy Key</h2>
              <svg className={`w-4 h-4 text-dark-300 transition-transform ${showDeployKey ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
              </svg>
            </button>
            {showDeployKey && (
              <div className="px-5 pb-5 border-t border-dark-600 pt-4">
                <p className="text-xs text-dark-200 mb-3">Add this key to your Git provider for private repos.</p>
                {selected.deploy_key_public ? (
                  <div className="space-y-3">
                    <div className="relative">
                      <pre className="bg-dark-900 border border-dark-500 rounded-lg p-3 text-xs font-mono text-dark-100 overflow-x-auto whitespace-pre-wrap break-all">
                        {selected.deploy_key_public}
                      </pre>
                      <button
                        onClick={() => copyText(selected.deploy_key_public!)}
                        className="absolute top-2 right-2 px-2 py-1 bg-dark-800 border border-dark-500 rounded text-xs text-dark-200 hover:text-dark-50 transition-colors"
                      >
                        Copy
                      </button>
                    </div>
                    <button
                      onClick={handleKeygen}
                      disabled={generatingKey}
                      className="text-sm text-dark-200 hover:text-dark-50 transition-colors"
                    >
                      {generatingKey ? "Regenerating..." : "Regenerate key"}
                    </button>
                  </div>
                ) : (
                  <button
                    onClick={handleKeygen}
                    disabled={generatingKey}
                    className="px-4 py-2 bg-dark-700 text-dark-100 rounded-lg text-sm font-medium hover:bg-dark-600 disabled:opacity-50 transition-colors"
                  >
                    {generatingKey ? "Generating..." : "Generate Deploy Key"}
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Container Logs */}
          {selected.container_id && (
            <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
              <button onClick={() => { setShowLogs(!showLogs); if (!showLogs) loadContainerLogs(); }} className="w-full px-5 py-4 flex items-center justify-between hover:bg-dark-700/30 transition-colors">
                <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Container Logs</h2>
                <svg className={`w-4 h-4 text-dark-300 transition-transform ${showLogs ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                </svg>
              </button>
              {showLogs && (
                <div className="border-t border-dark-600">
                  <div className="flex items-center justify-between px-5 py-2 bg-dark-900">
                    <span className="text-xs text-dark-300 font-mono">stdout + stderr</span>
                    <button onClick={loadContainerLogs} className="text-xs text-rust-400 hover:text-rust-300 transition-colors">Refresh</button>
                  </div>
                  <pre className="p-4 text-[11px] font-mono text-dark-200 bg-dark-950 max-h-80 overflow-y-auto overflow-x-auto whitespace-pre-wrap">
                    {containerLogs || "No logs available"}
                  </pre>
                </div>
              )}
            </div>
          )}

          {/* Webhook URL */}
          {selected.auto_deploy && (
            <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
              <div className="px-5 py-4 border-b border-dark-600">
                <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Webhook URL</h2>
                <p className="text-xs text-dark-200 mt-1">Add this URL to your Git provider's webhook settings (push events).</p>
              </div>
              <div className="p-5">
                <div className="relative">
                  <pre className="bg-dark-900 border border-dark-500 rounded-lg p-3 text-xs font-mono text-dark-100 overflow-x-auto pr-24">
                    {showSecret
                      ? `${window.location.origin}/api/webhooks/git/${selected.id}/${selected.webhook_secret}`
                      : `${window.location.origin}/api/webhooks/git/${selected.id}/${"●".repeat(8)}`}
                  </pre>
                  <div className="absolute top-2 right-2 flex items-center gap-1">
                    <button
                      onClick={() => setShowSecret(!showSecret)}
                      className="px-2 py-1 bg-dark-800 border border-dark-500 rounded text-xs text-dark-200 hover:text-dark-50 transition-colors"
                      title={showSecret ? "Hide secret" : "Show secret"}
                    >
                      {showSecret ? (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                        </svg>
                      )}
                    </button>
                    <button
                      onClick={() => copyText(`${window.location.origin}/api/webhooks/git/${selected.id}/${selected.webhook_secret}`)}
                      className="px-2 py-1 bg-dark-800 border border-dark-500 rounded text-xs text-dark-200 hover:text-dark-50 transition-colors"
                    >
                      Copy
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Deploy History */}
          {history.length > 0 && (
            <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
              <div className="px-5 py-4 border-b border-dark-600">
                <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Deploy History</h2>
              </div>
              <div className="divide-y divide-dark-600">
                {history.map((entry, idx) => (
                  <div key={entry.id}>
                    <button
                      onClick={() => setExpandedLog(expandedLog === entry.id ? null : entry.id)}
                      className="w-full px-5 py-3 flex items-center justify-between hover:bg-dark-700/30 transition-colors text-left"
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium shrink-0 ${statusBadge(entry.status)}`}>
                          {entry.status}
                        </span>
                        <code className="text-xs text-dark-200 bg-dark-700 px-1.5 py-0.5 rounded font-mono shrink-0">
                          {entry.commit_hash.substring(0, 8)}
                        </code>
                        {entry.commit_message && (
                          <span className="text-sm text-dark-100 truncate">{entry.commit_message}</span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 shrink-0 ml-3">
                        <span className="text-xs text-dark-300 bg-dark-700 px-1.5 py-0.5 rounded">{entry.triggered_by}</span>
                        {entry.duration_ms != null && (
                          <span className="text-xs text-dark-200 font-mono">{(entry.duration_ms / 1000).toFixed(1)}s</span>
                        )}
                        <span className="text-xs text-dark-300">{new Date(entry.created_at).toLocaleString()}</span>
                        {/* Rollback button — not on the first (latest) entry if it's running */}
                        {!(idx === 0 && (entry.status === "deploying" || entry.status === "running")) && (
                          <button
                            onClick={(e) => { e.stopPropagation(); handleRollback(entry.id); }}
                            className="px-2 py-0.5 bg-warn-500/10 text-warn-400 rounded text-xs font-medium hover:bg-warn-500/20 transition-colors"
                          >
                            Rollback
                          </button>
                        )}
                        {entry.status === "failed" && (
                          <button
                            onClick={(e) => { e.stopPropagation(); setExpandedLog(entry.id); explainWithAi(entry.id); }}
                            disabled={aiExplain[entry.id]?.loading}
                            className="px-2 py-0.5 bg-accent-500/10 text-accent-400 rounded text-xs font-medium hover:bg-accent-500/20 transition-colors disabled:opacity-50"
                          >
                            {aiExplain[entry.id]?.loading ? "Explaining..." : "Explain with AI"}
                          </button>
                        )}
                        <svg className={`w-4 h-4 text-dark-300 transition-transform ${expandedLog === entry.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="m19.5 8.25-7.5 7.5-7.5-7.5" />
                        </svg>
                      </div>
                    </button>
                    {expandedLog === entry.id && entry.output && (
                      <div className="px-5 pb-4 space-y-3">
                        <pre className="bg-dark-900 text-dark-100 rounded-lg p-4 text-xs font-mono overflow-x-auto max-h-64 overflow-y-auto whitespace-pre-wrap border border-dark-500">
                          {entry.output}
                        </pre>
                        {aiExplain[entry.id] && (
                          <div className="bg-accent-500/5 border border-accent-500/20 rounded-lg p-4">
                            <div className="flex items-center gap-2 mb-1.5">
                              <span className="text-[10px] font-medium text-accent-400 uppercase tracking-widest">AI Diagnosis</span>
                              {aiExplain[entry.id].provider && (
                                <span className="text-[10px] text-dark-300">via {aiExplain[entry.id].provider}</span>
                              )}
                            </div>
                            {aiExplain[entry.id].loading && (
                              <p className="text-xs text-dark-200">Asking the configured provider...</p>
                            )}
                            {aiExplain[entry.id].error && (
                              <p className="text-xs text-danger-400">{aiExplain[entry.id].error}</p>
                            )}
                            {aiExplain[entry.id].text && (
                              <p className="text-xs text-dark-100 whitespace-pre-wrap">{aiExplain[entry.id].text}</p>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Preview Deployments */}
          {previews.length > 0 && (
            <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
              <div className="px-5 py-4 border-b border-dark-600">
                <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Preview Deployments</h2>
              </div>
              <div className="divide-y divide-dark-600">
                {previews.map(p => (
                  <div key={p.id} className="px-5 py-3 flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${statusBadge(p.status)}`}>{p.status}</span>
                      <code className="text-sm text-dark-50 font-mono">{p.branch}</code>
                      {p.commit_hash && <code className="text-xs text-dark-300 font-mono">{p.commit_hash.substring(0, 8)}</code>}
                    </div>
                    <div className="flex items-center gap-2">
                      {p.domain && <a href={`http://${p.domain}`} target="_blank" rel="noreferrer" className="text-xs text-rust-400 hover:text-rust-300">Open</a>}
                      <span className="text-xs text-dark-300 font-mono">:{p.host_port}</span>
                      <button onClick={() => deletePreview(p.id)} className="text-xs text-danger-400 hover:text-danger-300">Delete</button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  );
}
