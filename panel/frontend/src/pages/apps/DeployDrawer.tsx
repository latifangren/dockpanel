import type { Dispatch, SetStateAction } from "react";
import type { AppTemplate, GpuDevice } from "../Apps";
import type { PrereqResult } from "../../components/Prerequisite";
import { FieldHelp } from "../../components/FieldHelp";
import { PrereqList } from "../../components/Prerequisite";

// Moved verbatim from pages/Apps.tsx (shell identifiers passed as props,
// destructured under the same names, so the body below is unchanged).
export function DeployDrawer({
  appDomain,
  appName,
  appPort,
  applySuggestion,
  availableGpus,
  cpuPercent,
  deployBlocker,
  deployChecks,
  deployError,
  deploying,
  enableHealthCheck,
  envValues,
  externalTls,
  generateSecret,
  gpuEnabled,
  gpuMode,
  gpuSelectedIndices,
  handleDeploy,
  healthCmd,
  healthInterval,
  healthRetries,
  healthTimeout,
  memoryMb,
  preflightChecking,
  recheckDeploy,
  selected,
  setAppDomain,
  setAppName,
  setAppPort,
  setCpuPercent,
  setEnableHealthCheck,
  setEnvValues,
  setExternalTls,
  setGpuEnabled,
  setGpuMode,
  setGpuSelectedIndices,
  setHealthCmd,
  setHealthInterval,
  setHealthRetries,
  setHealthTimeout,
  setMemoryMb,
  setSelected,
  setSslEmail,
  sslEmail
}: {
  appDomain: string;
  appName: string;
  appPort: number;
  applySuggestion: (appliesTo: string, value: string) => void;
  availableGpus: GpuDevice[];
  cpuPercent: string;
  deployBlocker: PrereqResult | null;
  deployChecks: PrereqResult[];
  deployError: string;
  deploying: boolean;
  enableHealthCheck: boolean;
  envValues: Record<string, string>;
  externalTls: boolean;
  generateSecret: (name: string) => void;
  gpuEnabled: boolean;
  gpuMode: "none" | "all" | "specific";
  gpuSelectedIndices: number[];
  handleDeploy: () => void;
  healthCmd: string;
  healthInterval: string;
  healthRetries: string;
  healthTimeout: string;
  memoryMb: string;
  preflightChecking: boolean;
  recheckDeploy: () => void;
  selected: AppTemplate;
  setAppDomain: Dispatch<SetStateAction<string>>;
  setAppName: Dispatch<SetStateAction<string>>;
  setAppPort: Dispatch<SetStateAction<number>>;
  setCpuPercent: Dispatch<SetStateAction<string>>;
  setEnableHealthCheck: Dispatch<SetStateAction<boolean>>;
  setEnvValues: Dispatch<SetStateAction<Record<string, string>>>;
  setExternalTls: Dispatch<SetStateAction<boolean>>;
  setGpuEnabled: Dispatch<SetStateAction<boolean>>;
  setGpuMode: Dispatch<SetStateAction<"none" | "all" | "specific">>;
  setGpuSelectedIndices: Dispatch<SetStateAction<number[]>>;
  setHealthCmd: Dispatch<SetStateAction<string>>;
  setHealthInterval: Dispatch<SetStateAction<string>>;
  setHealthRetries: Dispatch<SetStateAction<string>>;
  setHealthTimeout: Dispatch<SetStateAction<string>>;
  setMemoryMb: Dispatch<SetStateAction<string>>;
  setSelected: Dispatch<SetStateAction<AppTemplate | null>>;
  setSslEmail: Dispatch<SetStateAction<string>>;
  sslEmail: string
}) {
  return (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 dp-modal-overlay"
          role="dialog"
          aria-labelledby="deploy-dialog-title"
          onKeyDown={(e) => { if (e.key === "Escape") setSelected(null); }}
        >
          <div className="bg-dark-800 rounded-lg shadow-xl p-6 w-full max-w-[480px] max-h-[80vh] overflow-y-auto dp-modal">
            <h3 id="deploy-dialog-title" className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest mb-1">
              Deploy {selected.name}
            </h3>
            <p className="text-sm text-dark-200 mb-4">{selected.description}</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Container Name</label>
                <input
                  type="text"
                  value={appName}
                  onChange={(e) => setAppName(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                />
                <FieldHelp id="apps.deploy.name" />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Host Port</label>
                <input
                  type="number"
                  value={appPort}
                  onChange={(e) => setAppPort(Number(e.target.value))}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                />
                <FieldHelp id="apps.deploy.port" />
              </div>

              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">
                  Domain <span className="text-dark-300 font-normal">(optional — auto reverse proxy)</span>
                </label>
                <input
                  type="text"
                  value={appDomain}
                  onChange={(e) => setAppDomain(e.target.value)}
                  placeholder="app.example.com"
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                />
              </div>

              {appDomain && (
                <div>
                  <label className="flex items-center gap-2 text-sm font-medium text-dark-100">
                    <input type="checkbox" checked={externalTls} onChange={e => setExternalTls(e.target.checked)} className="rounded border-dark-500" />
                    TLS is terminated by an upstream proxy
                  </label>
                  <p className="mt-1 text-xs text-dark-300">
                    {externalTls
                      ? "No certificate will be requested, and this app will be served and linked over plain HTTP."
                      : "Leave unticked to get a Let's Encrypt certificate. Tick it if something in front of this server already handles HTTPS — this server never sees ports 80 and 443, so the certificate request cannot succeed."}
                  </p>
                  {!externalTls && (
                    <div className="mt-3">
                      <label className="block text-sm font-medium text-dark-100 mb-1">
                        SSL Email <span className="text-dark-300 font-normal">(optional — Let's Encrypt)</span>
                      </label>
                      <input
                        type="email"
                        value={sslEmail}
                        onChange={(e) => setSslEmail(e.target.value)}
                        placeholder="you@example.com"
                        className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                      />
                      <p className="mt-1 text-xs text-dark-300">Leave blank to use your account email.</p>
                    </div>
                  )}
                </div>
              )}

              {/* Resource Limits */}
              <div>
                <p className="text-sm font-medium text-dark-100 mb-2">Resource Limits <span className="text-dark-300 font-normal">(optional)</span></p>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs text-dark-200 mb-0.5">Memory (MB)</label>
                    <input
                      type="number"
                      value={memoryMb}
                      onChange={(e) => setMemoryMb(e.target.value)}
                      placeholder="e.g. 512"
                      min="0"
                      className="w-full px-3 py-1.5 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                    />
                    <FieldHelp id="apps.deploy.memory" />
                  </div>
                  <div>
                    <label className="block text-xs text-dark-200 mb-0.5">CPU (%)</label>
                    <input
                      type="number"
                      value={cpuPercent}
                      onChange={(e) => setCpuPercent(e.target.value)}
                      placeholder="e.g. 50"
                      min="0"
                      max="100"
                      className="w-full px-3 py-1.5 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                    />
                  </div>
                </div>
              </div>

              {/* GPU Passthrough */}
              <div className="mt-2">
                <label className="flex items-center gap-2 text-sm font-medium text-dark-100">
                  <input
                    type="checkbox"
                    checked={gpuEnabled}
                    onChange={e => {
                      const on = e.target.checked;
                      setGpuEnabled(on);
                      if (on && gpuMode === "none") setGpuMode("all");
                      if (!on) { setGpuMode("none"); setGpuSelectedIndices([]); }
                    }}
                    className="rounded border-dark-500"
                  />
                  Enable GPU passthrough
                  {selected?.gpu_recommended && (
                    <span className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rust-500/15 text-rust-400 border border-rust-500/30">
                      Recommended
                    </span>
                  )}
                </label>
                {gpuEnabled && availableGpus.length === 0 && (
                  <p className="mt-1 ml-6 text-xs text-warn-400">
                    No NVIDIA GPUs detected on this host. Deploy will still set GPU passthrough — verify NVIDIA Container Toolkit is installed.
                  </p>
                )}
                {gpuEnabled && availableGpus.length > 1 && (
                  <div className="mt-2 ml-6 space-y-2">
                    <div className="flex gap-3 text-xs">
                      <label className="flex items-center gap-1.5 text-dark-200 cursor-pointer">
                        <input
                          type="radio"
                          name="gpu-mode"
                          checked={gpuMode === "all"}
                          onChange={() => { setGpuMode("all"); setGpuSelectedIndices([]); }}
                        />
                        All GPUs <span className="text-dark-400">({availableGpus.length})</span>
                      </label>
                      <label className="flex items-center gap-1.5 text-dark-200 cursor-pointer">
                        <input
                          type="radio"
                          name="gpu-mode"
                          checked={gpuMode === "specific"}
                          onChange={() => setGpuMode("specific")}
                        />
                        Specific GPU(s)
                      </label>
                    </div>
                    {gpuMode === "specific" && (
                      <div className="space-y-1 border border-dark-600 rounded-md p-2 bg-dark-900">
                        {availableGpus.map(gpu => {
                          const checked = gpuSelectedIndices.includes(gpu.index);
                          return (
                            <label key={gpu.index} className="flex items-center gap-2 text-xs text-dark-200 cursor-pointer">
                              <input
                                type="checkbox"
                                checked={checked}
                                onChange={e => {
                                  setGpuSelectedIndices(prev =>
                                    e.target.checked
                                      ? [...prev, gpu.index].sort((a, b) => a - b)
                                      : prev.filter(i => i !== gpu.index)
                                  );
                                }}
                              />
                              <span className="font-mono text-dark-300">GPU {gpu.index}</span>
                              <span className="truncate">{gpu.name}</span>
                            </label>
                          );
                        })}
                        {gpuSelectedIndices.length === 0 && (
                          <p className="text-[11px] text-warn-400 mt-1">Pick at least one GPU, or switch to All.</p>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <p className="mt-1 ml-6 text-xs text-dark-300">Requires NVIDIA Container Toolkit on the host.</p>
              </div>

              {/* Health Check Configuration (Feature #9) */}
              <div>
                <label className="flex items-center gap-2 text-sm font-medium text-dark-100">
                  <input type="checkbox" checked={enableHealthCheck} onChange={e => setEnableHealthCheck(e.target.checked)} className="rounded border-dark-500" />
                  Configure health check <span className="text-dark-300 font-normal text-xs">(optional)</span>
                </label>
                {enableHealthCheck && (
                  <div className="mt-2 space-y-2">
                    <input
                      type="text"
                      value={healthCmd}
                      onChange={e => setHealthCmd(e.target.value)}
                      placeholder="CMD curl -f http://localhost/ || exit 1"
                      className="w-full px-3 py-1.5 border border-dark-500 rounded-lg text-xs font-mono focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                    />
                    <div className="flex gap-2">
                      <input
                        type="number"
                        value={healthInterval}
                        onChange={e => setHealthInterval(e.target.value)}
                        placeholder="Interval (s)"
                        min="1"
                        className="w-1/3 px-2 py-1.5 border border-dark-500 rounded-lg text-xs focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                      />
                      <input
                        type="number"
                        value={healthTimeout}
                        onChange={e => setHealthTimeout(e.target.value)}
                        placeholder="Timeout (s)"
                        min="1"
                        className="w-1/3 px-2 py-1.5 border border-dark-500 rounded-lg text-xs focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                      />
                      <input
                        type="number"
                        value={healthRetries}
                        onChange={e => setHealthRetries(e.target.value)}
                        placeholder="Retries"
                        min="0"
                        className="w-1/3 px-2 py-1.5 border border-dark-500 rounded-lg text-xs focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                      />
                    </div>
                    <p className="text-[10px] text-dark-300">Docker health check command, interval/timeout in seconds, and retry count.</p>
                  </div>
                )}
              </div>

              {selected.env_vars.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-dark-100 mb-2">Environment Variables</p>
                  <div className="space-y-2">
                    {selected.env_vars.map((v) => (
                      <div key={v.name}>
                        <label className="block text-xs text-dark-200 mb-0.5">
                          {v.label} {v.required && <span className="text-danger-500">*</span>}
                        </label>
                        <div className="flex gap-2">
                          <input
                            type={v.secret ? "password" : "text"}
                            list={selected.id === "vllm" && v.name === "MODEL" ? "vllm-models" : undefined}
                            value={envValues[v.name] || ""}
                            onChange={(e) =>
                              setEnvValues({ ...envValues, [v.name]: e.target.value })
                            }
                            placeholder={v.default || v.name}
                            className="w-full px-3 py-1.5 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                          />
                          {/* Remove the choice rather than explain it: a required
                              secret with no default is a field nobody can answer
                              well, so offer to answer it for them. */}
                          {v.secret && v.required && !v.default && (
                            <button
                              type="button"
                              onClick={() => generateSecret(v.name)}
                              className="px-3 py-1.5 bg-dark-700 text-dark-100 rounded-lg text-xs font-medium hover:bg-dark-600 shrink-0"
                            >
                              Generate
                            </button>
                          )}
                        </div>
                        {/* Say it rather than let the operator read a localhost
                            default the deploy is about to replace. Only shown
                            once a domain is actually claimed, because without
                            one the default IS what gets used. */}
                        {v.domain_derived && appDomain.trim() !== "" && (
                          <p className="text-[10px] text-accent-400 mt-0.5">
                            Set automatically from {appDomain.trim()} — change it only to override.
                          </p>
                        )}
                        {selected.id === "vllm" && v.name === "MODEL" && (
                          <datalist id="vllm-models">
                            <option value="meta-llama/Llama-3.2-1B-Instruct" />
                            <option value="meta-llama/Llama-3.2-3B-Instruct" />
                            <option value="meta-llama/Llama-3.1-8B-Instruct" />
                            <option value="mistralai/Mistral-7B-Instruct-v0.3" />
                            <option value="microsoft/Phi-3-mini-4k-instruct" />
                            <option value="google/gemma-2-2b-it" />
                            <option value="google/gemma-2-9b-it" />
                            <option value="Qwen/Qwen2.5-7B-Instruct" />
                            <option value="deepseek-ai/DeepSeek-R1-Distill-Qwen-7B" />
                            <option value="NousResearch/Meta-Llama-3.1-8B-Instruct" />
                          </datalist>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* The prerequisites render HERE, immediately above the button they
                gate — lesson #80a: a message 1400 lines from its control is
                indistinguishable from no message. */}
            <PrereqList
              checks={deployChecks}
              checking={preflightChecking}
              onRecheck={recheckDeploy}
              onApply={applySuggestion}
              className="mt-4"
            />

            {deployError && (
              <div role="alert" className="mt-4 px-4 py-3 rounded border border-danger-500/30 bg-danger-500/10 text-sm text-danger-400 whitespace-pre-line">
                {deployError}
              </div>
            )}

            <div className="flex justify-end gap-2 mt-6">
              <button
                onClick={() => setSelected(null)}
                className="px-4 py-2 text-dark-300 border border-dark-600 rounded-lg text-sm font-medium hover:text-dark-100 hover:border-dark-400"
              >
                Cancel
              </button>
              <button
                onClick={handleDeploy}
                disabled={deploying || !appName || !!deployBlocker}
                title={deployBlocker ? deployBlocker.title : undefined}
                className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
              >
                {deploying ? "Deploying..." : "Deploy"}
              </button>
            </div>
          </div>
        </div>
  );
}
