import { useState, useEffect, useMemo, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

// Ported from the AI Studio v2 Projects page, adapted to this codebase:
// - v2 imported a shared `components/ui` kit that does not exist here
//   (its page splits are deferred pending a feature audit), so this page
//   renders with plain elements and the existing dark-* tokens, which the
//   lite themes already invert.
// - v2 shipped with three example projects as defaults. Those are demo data
//   (their resource ids match nothing on a real panel), so this port starts
//   with NO projects: the operator creates their own. The storage key is
//   kept identical to v2's so a grouping created in the v2 demo carries over.
// - There is deliberately NO backend /projects API, table, or route behind
//   this page. Grouping is stored in this browser's localStorage only and
//   enforces nothing server-side: it is a workspace view, and the copy on
//   this page says so. Sites, apps, databases and git deploys below are the
//   real resources fetched from the real APIs; only the grouping itself is
//   local.

export interface ProjectEntity {
  id: string;
  name: string;
  slug: string;
  environment: "production" | "staging" | "development";
  description: string;
  site_ids: string[];
  app_ids: string[];
  database_ids: string[];
  git_deploy_ids: string[];
  created_at: string;
}

interface SiteResource {
  id: string;
  domain: string;
  runtime?: string;
  status?: string;
}

interface AppResource {
  container_id: string;
  name: string;
  template?: string;
  status: string;
  port: number | null;
  domain: string | null;
}

interface DbResource {
  id: string;
  name: string;
  engine: string;
  db_user: string;
  port?: number | null;
}

interface GitResource {
  id: string;
  name: string;
  repo_url: string;
  branch: string;
  status: string;
  domain: string | null;
}

const STORAGE_KEY = "dp_projects_registry_v1";

const ENVIRONMENTS = ["production", "staging", "development"] as const;

export default function Projects() {
  const [projects, setProjects] = useState<ProjectEntity[]>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed as ProjectEntity[];
      }
    } catch {
      // ignore storage errors — start empty rather than with demo data
    }
    return [];
  });

  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [envFilter, setEnvFilter] = useState<string>("all");
  const [sites, setSites] = useState<SiteResource[]>([]);
  const [apps, setApps] = useState<AppResource[]>([]);
  const [databases, setDatabases] = useState<DbResource[]>([]);
  const [gitDeploys, setGitDeploys] = useState<GitResource[]>([]);
  const [loading, setLoading] = useState(true);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<ProjectEntity | null>(null);
  const [name, setName] = useState("");
  const [environment, setEnvironment] = useState<"production" | "staging" | "development">("production");
  const [description, setDescription] = useState("");
  const [pickedSites, setPickedSites] = useState<string[]>([]);
  const [pickedApps, setPickedApps] = useState<string[]>([]);
  const [pickedDbs, setPickedDbs] = useState<string[]>([]);
  const [pickedGits, setPickedGits] = useState<string[]>([]);

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(projects));
    } catch {
      // ignore
    }
  }, [projects]);

  useEffect(() => {
    Promise.all([
      api.get<SiteResource[]>("/sites").catch(() => []),
      api.get<AppResource[]>("/apps").catch(() => []),
      api.get<DbResource[]>("/databases").catch(() => []),
      api.get<GitResource[]>("/git-deploys").catch(() => []),
    ])
      .then(([s, a, d, g]) => {
        setSites(Array.isArray(s) ? s : []);
        setApps(Array.isArray(a) ? a : []);
        setDatabases(Array.isArray(d) ? d : []);
        setGitDeploys(Array.isArray(g) ? g : []);
      })
      .finally(() => setLoading(false));
  }, []);

  const filteredProjects = useMemo(() => {
    if (envFilter === "all") return projects;
    return projects.filter((p) => p.environment === envFilter);
  }, [projects, envFilter]);

  const activeProject =
    projects.find((p) => p.id === selectedProjectId) || filteredProjects[0] || null;

  const toggleId = (list: string[], id: string, setter: (v: string[]) => void) => {
    setter(list.includes(id) ? list.filter((x) => x !== id) : [...list, id]);
  };

  const openCreateDrawer = () => {
    setEditingProject(null);
    setName("");
    setEnvironment("production");
    setDescription("");
    setPickedSites([]);
    setPickedApps([]);
    setPickedDbs([]);
    setPickedGits([]);
    setDrawerOpen(true);
  };

  const openEditDrawer = (proj: ProjectEntity) => {
    setEditingProject(proj);
    setName(proj.name);
    setEnvironment(proj.environment);
    setDescription(proj.description);
    setPickedSites(proj.site_ids);
    setPickedApps(proj.app_ids);
    setPickedDbs(proj.database_ids);
    setPickedGits(proj.git_deploy_ids);
    setDrawerOpen(true);
  };

  const handleDeleteProject = (id: string) => {
    setProjects((prev) => prev.filter((p) => p.id !== id));
    if (selectedProjectId === id) setSelectedProjectId("");
  };

  const handleSaveProject = (e: FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;
    const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
    if (editingProject) {
      setProjects((prev) =>
        prev.map((p) =>
          p.id === editingProject.id
            ? {
                ...p,
                name: name.trim(),
                slug,
                environment,
                description: description.trim(),
                site_ids: pickedSites,
                app_ids: pickedApps,
                database_ids: pickedDbs,
                git_deploy_ids: pickedGits,
              }
            : p,
        ),
      );
    } else {
      const created: ProjectEntity = {
        id: `proj-${Date.now().toString(36)}`,
        name: name.trim(),
        slug,
        environment,
        description: description.trim(),
        site_ids: pickedSites,
        app_ids: pickedApps,
        database_ids: pickedDbs,
        git_deploy_ids: pickedGits,
        created_at: new Date().toISOString(),
      };
      setProjects((prev) => [created, ...prev]);
      setSelectedProjectId(created.id);
    }
    setDrawerOpen(false);
  };

  const projectSites = activeProject ? sites.filter((s) => activeProject.site_ids.includes(s.id)) : [];
  const projectApps = activeProject ? apps.filter((a) => activeProject.app_ids.includes(a.container_id)) : [];
  const projectDbs = activeProject ? databases.filter((d) => activeProject.database_ids.includes(d.id)) : [];
  const projectGits = activeProject ? gitDeploys.filter((g) => activeProject.git_deploy_ids.includes(g.id)) : [];

  const inputCls =
    "w-full px-3 py-2 border border-dark-500 rounded-lg text-sm bg-dark-900 text-dark-100 focus:outline-none focus:border-dark-400";

  return (
    <div className="p-6 lg:p-8 max-w-[1600px] mx-auto space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <p className="text-xs font-medium text-dark-400 uppercase tracking-widest">Logical Workspace Grouping</p>
          <h1 className="text-2xl font-bold text-dark-50 mt-1">Projects &amp; Environments</h1>
          <p className="text-sm text-dark-300 mt-1 max-w-2xl">
            Group websites, Docker containers, databases, and Git deploys into workspaces.
            Grouping is stored in this browser only (localStorage) — it is a local
            workspace view, not a server-side boundary: it changes no permissions
            and moves no resources.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreateDrawer}
          className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600"
        >
          + New Project
        </button>
      </div>

      <div className="flex flex-wrap gap-1 p-1 bg-dark-800 rounded-lg border border-dark-600 w-fit">
        {(["all", ...ENVIRONMENTS] as const).map((env) => (
          <button
            key={env}
            type="button"
            onClick={() => setEnvFilter(env)}
            className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              envFilter === env ? "bg-rust-500 text-white" : "text-dark-300 hover:text-dark-100"
            }`}
          >
            {env === "all" ? "All Environments" : env}
            <span className="ml-1.5 text-xs opacity-70">
              {env === "all" ? projects.length : projects.filter((p) => p.environment === env).length}
            </span>
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-sm text-dark-300">Loading resources…</p>
      ) : projects.length === 0 ? (
        <div className="py-16 text-center bg-dark-800/50 border border-dark-600 rounded-lg">
          <p className="text-dark-200 font-medium">No projects yet</p>
          <p className="text-dark-400 text-sm mt-1 max-w-md mx-auto">
            Create a project and assign the sites, containers, databases, and Git deploys
            that belong together. The grouping lives in this browser only.
          </p>
          <button
            type="button"
            onClick={openCreateDrawer}
            className="mt-4 px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600"
          >
            + New Project
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <div className="lg:col-span-4 space-y-3">
            {filteredProjects.map((proj) => {
              const isSelected = activeProject?.id === proj.id;
              const total =
                proj.site_ids.length + proj.app_ids.length + proj.database_ids.length + proj.git_deploy_ids.length;
              return (
                <div
                  key={proj.id}
                  onClick={() => setSelectedProjectId(proj.id)}
                  className={`p-4 rounded-2xl border cursor-pointer transition-colors ${
                    isSelected
                      ? "bg-dark-900 border-rust-500/60 shadow-lg"
                      : "bg-dark-900/60 border-dark-800 hover:border-dark-700"
                  }`}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-semibold text-dark-50">{proj.name}</p>
                      <p className="text-xs text-dark-400 mt-0.5">{proj.environment} · {total} resource{total === 1 ? "" : "s"}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleDeleteProject(proj.id);
                      }}
                      className="text-dark-400 hover:text-danger-400 text-sm px-1"
                      aria-label={`Delete ${proj.name}`}
                    >
                      ×
                    </button>
                  </div>
                  {proj.description && <p className="text-xs text-dark-300 mt-2 line-clamp-2">{proj.description}</p>}
                  <p className="text-xs text-dark-400 mt-2">
                    {proj.site_ids.length} sites · {proj.app_ids.length} containers ·{" "}
                    {proj.database_ids.length} databases · {proj.git_deploy_ids.length} git deploys
                  </p>
                </div>
              );
            })}
          </div>

          <div className="lg:col-span-8 space-y-4">
            {activeProject ? (
              <>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-bold text-dark-50">{activeProject.name}</h2>
                    <p className="text-sm text-dark-300 mt-1">{activeProject.description}</p>
                    <p className="text-xs text-dark-400 mt-1">
                      {activeProject.environment} · created{" "}
                      {new Date(activeProject.created_at).toLocaleDateString()}
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => openEditDrawer(activeProject)}
                    className="px-3 py-1.5 bg-dark-700 text-dark-100 rounded-lg text-sm hover:bg-dark-600"
                  >
                    Assign Resources
                  </button>
                </div>
                {(
                  [
                    ["Websites", projectSites.map((s) => ({ key: s.id, title: s.domain, sub: s.status || s.runtime || "", to: `/sites/${s.id}` }))],
                    ["Containers", projectApps.map((a) => ({ key: a.container_id, title: a.name, sub: `${a.status || ""} ${a.domain || ""}`.trim(), to: "/apps" }))],
                    ["Databases", projectDbs.map((d) => ({ key: d.id, title: d.name, sub: `${d.engine} · ${d.db_user}`, to: "/databases" }))],
                    ["Git Deploys", projectGits.map((g) => ({ key: g.id, title: g.name, sub: `${g.repo_url} (${g.branch})`, to: "/git-deploys" }))],
                  ] as const
                ).map(([title, items]) => (
                  <div key={title} className="bg-dark-800/50 border border-dark-600 rounded-lg p-4">
                    <h3 className="text-sm font-semibold text-dark-100 mb-2">{title}</h3>
                    {items.length === 0 ? (
                      <p className="text-xs text-dark-400">Nothing assigned yet.</p>
                    ) : (
                      <ul className="space-y-1">
                        {items.map((it) => (
                          <li key={it.key}>
                            <Link to={it.to} className="text-sm text-dark-200 hover:text-dark-50">
                              {it.title}
                              {it.sub && <span className="text-dark-400 text-xs ml-2">{it.sub}</span>}
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                  </div>
                ))}
              </>
            ) : (
              <p className="text-sm text-dark-300">Select a project on the left.</p>
            )}
          </div>
        </div>
      )}

      {drawerOpen && (
        <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 dp-modal-overlay">
          <div className="bg-dark-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto dp-modal">
            <h3 className="text-lg font-bold text-dark-50 mb-4">
              {editingProject ? "Edit Project" : "New Project"}
            </h3>
            <form onSubmit={handleSaveProject} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Name</label>
                <input value={name} onChange={(e) => setName(e.target.value)} className={inputCls} required />
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Environment</label>
                <select
                  value={environment}
                  onChange={(e) => setEnvironment(e.target.value as typeof environment)}
                  className={inputCls}
                >
                  {ENVIRONMENTS.map((env) => (
                    <option key={env} value={env}>{env}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-dark-100 mb-1">Description</label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  className={inputCls}
                  rows={2}
                />
              </div>
              {(
                [
                  ["Websites", sites.map((s) => ({ id: s.id, label: s.domain })), pickedSites, setPickedSites],
                  ["Containers", apps.map((a) => ({ id: a.container_id, label: a.name })), pickedApps, setPickedApps],
                  ["Databases", databases.map((d) => ({ id: d.id, label: d.name })), pickedDbs, setPickedDbs],
                  ["Git Deploys", gitDeploys.map((g) => ({ id: g.id, label: g.name })), pickedGits, setPickedGits],
                ] as const
              ).map(([title, options, picked, setter]) => (
                <div key={title}>
                  <p className="text-sm font-medium text-dark-100 mb-1">{title}</p>
                  {options.length === 0 ? (
                    <p className="text-xs text-dark-400">None available.</p>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-1 max-h-40 overflow-y-auto pr-1">
                      {options.map((o) => (
                        <label key={o.id} className="flex items-center gap-2 text-sm text-dark-200 py-1">
                          <input
                            type="checkbox"
                            checked={picked.includes(o.id)}
                            onChange={() => toggleId(picked, o.id, setter)}
                          />
                          <span className="truncate">{o.label}</span>
                        </label>
                      ))}
                    </div>
                  )}
                </div>
              ))}
              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setDrawerOpen(false)}
                  className="px-4 py-2 text-sm text-dark-200 hover:text-dark-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600"
                >
                  Save Project
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
