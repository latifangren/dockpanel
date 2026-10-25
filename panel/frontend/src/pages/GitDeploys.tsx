import { useAuth } from "../context/AuthContext";
import { Navigate } from "react-router-dom";
import { useState, useEffect } from "react";
import { api } from "../api";
import ProvisionLog from "../components/ProvisionLog";
import ConfirmDialog from "../components/ConfirmDialog";
import { maskRepoCredentials, statusBadge } from "./gitdeploys/helpers";
export { maskRepoCredentials };
import ApprovalsBanner from "./gitdeploys/ApprovalsBanner";
import DeployDetail from "./gitdeploys/DeployDetail";
import DeployForm from "./gitdeploys/DeployForm";


export interface GitDeploy {
  id: string;
  name: string;
  repo_url: string;
  branch: string;
  dockerfile: string;
  container_port: number;
  host_port: number;
  domain: string | null;
  env_vars: Record<string, string>;
  auto_deploy: boolean;
  webhook_secret: string;
  deploy_key_public: string | null;
  deploy_key_path: string | null;
  container_id: string | null;
  image_tag: string | null;
  status: string;
  memory_mb: number | null;
  cpu_percent: number | null;
  ssl_email: string | null;
  // NULL on a row an older panel wrote — the effective mode is then whether
  // ssl_email is set, exactly as the backend's `effective_tls_mode` reads it.
  tls_mode: "none" | "acme" | "provided" | null;
  tls_certificate: string | null;
  pre_build_cmd: string | null;
  post_deploy_cmd: string | null;
  build_args: Record<string, string>;
  build_context: string;
  last_deploy: string | null;
  last_commit: string | null;
  created_at: string;
  github_token: string | null;
  deploy_cron: string | null;
  deploy_protected: boolean;
  build_method: string;
  preview_ttl_hours: number;
  // Container paths bind-mounted durably under GIT_DATA_DIR/{name} on the agent
  // (#118) — the host side is never operator-supplied. Always empty for
  // anything the panel deploys as a preview.
  volumes: string[];
}

export interface GitPreview {
  id: string;
  git_deploy_id: string;
  branch: string;
  container_name: string;
  container_id: string | null;
  host_port: number;
  domain: string | null;
  status: string;
  commit_hash: string | null;
  created_at: string;
}

// A protected deployment does not deploy when its owner presses Deploy — it files
// one of these, and a DIFFERENT administrator has to resolve it. The three
// endpoints behind it (list / approve / reject) shipped fully built and scoped and
// no screen ever called them, so the only way to finish a protected deploy was a
// pair of hand-written curls against ids nothing displayed.
export interface DeployApproval {
  id: string;
  deploy_id: string;
  requested_by: string;
  requested_by_email: string;
  status: string;
  deploy_name: string;
  repo_url: string;
  branch: string;
  created_at: string;
}

export interface DeployHistory {
  id: string;
  git_deploy_id: string;
  commit_hash: string;
  commit_message: string | null;
  image_tag: string;
  status: string;
  output: string | null;
  triggered_by: string;
  duration_ms: number | null;
  created_at: string;
}


