import { api } from "../../api";
import WarningStrip from "./WarningStrip";
import type { AuditLogEntry, LockdownStatus, PendingConfirm, SuspiciousEvent } from "./types";

interface LockdownTabProps {
  lockdown: LockdownStatus | null;
  setMessage: (m: { text: string; type: string }) => void;
  loadData: () => void;
  setPendingConfirm: (v: PendingConfirm | null) => void;
  suspiciousEvents: SuspiciousEvent[];
  auditLog: AuditLogEntry[];
}

export default function LockdownTab({
  lockdown, setMessage, loadData, setPendingConfirm, suspiciousEvents, auditLog,
}: LockdownTabProps) {
  return (
    <>
      <div className="space-y-4">
        <div className={`bg-dark-800 rounded-lg border p-6 ${lockdown?.active ? "border-danger-500/50" : "border-dark-500"}`}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-dark-50 font-medium">System Lockdown</h3>
              <p className="text-sm text-dark-400 mt-1">
                {lockdown?.active
                  ? `Active since ${lockdown.triggered_at ? new Date(lockdown.triggered_at).toLocaleString() : "unknown"}`
                  : "System is operating normally"}
              </p>
              {lockdown?.reason && <p className="text-sm text-warn-400 mt-1">{lockdown.reason}</p>}
            </div>
            <div className="flex gap-2">
              {lockdown?.active ? (
                <button onClick={async () => { try { await api.post("/security/lockdown/deactivate", {}); setMessage({ text: "Lockdown deactivated", type: "success" }); loadData(); } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }}}
                  className="px-4 py-2 text-sm font-mono bg-rust-500 hover:bg-rust-600 text-white rounded-lg">Unlock System</button>
              ) : (
                <button onClick={() => setPendingConfirm({ type: "lockdown", label: "Activate lockdown? All non-admin access will be blocked." })}
                  className="px-4 py-2 text-sm font-mono bg-warn-500 hover:bg-warn-600 text-white rounded-lg">Activate Lockdown</button>
              )}
              <button onClick={() => setPendingConfirm({ type: "panic", label: "EMERGENCY: Kill all terminals, block non-admins, disable registration?" })}
                className="px-3 py-2 text-sm font-mono bg-danger-500 hover:bg-danger-600 text-white rounded-lg">Panic Button</button>
              <button onClick={async () => { try { const r = await api.post<{ snapshot_dir: string }>("/security/forensic-snapshot", {}); setMessage({ text: `Snapshot saved: ${r.snapshot_dir}`, type: "success" }); } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }}}
                className="px-3 py-2 text-sm font-mono bg-dark-700 hover:bg-dark-600 text-dark-200 rounded-lg border border-dark-500">Forensic Snapshot</button>
            </div>
          </div>

          {/* What this lockdown is actually DOING to terminals.
              Rendered from `terminals_blocked` — the computed answer — and
              never from the stored `terminals_disabled` column: that column is
              DEFAULT TRUE in the migration and `deactivate_lockdown` never
              clears it, so it reads TRUE on a panel that has never been locked
              down. Only the computed field answers "can anyone open a shell
              right now", and it is computed by the same function the ticket
              mint gates on, so this cannot drift from the gate.
              Until now nothing on the panel said terminals were blocked and
              the terminal simply returned SERVICE_UNAVAILABLE. */}
          {lockdown?.terminals_blocked && (
            <WarningStrip
              title="Terminals are blocked while lockdown is active"
              detail="Opening a shell or creating a terminal share is refused panel-wide (the terminal returns SERVICE_UNAVAILABLE). Unlock the system to restore terminal access. Existing shares can still be revoked."
              className="mb-4 px-4 py-3 rounded-lg border"
            />
          )}
          {/* Active, but this lockdown left terminals open — the one case
              where a shell is still available during an incident. */}
          {lockdown?.active && lockdown.terminals_blocked === false && (
            <p className="mb-4 text-xs font-mono text-dark-300">
              This lockdown did not disable terminals — shells can still be opened.
            </p>
          )}

          <div className="text-xs text-dark-400 space-y-1">
            <p>When locked: terminals disabled, registration blocked, non-admin logins blocked.</p>
            <p>Auto-expires after 24 hours. Panic button also activates lockdown.</p>
          </div>
        </div>

        {/* Suspicious Events — the feed the threshold above actually counts.
            Sits ahead of the immutable audit log on purpose: this is the
            "why is lockdown close to firing" narrative, the log below is
            the "what already happened" record. */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Suspicious Events</h3>
            <p className="text-xs text-dark-200 mt-0.5">Events counted toward the auto-lockdown threshold above — proxy/datacenter logins, staging-clone abuse, deploy anomalies.</p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-dark-600 text-left text-xs font-mono text-dark-400 uppercase">
                <th className="px-4 py-2">Event</th><th className="px-4 py-2">Details</th><th className="px-4 py-2">Actor</th><th className="px-4 py-2">IP</th><th className="px-4 py-2">Time</th>
              </tr></thead>
              <tbody>
                {suspiciousEvents.map((e) => (
                  <tr key={e.id} className="border-b border-dark-700 hover:bg-dark-700 align-top">
                    <td className="px-4 py-2 font-mono text-dark-200">{e.event_type}</td>
                    <td className="px-4 py-2 text-xs text-dark-300 max-w-[24rem] break-words" title={e.details || undefined}>{e.details || <span className="text-dark-400">-</span>}</td>
                    <td className="px-4 py-2 text-dark-300">{e.actor_email || "-"}</td>
                    <td className="px-4 py-2 text-dark-400 font-mono text-xs">{e.actor_ip || "-"}</td>
                    <td className="px-4 py-2 text-dark-400 text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {suspiciousEvents.length === 0 && <tr><td colSpan={5} className="px-4 py-8 text-center text-dark-400">No suspicious events recorded</td></tr>}
              </tbody>
            </table>
          </div>
        </div>

        {/* Immutable Audit Log */}
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Immutable Security Audit Log</h3>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead><tr className="border-b border-dark-600 text-left text-xs font-mono text-dark-400 uppercase">
                <th className="px-4 py-2">Severity</th><th className="px-4 py-2">Event</th><th className="px-4 py-2">Target</th><th className="px-4 py-2">Details</th><th className="px-4 py-2">Actor</th><th className="px-4 py-2">IP</th><th className="px-4 py-2">Location</th><th className="px-4 py-2">Time</th>
              </tr></thead>
              <tbody>
                {auditLog.map((e) => (
                  <tr key={e.id} className="border-b border-dark-700 hover:bg-dark-700 align-top">
                    <td className="px-4 py-2"><span className={`px-2 py-0.5 rounded text-[10px] font-mono uppercase ${e.severity === "critical" ? "text-danger-400 bg-danger-500/10" : e.severity === "warning" ? "text-warn-400 bg-warn-500/10" : "text-accent-400 bg-accent-500/10"}`}>{e.severity}</span></td>
                    <td className="px-4 py-2 font-mono text-dark-200">{e.event_type}</td>
                    <td className="px-4 py-2 font-mono text-xs text-dark-200 max-w-[16rem] break-all">
                      {e.target_type && <span className="text-dark-400 mr-1">{e.target_type}:</span>}
                      {e.target_name || <span className="text-dark-400">-</span>}
                    </td>
                    <td className="px-4 py-2 text-xs text-dark-300 max-w-[24rem] break-words" title={e.details || undefined}>{e.details || <span className="text-dark-400">-</span>}</td>
                    <td className="px-4 py-2 text-dark-300">{e.actor_email || "-"}</td>
                    <td className="px-4 py-2 text-dark-400 font-mono text-xs">{e.actor_ip || "-"}</td>
                    <td className="px-4 py-2 text-dark-400 text-xs">{e.geo_country || "-"}</td>
                    <td className="px-4 py-2 text-dark-400 text-xs whitespace-nowrap">{new Date(e.created_at).toLocaleString()}</td>
                  </tr>
                ))}
                {auditLog.length === 0 && <tr><td colSpan={8} className="px-4 py-8 text-center text-dark-400">No audit events yet</td></tr>}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </>
  );
}
