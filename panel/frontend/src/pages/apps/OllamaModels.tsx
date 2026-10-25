import { useState, useEffect } from "react";
import { api } from "../../api";

// Moved verbatim from pages/Apps.tsx (props containerId + onClose).
const POPULAR_OLLAMA_MODELS = [
  { name: "llama3.2", desc: "Meta Llama 3.2 (3B)", size: "2.0 GB" },
  { name: "llama3.2:1b", desc: "Meta Llama 3.2 (1B)", size: "1.3 GB" },
  { name: "llama3.1:8b", desc: "Meta Llama 3.1 (8B)", size: "4.7 GB" },
  { name: "mistral", desc: "Mistral 7B v0.3", size: "4.1 GB" },
  { name: "gemma2:2b", desc: "Google Gemma 2 (2B)", size: "1.6 GB" },
  { name: "gemma2:9b", desc: "Google Gemma 2 (9B)", size: "5.5 GB" },
  { name: "phi3:mini", desc: "Microsoft Phi-3 Mini (3.8B)", size: "2.3 GB" },
  { name: "qwen2.5:7b", desc: "Alibaba Qwen 2.5 (7B)", size: "4.7 GB" },
  { name: "deepseek-r1:8b", desc: "DeepSeek R1 (8B)", size: "4.9 GB" },
  { name: "codellama:7b", desc: "Code Llama (7B)", size: "3.8 GB" },
  { name: "nomic-embed-text", desc: "Nomic Embed Text (137M)", size: "274 MB" },
];

interface OllamaModel {
  name: string;
  id: string;
  size: string;
  modified: string;
}

