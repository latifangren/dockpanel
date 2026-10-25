// Moved verbatim from panel/frontend/src/pages/Settings.tsx (services tab, original lines 2430-2517).
// The shell in Settings.tsx keeps all state, loaders and helpers;
// this component destructures exactly the shell identifiers it uses,
// under the same names, so the JSX body below is unchanged.
import { ServiceInstallers } from "./ServiceInstallers";
import { ImageScanSettings } from "./ImageScanSettings";
import { WpVulnScanSettings } from "./WpVulnScanSettings";
import { SbomSettings } from "./SbomSettings";
import { PrometheusSettings } from "./PrometheusSettings";
import { AcmeContactSettings } from "./AcmeContactSettings";
import { AcmeSettings } from "./AcmeSettings";
import { AiDiagnosisSettings } from "./AiDiagnosisSettings";
import { McpServerSettings } from "./McpServerSettings";
import type { HealthStatus } from "../Settings";
import type { Dispatch, SetStateAction } from "react";

interface ServicesTabProps {
  saving: string | null;
  setSaving: Dispatch<SetStateAction<string | null>>;
  health: HealthStatus | null;
  healthLoading: boolean;
  setHealthLoading: Dispatch<SetStateAction<boolean>>;
  setMessage: Dispatch<SetStateAction<{ text: string; type: string }>>;
  pdnsApiUrl: string;
  setPdnsApiUrl: Dispatch<SetStateAction<string>>;
  pdnsApiKey: string;
  setPdnsApiKey: Dispatch<SetStateAction<string>>;
  showPdnsGuide: boolean;
  setShowPdnsGuide: Dispatch<SetStateAction<boolean>>;
  loadHealth: () => Promise<void>;
  setTab: Dispatch<SetStateAction<string>>;
}

export function ServicesTab({
  saving,
  setSaving,
  health,
  healthLoading,
  setHealthLoading,
  setMessage,
  pdnsApiUrl,
  setPdnsApiUrl,
  pdnsApiKey,
  setPdnsApiKey,
  showPdnsGuide,
  setShowPdnsGuide,
  loadHealth,
  setTab
}: ServicesTabProps) {
  return (
    <>
        {/* Service Installers with integrated PowerDNS config */}
        <ServiceInstallers
          pdnsApiUrl={pdnsApiUrl}
          setPdnsApiUrl={setPdnsApiUrl}
          pdnsApiKey={pdnsApiKey}
          setPdnsApiKey={setPdnsApiKey}
          showPdnsGuide={showPdnsGuide}
          setShowPdnsGuide={setShowPdnsGuide}
          saving={saving}
          setSaving={setSaving}
          setMessage={setMessage}
        />

        {/* Image Vulnerability Scanning */}
        <ImageScanSettings setMessage={setMessage} />

        {/* WordPress Vulnerability Scanning (direct peer of the above) */}
        <WpVulnScanSettings setMessage={setMessage} />

        {/* SBOM (composition; companion to image scanning) */}
        <SbomSettings setMessage={setMessage} />

        {/* Prometheus metrics endpoint */}
        <PrometheusSettings setMessage={setMessage} />

        {/* ACME contact — rendered BEFORE the profile card, and independent of it:
            a bad contact is one reason the profile card's directory call fails. */}
        <AcmeContactSettings setMessage={setMessage} />

        {/* ACME profile selection — 2026-ready Let's Encrypt */}
        <AcmeSettings setMessage={setMessage} />

        {/* AI-assisted build/deploy failure diagnosis (BYO API key) */}
        <AiDiagnosisSettings setMessage={setMessage} />

        {/* MCP server (dockpanel-mcp) — read-only introspection for AI agents */}
        <McpServerSettings setMessage={setMessage} onManageKeys={() => setTab("account")} />

        {/* System Health */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600 flex items-center justify-between">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">System Health</h3>
            <button
              onClick={() => {
                setHealthLoading(true);
                loadHealth();
              }}
              className="px-3 py-1 bg-rust-500 text-white rounded-md text-xs font-medium hover:bg-rust-600"
            >
              Check Now
            </button>
          </div>
          <div className="p-5">
            {healthLoading && !health ? (
              <div className="text-center text-sm text-dark-300 py-4">Checking health...</div>
            ) : !health ? (
              <div className="text-center text-sm text-danger-500 py-4">Could not reach health endpoint</div>
            ) : (
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${health.database ? "bg-rust-500" : "bg-danger-500"}`} />
                    <span className="text-sm text-dark-50">Database</span>
                  </div>
                  <span className={`text-sm font-medium ${health.database ? "text-rust-400" : "text-danger-400"}`}>
                    {health.database ? "Connected" : "Error"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className={`w-3 h-3 rounded-full ${health.agentOk ? "bg-rust-500" : "bg-danger-500"}`} />
                    <span className="text-sm text-dark-50">Agent</span>
                  </div>
                  <span className={`text-sm font-medium ${health.agentOk ? "text-rust-400" : "text-danger-400"}`}>
                    {health.agentOk ? "Connected" : "Error"}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-3 h-3 rounded-full bg-accent-500" />
                    <span className="text-sm text-dark-50">Uptime</span>
                  </div>
                  <span className="text-sm font-medium text-dark-200 font-mono">{health.uptime}</span>
                </div>
              </div>
            )}
          </div>
        </div>
    </>
  );
}