export default function GitDeploys() {
  const { user } = useAuth();
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;
  const [deploys, setDeploys] = useState<GitDeploy[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<GitDeploy | null>(null);
  const [history, setHistory] = useState<DeployHistory[]>([]);
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(false);
  const [message, setMessage] = useState({ text: "", type: "" });
  const [deployId, setDeployId] = useState<string | null>(null);
  const [deploying, setDeploying] = useState<string | null>(null);
  const [generatingKey, setGeneratingKey] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [expandedLog, setExpandedLog] = useState<string | null>(null);
  const [aiExplain, setAiExplain] = useState<Record<string, { loading: boolean; text?: string; error?: string; provider?: string }>>({});
  const [showDeployKey, setShowDeployKey] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [showEnvPaste, setShowEnvPaste] = useState(false);
  const [showLogs, setShowLogs] = useState(false);
  const [containerLogs, setContainerLogs] = useState("");
  const [previews, setPreviews] = useState<GitPreview[]>([]);
  const [approvals, setApprovals] = useState<DeployApproval[]>([]);
  const [resolving, setResolving] = useState<string | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{ type: string; id: string; label: string } | null>(null);

  // Form state
  const [formName, setFormName] = useState("");
  const [formRepo, setFormRepo] = useState("");
  const [repoGuess, setRepoGuess] = useState<{ label: string; port: number; preBuild: string } | null>(null);
  const [formBranch, setFormBranch] = useState("main");
  const [formDockerfile, setFormDockerfile] = useState("Dockerfile");
  const [formPort, setFormPort] = useState(3000);
  const [formDomain, setFormDomain] = useState("");
  const [formEnvVars, setFormEnvVars] = useState<{ key: string; value: string }[]>([]);
  const [formAutoDeploy, setFormAutoDeploy] = useState(false);
  const [formSslEmail, setFormSslEmail] = useState("");
  const [formTlsMode, setFormTlsMode] = useState<"none" | "acme" | "provided">("none");
  const [formTlsCertificate, setFormTlsCertificate] = useState("");
  const [registeredCerts, setRegisteredCerts] = useState<{ id: string; alias: string; dns_names: string[] }[] | null>(null);
  const [registeredCertsError, setRegisteredCertsError] = useState("");
  const [formPreBuild, setFormPreBuild] = useState("");
  const [formPostDeploy, setFormPostDeploy] = useState("");
  const [formBuildArgs, setFormBuildArgs] = useState<{ key: string; value: string }[]>([]);
  const [formBuildContext, setFormBuildContext] = useState(".");
  const [formGithubToken, setFormGithubToken] = useState("");
  const [formCron, setFormCron] = useState("");
  const [formProtected, setFormProtected] = useState(false);
  const [formPreviewTtl, setFormPreviewTtl] = useState(24);
  const [formVolumes, setFormVolumes] = useState<string[]>([]);

  const loadDeploys = async () => {
    try {
      const data = await api.get<GitDeploy[]>("/git-deploys");
      setDeploys(data);
      // Refresh selected if still exists
      if (selected) {
        const updated = data.find((d) => d.id === selected.id);
        if (updated) setSelected(updated);
        else setSelected(null);
      }
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Failed to load deploys", type: "error" });
    } finally {
      setLoading(false);
    }
  };

  const loadHistory = async (id: string) => {
    try {
      const data = await api.get<DeployHistory[]>(`/git-deploys/${id}/history`);
      setHistory(data);
    } catch {
      setHistory([]);
    }
  };

  // Approvals are not scoped to the selected row — the server returns every
  // pending request on the machines this administrator operates, and the bell
  // notification an approver follows links here with nothing selected. So it
  // loads with the page, not with the detail panel.
  const loadApprovals = async () => {
    try { setApprovals(await api.get<DeployApproval[]>("/deploy-approvals")); }
    catch { setApprovals([]); }
  };

  useEffect(() => {
    loadDeploys();
    loadApprovals();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (selected) { loadHistory(selected.id); loadPreviews(selected.id); }
    else { setHistory([]); setPreviews([]); }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selected?.id]);

  const resetForm = () => {
    setFormName("");
    setFormRepo("");
    setFormBranch("main");
    setFormDockerfile("Dockerfile");
    setFormPort(3000);
    setFormDomain("");
    setFormEnvVars([]);
    setFormAutoDeploy(false);
    setFormSslEmail("");
    setFormTlsMode("none");
    setFormTlsCertificate("");
    setFormPreBuild("");
    setFormPostDeploy("");
    setFormBuildArgs([]);
    setFormBuildContext(".");
    setFormGithubToken("");
    setFormCron("");
    setFormProtected(false);
    setFormVolumes([]);
  };

  const openCreate = () => {
    resetForm();
    setEditing(false);
    setShowModal(true);
  };

  const openEdit = () => {
    if (!selected) return;
    setFormName(selected.name);
    setFormRepo(selected.repo_url);
    setFormBranch(selected.branch);
    setFormDockerfile(selected.dockerfile);
    setFormPort(selected.container_port);
    setFormDomain(selected.domain || "");
    setFormEnvVars(
      Object.entries(selected.env_vars).map(([key, value]) => ({ key, value }))
    );
    setFormAutoDeploy(selected.auto_deploy);
    setFormSslEmail(selected.ssl_email || "");
    setFormTlsMode(selected.tls_mode ?? (selected.ssl_email ? "acme" : "none"));
    setFormTlsCertificate(selected.tls_certificate || "");
    setFormPreBuild(selected.pre_build_cmd || "");
    setFormPostDeploy(selected.post_deploy_cmd || "");
    setFormBuildArgs(
      Object.entries(selected.build_args || {}).map(([key, value]) => ({ key, value }))
    );
    setFormBuildContext(selected.build_context || ".");
    setFormGithubToken(selected.github_token && selected.github_token !== "\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF\u25CF" ? selected.github_token : "");
    setFormCron(selected.deploy_cron || "");
    setFormProtected(selected.deploy_protected || false);
    setFormPreviewTtl(selected.preview_ttl_hours ?? 24);
    setFormVolumes(selected.volumes || []);
    setEditing(true);
    setShowModal(true);
  };

  const handleSave = async () => {
    setSubmitting(true);
    setMessage({ text: "", type: "" });
    const envVars: Record<string, string> = {};
    formEnvVars.forEach((ev) => {
      if (ev.key.trim()) envVars[ev.key.trim()] = ev.value;
    });
    const buildArgs: Record<string, string> = {};
    formBuildArgs.forEach((arg) => {
      if (arg.key.trim()) buildArgs[arg.key.trim()] = arg.value;
    });
    const payload = {
      name: formName,
      repo_url: formRepo,
      branch: formBranch || "main",
      dockerfile: formDockerfile || "Dockerfile",
      container_port: formPort || 3000,
      // Send each optional field exactly as the operator left it, empty
      // included. Substituting null for an empty box made clearing impossible:
      // the handler COALESCEs a null onto the stored value, so the old command
      // survived, the hook kept running, and the save still answered
      // "Deploy configuration updated." Same defect and same remedy as the
      // notification destinations in v2.120.0 — the empty string is the
      // sentinel at both ends, and every reader guards on non-empty before it
      // acts (the two that did not, domain and ssl_email, now do).
      domain: formDomain.trim(),
      env_vars: envVars,
      auto_deploy: formAutoDeploy,
      ssl_email: formSslEmail.trim(),
      tls_mode: formTlsMode,
      tls_certificate: formTlsMode === "provided" ? formTlsCertificate.trim() : "",
      pre_build_cmd: formPreBuild.trim(),
      post_deploy_cmd: formPostDeploy.trim(),
      build_args: buildArgs,
      build_context: formBuildContext.trim() || ".",
      // NOT converted, deliberately. The GET masks a stored token, so this box
      // is blank on every edit of a deploy that has one; an empty string here
      // would mean "the operator cleared it" on a form that clears itself, and
      // every ordinary save would delete the token and silently stop posting
      // commit statuses. `encrypt_stored_token` maps both blank and the mask
      // back to "leave it alone".
      github_token: formGithubToken.trim() || null,
      deploy_cron: formCron.trim(),
      deploy_protected: formProtected,
      preview_ttl_hours: formPreviewTtl,
      // Takes effect on the NEXT deploy, not this save — the field only
      // changes what a future container's HostConfig binds, and this request
      // never talks to the agent. Sent in full every time, empty included, so
      // clearing every row here removes the last volume on the next deploy
      // rather than leaving a stale one behind.
      volumes: formVolumes.map((v) => v.trim()).filter(Boolean),
    };
    try {
      if (editing && selected) {
        const updated = await api.put<GitDeploy>(`/git-deploys/${selected.id}`, payload);
        setSelected(updated);
        setMessage({ text: "Deploy configuration updated.", type: "success" });
      } else {
        await api.post<GitDeploy>("/git-deploys", payload);
        setMessage({ text: "Deploy created.", type: "success" });
      }
      setShowModal(false);
      resetForm();
      loadDeploys();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Save failed", type: "error" });
    } finally {
      setSubmitting(false);
    }
  };

  // Both Deploy buttons land here, and the response has two shapes. Only one of
  // them carries a `deploy_id`: a protected deployment answers 202 with the reason
  // instead. Reading only the id is what left the button spinning while the
  // server's own sentence — the one naming the second administrator — was thrown
  // away, so the branch is written once and both call sites use it.
  const startDeploy = async (id: string) => {
    setDeploying(id);
    setMessage({ text: "", type: "" });
    try {
      const result = await api.post<{ deploy_id?: string; status?: string; message?: string }>(`/git-deploys/${id}/deploy`);
      if (result.deploy_id) {
        setDeployId(result.deploy_id);
      } else {
        setDeploying(null);
        setMessage({ text: result.message || "Queued for approval by another administrator.", type: "success" });
        loadApprovals();
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Deploy failed", type: "error" });
      setDeploying(null);
    }
  };

  const handleDeploy = async (id: string) => {
    const deploy = deploys.find(d => d.id === id);
    if (deploy?.deploy_protected) {
      setPendingConfirm({
        type: "deploy",
        id,
        label: `"${deploy.name}" is protected — this files a request for another administrator. It does not deploy now.`,
      });
      return;
    }
    // Not the same as "this row is unprotected": the list can be stale if another
    // admin just turned protection on, and then this POST takes the 202 too.
    await startDeploy(id);
  };

  // Approving IS the production deploy the protected flag deferred, and rejecting
  // is terminal — `reject_deploy` refuses anything not 'pending', so the requester
  // must start over. Both are routed through the page's own confirmation bar for
  // that reason, the same way Delete and Rollback are.
  const resolveApproval = async (approvalId: string, action: "approve" | "reject") => {
    const approval = approvals.find((a) => a.id === approvalId);
    setResolving(approvalId);
    setMessage({ text: "", type: "" });
    try {
      const result = await api.post<{ deploy_id?: string; message?: string }>(`/deploy-approvals/${approvalId}/${action}`);
      // Approve answers with a fresh deploy id and registers the APPROVER as the
      // provision log's owner, so this admin is the one who can watch the build
      // they just authorised.
      if (result.deploy_id) {
        setDeployId(result.deploy_id);
        if (approval) setDeploying(approval.deploy_id);
      }
      // The server calls both outcomes "rejected"; for your own request the honest
      // word is withdrawn, and the operator just pressed a button that said so.
      const withdrew = action === "reject" && approval?.requested_by === user.id;
      setMessage({
        text: withdrew ? "Your deploy request was withdrawn." : (result.message || "Request resolved."),
        type: "success",
      });
      loadApprovals();
      loadDeploys();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : `Could not ${action} the request`, type: "error" });
    } finally {
      setResolving(null);
    }
  };

  const handleDelete = async (id: string) => {
    setPendingConfirm({ type: "delete", id, label: "Delete this deploy? The container will be removed." });
  };

  const executeDelete = async (id: string) => {
    setMessage({ text: "", type: "" });
    try {
      await api.delete(`/git-deploys/${id}`);
      if (selected?.id === id) setSelected(null);
      setMessage({ text: "Deploy deleted.", type: "success" });
      loadDeploys();
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Delete failed", type: "error" });
    }
  };

  const handleRollback = async (historyId: string) => {
    if (!selected) return;
    setPendingConfirm({ type: "rollback", id: historyId, label: "Rollback to this deployment? The current container will be replaced." });
  };

  const executeRollback = async (historyId: string) => {
    if (!selected) return;
    setMessage({ text: "", type: "" });
    try {
      const result = await api.post<{ deploy_id: string }>(`/git-deploys/${selected.id}/rollback/${historyId}`);
      if (result.deploy_id) {
        setDeployId(result.deploy_id);
        setDeploying(selected.id);
      }
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Rollback failed", type: "error" });
    }
  };

  const explainWithAi = async (historyId: string) => {
    if (!selected) return;
    setAiExplain((prev) => ({ ...prev, [historyId]: { loading: true } }));
    try {
      const result = await api.post<{ explanation: string; provider: string }>(
        `/git-deploys/${selected.id}/history/${historyId}/explain`,
      );
      setAiExplain((prev) => ({
        ...prev,
        [historyId]: { loading: false, text: result.explanation, provider: result.provider },
      }));
    } catch (e) {
      setAiExplain((prev) => ({
        ...prev,
        [historyId]: { loading: false, error: e instanceof Error ? e.message : "Failed to get AI explanation" },
      }));
    }
  };

  const handleKeygen = async () => {
    if (!selected) return;
    setGeneratingKey(true);
    setMessage({ text: "", type: "" });
    try {
      const result = await api.post<{ public_key: string }>(`/git-deploys/${selected.id}/keygen`);
      setMessage({ text: "Deploy key generated. Add it to your repository's deploy keys.", type: "success" });
      setSelected((prev) => prev ? { ...prev, deploy_key_public: result.public_key } : prev);
    } catch (err) {
      setMessage({ text: err instanceof Error ? err.message : "Key generation failed", type: "error" });
    } finally {
      setGeneratingKey(false);
    }
  };

  const copyText = (text: string) => {
    navigator.clipboard.writeText(text);
    setMessage({ text: "Copied to clipboard.", type: "success" });
    setTimeout(() => setMessage({ text: "", type: "" }), 2000);
  };

  const loadContainerLogs = async () => {
    if (!selected) return;
    try {
      const data = await api.get<{ logs: string }>(`/git-deploys/${selected.id}/logs`);
      setContainerLogs(data.logs);
    } catch { setContainerLogs("Failed to load logs"); }
  };

  const loadPreviews = async (id: string) => {
    try { const data = await api.get<GitPreview[]>(`/git-deploys/${id}/previews`); setPreviews(data); }
    catch { setPreviews([]); }
  };

  const deletePreview = async (previewId: string) => {
    if (!selected) return;
    setPendingConfirm({ type: "delete-preview", id: previewId, label: "Delete this preview deployment?" });
  };

  const executeConfirm = async () => {
    if (!pendingConfirm) return;
    const { type, id } = pendingConfirm;
    setPendingConfirm(null);
    if (type === "deploy") {
      await startDeploy(id);
    } else if (type === "approve-request") {
      await resolveApproval(id, "approve");
    } else if (type === "reject-request") {
      await resolveApproval(id, "reject");
    } else if (type === "delete") {
      await executeDelete(id);
    } else if (type === "rollback") {
      await executeRollback(id);
    } else if (type === "delete-preview") {
      if (!selected) return;
      try { await api.delete(`/git-deploys/${selected.id}/previews/${id}`); loadPreviews(selected.id); }
      catch (e) { setMessage({ text: e instanceof Error ? e.message : "Delete failed", type: "error" }); }
    }
  };

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Git Deploy</h1>
          <p className="page-header-subtitle">Deploy from Git repositories</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={openCreate}
            className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 transition-colors"
          >
            New Deploy
          </button>
        </div>
      </div>

      <div className="p-6 lg:p-8">

      {/* Message */}
      {message.text && (
        <div
          className={`mb-4 px-4 py-3 rounded-lg text-sm border ${
            message.type === "success"
              ? "bg-rust-500/10 text-rust-400 border-rust-500/20"
              : "bg-danger-500/10 text-danger-400 border-danger-500/20"
          }`}
          role="alert"
        >
          {message.text}
          <button onClick={() => setMessage({ text: "", type: "" })} className="float-right font-bold" aria-label="Close">&times;</button>
        </div>
      )}

      {/* Portals to document.body (issue #120): the triggers that arm this — per-entry Rollback most of all — sit far below this point. */}
      {pendingConfirm && (
        <ConfirmDialog
          label={pendingConfirm.label}
          tone={pendingConfirm.type === "deploy" || pendingConfirm.type === "approve-request" ? "warn" : "danger"}
          onConfirm={executeConfirm}
          onCancel={() => setPendingConfirm(null)}
        />
      )}

      {/* Deploy provisioning log */}
      {deployId && (
        <ProvisionLog
          sseUrl={`/api/git-deploys/deploy/${deployId}/log`}
          onComplete={() => {
            setDeployId(null);
            setDeploying(null);
            loadDeploys();
            loadApprovals();
            if (selected) loadHistory(selected.id);
          }}
        />
      )}

      {/* Pending deploy approvals — moved to ./gitdeploys/ApprovalsBanner.tsx */}
      <ApprovalsBanner
        approvals={approvals}
        user={user}
        resolving={resolving}
        setPendingConfirm={setPendingConfirm}
      />

      {/* Deploy list */}
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-x-auto">
        {loading ? (
          <div className="flex items-center justify-center py-12">
            <div className="w-6 h-6 border-2 border-dark-600 border-t-rust-500 rounded-full animate-spin" />
          </div>
        ) : deploys.length === 0 ? (
          <div className="p-12 text-center">
            <svg className="w-12 h-12 mx-auto text-dark-300 mb-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M17.25 6.75 22.5 12l-5.25 5.25m-10.5 0L1.5 12l5.25-5.25m7.5-3-4.5 16.5" />
            </svg>
            <p className="text-dark-200 font-medium">No Git deploys yet</p>
            <p className="text-dark-300 text-sm mt-2 max-w-md mx-auto">Connect a Git repository for automatic builds and zero-downtime deployments with webhook triggers, preview environments, and rollback support.</p>
            <button onClick={openCreate} className="mt-3 px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 transition-colors">
              Create your first deploy
            </button>
          </div>
        ) : (
          <table className="w-full">
            <thead>
              <tr className="border-b border-dark-500 bg-dark-900">
                <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3">Name</th>
                <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3 hidden md:table-cell">Repository</th>
                <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3 hidden sm:table-cell">Branch</th>
                <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3 hidden lg:table-cell">Domain</th>
                <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3">Status</th>
                <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3 hidden lg:table-cell">Last Deploy</th>
                <th scope="col" className="text-right text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-dark-600">
              {deploys.map((d) => (
                <tr
                  key={d.id}
                  onClick={() => setSelected(selected?.id === d.id ? null : d)}
                  className={`cursor-pointer transition-colors ${
                    selected?.id === d.id ? "bg-dark-700/50" : "hover:bg-dark-700/30"
                  }`}
                >
                  <td className="px-5 py-4 text-sm font-medium text-dark-50 font-mono">
                    {d.name}
                    {d.deploy_protected && (
                      <span className="ml-2 inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-medium bg-warn-500/15 text-warn-400" title="Protected: pressing Deploy files a request that a second administrator must approve">
                        <svg className="w-3 h-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M9 12.75 11.25 15 15 9.75m-3-7.036A11.959 11.959 0 0 1 3.598 6 11.99 11.99 0 0 0 3 9.749c0 5.592 3.824 10.29 9 11.623 5.176-1.332 9-6.03 9-11.622 0-1.31-.21-2.571-.598-3.751h-.152c-3.196 0-6.1-1.248-8.25-3.285Z" /></svg>
                        Protected
                      </span>
                    )}
                  </td>
                  <td className="px-5 py-4 text-sm text-dark-200 font-mono truncate max-w-xs hidden md:table-cell">
                    {maskRepoCredentials(d.repo_url).replace(/^https?:\/\//, "").replace(/\.git$/, "")}
                  </td>
                  <td className="px-5 py-4 text-sm text-dark-200 font-mono hidden sm:table-cell">{d.branch}</td>
                  <td className="px-5 py-4 text-sm text-dark-200 font-mono hidden lg:table-cell">{d.domain || "\u2014"}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex px-2.5 py-0.5 rounded-full text-xs font-medium ${statusBadge(d.status)}`}>
                      {d.status}
                    </span>
                  </td>
                  <td className="px-5 py-4 text-sm text-dark-200 hidden lg:table-cell">
                    {d.last_deploy ? new Date(d.last_deploy).toLocaleString() : "\u2014"}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <div className="flex items-center justify-end gap-2" onClick={(e) => e.stopPropagation()}>
                      <button
                        onClick={() => handleDeploy(d.id)}
                        disabled={deploying === d.id}
                        className="px-3 py-1 bg-rust-500/15 text-rust-400 rounded-md text-xs font-medium hover:bg-rust-500/25 disabled:opacity-50 transition-colors"
                      >
                        {deploying === d.id ? "Deploying..." : "Deploy"}
                      </button>
                      <button
                        onClick={() => handleDelete(d.id)}
                        className="px-3 py-1 bg-danger-500/10 text-danger-400 rounded-md text-xs font-medium hover:bg-danger-500/20 transition-colors"
                      >
                        Delete
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Detail panel — moved to ./gitdeploys/DeployDetail.tsx */}
      <DeployDetail
        selected={selected}
        history={history}
        previews={previews}
        deploying={deploying}
        generatingKey={generatingKey}
        showDeployKey={showDeployKey}
        showLogs={showLogs}
        showSecret={showSecret}
        containerLogs={containerLogs}
        expandedLog={expandedLog}
        aiExplain={aiExplain}
        setExpandedLog={setExpandedLog}
        setShowDeployKey={setShowDeployKey}
        setShowLogs={setShowLogs}
        setShowSecret={setShowSecret}
        setMessage={setMessage}
        openEdit={openEdit}
        handleDeploy={handleDeploy}
        handleDelete={handleDelete}
        handleKeygen={handleKeygen}
        loadContainerLogs={loadContainerLogs}
        copyText={copyText}
        handleRollback={handleRollback}
        explainWithAi={explainWithAi}
        deletePreview={deletePreview}
        loadDeploys={loadDeploys}
      />

      </div>

      {/* Create / Edit Modal — moved to ./gitdeploys/DeployForm.tsx */}
      <DeployForm
        showModal={showModal}
        editing={editing}
        submitting={submitting}
        formName={formName}
        formRepo={formRepo}
        repoGuess={repoGuess}
        formBranch={formBranch}
        formDockerfile={formDockerfile}
        formPort={formPort}
        formDomain={formDomain}
        formEnvVars={formEnvVars}
        formAutoDeploy={formAutoDeploy}
        formSslEmail={formSslEmail}
        formTlsMode={formTlsMode}
        formTlsCertificate={formTlsCertificate}
        registeredCerts={registeredCerts}
        registeredCertsError={registeredCertsError}
        formPreBuild={formPreBuild}
        formPostDeploy={formPostDeploy}
        formBuildArgs={formBuildArgs}
        formBuildContext={formBuildContext}
        formGithubToken={formGithubToken}
        formCron={formCron}
        formProtected={formProtected}
        formPreviewTtl={formPreviewTtl}
        formVolumes={formVolumes}
        showEnvPaste={showEnvPaste}
        setShowModal={setShowModal}
        setFormName={setFormName}
        setFormRepo={setFormRepo}
        setRepoGuess={setRepoGuess}
        setFormBranch={setFormBranch}
        setFormDockerfile={setFormDockerfile}
        setFormPort={setFormPort}
        setFormDomain={setFormDomain}
        setFormEnvVars={setFormEnvVars}
        setFormAutoDeploy={setFormAutoDeploy}
        setFormSslEmail={setFormSslEmail}
        setFormTlsMode={setFormTlsMode}
        setFormTlsCertificate={setFormTlsCertificate}
        setRegisteredCerts={setRegisteredCerts}
        setRegisteredCertsError={setRegisteredCertsError}
        setFormPreBuild={setFormPreBuild}
        setFormPostDeploy={setFormPostDeploy}
        setFormBuildArgs={setFormBuildArgs}
        setFormBuildContext={setFormBuildContext}
        setFormGithubToken={setFormGithubToken}
        setFormCron={setFormCron}
        setFormProtected={setFormProtected}
        setFormPreviewTtl={setFormPreviewTtl}
        setFormVolumes={setFormVolumes}
        setShowEnvPaste={setShowEnvPaste}
        resetForm={resetForm}
        handleSave={handleSave}
      />
    </div>
  );
}
