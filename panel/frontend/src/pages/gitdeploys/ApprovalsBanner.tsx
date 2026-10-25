import type { Dispatch, SetStateAction } from "react";
import { maskRepoCredentials } from "./helpers";
import type { DeployApproval } from "../GitDeploys";

export default function ApprovalsBanner({
  approvals,
  user,
  resolving,
  setPendingConfirm,
}: {
  approvals: DeployApproval[];
  user: { id: string };
  resolving: string | null;
  setPendingConfirm: Dispatch<SetStateAction<{ type: string; id: string; label: string } | null>>;
}) {
  return (
    <>
      {/* Pending deploy approvals.
          Installation-wide for the machines this administrator operates — not a
          property of the selected row — and the bell notification an approver
          follows links to this page with nothing selected. So it sits above the
          list, where it is the first thing on screen. */}
      {approvals.length > 0 && (
        <div className="mb-4 bg-dark-800 rounded-lg border border-warn-500/30 overflow-hidden">
          <div className="px-5 py-4 border-b border-dark-600">
            <h2 className="text-xs font-medium text-warn-400 uppercase font-mono tracking-widest">
              Pending Approvals ({approvals.length})
            </h2>
            <p className="text-xs text-dark-200 mt-1">
              Protected deployments waiting on a second administrator. You cannot approve a request you filed yourself.
            </p>
          </div>
          <div className="divide-y divide-dark-600">
            {approvals.map((a) => {
              const own = a.requested_by === user.id;
              return (
                <div key={a.id} className="px-5 py-3 flex items-center justify-between gap-4">
                  {/* The deployment list is scoped to its owner, so the approving
                      administrator has usually never seen this deployment anywhere
                      else in the panel. Naming the requester, the repository and
                      the branch is what makes the second signature a review rather
                      than a formality. */}
                  <div className="min-w-0">
                    <div className="flex items-center gap-3 min-w-0">
                      <span className="inline-flex px-2 py-0.5 rounded-full text-xs font-medium bg-warn-500/15 text-warn-400 shrink-0">
                        awaiting approval
                      </span>
                      <code className="text-sm text-dark-50 font-mono truncate">{a.deploy_name}</code>
                      <span className="text-xs text-dark-300 shrink-0 hidden sm:inline">{new Date(a.created_at).toLocaleString()}</span>
                    </div>
                    <div className="mt-1 text-xs text-dark-200 font-mono truncate">
                      {a.requested_by_email} &middot; {maskRepoCredentials(a.repo_url).replace(/^https?:\/\//, "").replace(/\.git$/, "")} &middot; {a.branch}
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {own ? (
                      // Not a dead end. `reject_deploy` has no self-rejection ban, so
                      // the requester may withdraw — and on a single-admin install
                      // that is the ONLY exit: nobody else exists to approve, and the
                      // one-pending-per-deployment index means pressing Deploy again
                      // cannot replace the row either.
                      <>
                        <span className="text-xs text-dark-300 font-mono hidden md:inline">your request — another admin must approve it</span>
                        <button
                          onClick={() => setPendingConfirm({
                            type: "reject-request",
                            id: a.id,
                            label: `Withdraw your own deploy request for "${a.deploy_name}"?`,
                          })}
                          disabled={resolving === a.id}
                          className="px-3 py-1 bg-dark-700 text-dark-100 rounded-md text-xs font-medium hover:bg-dark-600 disabled:opacity-50 transition-colors"
                        >
                          {resolving === a.id ? "Working..." : "Withdraw"}
                        </button>
                      </>
                    ) : (
                      <>
                        <button
                          onClick={() => setPendingConfirm({
                            type: "approve-request",
                            id: a.id,
                            label: `Approve and deploy "${a.deploy_name}" to production now.`,
                          })}
                          disabled={resolving === a.id}
                          className="px-3 py-1 bg-rust-500/15 text-rust-400 rounded-md text-xs font-medium hover:bg-rust-500/25 disabled:opacity-50 transition-colors"
                        >
                          {resolving === a.id ? "Working..." : "Approve"}
                        </button>
                        <button
                          onClick={() => setPendingConfirm({
                            type: "reject-request",
                            id: a.id,
                            label: `Reject the deploy request for "${a.deploy_name}"? This is final — the requester has to ask again.`,
                          })}
                          disabled={resolving === a.id}
                          className="px-3 py-1 bg-danger-500/10 text-danger-400 rounded-md text-xs font-medium hover:bg-danger-500/20 disabled:opacity-50 transition-colors"
                        >
                          Reject
                        </button>
                      </>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </>
  );
}
