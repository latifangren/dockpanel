import { useState, useEffect, FormEvent } from "react";
import { api } from "../api";
import { formatDate } from "../utils/format";
import { useAuth } from "../context/AuthContext";
import type { Database } from "./databases/types";
import { engineLabels } from "./databases/types";
import SchemaBrowser from "./databases/SchemaBrowser";
import SqlBrowser from "./databases/SqlBrowser";
import ImportDatabase from "./databases/ImportDatabase";

interface Site {
  id: string;
  domain: string;
}

// A Docker Stack a database can be provisioned against instead of a Site
// (GH #64: standalone DB provisioning for Docker Apps). Stacks are admin-only

interface Stack {
  id: string;
  name: string;
}

interface Credentials {
  host: string;
  port: number;
  database: string;
  username: string;
  password: string;
  engine: string;
  connection_string: string;
  internal_host: string;
}

/* ─── Main Databases Page ─────────────────────────────────────── */

export default function Databases() {
  const [databases, setDatabases] = useState<Database[]>([]);
  const [sites, setSites] = useState<Site[]>([]);
  const [stacks, setStacks] = useState<Stack[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Form state. GH #64: a database is now owned by a Site OR a Stack — never both
  // (chk_databases_owner). Stacks are admin-only throughout the panel, so ownerType
  // only ever offers "stack" for admins; a non-admin's request is unaffected.
  const [ownerType, setOwnerType] = useState<"site" | "stack">("site");
  const [siteId, setSiteId] = useState("");
  const [stackId, setStackId] = useState("");
  const [dbName, setDbName] = useState("");
  const [engine, setEngine] = useState("postgres");
  const [submitting, setSubmitting] = useState(false);

  // Delete state
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Credentials state
  const [credentialsId, setCredentialsId] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<Credentials | null>(null);
  const [credentialsLoading, setCredentialsLoading] = useState(false);
  const [copied, setCopied] = useState("");
  const [search, setSearch] = useState("");
  const [displayCount, setDisplayCount] = useState(25);

  // SQL Browser state
  const [browseDb, setBrowseDb] = useState<Database | null>(null);
  const [schemaDb, setSchemaDb] = useState<Database | null>(null);

  // Import state. Admin-only, matching the server: the dump directory is keyed by
  // database NAME and a name outlives the database that made it, so a tenant-reachable
  // listing would expose a previous holder's leftover dumps. Putting a file there needs
  // root anyway — there is no per-site SFTP — so no non-admin can use this door for its
  // intended purpose in the first place.
  const { user } = useAuth();
  const isAdmin = user?.role === "admin";
  const [importTargetDb, setImportTargetDb] = useState<Database | null>(null);

  // Password reset state
  const [resettingPw, setResettingPw] = useState<string | null>(null);
  const [pwResetSuccess, setPwResetSuccess] = useState<string | null>(null);

  const fetchData = async () => {
    try {
      const [dbs, sitesData, stacksData] = await Promise.all([
        api.get<Database[]>("/databases"),
        api.get<Site[]>("/sites"),
        // Stacks are admin-only server-side (require_admin) — skip the call
        // entirely for non-admins rather than surfacing its 403 as a page error.
        isAdmin ? api.get<Stack[]>("/stacks") : Promise.resolve([] as Stack[]),
      ]);
      setDatabases(dbs);
      setSites(sitesData);
      setStacks(stacksData);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin]);

  const handleCreate = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setSuccessMsg("");
    setSubmitting(true);
    try {
      await api.post("/databases", {
        site_id: ownerType === "site" ? siteId : undefined,
        stack_id: ownerType === "stack" ? stackId : undefined,
        name: dbName,
        engine,
      });
      setShowForm(false);
      setSuccessMsg(`Database "${dbName}" created`);
      setDbName("");
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create database");
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (confirmDeleteId !== id) {
      setConfirmDeleteId(id);
      return;
    }
    setDeletingId(id);
    setSuccessMsg("");
    try {
      await api.delete(`/databases/${id}`);
      setConfirmDeleteId(null);
      setSuccessMsg("Database deleted");
      if (credentialsId === id) {
        setCredentialsId(null);
        setCredentials(null);
      }
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Delete failed");
    } finally {
      setDeletingId(null);
    }
  };

  const toggleCredentials = async (id: string) => {
    if (credentialsId === id) {
      setCredentialsId(null);
      setCredentials(null);
      return;
    }
    setCredentialsId(id);
    setCredentials(null);
    setCredentialsLoading(true);
    try {
      const creds = await api.get<Credentials>(`/databases/${id}/credentials`);
      setCredentials(creds);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load credentials");
      setCredentialsId(null);
    } finally {
      setCredentialsLoading(false);
    }
  };

  const handleResetPassword = async (id: string) => {
    setResettingPw(id);
    setPwResetSuccess(null);
    setError("");
    try {
      const res = await api.post<{ ok: boolean; password: string }>(
        `/databases/${id}/reset-password`
      );
      setPwResetSuccess(res.password);
      // Show the new credentials panel with refreshed data
      setCredentialsId(id);
      setCredentials(null);
      setCredentialsLoading(true);
      try {
        const creds = await api.get<Credentials>(`/databases/${id}/credentials`);
        setCredentials(creds);
      } catch {
        // Credentials will be stale but password is shown in success message
      } finally {
        setCredentialsLoading(false);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Password reset failed");
    } finally {
      setResettingPw(null);
    }
  };

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopied(label);
    setTimeout(() => setCopied(""), 2000);
  };

  const getSiteDomain = (siteId: string) =>
    sites.find((s) => s.id === siteId)?.domain || "Unknown";

  const getStackName = (stackId: string) =>
    stacks.find((s) => s.id === stackId)?.name || "Unknown stack";

  const getOwnerLabel = (db: Database) =>
    db.stack_id ? getStackName(db.stack_id) : getSiteDomain(db.site_id ?? "");

  // Schema Browser mode
  if (schemaDb) {
    return (
      <div className="p-6 lg:p-8">
        <SchemaBrowser database={schemaDb} onClose={() => setSchemaDb(null)} />
      </div>
    );
  }

  // SQL Browser mode
  if (browseDb) {
    return (
      <div className="p-6 lg:p-8">
        <SqlBrowser database={browseDb} onClose={() => setBrowseDb(null)} />
      </div>
    );
  }

  // Import mode
  if (importTargetDb) {
    return (
      <div className="p-6 lg:p-8">
        <ImportDatabase
          database={importTargetDb}
          onClose={() => {
            setImportTargetDb(null);
            fetchData();
          }}
        />
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Databases</h1>
          <p className="page-header-subtitle">Create and manage your databases</p>
        </div>
        <div className="flex items-center gap-2">
          {databases.length >= 2 && (
            <input
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search databases..."
              className="px-3 py-1.5 bg-dark-800 border border-dark-600 rounded-lg text-sm text-dark-100 placeholder-dark-400 focus:outline-none focus:border-dark-400"
            />
          )}
          <button
            onClick={() => setShowForm(!showForm)}
            className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 transition-colors"
          >
            {showForm ? "Cancel" : "Create Database"}
          </button>
        </div>
      </div>

      <div className="p-6 lg:p-8">

      {error && (
        <div role="alert" className="bg-danger-500/10 text-danger-400 text-sm px-4 py-3 rounded-lg border border-danger-500/20 mb-4">
          {error}
          <button onClick={() => setError("")} className="float-right font-bold" aria-label="Close error">
            &times;
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-rust-500/10 text-rust-400 text-sm px-4 py-3 rounded-lg border border-rust-500/20 mb-4">
          {successMsg}
          <button onClick={() => setSuccessMsg("")} className="float-right font-bold" aria-label="Dismiss">
            &times;
          </button>
        </div>
      )}

      {/* Create form */}
      {showForm && (
        <form
          onSubmit={handleCreate}
          className="bg-dark-800 rounded-lg border border-dark-500 p-5 mb-6 space-y-4"
        >
          {/* Owner type toggle — Stacks are admin-only throughout the panel, so this
              only appears once the operator has at least one to pick from. Everyone
              else keeps the plain Site picker unchanged. */}
          {isAdmin && stacks.length > 0 && (
            <div className="flex gap-2" role="radiogroup" aria-label="Database owner type">
              {(["site", "stack"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  role="radio"
                  aria-checked={ownerType === t}
                  onClick={() => {
                    setOwnerType(t);
                    setSiteId("");
                    setStackId("");
                    setDbName("");
                  }}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium border transition-colors ${
                    ownerType === t
                      ? "bg-rust-500/10 text-rust-400 border-rust-500/30"
                      : "text-dark-300 border-dark-600 hover:text-dark-100 hover:border-dark-400"
                  }`}
                >
                  {t === "site" ? "Owned by a Site" : "Owned by a Stack"}
                </button>
              ))}
            </div>
          )}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {ownerType === "site" ? (
              <div>
                <label htmlFor="db-site" className="block text-sm font-medium text-dark-100 mb-1">
                  Site
                </label>
                <select
                  id="db-site"
                  value={siteId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setSiteId(val);
                    if (val) {
                      const selectedSite = sites.find((s) => s.id === val);
                      if (selectedSite) {
                        setDbName(selectedSite.domain.replace(/\./g, '_').replace(/-/g, '_'));
                      }
                    }
                  }}
                  className="w-full px-3 py-2.5 border border-dark-500 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none text-sm bg-dark-800"
                >
                  <option value="">-- Select a site --</option>
                  {sites.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.domain}
                    </option>
                  ))}
                </select>
              </div>
            ) : (
              <div>
                <label htmlFor="db-stack" className="block text-sm font-medium text-dark-100 mb-1">
                  Stack
                </label>
                <select
                  id="db-stack"
                  value={stackId}
                  onChange={(e) => {
                    const val = e.target.value;
                    setStackId(val);
                    if (val) {
                      const selectedStack = stacks.find((s) => s.id === val);
                      if (selectedStack) {
                        setDbName(selectedStack.name.replace(/[^a-zA-Z0-9]/g, '_'));
                      }
                    }
                  }}
                  className="w-full px-3 py-2.5 border border-dark-500 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none text-sm bg-dark-800"
                >
                  <option value="">-- Select a stack --</option>
                  {stacks.map((s) => (
                    <option key={s.id} value={s.id}>
                      {s.name}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-dark-300 mt-1">
                  Reachable from the stack's own containers at this database's name — no
                  extra networking to configure.
                </p>
              </div>
            )}
            <div>
              <label htmlFor="db-name" className="block text-sm font-medium text-dark-100 mb-1">
                Database Name
              </label>
              <input
                id="db-name"
                type="text"
                value={dbName}
                onChange={(e) => setDbName(e.target.value)}
                required
                placeholder="my_database"
                pattern="[a-zA-Z0-9][a-zA-Z0-9_]*"
                title="Letters, numbers and underscores. Must start with a letter or a number."
                className="w-full px-3 py-2.5 border border-dark-500 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none text-sm"
              />
              <p className="text-xs text-dark-300 mt-1">Letters, numbers and underscores — must start with a letter or a number</p>
            </div>
            <div>
              <label htmlFor="db-engine" className="block text-sm font-medium text-dark-100 mb-1">
                Engine
              </label>
              <select
                id="db-engine"
                value={engine}
                onChange={(e) => setEngine(e.target.value)}
                className="w-full px-3 py-2.5 border border-dark-500 rounded-lg focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none text-sm bg-dark-800"
              >
                <option value="postgres">PostgreSQL 16</option>
                <option value="mariadb">MariaDB 11</option>
              </select>
              <p className="text-xs text-dark-300 mt-1">MySQL, MariaDB, or PostgreSQL</p>
            </div>
          </div>
          <div className="flex gap-3">
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-2 px-6 py-2.5 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50 transition-colors"
            >
              {submitting && <span className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />}
              {submitting ? "Creating..." : "Create Database"}
            </button>
            <button
              type="button"
              onClick={() => setShowForm(false)}
              className="px-4 py-2 text-sm text-dark-300 border border-dark-600 rounded-lg hover:text-dark-100 hover:border-dark-400 transition-colors"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {/* Database list */}
      {loading ? (
        <div className="bg-dark-800 rounded-lg border border-dark-500 animate-pulse">
          {[...Array(3)].map((_, i) => (
            <div key={i} className="px-5 py-4 border-b border-dark-600 last:border-0">
              <div className="h-5 bg-dark-700 rounded w-48" />
            </div>
          ))}
        </div>
      ) : !showForm && databases.length === 0 ? (
        <div className="bg-dark-800 rounded-lg border border-dark-500 p-12 text-center">
          <svg
            className="w-12 h-12 mx-auto text-dark-300 mb-4"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1}
            aria-hidden="true"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
            />
          </svg>
          <p className="text-dark-200 font-medium">No databases yet</p>
          <p className="text-dark-300 text-sm mt-2 max-w-md mx-auto">Create MySQL or PostgreSQL databases with automatic Docker containers, user management, and a built-in SQL browser.</p>
          <button onClick={() => setShowForm(true)} className="mt-3 px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 transition-colors">
            Create your first database
          </button>
        </div>
      ) : databases.length > 0 ? (
        <div className="space-y-0">
          <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-dark-500 bg-dark-900">
                  <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3">
                    Name
                  </th>
                  <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3">
                    Engine
                  </th>
                  <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3 hidden md:table-cell">
                    Owner
                  </th>
                  <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3 hidden sm:table-cell">
                    Port
                  </th>
                  <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3 hidden lg:table-cell">
                    Created
                  </th>
                  <th scope="col" className="text-right text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-5 py-3">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600">
                {(() => {
                  const filtered = databases.filter((db) => db.name.toLowerCase().includes(search.toLowerCase()));
                  const displayed = filtered.slice(0, displayCount);
                  return displayed.map((db) => (
                  <tr key={db.id} className="hover:bg-dark-700/30 transition-colors">
                    <td className="px-5 py-4 text-sm font-medium text-dark-50 font-mono">
                      {db.name}
                    </td>
                    <td className="px-5 py-4 text-sm text-dark-200">
                      {engineLabels[db.engine] || db.engine}
                    </td>
                    <td className="px-5 py-4 text-sm text-dark-200 hidden md:table-cell font-mono">
                      {getOwnerLabel(db)}
                    </td>
                    <td className="px-5 py-4 text-sm text-dark-200 font-mono hidden sm:table-cell">
                      {db.port || "\u2014"}
                    </td>
                    <td className="px-5 py-4 text-sm text-dark-200 hidden lg:table-cell">
                      {formatDate(db.created_at)}
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => setBrowseDb(db)}
                          className="px-2 py-1 rounded text-xs font-medium bg-dark-700 text-dark-200 hover:bg-dark-600 transition-colors"
                        >
                          Browse
                        </button>
                        <button
                          onClick={() => setSchemaDb(db)}
                          className="px-2 py-1 rounded text-xs font-medium bg-accent-500/10 text-accent-400 hover:bg-accent-500/15 transition-colors"
                        >
                          Schema
                        </button>
                        {isAdmin && (
                          <button
                            onClick={() => setImportTargetDb(db)}
                            className="px-2 py-1 rounded text-xs font-medium bg-dark-700 text-dark-200 hover:bg-dark-600 transition-colors"
                            title="Import a .sql.gz dump you placed on the server"
                          >
                            Import
                          </button>
                        )}
                        <button
                          onClick={async () => {
                            try {
                              const cfg = await api.get<{ pitr_enabled: boolean; retention_hours: number }>(`/databases/${db.id}/pitr`);
                              const newEnabled = !cfg.pitr_enabled;
                              await api.put(`/databases/${db.id}/pitr`, {
                                pitr_enabled: newEnabled,
                                retention_hours: cfg.retention_hours || 24,
                              });
                              setError("");
                              // The flag is stored and nothing consumes it: no WAL is
                              // archived, no binlog retained, and the restore endpoint
                              // answers 501. Saying "recovery enabled" promised a
                              // recoverability nothing behind this button can deliver —
                              // the worst place in the product to be optimistic.
                              setSuccessMsg(
                                newEnabled
                                  ? `Retention preference saved for ${db.name}. Point-in-time recovery is not implemented — nothing is being archived, and restore is unavailable. Use scheduled backups.`
                                  : `Retention preference cleared for ${db.name}.`
                              );
                            } catch (e) { setError(e instanceof Error ? e.message : "Failed to save retention preference"); }
                          }}
                          className="px-2 py-1 rounded text-xs font-medium bg-dark-700 text-dark-300 hover:bg-dark-600 transition-colors"
                          title="Store a PITR retention preference. Point-in-time recovery itself is not implemented — nothing is archived and restore returns 501."
                        >
                          PITR
                        </button>
                        <button
                          onClick={() => handleResetPassword(db.id)}
                          disabled={resettingPw === db.id}
                          className="px-2 py-1 rounded text-xs font-medium bg-dark-700 text-dark-300 hover:bg-dark-600 disabled:opacity-50 transition-colors"
                          title="Generate a new database password"
                        >
                          {resettingPw === db.id ? "..." : "Reset PW"}
                        </button>
                        <button
                          onClick={() => toggleCredentials(db.id)}
                          className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                            credentialsId === db.id
                              ? "bg-rust-500/15 text-rust-400"
                              : "bg-dark-700 text-dark-200 hover:bg-dark-600"
                          }`}
                        >
                          {credentialsId === db.id ? "Hide" : "Connect"}
                        </button>
                        {confirmDeleteId === db.id ? (
                          <>
                            <span className="text-xs text-danger-400">Sure?</span>
                            <button
                              onClick={() => handleDelete(db.id)}
                              disabled={deletingId === db.id}
                              className="px-2 py-1 bg-danger-600 text-white rounded text-xs hover:bg-danger-700 disabled:opacity-50"
                            >
                              {deletingId === db.id ? "..." : "Yes"}
                            </button>
                            <button
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-2 py-1 bg-dark-600 text-dark-100 rounded text-xs hover:bg-dark-500"
                            >
                              No
                            </button>
                          </>
                        ) : (
                          <button
                            onClick={() => handleDelete(db.id)}
                            className="text-xs text-danger-500 hover:text-danger-500"
                          >
                            Delete
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ));
                })()}
              </tbody>
            </table>
            {(() => {
              const filtered = databases.filter((db) => db.name.toLowerCase().includes(search.toLowerCase()));
              const remaining = filtered.length - displayCount;
              return remaining > 0 ? (
                <button
                  onClick={() => setDisplayCount((c) => c + 25)}
                  className="w-full py-2 text-sm text-dark-300 hover:text-dark-100 border-t border-dark-600 hover:bg-dark-700/30 transition-colors"
                >
                  Show more ({remaining} remaining)
                </button>
              ) : null;
            })()}
          </div>

          {/* Password reset success */}
          {pwResetSuccess && (
            <div className="mt-4 bg-dark-800 rounded-lg border border-accent-500/30 p-4">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-xs font-medium text-accent-400 uppercase font-mono tracking-widest">
                  Password Reset Successful
                </h3>
                <button
                  onClick={() => setPwResetSuccess(null)}
                  className="text-dark-400 hover:text-dark-200 text-sm"
                  aria-label="Dismiss"
                >
                  &times;
                </button>
              </div>
              <p className="text-xs text-dark-300 mb-2">Save this password now — it will not be shown again after you leave this page.</p>
              <div className="flex items-center gap-2">
                <code className="flex-1 bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-sm font-mono text-dark-50">
                  {pwResetSuccess}
                </code>
                <button
                  onClick={() => copyToClipboard(pwResetSuccess, "new_password")}
                  className="shrink-0 px-3 py-2 bg-dark-700 text-dark-200 rounded-lg text-xs hover:bg-dark-600 transition-colors"
                >
                  {copied === "new_password" ? "Copied!" : "Copy"}
                </button>
              </div>
            </div>
          )}

          {/* Credentials panel */}
          {credentialsId && (
            <div className="mt-4 bg-dark-800 rounded-lg border border-dark-500 p-5">
              {credentialsLoading ? (
                <div className="text-center text-dark-300 py-4">Loading credentials...</div>
              ) : credentials ? (
                <div>
                  <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest mb-4">
                    Connection Details
                  </h3>

                  {/* Connection string */}
                  <div className="mb-4">
                    <label className="block text-xs font-medium text-dark-200 mb-1">
                      Connection String
                    </label>
                    <div className="flex items-center gap-2">
                      <code className="flex-1 bg-dark-900 border border-dark-500 rounded-lg px-3 py-2 text-xs font-mono text-dark-100 overflow-x-auto">
                        {credentials.connection_string}
                      </code>
                      <button
                        onClick={() =>
                          copyToClipboard(credentials.connection_string, "connection_string")
                        }
                        className="shrink-0 px-3 py-2 bg-dark-700 text-dark-200 rounded-lg text-xs hover:bg-dark-600 transition-colors"
                      >
                        {copied === "connection_string" ? "Copied!" : "Copy"}
                      </button>
                    </div>
                  </div>

                  {/* Individual fields.
                      Two of these carry a `hint`, because two of them are the reason
                      this panel generates support questions. A managed database is
                      published on the host's loopback only and sits on a bridge with
                      container-to-container traffic switched off — so "Host" does not
                      work from inside a container, and "Internal Host" is a container
                      NAME rather than a hostname anything can resolve. Stating that
                      here is the whole fix: the field was inviting a connection
                      attempt that cannot succeed, and then saying nothing when it
                      failed. GitHub #107. */}
                  <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                    {[
                      { label: "Host", value: credentials.host, key: "host",
                        hint: "From a shell on this server. The port is published on the host's loopback only, so this will not work from inside another container or from off-box." },
                      { label: "Port", value: String(credentials.port), key: "port" },
                      { label: "Database", value: credentials.database, key: "database" },
                      { label: "Username", value: credentials.username, key: "username" },
                      { label: "Password", value: credentials.password, key: "password" },
                      { label: "Internal Host", value: credentials.internal_host, key: "internal_host",
                        hint: "The Docker container's name — for docker exec, docker logs and the CLI. It is not a hostname you can connect to." },
                    ].map((field: { label: string; value: string; key: string; hint?: string }) => (
                      <div key={field.key}>
                        <label className="block text-xs font-medium text-dark-200 mb-1">
                          {field.label}
                        </label>
                        <div className="flex items-center gap-1">
                          <code className="flex-1 bg-dark-900 border border-dark-500 rounded px-2 py-1.5 text-xs font-mono text-dark-100 truncate">
                            {field.key === "password" ? "\u2022\u2022\u2022\u2022\u2022\u2022\u2022\u2022" : field.value}
                          </code>
                          <button
                            onClick={() => copyToClipboard(field.value, field.key)}
                            className="shrink-0 p-1.5 text-dark-300 hover:text-dark-200"
                            title={`Copy ${field.label}`}
                          >
                            {copied === field.key ? (
                              <svg className="w-3.5 h-3.5 text-rust-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                              </svg>
                            ) : (
                              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                                <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0 0 13.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 0 1-.75.75H9.75a.75.75 0 0 1-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 0 1-2.25 2.25H6.75A2.25 2.25 0 0 1 4.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 0 1 1.927-.184" />
                              </svg>
                            )}
                          </button>
                        </div>
                        {field.hint && (
                          <p className="text-xs text-dark-400 mt-1 leading-snug">{field.hint}</p>
                        )}
                      </div>
                    ))}
                  </div>
                </div>
              ) : null}
            </div>
          )}
        </div>
      ) : null}
      </div>
    </div>
  );
}
