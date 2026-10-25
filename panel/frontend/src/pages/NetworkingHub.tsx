import { useSearchParams } from "react-router-dom";
import Sites from "./Sites";
import Dns from "./Dns";
import Cdn from "./Cdn";

// Ported from the AI Studio v2 NetworkingHub (tab wrapper only): the three
// pages below are the real upstream pages, unchanged. DNS and CDN are hidden
// from the sidebar via `consolidatedInto` in navItems.ts but their own routes
// (/dns, /cdn) still work — this hub is the consolidated entry point, not a
// replacement for them.
type NetworkingTab = "sites" | "dns" | "cdn";

const TABS: { id: NetworkingTab; label: string }[] = [
  { id: "sites", label: "Websites & Reverse Proxy" },
  { id: "dns", label: "DNS Zones & Records" },
  { id: "cdn", label: "CDN & Edge Caching" },
];

export default function NetworkingHub() {
  const [searchParams, setSearchParams] = useSearchParams();
  const rawTab = searchParams.get("tab");
  const activeTab: NetworkingTab =
    rawTab === "dns" || rawTab === "cdn" || rawTab === "sites" ? rawTab : "sites";

  return (
    <div className="space-y-2">
      <div className="px-6 lg:px-8 pt-6 max-w-[1600px] mx-auto flex flex-wrap items-center justify-between gap-4">
        <div className="flex gap-1 p-1 bg-dark-800 rounded-lg border border-dark-600">
          {TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setSearchParams({ tab: t.id })}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                activeTab === t.id
                  ? "bg-rust-500 text-white"
                  : "text-dark-300 hover:text-dark-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
        <span className="text-xs font-mono text-dark-400">
          Unified Networking, Domains, SSL &amp; Edge Routing Hub
        </span>
      </div>

      {activeTab === "sites" && <Sites />}
      {activeTab === "dns" && <Dns />}
      {activeTab === "cdn" && <Cdn />}
    </div>
  );
}
