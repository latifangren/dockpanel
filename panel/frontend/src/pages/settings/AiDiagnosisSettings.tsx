// Moved verbatim from panel/frontend/src/pages/Settings.tsx (subcomponent AiDiagnosisSettings).
// Signature unchanged; only the module imports below are new.
import { useState, useEffect } from "react";
import { api } from "../../api";

// ── AI Build/Deploy Diagnosis (BYO API key, default off) ───────────────

const AI_DIAGNOSIS_PROVIDERS = [
  { id: "anthropic", label: "Anthropic", placeholder: "claude-sonnet-5" },
  { id: "openai", label: "OpenAI", placeholder: "gpt-4o" },
  { id: "gemini", label: "Gemini", placeholder: "gemini-2.0-flash" },
  { id: "grok", label: "Grok (xAI)", placeholder: "grok-2-latest" },
];

export function AiDiagnosisSettings({ setMessage }: { setMessage: (m: { text: string; type: string }) => void }) {
  const [enabled, setEnabled] = useState(false);
  const [provider, setProvider] = useState("anthropic");
  const [model, setModel] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get<Record<string, string>>("/settings")
      .then((data) => {
        setEnabled(data.ai_diagnosis_enabled === "true");
        setProvider(data.ai_diagnosis_provider || "anthropic");
        setModel(data.ai_diagnosis_model || "");
        setApiKey(data.ai_diagnosis_api_key || "");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      const body: Record<string, string> = {
        ai_diagnosis_enabled: enabled ? "true" : "false",
        ai_diagnosis_provider: provider,
        ai_diagnosis_model: model.trim(),
      };
      // Don't overwrite a stored key with the mask placeholder — same guard as PowerDNS.
      if (apiKey && apiKey !== "********") {
        body.ai_diagnosis_api_key = apiKey;
      }
      await api.put("/settings", body);
      setMessage({ text: "AI diagnosis settings saved", type: "success" });
      load();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Failed to save AI diagnosis settings", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const activeProvider = AI_DIAGNOSIS_PROVIDERS.find((p) => p.id === provider) ?? AI_DIAGNOSIS_PROVIDERS[0];

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">AI Build/Deploy Diagnosis</h3>
        <p className="text-xs text-dark-200 mt-0.5">
          Bring your own API key to get an AI-generated root-cause explanation for a failed Git Deploy, on demand from its history entry.
        </p>
        <p className="text-[10px] text-dark-300 mt-1 italic">
          Off by default. Nothing is ever sent automatically — this only fires when enabled here AND you click "Explain with AI" on a specific failed deploy.
        </p>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between border border-dark-600 bg-dark-900/50 rounded p-4">
          <div>
            <div className="text-sm font-medium text-dark-50">Enable AI diagnosis</div>
            <p className="text-[10px] text-dark-300 mt-0.5">Requires a provider, model, and API key below.</p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${enabled ? "bg-rust-500 text-white hover:bg-rust-600" : "bg-dark-600 text-dark-100 hover:bg-dark-500"}`}
          >
            {enabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          <div>
            <label htmlFor="ai-diag-provider" className="block text-xs font-medium text-dark-100 mb-1">Provider</label>
            <select
              id="ai-diag-provider"
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none bg-dark-900"
            >
              {AI_DIAGNOSIS_PROVIDERS.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="ai-diag-model" className="block text-xs font-medium text-dark-100 mb-1">Model</label>
            <input
              id="ai-diag-model"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none font-mono"
              placeholder={activeProvider.placeholder}
            />
          </div>
        </div>

        <div>
          <label htmlFor="ai-diag-key" className="block text-xs font-medium text-dark-100 mb-1">API Key</label>
          <input
            id="ai-diag-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none font-mono"
            placeholder={`Your ${activeProvider.label} API key`}
          />
          <p className="text-xs text-dark-300 mt-1">Stored encrypted at rest. Failure output is redacted for obvious secrets (passwords, tokens, private keys) before it's sent, and truncated to the last ~8000 characters.</p>
        </div>

        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving || !loaded}
            className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save AI Diagnosis Settings"}
          </button>
        </div>
      </div>
    </div>
  );
}
