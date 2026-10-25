// Moved verbatim from panel/frontend/src/pages/Settings.tsx (subcomponent SSHKeys).
// Signature unchanged; only the module imports below are new.
import { useState, useEffect } from "react";
import { api } from "../../api";

// ── SSH Keys Component ──────────────────────────────────────────────────

export function SSHKeys() {
  const [keys, setKeys] = useState<{ type: string; fingerprint: string; comment: string; key: string }[]>([]);
  const [newKey, setNewKey] = useState("");
  const [adding, setAdding] = useState(false);
  const [msg, setMsg] = useState({ text: "", type: "" });

  useEffect(() => {
    api.get<{ keys: typeof keys }>("/ssh-keys").then(d => setKeys(d.keys || [])).catch(() => {});
  }, []);

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">SSH Keys</h3>
        <p className="text-xs text-dark-200 mt-0.5">Manage authorized SSH keys for root access</p>
      </div>
      <div className="p-5 space-y-3">
        {msg.text && <div className={`px-3 py-2 rounded text-xs ${msg.type === "success" ? "bg-rust-500/10 text-rust-400" : "bg-danger-500/10 text-danger-400"}`}>{msg.text}</div>}
        {keys.length === 0 && (
          <p className="text-xs text-dark-400 text-center py-2">No SSH keys configured</p>
        )}
        {keys.map((k) => (
          <div key={k.fingerprint} className="flex items-center justify-between bg-dark-900 border border-dark-500 px-4 py-2">
            <div className="min-w-0">
              <span className="text-xs text-dark-50 font-mono block truncate">{k.comment || k.key}</span>
              <span className="text-[10px] text-dark-300 font-mono">{k.fingerprint}</span>
            </div>
            <button onClick={async () => {
              try { await api.delete(`/ssh-keys/${encodeURIComponent(k.fingerprint)}`); setKeys(keys.filter(x => x.fingerprint !== k.fingerprint)); setMsg({ text: "Key removed", type: "success" }); }
              catch (e) { setMsg({ text: e instanceof Error ? e.message : "Failed to remove key", type: "error" }); }
            }} className="p-1 text-dark-300 hover:text-danger-400 shrink-0 ml-2">
              <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
            </button>
          </div>
        ))}
        <div className="flex gap-2">
          <input type="text" value={newKey} onChange={(e) => setNewKey(e.target.value)} placeholder="ssh-ed25519 AAAA... user@host" className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-xs font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
          <button disabled={adding || !newKey.startsWith("ssh-")} onClick={async () => {
            setAdding(true); setMsg({ text: "", type: "" });
            try { await api.post("/ssh-keys", { key: newKey }); setNewKey(""); const d = await api.get<{ keys: typeof keys }>("/ssh-keys"); setKeys(d.keys || []); setMsg({ text: "Key added", type: "success" }); }
            catch (e) { setMsg({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
            finally { setAdding(false); }
          }} className="px-3 py-2 bg-rust-500 text-white rounded-lg text-xs font-medium hover:bg-rust-600 disabled:opacity-50 shrink-0">
            {adding ? "Adding..." : "Add Key"}
          </button>
        </div>
      </div>
    </div>
  );
}