export function OllamaModels({ containerId, onClose }: { containerId: string; onClose: () => void }) {
  const [models, setModels] = useState<OllamaModel[]>([]);
  const [loading, setLoading] = useState(true);
  const [pulling, setPulling] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [customModel, setCustomModel] = useState("");
  const [pullResult, setPullResult] = useState<{ type: string; msg: string }>({ type: "", msg: "" });
  const [deleteArmed, setDeleteArmed] = useState<string | null>(null);

  const loadModels = () => {
    setLoading(true);
    api.get<{ models: OllamaModel[] }>(`/apps/${containerId}/ollama/models`)
      .then(d => setModels(d.models || []))
      .catch(() => {})
      .finally(() => setLoading(false));
  };

  useEffect(() => { loadModels(); }, [containerId]);

  const pullModel = async (name: string) => {
    setPulling(name);
    setPullResult({ type: "", msg: "" });
    try {
      const res = await api.post<{ success: boolean; stderr: string }>(`/apps/${containerId}/ollama/pull`, { model: name });
      if (res.success) {
        setPullResult({ type: "success", msg: `Pulled ${name}` });
        loadModels();
      } else {
        setPullResult({ type: "error", msg: res.stderr || "Pull failed" });
      }
    } catch (e) {
      setPullResult({ type: "error", msg: e instanceof Error ? e.message : "Failed" });
    } finally {
      setPulling(null);
    }
  };

  const deleteModel = async (name: string) => {
    setDeleting(name);
    setPullResult({ type: "", msg: "" });
    try {
      await api.post(`/apps/${containerId}/ollama/delete`, { model: name });
      setPullResult({ type: "success", msg: `Removed ${name}` });
      loadModels();
    } catch (e) {
      // s237 audit: was `catch { /* ignore */ }` — a failed delete surfaced nothing.
      setPullResult({ type: "error", msg: e instanceof Error ? e.message : "Failed to remove model" });
    }
    finally { setDeleting(null); }
  };

  const installedNames = models.map(m => m.name.split(":")[0]);

  return (
    <div className="fixed inset-0 z-50 flex justify-end" onClick={onClose}>
      <div className="absolute inset-0 bg-black/50" />
      <div className="relative w-full max-w-lg bg-dark-900 border-l border-dark-600 overflow-y-auto" onClick={e => e.stopPropagation()}>
        <div className="p-6">
          <div className="flex items-center justify-between mb-6">
            <div>
              <h2 className="text-sm font-medium text-dark-50 font-mono uppercase tracking-widest">Ollama Model Library</h2>
              <p className="text-xs text-dark-400 mt-1">{models.length} model{models.length !== 1 ? "s" : ""} installed</p>
            </div>
            <button onClick={onClose} className="text-dark-300 hover:text-dark-50 text-2xl leading-none">&times;</button>
          </div>

          {pullResult.msg && (
            <div className={`mb-4 px-3 py-2 rounded text-xs ${pullResult.type === "success" ? "bg-rust-500/10 text-rust-400" : "bg-danger-500/10 text-danger-400"}`}>
              {pullResult.msg}
            </div>
          )}

          {/* Installed models */}
          <div className="mb-6">
            <h3 className="text-xs text-dark-400 font-mono uppercase tracking-wider mb-3">Installed</h3>
            {loading ? (
              <div className="space-y-2">{[1,2].map(i => <div key={i} className="h-10 bg-dark-700 rounded animate-pulse" />)}</div>
            ) : models.length === 0 ? (
              <p className="text-sm text-dark-300">No models installed. Pull one below.</p>
            ) : (
              <div className="space-y-2">
                {models.map(m => (
                  <div key={m.name} className="flex items-center justify-between bg-dark-800 rounded-lg border border-dark-600 px-4 py-2.5">
                    <div>
                      <p className="text-sm text-dark-50 font-mono">{m.name}</p>
                      <p className="text-xs text-dark-400">{m.size} {m.id ? `\u00b7 ${m.id.slice(0, 12)}` : ""}</p>
                    </div>
                    {deleteArmed === m.name ? (
                      <div className="flex items-center gap-1">
                        <button
                          onClick={() => { setDeleteArmed(null); deleteModel(m.name); }}
                          disabled={deleting === m.name}
                          className="px-2 py-1 text-xs bg-danger-500 text-white rounded disabled:opacity-50"
                        >
                          {deleting === m.name ? "..." : "Confirm"}
                        </button>
                        <button
                          onClick={() => setDeleteArmed(null)}
                          disabled={deleting === m.name}
                          className="px-2 py-1 text-xs bg-dark-600 text-dark-200 rounded disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setDeleteArmed(m.name)}
                        disabled={deleting === m.name}
                        className="px-2 py-1 text-xs text-danger-400 hover:bg-danger-500/10 rounded disabled:opacity-50"
                      >
                        {deleting === m.name ? "..." : "Remove"}
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pull custom model */}
          <div className="mb-6">
            <h3 className="text-xs text-dark-400 font-mono uppercase tracking-wider mb-3">Pull Model</h3>
            <div className="flex gap-2">
              <input
                type="text"
                value={customModel}
                onChange={e => setCustomModel(e.target.value)}
                onKeyDown={e => { if (e.key === "Enter" && customModel.trim()) pullModel(customModel.trim()); }}
                placeholder="e.g. llama3.2, mistral:latest"
                className="flex-1 px-3 py-2 bg-dark-800 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
              />
              <button
                onClick={() => { if (customModel.trim()) pullModel(customModel.trim()); }}
                disabled={!customModel.trim() || !!pulling}
                className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
              >
                {pulling === customModel.trim() ? "Pulling..." : "Pull"}
              </button>
            </div>
          </div>

          {/* Popular models */}
          <div>
            <h3 className="text-xs text-dark-400 font-mono uppercase tracking-wider mb-3">Popular Models</h3>
            <div className="space-y-2">
              {POPULAR_OLLAMA_MODELS.map(m => {
                const installed = installedNames.includes(m.name.split(":")[0]);
                return (
                  <div key={m.name} className="flex items-center justify-between bg-dark-800 rounded-lg border border-dark-600 px-4 py-2.5">
                    <div>
                      <p className="text-sm text-dark-50 font-mono">{m.name}</p>
                      <p className="text-xs text-dark-400">{m.desc} \u00b7 {m.size}</p>
                    </div>
                    {installed ? (
                      <span className="text-xs text-rust-400 font-medium">Installed</span>
                    ) : (
                      <button
                        onClick={() => pullModel(m.name)}
                        disabled={!!pulling}
                        className="px-3 py-1 text-xs font-medium bg-rust-500/20 text-rust-400 rounded hover:bg-rust-500/30 disabled:opacity-50"
                      >
                        {pulling === m.name ? "Pulling..." : "Pull"}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
