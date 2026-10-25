import { useState, useEffect } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { useAuth } from "../context/AuthContext";
import { api } from "../api";
import PanicReport, { serverList, unreachableNames, type PanicResult } from "../components/PanicReport";
import ConfirmDialog from "../components/ConfirmDialog";
import WarningStrip from "./security/WarningStrip";
import OverviewTab from "./security/OverviewTab";
import ScansTab from "./security/ScansTab";
import DiagnosticsTab from "./security/DiagnosticsTab";
import AuditTab from "./security/AuditTab";
import LockdownTab from "./security/LockdownTab";
import RecordingsTab from "./security/RecordingsTab";
import ApprovalsTab from "./security/ApprovalsTab";
import {
  SEC_TABS,
  type AuditLogEntry,
  type Fail2banStatus,
  type FirewallStatus,
  type LockdownStatus,
  type LoginAudit,
  type PendingConfirm,
  type PendingUser,
  type Posture,
  type RecordingEntry,
  type ScanFinding,
  type ScanSummary,
  type SecTab,
  type SecurityOverview,
  type SshLoginEntry,
  type SuspiciousEvent,
  type UnverifiedUser,
} from "./security/types";



export default function Security() {
  const { user } = useAuth();
  // Ahead of every hook, which is where the other nineteen administrator pages
  // put it. A redirect is itself an effect, so a guard placed BELOW the loaders
  // does not out-run them: the mount fires its whole request burst and collects
  // a 403 for each before the navigation lands. Nothing was disclosed — the
  // server refused every one — but a refused request is a line in the audit log
  // and a fright for whoever reads it.
  if (user?.role !== "admin") return <Navigate to="/" replace />;
  const [overview, setOverview] = useState<SecurityOverview | null>(null);
  const [firewall, setFirewall] = useState<FirewallStatus | null>(null);
  const [fail2ban, setFail2ban] = useState<Fail2banStatus | null>(null);
  const [posture, setPosture] = useState<Posture | null>(null);
  const [scans, setScans] = useState<ScanSummary[]>([]);
  const [selectedScan, setSelectedScan] = useState<string | null>(null);
  const [findings, setFindings] = useState<ScanFinding[]>([]);
  const [loading, setLoading] = useState(true);
  const [scanning, setScanning] = useState(false);
  const [showAddRule, setShowAddRule] = useState(false);
  const [rulePort, setRulePort] = useState("");
  const [ruleProto, setRuleProto] = useState("tcp");
  const [ruleAction, setRuleAction] = useState("allow");
  const [ruleFrom, setRuleFrom] = useState("");
  const [deleteTarget, setDeleteTarget] = useState<number | null>(null);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [searchParams] = useSearchParams();
  const resolveSecTab = (raw: string | null): SecTab =>
    raw && (SEC_TABS as readonly string[]).includes(raw) ? (raw as SecTab) : "overview";
  // Deep-linkable tab (e.g. /security?tab=diagnostics from the dashboard).
  const [tab, setTab] = useState<SecTab>(() => resolveSecTab(searchParams.get("tab")));
  useEffect(() => {
    setTab(resolveSecTab(searchParams.get("tab")));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [searchParams]);
  const [loginAudit, setLoginAudit] = useState<LoginAudit>({ panel: [], ssh: [] });
  const [auditLoading, setAuditLoading] = useState(false);
  // A failed fetch left the two tables empty and said nothing — the same
  // "empty reads as clean" fault the coverage flags exist to prevent, one level
  // up. Kept next to the tables rather than in `message` because it explains
  // what is (not) on screen right there.
  const [loginAuditError, setLoginAuditError] = useState<string | null>(null);
  // Per-server row expansion for the SSH table. Keyed by server id.
  const [sshExpanded, setSshExpanded] = useState<Record<string, boolean>>({});

  // Security Hardening state (consolidated from SecurityHardening.tsx)
  const [lockdown, setLockdown] = useState<LockdownStatus | null>(null);
  const [auditLog, setAuditLog] = useState<AuditLogEntry[]>([]);
  const [suspiciousEvents, setSuspiciousEvents] = useState<SuspiciousEvent[]>([]);
  const [recordings, setRecordings] = useState<RecordingEntry[]>([]);
  const [pendingUsers, setPendingUsers] = useState<PendingUser[]>([]);
  const [unverifiedUsers, setUnverifiedUsers] = useState<UnverifiedUser[]>([]);
  const [selectedJail, setSelectedJail] = useState<string | null>(null);
  const [bannedIps, setBannedIps] = useState<string[]>([]);
  const [banIp, setBanIp] = useState("");
  const [banJail, setBanJail] = useState("");
  const [panelJail, setPanelJail] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<PendingConfirm | null>(null);
  const [showPortInput, setShowPortInput] = useState(false);
  const [portValue, setPortValue] = useState("");
  // The panic button's per-host result. Kept out of `message` because the hosts
  // it could not sweep need a block, not a line — see components/PanicReport.
  const [panicResult, setPanicResult] = useState<PanicResult | null>(null);

  const loadData = async () => {
    try {
      const [ov, fw, fb, pos, sc] = await Promise.all([
        api.get<SecurityOverview>("/security/overview").catch(() => null),
        api.get<FirewallStatus>("/security/firewall").catch(() => null),
        api.get<Fail2banStatus>("/security/fail2ban").catch(() => null),
        api.get<Posture>("/security/posture").catch(() => null),
        api.get<ScanSummary[]>("/security/scans").catch(() => []),
      ]);
      setOverview(ov);
      setFirewall(fw);
      setFail2ban(fb);
      setPosture(pos);
      setScans(sc || []);
      api.get<{ active: boolean }>("/security/panel-jail/status").then(d => setPanelJail(d.active)).catch(() => {});
      // Load hardening data (consolidated from SecurityHardening.tsx)
      api.get<LockdownStatus>("/security/lockdown").then(setLockdown).catch(() => {});
      api.get<AuditLogEntry[]>("/security/audit-log?limit=50").then(setAuditLog).catch(() => {});
      api.get<SuspiciousEvent[]>("/security/suspicious-events?limit=50").then(setSuspiciousEvents).catch(() => {});
      api.get<{ recordings: RecordingEntry[] }>("/security/recordings").then(d => setRecordings(d.recordings || [])).catch(() => {});
      api.get<PendingUser[]>("/security/pending-users").then(setPendingUsers).catch(() => {});
      api.get<UnverifiedUser[]>("/security/unverified-users").then(setUnverifiedUsers).catch(() => {});
    } finally {
      setLoading(false);
    }
  };

  const loadBannedIps = async (jail: string) => {
    try {
      const data = await api.get<{ ips: string[] }>(`/security/fail2ban/${jail}/banned`);
      setBannedIps(data.ips);
      setSelectedJail(jail);
    } catch { setBannedIps([]); }
  };

  const loadLoginAudit = async () => {
    setAuditLoading(true);
    try {
      const data = await api.get<LoginAudit>("/security/login-audit");
      setLoginAudit(data);
      setLoginAuditError(null);
    } catch (e) {
      // Clear the tables AND say why. Leaving the old rows up would present
      // stale data as current; leaving them empty silently would present a
      // failed request as a quiet fleet.
      setLoginAudit({ panel: [], ssh: [] });
      setLoginAuditError(e instanceof Error ? e.message : "Request failed");
    } finally {
      setAuditLoading(false);
    }
  };

  const executeConfirm = async () => {
    if (!pendingConfirm) return;
    const { type, data = {} } = pendingConfirm;
    setPendingConfirm(null);
    try {
      switch (type) {
        case "ssh_password": {
          await api.post(data.enabled ? "/security/ssh/disable-password" : "/security/ssh/enable-password", {});
          setMessage({ text: `SSH password auth ${data.enabled ? "disabled" : "enabled"}`, type: "success" });
          loadData();
          break;
        }
        case "ssh_root": {
          await api.post("/security/ssh/disable-root", {});
          setMessage({ text: "SSH root login disabled", type: "success" });
          loadData();
          break;
        }
        case "ssh_port": {
          await api.post("/security/ssh/change-port", { port: data.port });
          setMessage({ text: `SSH port changed to ${data.port}`, type: "success" });
          loadData();
          break;
        }
        case "unban": {
          await api.post("/security/fail2ban/unban", { jail: data.jail, ip: data.ip });
          setMessage({ text: `${data.ip} unbanned from ${data.jail}`, type: "success" });
          loadBannedIps(String(data.jail));
          loadData();
          break;
        }
        case "ban": {
          await api.post("/security/fail2ban/ban", { jail: data.jail, ip: data.ip });
          setMessage({ text: `${data.ip} banned in ${data.jail}`, type: "success" });
          setBanIp("");
          if (selectedJail === data.jail) loadBannedIps(String(data.jail));
          loadData();
          break;
        }
        case "quarantine": {
          await api.post("/security/fix", { fix_type: "quarantine_file", target: data.path });
          setMessage({ text: "File quarantined", type: "success" });
          handleScan();
          break;
        }
        case "delete_file": {
          await api.post("/security/fix", { fix_type: "remove_file", target: data.path });
          setMessage({ text: "File deleted", type: "success" });
          handleScan();
          break;
        }
        case "apply_fix": {
          await api.post("/security/fix", { fix_type: data.fix_type, target: data.target });
          setMessage({ text: `Fix applied: ${data.fix_label}`, type: "success" });
          handleScan();
          break;
        }
        case "lockdown": {
          await api.post("/security/lockdown/activate", { reason: "Manual admin lockdown" });
          setMessage({ text: "Lockdown activated", type: "success" });
          loadData();
          break;
        }
        case "panic": {
          const r = await api.post<PanicResult>("/security/panic", {});
          // Report what the server actually did. `sessions_revoked` was already
          // being computed honestly and thrown away here, while this string said
          // "all sessions revoked" unconditionally — the same shape as the
          // hardcoded `terminals_killed: true` that v2.65.0 removed, one field
          // to the left.
          const sess = r.sessions_revoked ? "all sessions revoked" : "SESSION REVOCATION FAILED";
          const shares = r.shares_revoked > 0 ? `, ${r.shares_revoked} terminal share${r.shares_revoked === 1 ? "" : "s"} revoked` : "";
          // The panic now fans out, so the un-swept members are named here and
          // listed in full by <PanicReport/> below. `agent_reached` is false
          // whenever ANY member was left unswept.
          setPanicResult(r);
          const missed = unreachableNames(r);
          const n = r.terminals_killed ?? 0;
          const root = r.server_terminals_killed ?? 0;
          const killed = `${n} terminal${n === 1 ? "" : "s"} killed${root > 0 ? ` (${root} server/root)` : ""}`;
          if (!r.agent_reached) {
            const where = missed.length > 0
              ? `terminals may still be running on ${serverList(missed)}`
              : "terminals may still be running";
            const swept = r.servers_total ? ` (${r.servers_reached ?? 0}/${r.servers_total} servers swept, ${killed})` : "";
            setMessage({ text: `Panic: locked down and ${sess}, but ${where}${swept}${shares}`, type: "error" });
          } else {
            const fleet = r.servers_total && r.servers_total > 1 ? ` across all ${r.servers_total} servers` : "";
            setMessage({ text: `Panic mode activated — ${killed}${fleet}, ${sess}${shares}`, type: r.sessions_revoked ? "success" : "error" });
          }
          // Panic revokes THIS admin's session too (correct — they cannot know
          // their own is not the stolen one). So do NOT call loadData(): its
          // requests 401 and api.ts hard-navigates to /login within one round
          // trip, destroying the report above before it can be read — including
          // the "terminals may still be running" warning, the single most
          // important sentence here. Mirrors the existing self-revocation
          // handling in Settings.tsx ("Revoke all sessions").
          //
          // When hosts were left unswept, don't redirect at all: the list of
          // machines to go and check by hand cannot be re-fetched afterwards
          // (the session is gone and the detail lives only in the audit log),
          // and six seconds is not long enough to read, let alone write down,
          // a list of hostnames. <PanicReport/> carries its own way out.
          if (missed.length === 0) {
            setTimeout(() => { window.location.href = "/login"; }, 6000);
          }
          break;
        }
      }
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Action failed", type: "error" });
    }
  };

  const getFixAction = (finding: ScanFinding): { type: string; target: string; label: string } | null => {
    if (finding.check_type === "open_port" && finding.title.includes("Unexpected open port")) {
      const port = finding.title.match(/port:\s*(\d+)/)?.[1];
      if (port) return { type: "block_port", target: port, label: "Block Port" };
    }
    if (finding.check_type === "malware" && finding.file_path) {
      return { type: "remove_file", target: finding.file_path, label: "Remove File" };
    }
    return null;
  };

  useEffect(() => {
    loadData();
  }, []);

  // Fetch when the audit tab becomes visible, including on a deep link
  // (/security?tab=audit). The fetch used to hang off the tab BUTTON only, so
  // arriving by URL showed two empty tables with nothing saying that nothing
  // had been asked for — the same fault as an un-asked host, one layer out.
  useEffect(() => {
    if (tab === "audit") loadLoginAudit();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab]);

  const handleScan = async () => {
    setScanning(true);
    setMessage({ text: "", type: "" });
    try {
      const result = await api.post<{ findings_count: number; critical_count: number }>("/security/scan", {});
      setMessage({
        text: `Scan completed: ${result.findings_count} findings (${result.critical_count} critical)`,
        type: result.critical_count > 0 ? "error" : "success",
      });
      loadData();
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Scan failed",
        type: "error",
      });
    } finally {
      setScanning(false);
    }
  };

  const handleViewScan = async (id: string) => {
    if (selectedScan === id) {
      setSelectedScan(null);
      return;
    }
    try {
      const result = await api.get<{ findings: ScanFinding[] }>(`/security/scans/${id}`);
      setFindings(result.findings);
      setSelectedScan(id);
    } catch {
      setMessage({ text: "Failed to load scan details", type: "error" });
    }
  };

  const handleAddRule = async () => {
    if (!rulePort) return;
    setMessage({ text: "", type: "" });
    try {
      await api.post("/security/firewall/rules", {
        port: parseInt(rulePort),
        proto: ruleProto,
        action: ruleAction,
        from: ruleFrom || null,
      });
      setShowAddRule(false);
      setRulePort("");
      setRuleFrom("");
      setMessage({ text: "Firewall rule added", type: "success" });
      loadData();
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Failed to add rule",
        type: "error",
      });
    }
  };

  const handleDeleteRule = async (num: number) => {
    try {
      await api.delete(`/security/firewall/rules/${num}`);
      setDeleteTarget(null);
      setMessage({ text: "Rule deleted", type: "success" });
      loadData();
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Failed to delete rule",
        type: "error",
      });
    }
  };

  const scoreColor = (score: number) => {
    if (score >= 80) return "text-rust-400";
    if (score >= 50) return "text-warn-500";
    return "text-danger-400";
  };

  const scoreBg = (score: number) => {
    if (score >= 80) return "bg-rust-500";
    if (score >= 50) return "bg-warn-500";
    return "bg-danger-500";
  };

  const severityBadge = (severity: string) => {
    switch (severity) {
      case "critical":
        return "bg-danger-500/15 text-danger-400 border-danger-500/20";
      case "warning":
        return "bg-warn-500/15 text-warn-400 border-warn-400/20";
      default:
        return "bg-accent-500/15 text-accent-400 border-accent-200";
    }
  };

  const checkTypeBadge = (type: string) => {
    switch (type) {
      case "malware":
        return "bg-danger-500/10 text-danger-400";
      case "file_integrity":
        return "bg-accent-600/15 text-accent-400";
      case "open_port":
        return "bg-warn-500/10 text-warn-400";
      case "ssl_expiry":
        return "bg-warn-500/10 text-warn-400";
      case "container_vuln":
        return "bg-danger-500/10 text-danger-400";
      case "secret_leak":
        return "bg-danger-500/10 text-danger-400";
      case "security_headers":
        return "bg-accent-500/10 text-accent-400";
      default:
        return "bg-dark-900 text-dark-200";
    }
  };

  // ── SSH login audit: per-host grouping and coverage ──────────────────────
  //
  // The rows arrive as one contiguous block per host and are deliberately NOT
  // sorted globally: the agent's `time` is a year-less syslog stamp, so a
  // cross-host chronological merge would be a fiction with a timestamp on it.
  // Run-length grouping therefore preserves exactly the order the backend sent
  // — each host's own ordering, hosts in `online_fleet` order — and gives the
  // volume somewhere to be capped.
  const sshGroups: { key: string; name: string; isLocal: boolean; rows: SshLoginEntry[] }[] = [];
  for (const e of loginAudit.ssh) {
    const key = e.server_id ?? e.server_name ?? "unknown";
    const last = sshGroups[sshGroups.length - 1];
    if (last && last.key === key) last.rows.push(e);
    else sshGroups.push({ key, name: e.server_name ?? "Unknown server", isLocal: e.is_local ?? false, rows: [e] });
  }
  const sshUnreached = loginAudit.ssh_unreachable_servers ?? [];
  const sshTotal = loginAudit.ssh_servers_total;
  const sshReached = loginAudit.ssh_servers_reached ?? 0;

  if (loading) {
    return (
      <div className="p-6 lg:p-8 animate-fade-up">
        <h1 className="text-sm font-medium text-dark-300 uppercase font-mono tracking-widest mb-6">Security</h1>
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => (
            <div key={i} className="bg-dark-800 rounded-lg border border-dark-500 p-5 animate-pulse">
              <div className="h-4 bg-dark-700 rounded w-20 mb-3" />
              <div className="h-8 bg-dark-700 rounded w-16" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Security</h1>
          <p className="page-header-subtitle">Firewall, fail2ban, and security scanning</p>
        </div>
        <div className="flex items-center gap-2">
          <a
            href="/api/security/report"
            target="_blank"
            className="px-4 py-2 bg-dark-700 text-dark-200 hover:bg-dark-600 hover:text-dark-100 border border-dark-600 rounded-lg text-sm font-medium transition-colors"
          >
            Download Report
          </a>
          <button
            onClick={handleScan}
            disabled={scanning}
            className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50 flex items-center gap-2"
          >
            {scanning && (
              <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
              </svg>
            )}
            {scanning ? "Scanning..." : "Run Security Scan"}
          </button>
        </div>
      </div>

      <div className="p-6 lg:p-8">
      {/* The machines the panic button did NOT sweep. Renders nothing when the
          whole fleet was covered. Above the banner because it outranks it. */}
      {panicResult && (
        <PanicReport result={panicResult} onDismiss={() => { window.location.href = "/login"; }} />
      )}
      {message.text && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
            message.type === "success"
              ? "bg-rust-500/10 text-rust-400 border-rust-500/20"
              : "bg-danger-500/10 text-danger-400 border-danger-500/20"
          }`}
        >
          {message.text}
        </div>
      )}

      {/* Issue #120: the prompt portals to document.body — its eleven triggers are scattered across three tabs, so a bar rendered here was off-screen for most of them. */}
      {pendingConfirm && (
        <ConfirmDialog
          label={pendingConfirm.label}
          tone={["panic", "delete_file", "lockdown"].includes(pendingConfirm.type) ? "danger" : "warn"}
          onConfirm={executeConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {/* Tabs */}
      <div className="flex gap-1 mb-6 bg-dark-700 rounded-lg p-1 w-fit">
        <button
          onClick={() => setTab("overview")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "overview" ? "bg-dark-800 text-dark-50 shadow-sm" : "text-dark-200 hover:text-dark-100"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setTab("scans")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "scans" ? "bg-dark-800 text-dark-50 shadow-sm" : "text-dark-200 hover:text-dark-100"
          }`}
        >
          Scan History
        </button>
        <button
          onClick={() => setTab("diagnostics")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "diagnostics" ? "bg-dark-800 text-dark-50 shadow-sm" : "text-dark-200 hover:text-dark-100"
          }`}
        >
          Diagnostics
        </button>
        <button
          onClick={() => setTab("audit")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "audit" ? "bg-dark-800 text-dark-50 shadow-sm" : "text-dark-200 hover:text-dark-100"
          }`}
        >
          Login Audit
        </button>
        <button
          onClick={() => setTab("lockdown")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "lockdown" ? "bg-dark-800 text-dark-50 shadow-sm" : "text-dark-200 hover:text-dark-100"
          }`}
        >
          {lockdown?.active ? "Lockdown (Active)" : "Lockdown"}
        </button>
        <button
          onClick={() => setTab("recordings")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "recordings" ? "bg-dark-800 text-dark-50 shadow-sm" : "text-dark-200 hover:text-dark-100"
          }`}
        >
          Recordings
        </button>
        <button
          onClick={() => setTab("approvals")}
          className={`px-4 py-1.5 rounded-md text-sm font-medium transition-colors ${
            tab === "approvals" ? "bg-dark-800 text-dark-50 shadow-sm" : "text-dark-200 hover:text-dark-100"
          }`}
        >
          Approvals{pendingUsers.length > 0 && <span className="ml-1 px-1.5 py-0.5 text-[10px] bg-rust-500 text-white rounded-full">{pendingUsers.length}</span>}
        </button>
      </div>

      {tab === "overview" && (
        <OverviewTab
          posture={posture}
          overview={overview}
          panelJail={panelJail}
          setPanelJail={setPanelJail}
          setMessage={setMessage}
          scoreColor={scoreColor}
          scoreBg={scoreBg}
          firewall={firewall}
          deleteTarget={deleteTarget}
          setDeleteTarget={setDeleteTarget}
          handleDeleteRule={handleDeleteRule}
          fail2ban={fail2ban}
          selectedJail={selectedJail}
          setSelectedJail={setSelectedJail}
          loadBannedIps={loadBannedIps}
          banJail={banJail}
          setBanJail={setBanJail}
          bannedIps={bannedIps}
          banIp={banIp}
          setBanIp={setBanIp}
          setPendingConfirm={setPendingConfirm}
          showPortInput={showPortInput}
          setShowPortInput={setShowPortInput}
          portValue={portValue}
          setPortValue={setPortValue}
          setTab={setTab}
          handleViewScan={handleViewScan}
          setShowAddRule={setShowAddRule}
        />
      )}

      {tab === "scans" && (
        <ScansTab scans={scans} selectedScan={selectedScan} handleViewScan={handleViewScan} findings={findings} severityBadge={severityBadge} checkTypeBadge={checkTypeBadge} getFixAction={getFixAction} setPendingConfirm={setPendingConfirm} />
      )}

      {tab === "diagnostics" && (
        <DiagnosticsTab />
      )}

      {tab === "audit" && (
        <AuditTab
          loginAudit={loginAudit}
          loginAuditError={loginAuditError}
          sshGroups={sshGroups}
          sshUnreached={sshUnreached}
          sshTotal={sshTotal}
          sshReached={sshReached}
          auditLoading={auditLoading}
          loadLoginAudit={loadLoginAudit}
          sshExpanded={sshExpanded}
          setSshExpanded={setSshExpanded}
        />
      )}

      {/* Add Rule Dialog */}
      {showAddRule && (() => {
        const portInfo: Record<string, { service: string; safety: "safe" | "caution" | "blocked" }> = {
          "22": { service: "SSH", safety: "safe" }, "80": { service: "HTTP", safety: "safe" }, "443": { service: "HTTPS", safety: "safe" },
          "8080": { service: "HTTP Alt", safety: "safe" }, "8443": { service: "HTTPS Alt", safety: "safe" },
          "3000": { service: "Web App", safety: "safe" }, "3001": { service: "Web App", safety: "safe" },
          "5000": { service: "Web App", safety: "safe" }, "8000": { service: "Web App", safety: "safe" },
          "25": { service: "SMTP", safety: "caution" }, "587": { service: "SMTP Submission", safety: "caution" },
          "465": { service: "SMTPS", safety: "caution" }, "993": { service: "IMAPS", safety: "caution" },
          "995": { service: "POP3S", safety: "caution" }, "110": { service: "POP3", safety: "caution" },
          "143": { service: "IMAP", safety: "caution" }, "21": { service: "FTP", safety: "caution" },
          "3306": { service: "MySQL", safety: "caution" }, "5432": { service: "PostgreSQL", safety: "caution" },
          "6379": { service: "Redis", safety: "caution" }, "27017": { service: "MongoDB", safety: "caution" },
          "23": { service: "Telnet", safety: "blocked" }, "135": { service: "RPC", safety: "blocked" },
          "136": { service: "NetBIOS", safety: "blocked" }, "137": { service: "NetBIOS", safety: "blocked" },
          "138": { service: "NetBIOS", safety: "blocked" }, "139": { service: "NetBIOS", safety: "blocked" },
          "445": { service: "SMB", safety: "blocked" }, "1433": { service: "MSSQL", safety: "blocked" },
        };

        const info = rulePort ? portInfo[rulePort] : null;
        const isBlocked = info?.safety === "blocked";

        const presets = [
          { label: "Web", ports: "80, 443, 8080", action: () => { setRulePort("80"); } },
          { label: "Mail", ports: "25, 587, 993", action: () => { setRulePort("587"); } },
          { label: "Database", ports: "3306 or 5432", action: () => { setRulePort("3306"); } },
        ];

        return (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 dp-modal-overlay" onClick={() => setShowAddRule(false)}>
          <div className="bg-dark-800 border border-dark-500 shadow-xl p-6 w-full max-w-md dp-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-labelledby="add-rule-title">
            <h3 id="add-rule-title" className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest mb-4">Open Port</h3>

            {/* Quick presets */}
            <div className="flex gap-2 mb-4">
              {presets.map((p) => (
                <button key={p.label} onClick={p.action} className="px-3 py-1.5 bg-dark-700 border border-dark-500 text-xs text-dark-100 hover:bg-dark-600 transition-colors">
                  {p.label} <span className="text-dark-300 ml-1">{p.ports}</span>
                </button>
              ))}
            </div>

            <div className="space-y-3">
              <div>
                <label htmlFor="rule-port" className="block text-xs font-medium text-dark-100 mb-1">Port Number</label>
                <input
                  id="rule-port"
                  type="number"
                  value={rulePort}
                  onChange={(e) => setRulePort(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                  placeholder="e.g. 8080"
                  autoFocus
                />
                {/* Port info badge */}
                {rulePort && (
                  <div className={`mt-2 flex items-center gap-2 text-xs ${isBlocked ? "text-danger-400" : info?.safety === "caution" ? "text-warn-400" : "text-rust-400"}`}>
                    <span className={`w-2 h-2 rounded-full ${isBlocked ? "bg-danger-400" : info?.safety === "caution" ? "bg-warn-400" : "bg-rust-400"}`} />
                    {info ? (
                      <span>{info.service} — {isBlocked ? "Blocked (security risk)" : info.safety === "caution" ? "Use with caution (restrict source IP if possible)" : "Safe to open"}</span>
                    ) : (
                      <span>Custom port — safe to open</span>
                    )}
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="rule-protocol" className="block text-xs font-medium text-dark-100 mb-1">Protocol</label>
                  <select id="rule-protocol" value={ruleProto} onChange={(e) => setRuleProto(e.target.value)} className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm">
                    <option value="tcp">TCP</option>
                    <option value="udp">UDP</option>
                    <option value="tcp/udp">TCP/UDP</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="rule-action" className="block text-xs font-medium text-dark-100 mb-1">Action</label>
                  <select id="rule-action" value={ruleAction} onChange={(e) => setRuleAction(e.target.value)} className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm">
                    <option value="allow">Allow</option>
                    <option value="deny">Deny</option>
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="rule-from" className="block text-xs font-medium text-dark-100 mb-1">From IP <span className="text-dark-300">(optional — leave empty for any)</span></label>
                <input id="rule-from" type="text" value={ruleFrom} onChange={(e) => setRuleFrom(e.target.value)} className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none" placeholder="Any" />
              </div>
            </div>

            <div className="flex justify-end gap-2 mt-5">
              <button onClick={() => setShowAddRule(false)} className="px-4 py-2 text-dark-300 border border-dark-600 rounded-lg text-sm font-medium hover:text-dark-100 hover:border-dark-400">Cancel</button>
              <button
                onClick={handleAddRule}
                disabled={!rulePort || isBlocked}
                className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
              >
                {isBlocked ? "Port Blocked" : "Open Port"}
              </button>
            </div>
          </div>
        </div>
        );
      })()}
      {/* Lockdown Tab (consolidated from SecurityHardening) */}
      {tab === "lockdown" && (
        <LockdownTab lockdown={lockdown} setMessage={setMessage} loadData={loadData} setPendingConfirm={setPendingConfirm} suspiciousEvents={suspiciousEvents} auditLog={auditLog} />
      )}

      {/* Recordings Tab */}
      {tab === "recordings" && (
        <RecordingsTab recordings={recordings} />
      )}

      {/* Approvals Tab */}
      {tab === "approvals" && (
        <ApprovalsTab pendingUsers={pendingUsers} unverifiedUsers={unverifiedUsers} setMessage={setMessage} loadData={loadData} />
      )}

      </div>
    </div>
  );
}
