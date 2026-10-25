import { api } from "../../api";
import type {
  Fail2banStatus,
  FirewallStatus,
  PendingConfirm,
  Posture,
  SecTab,
  SecurityOverview,
} from "./types";

interface OverviewTabProps {
  posture: Posture | null;
  overview: SecurityOverview | null;
  panelJail: boolean;
  setPanelJail: (v: boolean) => void;
  setMessage: (m: { text: string; type: string }) => void;
  scoreColor: (score: number) => string;
  scoreBg: (score: number) => string;
  firewall: FirewallStatus | null;
  deleteTarget: number | null;
  setDeleteTarget: (v: number | null) => void;
  handleDeleteRule: (num: number) => void;
  fail2ban: Fail2banStatus | null;
  selectedJail: string | null;
  setSelectedJail: (v: string | null) => void;
  loadBannedIps: (jail: string) => void;
  banJail: string;
  setBanJail: (v: string) => void;
  bannedIps: string[];
  banIp: string;
  setBanIp: (v: string) => void;
  setPendingConfirm: (v: PendingConfirm | null) => void;
  showPortInput: boolean;
  setShowPortInput: (v: boolean) => void;
  portValue: string;
  setPortValue: (v: string) => void;
  setTab: (t: SecTab) => void;
  handleViewScan: (id: string) => void;
  setShowAddRule: (v: boolean) => void;
}

