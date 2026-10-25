// Moved verbatim from panel/frontend/src/pages/Settings.tsx (subcomponent McpServerSettings).
// Signature unchanged; only the module imports below are new.
import { useState, useEffect } from "react";
import { api } from "../../api";

// ── MCP Server Component ─────────────────────────────────────────────────

export function McpServerSettings({ setMessage, onManageKeys }: { setMessage: (m: { text: string; type: string }) => void; onManageKeys: () => void }) {
  const [enabled, setEnabled] = useState(false);
  const [bindMode, setBindMode] = useState("loopback");
  const [loaded, setLoaded] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get<Record<string, string>>("/settings")
      .then((data) => {
        setEnabled(data.mcp_server_enabled === "true");
        setBindMode(data.mcp_bind_mode || "loopback");
        setLoaded(true);
      })
      .catch(() => setLoaded(true));
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings", {
        mcp_server_enabled: enabled ? "true" : "false",
        mcp_bind_mode: bindMode,
      });
      setMessage({ text: "MCP server record saved", type: "success" });
      load();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Failed to save MCP server settings", type: "error" });
    } finally {
      setSaving(false);
    }
  };

  const endpoint = bindMode === "direct"
    ? "Whatever address you set in /etc/dockpanel/mcp.env's LISTEN_ADDR — not proxied by nginx in this mode."
    : `${window.location.origin}/mcp`;

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">MCP Server</h3>
        <p className="text-xs text-dark-200 mt-0.5">
          Read-only DockPanel introspection for AI agents (list sites, read logs/metrics, check security posture) over the Model Context Protocol.
        </p>
        <p className="text-[10px] text-dark-300 mt-1 italic">
          The toggle and bind mode below are a record for this Settings page to display — they don't start, stop, or
          reconfigure the <code>dockpanel-mcp</code> systemd service themselves. Set them to match what you've actually
          done on the host.
        </p>
      </div>
      <div className="p-5 space-y-4">
        <div className="flex items-center justify-between border border-dark-600 bg-dark-900/50 rounded p-4">
          <div>
            <div className="text-sm font-medium text-dark-50">MCP server enabled</div>
            <p className="text-[10px] text-dark-300 mt-0.5">Reflects whether you've run <code>systemctl enable --now dockpanel-mcp</code> on the host.</p>
          </div>
          <button
            type="button"
            onClick={() => setEnabled(!enabled)}
            className={`px-3 py-1.5 text-xs font-medium rounded-md ${enabled ? "bg-rust-500 text-white hover:bg-rust-600" : "bg-dark-600 text-dark-100 hover:bg-dark-500"}`}
          >
            {enabled ? "Enabled" : "Disabled"}
          </button>
        </div>

        <div>
          <label htmlFor="mcp-bind-mode" className="block text-xs font-medium text-dark-100 mb-1">Bind mode</label>
          <select
            id="mcp-bind-mode"
            value={bindMode}
            onChange={(e) => setBindMode(e.target.value)}
            className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none bg-dark-900"
          >
            <option value="loopback">Loopback, proxied by nginx (recommended)</option>
            <option value="direct">Direct bind (advanced — bypasses nginx and TLS)</option>
          </select>
          <p className="text-xs text-dark-300 mt-1">
            Endpoint once running: <code className="font-mono text-dark-100">{endpoint}</code>
          </p>
        </div>

        <div className="border border-dark-600 bg-dark-900/50 rounded p-4 space-y-1.5">
          <p className="text-xs font-medium text-dark-100">Setup, if you haven't already</p>
          <ol className="text-[10px] text-dark-300 list-decimal list-inside space-y-0.5">
            <li>Mint an API key named "MCP server" — <button type="button" onClick={onManageKeys} className="text-rust-400 hover:text-rust-300 underline">manage API keys</button>.</li>
            <li>Save it to <code>/etc/dockpanel/mcp.token</code> on the host (root:root, mode 600).</li>
            <li>Run <code>systemctl enable --now dockpanel-mcp</code>.</li>
          </ol>
        </div>

        <div className="flex justify-end">
          <button
            onClick={save}
            disabled={saving || !loaded}
            className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
          >
            {saving ? "Saving..." : "Save MCP Server Record"}
          </button>
        </div>
      </div>
    </div>
  );
}
