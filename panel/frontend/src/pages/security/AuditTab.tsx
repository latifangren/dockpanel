import { serverList } from "../../components/PanicReport";
import type { UnreachableServer } from "../../components/PanicReport";
import WarningStrip from "./WarningStrip";
import type { LoginAudit, SshLoginEntry } from "./types";

/** The agent returns up to 50 rows per host; a ten-host fleet is 500 rows. */
const SSH_ROWS_PER_SERVER = 10;

interface SshGroup {
  key: string;
  name: string;
  isLocal: boolean;
  rows: SshLoginEntry[];
}

interface AuditTabProps {
  loginAudit: LoginAudit;
  loginAuditError: string | null;
  sshGroups: SshGroup[];
  sshUnreached: UnreachableServer[];
  sshTotal: number | undefined;
  sshReached: number;
  auditLoading: boolean;
  loadLoginAudit: () => void;
  sshExpanded: Record<string, boolean>;
  setSshExpanded: (updater: (s: Record<string, boolean>) => Record<string, boolean>) => void;
}

export default function AuditTab({
  loginAudit, loginAuditError, sshGroups, sshUnreached, sshTotal,
  sshReached, auditLoading, loadLoginAudit, sshExpanded, setSshExpanded,
}: AuditTabProps) {
  return (
    <>
      <div className="space-y-6">
        {/* SSH Logins — every server in the fleet, not just the selected one */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600 flex items-start justify-between gap-4">
            <div className="min-w-0">
              <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">SSH Login Attempts</h3>
              <p className="text-xs text-dark-200 font-mono mt-0.5">
                {sshTotal !== undefined
                  ? `${sshReached} of ${sshTotal} server${sshTotal === 1 ? "" : "s"} answered · ${loginAudit.ssh.length} attempt${loginAudit.ssh.length === 1 ? "" : "s"}`
                  : `${loginAudit.ssh.length} attempt${loginAudit.ssh.length === 1 ? "" : "s"}`}
              </p>
            </div>
            <button
              onClick={loadLoginAudit}
              disabled={auditLoading}
              className="px-3 py-1.5 bg-dark-700 text-dark-200 hover:bg-dark-600 hover:text-dark-100 border border-dark-600 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 shrink-0"
            >
              {auditLoading ? "Asking servers…" : "Re-check"}
            </button>
          </div>

          {/* The request itself failed: BOTH tables below are empty because
              nothing was fetched. */}
          {loginAuditError && (
            <WarningStrip
              tone="danger"
              title="Login audit could not be loaded"
              detail={`Both tables below are empty because the request failed, not because there were no logins — ${loginAuditError}. Use Re-check once the panel is reachable.`}
            />
          )}

          {/* Hosts nobody could ask. Without this, an empty table reads as
              "no SSH logins" when the truth is "we could not look". */}
          {loginAudit.ssh_partial && sshUnreached.length > 0 && (
            <WarningStrip
              title={`SSH logins are missing from ${serverList(sshUnreached.map((s) => s.server_name))}`}
              detail={`${sshReached} of ${sshTotal ?? sshUnreached.length} servers answered. Nobody read auth.log on the ${sshUnreached.length === 1 ? "server" : `${sshUnreached.length} servers`} below, so the absence of a row from ${sshUnreached.length === 1 ? "it" : "them"} is not evidence that nothing happened there.`}
              servers={sshUnreached}
            />
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-dark-900">
                <th className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">Server</th>
                <th className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">Time</th>
                <th className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">User</th>
                <th className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">IP</th>
                <th className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">Method</th>
                <th className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">Status</th>
              </tr></thead>
              {sshGroups.map((g) => {
                // Capped per host rather than paginated: 50 rows per server is
                // 500 on a ten-host fleet, and the newest rows are the ones
                // worth seeing first. Nothing is hidden without a count.
                const expanded = sshExpanded[g.key] ?? false;
                const rows = expanded ? g.rows : g.rows.slice(0, SSH_ROWS_PER_SERVER);
                return (
                  <tbody key={g.key} className="divide-y divide-dark-600 border-t border-dark-600">
                    {sshGroups.length > 1 && (
                      <tr className="bg-dark-900/60">
                        <td colSpan={6} className="px-5 py-1.5 text-xs font-mono text-dark-200">
                          <span className="text-dark-50 font-medium">{g.name}</span>
                          {g.isLocal && <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] bg-dark-700 text-dark-200 align-middle">this panel</span>}
                          <span className="ml-2 text-dark-300">
                            {g.rows.length} attempt{g.rows.length === 1 ? "" : "s"}
                          </span>
                        </td>
                      </tr>
                    )}
                    {rows.map((e, i) => (
                      <tr key={`${g.key}-${i}`} className="table-row-hover">
                        <td className="px-5 py-2 text-xs text-dark-200 font-mono">{e.server_name ?? "—"}</td>
                        <td className="px-5 py-2 text-xs text-dark-200 font-mono">{e.time}</td>
                        <td className="px-5 py-2 text-sm text-dark-50 font-mono">{e.user}</td>
                        <td className="px-5 py-2 text-sm text-dark-100 font-mono">{e.ip}</td>
                        <td className="px-5 py-2 text-xs text-dark-300">{e.method}</td>
                        <td className="px-5 py-2">
                          <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.success ? "bg-rust-500/15 text-rust-400" : "bg-danger-500/15 text-danger-400"}`}>
                            {e.success ? "Success" : "Failed"}
                          </span>
                        </td>
                      </tr>
                    ))}
                    {g.rows.length > SSH_ROWS_PER_SERVER && (
                      <tr>
                        <td colSpan={6} className="px-5 py-2">
                          <button
                            onClick={() => setSshExpanded((s) => ({ ...s, [g.key]: !expanded }))}
                            className="text-xs font-mono text-rust-400 hover:text-rust-500 transition-colors"
                          >
                            {expanded
                              ? `Show fewer from ${g.name}`
                              : `Show all ${g.rows.length} attempts from ${g.name}`}
                          </button>
                        </td>
                      </tr>
                    )}
                  </tbody>
                );
              })}
            </table>
            {loginAudit.ssh.length === 0 && !loginAuditError && (
              <p className="px-5 py-4 text-sm text-dark-300">
                {loginAudit.ssh_partial
                  ? `No SSH login attempts from the ${sshReached} server${sshReached === 1 ? "" : "s"} that answered — the ${sshUnreached.length === 1 ? "server" : `${sshUnreached.length} servers`} named above ${sshUnreached.length === 1 ? "was" : "were"} not asked at all.`
                  : "No SSH login attempts found"}
              </p>
            )}
          </div>
        </div>

        {/* Panel Logins */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Panel Login Activity</h3>
          </div>

          {/* The activity_logs query failed. The backend degrades to an empty
              list so a broken panel query does not also cost the SSH half —
              which means without this strip a database error renders as "no
              panel logins", the most calming thing this page can say. */}
          {loginAudit.panel_query_failed && (
            <WarningStrip
              tone="danger"
              title="Panel login history could not be read"
              detail="The query against activity_logs failed, so this table is empty because of a database error — NOT because nobody signed in. Check the panel logs before drawing any conclusion from it."
            />
          )}

          <div className="overflow-x-auto">
            <table className="w-full">
              <thead><tr className="bg-dark-900">
                <th className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">Time</th>
                <th className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">Account</th>
                <th className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">From</th>
                <th className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">Action</th>
                <th className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-2">Status</th>
              </tr></thead>
              <tbody className="divide-y divide-dark-600">
                {loginAudit.panel.map((e, i) => (
                  <tr key={i} className="table-row-hover">
                    <td className="px-5 py-2 text-xs text-dark-200 font-mono">{new Date(e.time).toLocaleString()}</td>
                    <td className="px-5 py-2 text-sm text-dark-50 font-mono">
                      {e.user || "—"}
                      {/* Repeated attempts against addresses that do not exist are
                          what credential stuffing and user enumeration look like.
                          Until v2.60.0 these rows were rejected by a foreign key
                          and never reached this table at all. */}
                      {e.unknown_user && (
                        <span className="ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium bg-danger-500/15 text-danger-400 align-middle">
                          no such account
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-2 text-xs text-dark-200 font-mono">{e.ip || "—"}</td>
                    <td className="px-5 py-2 text-sm text-dark-50">{e.action}</td>
                    <td className="px-5 py-2">
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${e.success ? "bg-rust-500/15 text-rust-400" : "bg-danger-500/15 text-danger-400"}`}>
                        {e.success ? "Success" : "Failed"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {loginAudit.panel.length === 0 && !loginAudit.panel_query_failed && !loginAuditError && (
              <p className="px-5 py-4 text-sm text-dark-300">No panel login activity found</p>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