export default function OverviewTab({
  posture, overview, panelJail, setPanelJail, setMessage, scoreColor, scoreBg,
  firewall, deleteTarget, setDeleteTarget, handleDeleteRule, fail2ban,
  selectedJail, setSelectedJail, loadBannedIps, banJail, setBanJail, bannedIps,
  banIp, setBanIp, setPendingConfirm, showPortInput, setShowPortInput,
  portValue, setPortValue, setTab, handleViewScan, setShowAddRule,
}: OverviewTabProps) {
  return (
    <>
        {/* Security Posture + Overview Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
          {/* Security Score */}
          {posture && posture.score >= 0 && (
            <div className="bg-dark-800 rounded-lg border border-dark-500 p-5 min-h-[140px]">
              <div className="flex items-center gap-2.5">
                <div className="w-10 h-10 rounded-lg bg-accent-600/10 flex items-center justify-center">
                  <svg className="w-6 h-6 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                    <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" />
                  </svg>
                </div>
                <p className="text-sm font-medium text-dark-200 uppercase font-mono tracking-wider">Security Score</p>
              </div>
              <div className="flex items-end gap-1 mt-3">
                <span className={`text-4xl font-bold ${scoreColor(posture.score)}`}>{posture.score}</span>
                <span className="text-base text-dark-300 mb-1">/100</span>
              </div>
              <div className="mt-2.5 h-2 bg-dark-700 rounded-full overflow-hidden">
                <div className={`h-full rounded-full ${scoreBg(posture.score)}`} style={{ width: `${posture.score}%` }} />
              </div>
              <p className="text-xs text-dark-300 mt-1.5">{posture.total_scans} {posture.total_scans === 1 ? "scan" : "scans"} total</p>
            </div>
          )}

          {overview && (
            <>
              <div className="bg-dark-800 rounded-lg border border-dark-500 p-5 min-h-[140px]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-warn-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-warn-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.362 5.214A8.252 8.252 0 0 1 12 21 8.25 8.25 0 0 1 6.038 7.047 8.287 8.287 0 0 0 9 9.601a8.983 8.983 0 0 1 3.361-6.867 8.21 8.21 0 0 0 3 2.48Z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M12 18a3.75 3.75 0 0 0 .495-7.468 5.99 5.99 0 0 0-1.925 3.547 5.975 5.975 0 0 1-2.133-1.001A3.75 3.75 0 0 0 12 18Z" />
                    </svg>
                  </div>
                  <p className="text-xs font-medium text-dark-300 uppercase font-mono tracking-wider">Firewall</p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className={`w-3 h-3 rounded-full ${overview.firewall_active ? "bg-rust-500" : "bg-danger-500"}`} />
                  <span className="text-lg font-bold text-dark-50">
                    {overview.firewall_active ? "Active" : "Inactive"}
                  </span>
                </div>
                <p className="text-xs text-dark-300 mt-1">{overview.firewall_rules_count} rules</p>
              </div>

              <div className="bg-dark-800 rounded-lg border border-dark-500 p-5 min-h-[140px]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-danger-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-danger-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M18.364 18.364A9 9 0 0 0 5.636 5.636m12.728 12.728A9 9 0 0 1 5.636 5.636m12.728 12.728L5.636 5.636" />
                    </svg>
                  </div>
                  <p className="text-xs font-medium text-dark-300 uppercase font-mono tracking-wider">Fail2Ban</p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className={`w-3 h-3 rounded-full ${overview.fail2ban_running ? "bg-rust-500" : "bg-dark-400"}`} />
                  <span className="text-lg font-bold text-dark-50">
                    {overview.fail2ban_running ? "Running" : "Stopped"}
                  </span>
                </div>
                <p className="text-xs text-dark-300 mt-1"><span className="font-mono">{overview.fail2ban_banned_total}</span> banned IPs</p>
              </div>

              <div className="bg-dark-800 rounded-lg border border-dark-500 p-5 min-h-[140px]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-rust-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-rust-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 5.25a3 3 0 0 1 3 3m3 0a6 6 0 0 1-7.029 5.912c-.563-.097-1.159.026-1.563.43L10.5 17.25H8.25v2.25H6v2.25H2.25v-2.818c0-.597.237-1.17.659-1.591l6.499-6.499c.404-.404.527-1 .43-1.563A6 6 0 1 1 21.75 8.25Z" />
                    </svg>
                  </div>
                  <p className="text-xs font-medium text-dark-300 uppercase font-mono tracking-wider">SSH</p>
                </div>
                <p className="text-lg font-bold text-dark-50 mt-2">Port <span className="font-mono">{overview.ssh_port}</span></p>
                <p className="text-xs mt-1">
                  <span className={overview.ssh_password_auth ? "text-warn-400" : "text-rust-400"}>
                    Password auth: {overview.ssh_password_auth ? "On" : "Off"}
                  </span>
                </p>
                <p className="text-xs mt-0.5">
                  <span className={overview.ssh_root_login ? "text-warn-400" : "text-rust-400"}>
                    Root login: {overview.ssh_root_login ? "On" : "Off"}
                  </span>
                </p>
                <div className="flex flex-wrap gap-1.5 mt-3">
                  <button
                    onClick={() => setPendingConfirm({
                      type: "ssh_password",
                      label: overview.ssh_password_auth ? "Disable SSH password authentication? Make sure you have SSH key access first!" : "Enable SSH password authentication?",
                      data: { enabled: overview.ssh_password_auth }
                    })}
                    className="px-3 py-1.5 bg-dark-700 text-dark-200 hover:bg-dark-600 border border-dark-600 rounded text-xs font-medium transition-colors"
                  >
                    {overview.ssh_password_auth ? "Disable Password" : "Enable Password"}
                  </button>
                  {overview.ssh_root_login && (
                    <button
                      onClick={() => setPendingConfirm({
                        type: "ssh_root",
                        label: "Disable root SSH login? Make sure you have a non-root user with sudo access!"
                      })}
                      className="px-3 py-1.5 bg-dark-700 text-dark-200 hover:bg-dark-600 border border-dark-600 rounded text-xs font-medium transition-colors"
                    >
                      Disable Root
                    </button>
                  )}
                  {showPortInput ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="number"
                        min="1"
                        max="65535"
                        value={portValue}
                        onChange={(e) => setPortValue(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            const port = parseInt(portValue);
                            if (isNaN(port) || port < 1 || port > 65535) { setMessage({ text: "Invalid port number", type: "error" }); return; }
                            setShowPortInput(false);
                            setPendingConfirm({ type: "ssh_port", label: `Change SSH port to ${port}? A firewall rule will be added automatically.`, data: { port } });
                          }
                          if (e.key === "Escape") setShowPortInput(false);
                        }}
                        autoFocus
                        className="w-20 px-2 py-1 bg-dark-900 border border-dark-500 rounded text-xs font-mono text-dark-100"
                        placeholder="Port"
                      />
                      <button
                        onClick={() => {
                          const port = parseInt(portValue);
                          if (isNaN(port) || port < 1 || port > 65535) { setMessage({ text: "Invalid port number", type: "error" }); return; }
                          setShowPortInput(false);
                          setPendingConfirm({ type: "ssh_port", label: `Change SSH port to ${port}? A firewall rule will be added automatically.`, data: { port } });
                        }}
                        className="px-2 py-1 bg-rust-500 text-white rounded text-xs font-medium"
                      >
                        Set
                      </button>
                      <button onClick={() => setShowPortInput(false)} className="px-2 py-1 bg-dark-600 text-dark-200 rounded text-xs font-medium">
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      onClick={() => { setPortValue(String(overview.ssh_port)); setShowPortInput(true); }}
                      className="px-3 py-1.5 bg-dark-700 text-dark-200 hover:bg-dark-600 border border-dark-600 rounded text-xs font-medium transition-colors"
                    >
                      Change Port
                    </button>
                  )}
                </div>
              </div>

              <div className="bg-dark-800 rounded-lg border border-dark-500 p-5 min-h-[140px]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-warn-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-warn-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 1 0-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 0 0 2.25-2.25v-6.75a2.25 2.25 0 0 0-2.25-2.25H6.75a2.25 2.25 0 0 0-2.25 2.25v6.75a2.25 2.25 0 0 0 2.25 2.25Z" />
                    </svg>
                  </div>
                  <p className="text-xs font-medium text-dark-300 uppercase font-mono tracking-wider">SSL Certs</p>
                </div>
                <p className="text-3xl font-bold text-dark-50 mt-2">{overview.ssl_certs_count}</p>
                <p className="text-xs text-dark-300 mt-1">Active certificates</p>
              </div>

              <div className="bg-dark-800 rounded-lg border border-dark-500 p-5 min-h-[140px]">
                <div className="flex items-center gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-accent-500/10 flex items-center justify-center">
                    <svg className="w-5 h-5 text-accent-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75L11.25 15 15 9.75m-3-7.036A11.959 11.959 0 013.598 6 11.99 11.99 0 003 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285z" />
                    </svg>
                  </div>
                  <p className="text-xs font-medium text-dark-300 uppercase font-mono tracking-wider">Panel Protection</p>
                </div>
                <div className="flex items-center gap-2 mt-2">
                  <div className={`w-3 h-3 rounded-full ${panelJail ? "bg-rust-500" : "bg-dark-400"}`} />
                  <span className="text-sm text-dark-50">{panelJail ? "Active" : "Not configured"}</span>
                </div>
                {!panelJail && (
                  <button
                    onClick={async () => {
                      try {
                        await api.post("/security/panel-jail/setup");
                        setPanelJail(true);
                        setMessage({ text: "Panel Fail2Ban jail activated", type: "success" });
                      } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }
                    }}
                    className="mt-3 px-3 py-1.5 bg-dark-700 text-dark-200 hover:bg-dark-600 border border-dark-600 rounded text-xs font-medium transition-colors"
                  >
                    Enable Protection
                  </button>
                )}
                {panelJail && <p className="text-xs text-dark-300 mt-1">Bans IPs after 5 failed logins</p>}
              </div>
            </>
          )}
          {!posture && !overview && (
            <div className="col-span-full text-center py-8">
              <p className="text-dark-300 text-sm">Unable to load security overview. Check that the agent is running.</p>
            </div>
          )}
        </div>

        {/* Latest scan findings */}
        {posture?.latest_scan && posture.latest_scan.findings_count > 0 && (
          <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mb-6">
            <div className="px-5 py-3 border-b border-dark-600 flex items-center justify-between">
              <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Latest Scan Findings</h3>
              <span className="text-xs text-dark-300 font-mono">
                {new Date(posture.latest_scan.completed_at || posture.latest_scan.started_at).toLocaleString()}
              </span>
            </div>
            <div className="px-5 py-3 flex gap-4 text-sm border-b border-dark-600">
              {posture.latest_scan.critical_count > 0 && (
                <span className="text-danger-400 font-medium">{posture.latest_scan.critical_count} critical</span>
              )}
              {posture.latest_scan.warning_count > 0 && (
                <span className="text-warn-500 font-medium">{posture.latest_scan.warning_count} warning</span>
              )}
              {posture.latest_scan.info_count > 0 && (
                <span className="text-accent-400 font-medium">{posture.latest_scan.info_count} info</span>
              )}
            </div>
            <div className="p-3">
              <button
                onClick={() => { setTab("scans"); handleViewScan(posture.latest_scan!.id); }}
                className="text-sm text-rust-400 hover:text-rust-300 font-medium"
              >
                View details
              </button>
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Firewall Rules */}
          <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-x-auto">
            <div className="px-5 py-3 border-b border-dark-600 flex items-center justify-between">
              <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Firewall Rules</h3>
              <button
                onClick={() => setShowAddRule(true)}
                className="px-3 py-1 bg-rust-500 text-white rounded-md text-xs font-medium hover:bg-rust-600"
              >
                Add Rule
              </button>
            </div>
            {firewall && firewall.rules.length > 0 ? (
              <table className="w-full">
                <thead>
                  <tr className="bg-dark-900">
                    <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">#</th>
                    <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">To</th>
                    <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">Action</th>
                    <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">From</th>
                    <th scope="col" className="text-right text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2 w-16"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-600">
                  {firewall.rules.map((rule) => (
                    <tr key={rule.number} className="table-row-hover">
                      <td className="px-5 py-2.5 text-sm text-dark-300 font-mono">{rule.number}</td>
                      <td className="px-5 py-2.5 text-sm text-dark-50 font-mono">{rule.to}</td>
                      <td className="px-5 py-2.5">
                        <span className={`text-xs font-medium ${rule.action.toLowerCase().includes("allow") ? "text-rust-400" : "text-danger-400"}`}>
                          {rule.action}
                        </span>
                      </td>
                      <td className="px-5 py-2.5 text-sm text-dark-200 font-mono">{rule.from}</td>
                      <td className="px-5 py-2.5 text-right">
                        {deleteTarget === rule.number ? (
                          <div className="flex gap-1 justify-end">
                            <button onClick={() => handleDeleteRule(rule.number)} className="px-1.5 py-0.5 bg-danger-500 text-white rounded text-[10px]">Del</button>
                            <button onClick={() => setDeleteTarget(null)} className="px-1.5 py-0.5 bg-dark-600 text-dark-200 rounded text-[10px]">No</button>
                          </div>
                        ) : (
                          <button onClick={() => setDeleteTarget(rule.number)} className="text-dark-300 hover:text-danger-500" aria-label="Delete rule">
                            <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                            </svg>
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className="p-6 text-center text-sm text-dark-300">
                {firewall ? "No firewall rules" : "Could not load firewall status"}
              </div>
            )}
          </div>

          {/* Fail2Ban Jails */}
          <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-x-auto">
            <div className="px-5 py-3 border-b border-dark-600">
              <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Fail2Ban Jails</h3>
            </div>
            {fail2ban && fail2ban.jails.length > 0 ? (
              <>
                <table className="w-full">
                  <thead>
                    <tr className="bg-dark-900">
                      <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">Jail</th>
                      <th scope="col" className="text-right text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">Banned</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-dark-600">
                    {fail2ban.jails.map((jail) => (
                      <tr
                        key={jail.name}
                        className="table-row-hover cursor-pointer"
                        onClick={() => { if (selectedJail === jail.name) { setSelectedJail(null); } else { loadBannedIps(jail.name); if (!banJail) setBanJail(jail.name); } }}
                      >
                        <td className="px-5 py-2.5 text-sm text-dark-50 font-mono flex items-center gap-2">
                          <svg className={`w-3 h-3 text-dark-300 transition-transform ${selectedJail === jail.name ? "rotate-90" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                            <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 4.5l7.5 7.5-7.5 7.5" />
                          </svg>
                          {jail.name}
                        </td>
                        <td className="px-5 py-2.5 text-sm text-right">
                          <span className={`font-medium ${jail.banned_count > 0 ? "text-danger-400" : "text-dark-300"}`}>
                            {jail.banned_count}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Banned IPs for selected jail */}
                {selectedJail && (
                  <div className="border-t border-dark-600 px-5 py-3">
                    <p className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest mb-2">
                      Banned IPs in <span className="text-dark-100">{selectedJail}</span>
                    </p>
                    {bannedIps.length > 0 ? (
                      <div className="space-y-1">
                        {bannedIps.map((ip) => (
                          <div key={ip} className="flex items-center justify-between bg-dark-900 rounded px-3 py-1.5">
                            <span className="text-sm text-dark-50 font-mono">{ip}</span>
                            <button
                              onClick={(e) => {
                                e.stopPropagation();
                                setPendingConfirm({
                                  type: "unban",
                                  label: `Unban ${ip} from ${selectedJail}?`,
                                  data: { jail: selectedJail, ip }
                                });
                              }}
                              className="px-2 py-0.5 bg-rust-500/15 text-rust-400 rounded text-xs font-medium hover:bg-rust-500/25 transition-colors"
                            >
                              Unban
                            </button>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-xs text-dark-300">No banned IPs</p>
                    )}
                  </div>
                )}

                {/* Ban IP form */}
                <div className="border-t border-dark-600 px-5 py-3">
                  <p className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest mb-2">Ban IP</p>
                  <div className="flex gap-2">
                    <select
                      value={banJail}
                      onChange={(e) => setBanJail(e.target.value)}
                      className="px-2 py-1.5 border border-dark-500 rounded text-xs bg-dark-900 text-dark-100"
                    >
                      <option value="">Select jail</option>
                      {fail2ban.jails.map((j) => (
                        <option key={j.name} value={j.name}>{j.name}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={banIp}
                      onChange={(e) => setBanIp(e.target.value)}
                      className="flex-1 px-2 py-1.5 border border-dark-500 rounded text-xs bg-dark-900 text-dark-100 font-mono"
                      placeholder="IP address"
                    />
                    <button
                      onClick={() => {
                        if (!banJail || !banIp) return;
                        setPendingConfirm({
                          type: "ban",
                          label: `Ban ${banIp} in jail ${banJail}?`,
                          data: { jail: banJail, ip: banIp }
                        });
                      }}
                      disabled={!banJail || !banIp}
                      className="px-3 py-1.5 bg-danger-500/15 text-danger-400 rounded text-xs font-medium hover:bg-danger-500/25 transition-colors disabled:opacity-50"
                    >
                      Ban
                    </button>
                  </div>
                </div>
              </>
            ) : (
              <div className="p-6 text-center text-sm text-dark-300">
                {fail2ban ? "No jails configured" : "Fail2Ban not available"}
              </div>
            )}
          </div>
        </div>
    </>
  );
}
