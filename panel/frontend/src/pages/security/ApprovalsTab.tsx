import { api } from "../../api";
import type { PendingUser, UnverifiedUser } from "./types";

interface ApprovalsTabProps {
  pendingUsers: PendingUser[];
  unverifiedUsers: UnverifiedUser[];
  setMessage: (m: { text: string; type: string }) => void;
  loadData: () => void;
}

export default function ApprovalsTab({ pendingUsers, unverifiedUsers, setMessage, loadData }: ApprovalsTabProps) {
  return (
    <>
      <div className="space-y-4">
        <p className="text-sm text-dark-400">Users awaiting admin approval. Enable approval mode in Settings &rarr; Security.</p>
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-dark-600 text-left text-xs font-mono text-dark-400 uppercase">
              <th className="px-4 py-2">Email</th><th className="px-4 py-2">Registered</th><th className="px-4 py-2">Actions</th>
            </tr></thead>
            <tbody>
              {pendingUsers.map((u) => (
                <tr key={u.id} className="border-b border-dark-700">
                  <td className="px-4 py-2 text-dark-200">{u.email}</td>
                  <td className="px-4 py-2 text-dark-400 text-xs">{new Date(u.created_at).toLocaleString()}</td>
                  <td className="px-4 py-2">
                    <button onClick={async () => { try { await api.post(`/security/users/${u.id}/approve`, {}); setMessage({ text: "User approved", type: "success" }); loadData(); } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }}}
                      className="px-3 py-1 text-xs font-mono bg-rust-500 hover:bg-rust-600 text-white rounded">Approve</button>
                  </td>
                </tr>
              ))}
              {pendingUsers.length === 0 && <tr><td colSpan={3} className="px-4 py-8 text-center text-dark-400">No pending approvals</td></tr>}
            </tbody>
          </table>
        </div>

        {/* Email verification — the recovery door for a verification that can never
            complete (#100). Sits beside Approvals because it is the same shape: an
            administrator releasing an account the account cannot release itself. */}
        <p className="text-sm text-dark-400 pt-2">
          Accounts blocked by email verification. Sign-in is refused for an unverified
          account whenever an SMTP host is set — even if that SMTP host does not work.
          <span className="text-dark-300"> No link can be resent</span> to an account
          marked <span className="font-mono text-xs">no link exists</span>, so this
          button is the only way in besides editing the database.
        </p>
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <table className="w-full text-sm">
            <thead><tr className="border-b border-dark-600 text-left text-xs font-mono text-dark-400 uppercase">
              <th className="px-4 py-2">Email</th><th className="px-4 py-2">Role</th><th className="px-4 py-2">Status</th><th className="px-4 py-2">Actions</th>
            </tr></thead>
            <tbody>
              {unverifiedUsers.map((u) => (
                <tr key={u.id} className="border-b border-dark-700">
                  <td className="px-4 py-2 text-dark-200">{u.email}</td>
                  <td className="px-4 py-2 text-dark-400 text-xs font-mono">{u.role}</td>
                  <td className="px-4 py-2 text-xs">
                    {u.can_self_verify
                      ? <span className="text-dark-400">link outstanding</span>
                      : <span className="text-warn-400">no link exists</span>}
                  </td>
                  <td className="px-4 py-2">
                    <button onClick={async () => { try { await api.post(`/security/users/${u.id}/verify-email`, {}); setMessage({ text: "Email marked verified", type: "success" }); loadData(); } catch (e) { setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" }); }}}
                      className="px-3 py-1 text-xs font-mono bg-rust-500 hover:bg-rust-600 text-white rounded">Mark verified</button>
                  </td>
                </tr>
              ))}
              {unverifiedUsers.length === 0 && <tr><td colSpan={4} className="px-4 py-8 text-center text-dark-400">No accounts blocked by email verification</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </>
  );
}
