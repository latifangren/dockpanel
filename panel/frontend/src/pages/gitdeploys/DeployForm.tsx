import type { Dispatch, SetStateAction } from "react";
import { createPortal } from "react-dom";
import { api } from "../../api";
import { guessFrameworkFromUrl } from "./helpers";

export default function DeployForm({
  showModal,
  editing,
  submitting,
  formName,
  formRepo,
  repoGuess,
  formBranch,
  formDockerfile,
  formPort,
  formDomain,
  formEnvVars,
  formAutoDeploy,
  formSslEmail,
  formTlsMode,
  formTlsCertificate,
  registeredCerts,
  registeredCertsError,
  formPreBuild,
  formPostDeploy,
  formBuildArgs,
  formBuildContext,
  formGithubToken,
  formCron,
  formProtected,
  formPreviewTtl,
  formVolumes,
  showEnvPaste,
  setShowModal,
  setFormName,
  setFormRepo,
  setRepoGuess,
  setFormBranch,
  setFormDockerfile,
  setFormPort,
  setFormDomain,
  setFormEnvVars,
  setFormAutoDeploy,
  setFormSslEmail,
  setFormTlsMode,
  setFormTlsCertificate,
  setRegisteredCerts,
  setRegisteredCertsError,
  setFormPreBuild,
  setFormPostDeploy,
  setFormBuildArgs,
  setFormBuildContext,
  setFormGithubToken,
  setFormCron,
  setFormProtected,
  setFormPreviewTtl,
  setFormVolumes,
  setShowEnvPaste,
  resetForm,
  handleSave,
}: {
  showModal: boolean;
  editing: boolean;
  submitting: boolean;
  formName: string;
  formRepo: string;
  repoGuess: { label: string; port: number; preBuild: string } | null;
  formBranch: string;
  formDockerfile: string;
  formPort: number;
  formDomain: string;
  formEnvVars: { key: string; value: string }[];
  formAutoDeploy: boolean;
  formSslEmail: string;
  formTlsMode: "none" | "acme" | "provided";
  formTlsCertificate: string;
  registeredCerts: { id: string; alias: string; dns_names: string[] }[] | null;
  registeredCertsError: string;
  formPreBuild: string;
  formPostDeploy: string;
  formBuildArgs: { key: string; value: string }[];
  formBuildContext: string;
  formGithubToken: string;
  formCron: string;
  formProtected: boolean;
  formPreviewTtl: number;
  formVolumes: string[];
  showEnvPaste: boolean;
  setShowModal: Dispatch<SetStateAction<boolean>>;
  setFormName: Dispatch<SetStateAction<string>>;
  setFormRepo: Dispatch<SetStateAction<string>>;
  setRepoGuess: Dispatch<SetStateAction<{ label: string; port: number; preBuild: string } | null>>;
  setFormBranch: Dispatch<SetStateAction<string>>;
  setFormDockerfile: Dispatch<SetStateAction<string>>;
  setFormPort: Dispatch<SetStateAction<number>>;
  setFormDomain: Dispatch<SetStateAction<string>>;
  setFormEnvVars: Dispatch<SetStateAction<{ key: string; value: string }[]>>;
  setFormAutoDeploy: Dispatch<SetStateAction<boolean>>;
  setFormSslEmail: Dispatch<SetStateAction<string>>;
  setFormTlsMode: Dispatch<SetStateAction<"none" | "acme" | "provided">>;
  setFormTlsCertificate: Dispatch<SetStateAction<string>>;
  setRegisteredCerts: Dispatch<SetStateAction<{ id: string; alias: string; dns_names: string[] }[] | null>>;
  setRegisteredCertsError: Dispatch<SetStateAction<string>>;
  setFormPreBuild: Dispatch<SetStateAction<string>>;
  setFormPostDeploy: Dispatch<SetStateAction<string>>;
  setFormBuildArgs: Dispatch<SetStateAction<{ key: string; value: string }[]>>;
  setFormBuildContext: Dispatch<SetStateAction<string>>;
  setFormGithubToken: Dispatch<SetStateAction<string>>;
  setFormCron: Dispatch<SetStateAction<string>>;
  setFormProtected: Dispatch<SetStateAction<boolean>>;
  setFormPreviewTtl: Dispatch<SetStateAction<number>>;
  setFormVolumes: Dispatch<SetStateAction<string[]>>;
  setShowEnvPaste: Dispatch<SetStateAction<boolean>>;
  resetForm: () => void;
  handleSave: () => void;
}) {
  return (
    <>
      {/* Create / Edit Modal */}
      {showModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {/* Overlay */}
          <div className="absolute inset-0 bg-black/60 dp-modal-overlay" onClick={() => { setShowModal(false); resetForm(); }} />

          {/* Modal card */}
          <div className="relative bg-dark-800 rounded-lg border border-dark-500 w-full max-w-2xl max-h-[90vh] overflow-y-auto animate-fade-up dp-modal">
            <div className="px-5 py-4 border-b border-dark-600 flex items-center justify-between">
              <h2 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">
                {editing ? "Edit Deploy" : "New Deploy"}
              </h2>
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="text-dark-300 hover:text-dark-50 transition-colors"
              >
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* The other half of what #118 was promised. The guide has carried
                  this warning since v2.135.0, but the reporter's own accepted
                  fallback was "documenting it AND surfacing it in the UI", and
                  only the doc shipped — so the person who most needs it, the one
                  filling in this form for the first time, was the one person not
                  shown it. Deliberately above the first field and on the edit
                  path too: the loss lands on the SECOND deploy, so an operator
                  editing an existing deploy is inside the window, not past it. */}
              <div className="px-3 py-2 bg-warn-500/10 border border-warn-500/20 rounded-lg">
                <p className="text-xs text-warn-400">
                  Git Deploys have no persistent storage. Every deploy replaces the
                  container, so anything the app writes to its own filesystem —
                  uploads, generated files, a SQLite database — is lost on the next
                  deploy, not this one.
                </p>
                <p className="text-xs text-warn-400/80 mt-1">
                  Use a database under <span className="font-medium">Databases</span>, or
                  object storage, for anything that has to survive a deploy.
                </p>
              </div>
              {/* Name */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Name</label>
                <input
                  type="text"
                  value={formName}
                  onChange={(e) => setFormName(e.target.value.replace(/[^a-zA-Z0-9-]/g, ""))}
                  placeholder="my-app"
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                />
                <p className="text-xs text-dark-300 mt-1">Letters, numbers, and hyphens only</p>
              </div>

              {/* Repository URL */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Repository URL</label>
                <input
                  type="text"
                  value={formRepo}
                  onChange={(e) => {
                    setFormRepo(e.target.value);
                    setRepoGuess(guessFrameworkFromUrl(e.target.value));
                  }}
                  placeholder="https://github.com/user/repo.git"
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                />
              </div>

              {repoGuess && (
                <div className="flex flex-wrap items-center gap-2 px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg">
                  <span className="text-xs text-dark-300">
                    Framework guess from URL keywords only (not repo inspection):{" "}
                    <span className="text-dark-100 font-medium">{repoGuess.label}</span> — suggested port{" "}
                    {repoGuess.port}, pre-build <span className="font-mono">{repoGuess.preBuild}</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => {
                      setFormPort(repoGuess.port);
                      setFormPreBuild(repoGuess.preBuild);
                    }}
                    className="ml-auto px-2 py-1 text-xs bg-rust-500 text-white rounded hover:bg-rust-600"
                  >
                    Apply suggestion
                  </button>
                </div>
              )}

              {/* Branch + Dockerfile */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-100 mb-1">Branch</label>
                  <input
                    type="text"
                    value={formBranch}
                    onChange={(e) => setFormBranch(e.target.value)}
                    placeholder="main"
                    className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-100 mb-1">Dockerfile Path</label>
                  <input
                    type="text"
                    value={formDockerfile}
                    onChange={(e) => setFormDockerfile(e.target.value)}
                    placeholder="Dockerfile"
                    className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                  />
                </div>
              </div>

              {/* Port + Domain */}
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-dark-100 mb-1">Container Port</label>
                  <input
                    type="number"
                    value={formPort}
                    onChange={(e) => setFormPort(parseInt(e.target.value) || 3000)}
                    min={1}
                    max={65535}
                    className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-dark-100 mb-1">Domain (optional)</label>
                  <input
                    type="text"
                    value={formDomain}
                    onChange={(e) => {
                      setFormDomain(e.target.value);
                      // A TLS choice is meaningless without a domain, and the
                      // backend refuses a mode other than none for one — so
                      // emptying the box takes the choice with it rather than
                      // leaving a hidden "acme"/"provided" behind a disabled select.
                      if (!e.target.value.trim()) {
                        setFormTlsMode("none");
                        setFormTlsCertificate("");
                        setFormSslEmail("");
                      }
                    }}
                    placeholder="app.example.com"
                    className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                  />
                </div>
              </div>

              {/* HTTPS */}
              {formDomain && (
                <div>
                  <label htmlFor="gd-tls-mode" className="block text-sm font-medium text-dark-100 mb-1">HTTPS</label>
                  <select
                    id="gd-tls-mode"
                    value={formTlsMode}
                    onChange={(e) => {
                      const mode = e.target.value as "none" | "acme" | "provided";
                      setFormTlsMode(mode);
                      // The email/alias is only meaningful to its own mode.
                      // Keeping a typed value behind a hidden input would send
                      // it with a mode that ignores it.
                      if (mode !== "acme") setFormSslEmail("");
                      if (mode !== "provided") setFormTlsCertificate("");
                      if (mode === "provided" && registeredCerts === null) {
                        setRegisteredCertsError("");
                        api.get<{ id: string; alias: string; dns_names: string[] }[]>("/tls-certificates")
                          .then((rows) => setRegisteredCerts(rows))
                          .catch((err) => {
                            // Left at null so choosing the mode again asks
                            // again; an empty list here would read as
                            // "nothing registered" for the life of the page
                            // after one failed request.
                            setRegisteredCertsError(err instanceof Error ? err.message : "Could not load registered certificates");
                          });
                      }
                    }}
                    className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                  >
                    <option value="none">No HTTPS — plain HTTP, or TLS terminated upstream</option>
                    <option value="acme">Let's Encrypt certificate</option>
                    <option value="provided">Registered certificate</option>
                  </select>
                  {formTlsMode === "acme" && (
                    <>
                      <input type="email" value={formSslEmail} onChange={(e) => setFormSslEmail(e.target.value)}
                        placeholder="admin@example.com" aria-label="SSL Email"
                        className="mt-2 w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none" />
                      <p className="text-xs text-dark-300 mt-1">Auto-provisions a Let's Encrypt certificate on first deploy. Account email required.</p>
                    </>
                  )}
                  {formTlsMode === "provided" && (
                    <>
                      <select
                        value={formTlsCertificate}
                        onChange={(e) => setFormTlsCertificate(e.target.value)}
                        aria-label="Registered certificate"
                        className="mt-2 w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none"
                      >
                        <option value="">
                          {registeredCerts === null ? "Loading…" : "Choose a certificate"}
                        </option>
                        {(registeredCerts ?? []).map((c) => (
                          <option key={c.id} value={c.alias}>
                            {c.alias}{c.dns_names.length > 0 ? ` — ${c.dns_names.join(", ")}` : ""}
                          </option>
                        ))}
                      </select>
                      {registeredCertsError ? (
                        <p className="text-xs text-danger-400 mt-1">{registeredCertsError}</p>
                      ) : registeredCerts !== null && registeredCerts.length === 0 ? (
                        <p className="text-xs text-dark-300 mt-1">
                          No certificates are registered on this server yet. Register one under Monitoring → Certificates, then pick it here.
                        </p>
                      ) : (
                        <p className="text-xs text-dark-300 mt-1">
                          The certificate must cover the domain above; the deploy falls back to plain HTTP with a warning otherwise. Served by nginx only.
                        </p>
                      )}
                    </>
                  )}
                </div>
              )}

              {/* Environment Variables */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-dark-100">Environment Variables</label>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setShowEnvPaste(!showEnvPaste)}
                      className="text-xs text-rust-400 hover:text-rust-300 transition-colors"
                    >
                      {showEnvPaste ? "Manual entry" : "Paste .env"}
                    </button>
                    {!showEnvPaste && (
                      <button
                        type="button"
                        onClick={() => setFormEnvVars([...formEnvVars, { key: "", value: "" }])}
                        className="px-2 py-0.5 text-xs text-rust-400 hover:text-rust-300 font-medium transition-colors"
                      >
                        + Add
                      </button>
                    )}
                  </div>
                </div>
                {showEnvPaste ? (
                  <textarea
                    placeholder={"KEY=value\nDATABASE_URL=postgres://...\nSECRET_KEY=abc123"}
                    rows={6}
                    className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                    onBlur={(e) => {
                      const lines = e.target.value.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
                      const parsed = lines.map((l) => {
                        const eq = l.indexOf("=");
                        if (eq === -1) return { key: l.trim(), value: "" };
                        return { key: l.substring(0, eq).trim(), value: l.substring(eq + 1).trim().replace(/^["']|["']$/g, "") };
                      }).filter((p) => p.key);
                      if (parsed.length > 0) {
                        setFormEnvVars(parsed);
                        setShowEnvPaste(false);
                      }
                    }}
                  />
                ) : (
                  <>
                    {formEnvVars.length === 0 && (
                      <p className="text-xs text-dark-300">No environment variables defined</p>
                    )}
                    <div className="space-y-2">
                      {formEnvVars.map((ev, i) => (
                        <div key={i} className="flex items-center gap-2">
                          <input
                            type="text"
                            value={ev.key}
                            onChange={(e) => {
                              const next = [...formEnvVars];
                              next[i] = { ...next[i], key: e.target.value };
                              setFormEnvVars(next);
                            }}
                            placeholder="KEY"
                            className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                          />
                          <span className="text-dark-300">=</span>
                          <input
                            type="text"
                            value={ev.value}
                            onChange={(e) => {
                              const next = [...formEnvVars];
                              next[i] = { ...next[i], value: e.target.value };
                              setFormEnvVars(next);
                            }}
                            placeholder="value"
                            className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => setFormEnvVars(formEnvVars.filter((_, j) => j !== i))}
                            className="p-1.5 text-danger-400 hover:text-danger-300 transition-colors"
                            title="Remove variable"
                          >
                            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                            </svg>
                          </button>
                        </div>
                      ))}
                    </div>
                  </>
                )}
              </div>

              {/* Persistent Volumes */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-dark-100">Persistent Volumes</label>
                  <button
                    type="button"
                    onClick={() => setFormVolumes([...formVolumes, ""])}
                    className="px-2 py-0.5 text-xs text-rust-400 hover:text-rust-300 font-medium transition-colors"
                  >
                    + Add
                  </button>
                </div>
                <p className="text-xs text-dark-300 mb-2">
                  Container paths only — DockPanel manages the host location for you. Without one,
                  every deploy replaces the container and anything it wrote to its own filesystem is
                  lost. Takes effect on the next deploy; adding a path here carries over whatever the
                  running container already has there.
                </p>
                {formVolumes.length === 0 && (
                  <p className="text-xs text-dark-300">No persistent volumes defined</p>
                )}
                <div className="space-y-2">
                  {formVolumes.map((path, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={path}
                        onChange={(e) => {
                          const next = [...formVolumes];
                          next[i] = e.target.value;
                          setFormVolumes(next);
                        }}
                        placeholder="/data"
                        className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setFormVolumes(formVolumes.filter((_, j) => j !== i))}
                        className="p-1.5 text-danger-400 hover:text-danger-300 transition-colors"
                        title="Remove volume"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Auto-deploy toggle */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formAutoDeploy}
                    onChange={(e) => setFormAutoDeploy(e.target.checked)}
                    className="w-4 h-4 text-rust-500 border-dark-500 rounded focus:ring-accent-500"
                  />
                  <span className="text-sm text-dark-100">Auto-deploy on push</span>
                </label>
                <p className="text-xs text-dark-300 mt-1 ml-6">Automatically deploy when commits are pushed via webhook</p>
              </div>

              {/* Deploy Protection */}
              <div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={formProtected}
                    onChange={(e) => setFormProtected(e.target.checked)}
                    className="w-4 h-4 text-warn-500 border-dark-500 rounded focus:ring-accent-500"
                  />
                  <span className="text-sm text-dark-100">Require another admin's approval before deploy</span>
                </label>
                {/* The copy here used to describe a client-side are-you-sure dialog.
                    The server does something else entirely: it files a request and
                    refuses to build until a DIFFERENT administrator signs it off.
                    (The old wording is not quoted — a pin arm greps raw source and
                    would match the quotation.) */}
                <p className="text-xs text-dark-300 mt-1 ml-6">
                  Pressing Deploy files a request instead of building. A different administrator must approve it under
                  Pending Approvals — nobody can approve their own request. Webhook, scheduled and rollback deploys are
                  not covered.
                </p>
              </div>

              {/* Preview TTL */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Preview TTL (hours)</label>
                <input
                  type="number"
                  min={0}
                  value={formPreviewTtl}
                  onChange={(e) => setFormPreviewTtl(Number(e.target.value))}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-600 rounded-lg text-dark-100 text-sm focus:border-accent-500 focus:outline-none"
                />
                <p className="text-xs text-dark-300 mt-1">Auto-cleanup preview environments after this many hours (0 = no cleanup)</p>
              </div>

              {/* Pre-build Command */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Pre-build Command</label>
                <input type="text" value={formPreBuild} onChange={(e) => setFormPreBuild(e.target.value)}
                  placeholder="npm install, composer install, etc." className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
                <p className="text-xs text-dark-300 mt-1">Only applies when DockPanel generates the Dockerfile for you — becomes an install step inside the built image (add it as a RUN line yourself if you commit your own Dockerfile)</p>
              </div>

              {/* Post-deploy Command */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Post-deploy Command</label>
                <input type="text" value={formPostDeploy} onChange={(e) => setFormPostDeploy(e.target.value)}
                  placeholder="php artisan migrate, npx prisma migrate deploy, etc." className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
                <p className="text-xs text-dark-300 mt-1">Runs inside the container after deploy (docker exec)</p>
              </div>

              {/* Build Arguments */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-sm font-medium text-dark-100">Build Arguments</label>
                  <button
                    type="button"
                    onClick={() => setFormBuildArgs([...formBuildArgs, { key: "", value: "" }])}
                    className="px-2 py-0.5 text-xs text-rust-400 hover:text-rust-300 font-medium transition-colors"
                  >
                    + Add build arg
                  </button>
                </div>
                <p className="text-xs text-dark-300 mb-2">Passed as --build-arg to Docker build</p>
                {formBuildArgs.length === 0 && (
                  <p className="text-xs text-dark-300">No build arguments defined</p>
                )}
                <div className="space-y-2">
                  {formBuildArgs.map((arg, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <input
                        type="text"
                        value={arg.key}
                        onChange={(e) => {
                          const next = [...formBuildArgs];
                          next[i] = { ...next[i], key: e.target.value };
                          setFormBuildArgs(next);
                        }}
                        placeholder="KEY"
                        className="w-1/3 px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                      />
                      <span className="text-dark-300">=</span>
                      <input
                        type="text"
                        value={arg.value}
                        onChange={(e) => {
                          const next = [...formBuildArgs];
                          next[i] = { ...next[i], value: e.target.value };
                          setFormBuildArgs(next);
                        }}
                        placeholder="value"
                        className="flex-1 px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                      />
                      <button
                        type="button"
                        onClick={() => setFormBuildArgs(formBuildArgs.filter((_, j) => j !== i))}
                        className="p-1.5 text-danger-400 hover:text-danger-300 transition-colors"
                        title="Remove build arg"
                      >
                        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              </div>

              {/* Build Context */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Build Context</label>
                <input
                  type="text"
                  value={formBuildContext}
                  onChange={(e) => setFormBuildContext(e.target.value)}
                  placeholder="."
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none"
                />
                <p className="text-xs text-dark-300 mt-1">Subdirectory for Docker build context (default: repo root)</p>
              </div>

              {/* GitHub Token */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">GitHub Token</label>
                <input type="password" value={formGithubToken} onChange={(e) => setFormGithubToken(e.target.value)}
                  placeholder="ghp_xxxxxxxxxxxxxxxxxxxx" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
                <p className="text-xs text-dark-300 mt-1">Sets commit status in GitHub after deploy (optional)</p>
              </div>

              {/* Deploy Schedule */}
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Deploy Schedule (cron)</label>
                <input type="text" value={formCron} onChange={(e) => setFormCron(e.target.value)}
                  placeholder="0 3 * * * (daily at 3 AM UTC)" className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 outline-none" />
                <p className="text-xs text-dark-300 mt-1">Auto-deploy on schedule (cron format: minute hour day month weekday)</p>
              </div>
            </div>

            {/* Modal footer */}
            <div className="px-5 py-4 border-t border-dark-600 flex justify-end gap-3">
              <button
                onClick={() => { setShowModal(false); resetForm(); }}
                className="px-4 py-2 text-sm text-dark-300 border border-dark-600 rounded-lg hover:text-dark-100 hover:border-dark-400 transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleSave}
                disabled={submitting || !formName.trim() || !formRepo.trim()}
                className="flex items-center gap-2 px-6 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50 transition-colors"
              >
                {submitting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
                {submitting ? "Saving..." : editing ? "Update" : "Create"}
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </>
  );
}
