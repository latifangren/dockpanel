import { useAuth } from "../context/AuthContext";
import { useServer } from "../context/ServerContext";
import { Navigate } from "react-router-dom";
import { useState, useEffect, useRef, useCallback } from "react";
import { api, ApiError } from "../api";
import ProvisionLog from "../components/ProvisionLog";
import { usePrereqs } from "../components/Prerequisite";
import { TemplateBrandIcon } from "./apps/TemplateBrandIcon";
import { OllamaModels } from "./apps/OllamaModels";
import { StatsDrawer } from "./apps/StatsDrawer";
import { LogsDrawer } from "./apps/LogsDrawer";
import { DeployDrawer } from "./apps/DeployDrawer";
import { EnvDrawer } from "./apps/EnvDrawer";
import { ShellDrawer } from "./apps/ShellDrawer";
import { VolumeDrawer } from "./apps/VolumeDrawer";
import { RegistriesPanel } from "./apps/RegistriesPanel";
import { ImagesPanel } from "./apps/ImagesPanel";
import { ScanDrawer } from "./apps/ScanDrawer";
import { SnapshotFlow } from "./apps/SnapshotFlow";
import { timeAgo } from "../utils/format";

/// What the agent substitutes for an environment value it will not show. The
/// edit dialog is seeded from that response, so this is what an untouched
/// sensitive field posts back — the agent reads it as "unchanged" and keeps the
/// stored value.
export const ENV_MASK = "********";

interface EnvVar {
  name: string;
  label: string;
  default: string;
  required: boolean;
  secret: boolean;
  /** Server fills this in from the domain claimed above; the catalogue default
   *  shown here is the no-domain fallback. See TEMPLATE_DOMAIN_ENV in the agent. */
  domain_derived?: boolean;
}

export interface AppTemplate {
  id: string;
  name: string;
  description: string;
  category: string;
  image: string;
  default_port: number;
  container_port: string;
  env_vars: EnvVar[];
  gpu_recommended?: boolean;
  // Ported from the AI Studio v2 catalogue: the agent now derives these
  // (see docker_apps.rs template_icon/template_available_tags) instead of
  // v2's hand-edited fixture, so they survive fixture regeneration.
  // available_tags is display data for now: deploy takes a template_id and
  // always uses the template's declared image, so no tag picker is wired
  // into the deploy dialog in this pass.
  icon?: string;
  available_tags?: string[];
}

export interface GpuDevice {
  index: number;
  name: string;
}

interface GpuInfo {
  available: boolean;
  gpus: GpuDevice[];
}

type GpuMode = "none" | "all" | "specific";

export interface DeployedApp {
  container_id: string;
  name: string;
  template: string;
  status: string;
  port: number | null;
  domain: string | null;
  // Whether the server actually serves this domain over HTTPS. Optional so an
  // older agent, which does not send it, degrades to a plain-HTTP link rather
  // than to the https:// assumption this field exists to remove.
  ssl?: boolean;
  health: string | null;
  image: string | null;
  volumes: string[];
  stack_id: string | null;
  // Set by the panel (not the agent) when this container is stopped because
  // something asked it to be: 'operator_stop' | 'manual_sleep' | 'auto_sleep' |
  // 'stack_stop' | 'recreate_in_progress'. Absent means the panel has no
  // record of a deliberate stop, which for an exited container means it went
  // down on its own.
  expected_stop_reason?: string;
  expected_stop_by?: string;
}

interface StackInfo {
  id: string;
  name: string;
  service_count: number;
  domain: string | null;
  ssl_email: string | null;
  // The STORED mode, honoured by the agent on every redeploy. The link scheme
  // below keys on this and never on ssl_email: a stack served by a registered
  // certificate has no email, and inferring "no TLS" from that absence is the
  // defect that put a plain-HTTP link beside an HSTS-pinned domain.
  tls_mode: "none" | "acme" | "provided";
  /** Registry alias; provided mode only. */
  tls_certificate: string | null;
  running: number;
  total: number;
  status: string;
  services: DeployedApp[];
  created_at: string;
  updated_at: string;
}

interface ComposeService {
  /// The compose service key — what sibling services resolve on the stack network.
  key: string;
  /// The Docker container name, scoped by stack.
  name: string;
  image: string;
  ports: { host: number; container: number; protocol: string }[];
  environment: Record<string, string>;
  volumes: string[];
  restart: string;
  command: string[] | null;
  depends_on: string[];
}

interface ComposeDeployResult {
  services: { name: string; container_id: string; status: string; error: string | null }[];
  network?: string;
  proxy?: boolean | string;
  proxy_warning?: string;
  ssl?: boolean;
  ssl_warning?: string;
}

interface ComposeValidation {
  valid: boolean;
  errors: { service?: string; message: string }[];
  warnings: { service?: string; message: string }[];
  info: { service?: string; message: string }[];
}

interface ScanVuln {
  cve: string;
  severity: string;
  package: string;
  installed_version: string;
  fixed_version: string | null;
  description: string | null;
}

export interface ScanFinding {
  image: string;
  scanner: string;
  critical_count: number;
  high_count: number;
  medium_count: number;
  low_count: number;
  unknown_count: number;
  vulnerabilities: ScanVuln[];
  scanned_at: string;
}

const categoryColors: Record<string, string> = {
  CMS: "bg-accent-500/15",
  Database: "bg-rust-500/15",
  Monitoring: "bg-accent-600/15",
  DevOps: "bg-warn-500/15",
  Automation: "bg-accent-500/15",
  Tools: "bg-dark-500/15",
  Development: "bg-accent-400/15",
  Analytics: "bg-accent-600/15",
  Storage: "bg-accent-500/15",
  Security: "bg-danger-500/15",
  Media: "bg-accent-600/15",
  Networking: "bg-rust-500/15",
  Mail: "bg-rust-500/15",
};

/// What the panel knows about a deliberate stop, in words an operator can act on.
/// Falls through to a neutral sentence rather than inventing a cause for a reason
/// string a newer backend might send that this bundle has not heard of.
function stopReasonLabel(reason?: string): string {
  switch (reason) {
    case "operator_stop":
      return "you stopped it";
    case "manual_sleep":
      return "put to sleep";
    case "auto_sleep":
      return "auto-slept while idle";
    case "stack_stop":
      return "stopped with its stack";
    case "recreate_in_progress":
      return "recreating (update in progress)";
    default:
      return "stopped by the panel";
  }
}

const statusColors: Record<string, string> = {
  running: "bg-rust-500/15 text-rust-400",
  exited: "bg-danger-500/15 text-danger-400",
  created: "bg-warn-500/15 text-warn-400",
  paused: "bg-dark-700 text-dark-200",
};

export default function Apps() {
  const { user } = useAuth();
  const { activeServer } = useServer();
  if (!user || user.role !== "admin") return <Navigate to="/" replace />;

  // Where a port-only app can actually be reached.
  //
  // An app with a domain links to that domain. One published on a bare port has
  // no name to link to, so the host has to come from the machine the container
  // runs on — and that is `ServerContext`'s active server, because this page's
  // list is fetched under `X-Server-Id` and is therefore already scoped to it.
  // NOT `window.location`: on a fleet the panel and the container are different
  // machines, and substituting the panel's own host is precisely how a link ends
  // up pointing at the wrong box. That is the defect the backend spent v2.79.0
  // removing from 71 handlers; re-introducing it in the UI would be the same bug
  // with a nicer font.
  //
  // The local server is the one case where the panel's own hostname IS the right
  // answer — the panel is served from that box — and it is also the case where
  // `ip_address` is legitimately null, so it is resolved first rather than
  // treated as a missing address. A REMOTE server with no recorded address gets
  // no link at all, mirroring `agent_for_site_server`'s rule on the server side:
  // refuse rather than substitute, because a link to a guessed host is worse
  // than no link.
  const appHost = !activeServer || activeServer.is_local
    ? window.location.hostname
    : activeServer.ip_address;
  const [templates, setTemplates] = useState<AppTemplate[]>([]);
  const [apps, setApps] = useState<DeployedApp[]>([]);
  const [loading, setLoading] = useState(true);
  const [deploying, setDeploying] = useState(false);
  const [deployId, setDeployId] = useState<string | null>(null);
  const [selected, setSelected] = useState<AppTemplate | null>(null);
  const [appName, setAppName] = useState("");
  const [appPort, setAppPort] = useState(0);
  const [envValues, setEnvValues] = useState<Record<string, string>>({});
  const [appDomain, setAppDomain] = useState("");
  const [sslEmail, setSslEmail] = useState("");
  const [externalTls, setExternalTls] = useState(false);
  const [memoryMb, setMemoryMb] = useState("");
  const [cpuPercent, setCpuPercent] = useState("");
  const [gpuEnabled, setGpuEnabled] = useState(false);
  const [availableGpus, setAvailableGpus] = useState<GpuDevice[]>([]);
  const [gpuMode, setGpuMode] = useState<GpuMode>("none");
  const [gpuSelectedIndices, setGpuSelectedIndices] = useState<number[]>([]);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [message, setMessage] = useState({ text: "", type: "" });
  /** Deploy refusals, rendered INSIDE the deploy dialog. */
  const [deployError, setDeployError] = useState("");

  // ── Deploy preflight ──
  // Only the NAMES of filled env fields travel, never their values: this runs on
  // every keystroke, and a database password in a query string ends up in the
  // access log and the browser history.
  const filledEnv = Object.entries(envValues)
    .filter(([, v]) => v.trim() !== "")
    .map(([k]) => k)
    .join(",");
  const preflightPath = selected
    ? `/apps/preflight?template_id=${encodeURIComponent(selected.id)}` +
      `&name=${encodeURIComponent(appName)}&port=${appPort}` +
      (memoryMb ? `&memory_mb=${encodeURIComponent(memoryMb)}` : "") +
      `&filled_env=${encodeURIComponent(filledEnv)}`
    : null;
  const { checks: deployChecks, checking: preflightChecking, blocker: deployBlocker, recheck: recheckDeploy } =
    usePrereqs(preflightPath);

  /** Apply a suggested port or name from a prerequisite's remediation. */
  const applySuggestion = (appliesTo: string, value: string) => {
    if (appliesTo === "port") setAppPort(parseInt(value, 10) || appPort);
    else if (appliesTo === "name") setAppName(value);
  };

  /**
   * Fill a required secret with a strong random value.
   *
   * `crypto.getRandomValues` — not `crypto.subtle` — because it is available in
   * insecure contexts too, and the documented install lands the operator on plain
   * HTTP (audit finding F8). A generator that silently did nothing over HTTP would
   * be worse than none.
   */
  const generateSecret = (name: string) => {
    // Ambiguous glyphs (0/O, 1/l/I) omitted — these get read off a screen and
    // retyped into a config file more often than anyone would like.
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789";
    // Reject bytes past the largest whole multiple of the alphabet, so every
    // character is equally likely rather than biased toward the low letters.
    const limit = 256 - (256 % alphabet.length);
    let out = "";
    while (out.length < 24) {
      const bytes = new Uint8Array(32);
      crypto.getRandomValues(bytes);
      for (const b of bytes) {
        if (b < limit && out.length < 24) out += alphabet[b % alphabet.length];
      }
    }
    setEnvValues((prev) => ({ ...prev, [name]: out }));
  };
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [logsTarget, setLogsTarget] = useState<string | null>(null);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logSearch, setLogSearch] = useState("");
  const [logAutoRefresh, setLogAutoRefresh] = useState(false);
  const [logAutoScroll, setLogAutoScroll] = useState(true);
  const logEndRef = useRef<HTMLDivElement>(null);
  const logIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Env vars state
  const [envTarget, setEnvTarget] = useState<string | null>(null);
  const [envVars, setEnvVars] = useState<{ key: string; value: string }[]>([]);
  const [envLoading, setEnvLoading] = useState(false);
  const [envEditing, setEnvEditing] = useState(false);
  // Rows, not a keyed record: a record cannot express an added variable (every
  // new row would collide on the empty-string key) nor a removed one, which is
  // why the modal could only ever edit the values of keys the container already
  // had (GitHub #111).
  const [envEditRows, setEnvEditRows] = useState<{ key: string; value: string }[]>([]);
  const [envSaving, setEnvSaving] = useState(false);
  // Update SSE state
  const [updateDeployId, setUpdateDeployId] = useState<string | null>(null);

  // Container stats state
  const [statsTarget, setStatsTarget] = useState<string | null>(null);
  const [statsData, setStatsData] = useState<{ cpu_percent?: string; memory_usage?: string; memory_percent?: string; network_io?: string; block_io?: string; pids?: string } | null>(null);
  const [statsLoading, setStatsLoading] = useState(false);

  // Container shell state
  const [shellContainer, setShellContainer] = useState<{ id: string; name: string } | null>(null);
  const [shellCmd, setShellCmd] = useState("");
  const [shellOutput, setShellOutput] = useState("");
  const [shellInfo, setShellInfo] = useState<{ has_bash: boolean; has_sh: boolean } | null>(null);
  const [shellInfoLoading, setShellInfoLoading] = useState(false);
  const shellOutputRef = useRef<HTMLDivElement>(null);

  // Volume browser state
  const [volumeTarget, setVolumeTarget] = useState<string | null>(null);
  const [volumeData, setVolumeData] = useState<{ source: string; destination: string; type: string; size_bytes: number; size_mb: number; listing: string }[]>([]);
  const [volumeLoading, setVolumeLoading] = useState(false);

  // Private registry state
  const [showRegistries, setShowRegistries] = useState(false);
  const [registries, setRegistries] = useState<string[]>([]);
  const [regServer, setRegServer] = useState("");
  const [regUsername, setRegUsername] = useState("");
  const [regPassword, setRegPassword] = useState("");
  const [regLoading, setRegLoading] = useState(false);

  // Compose import state
  const [showCompose, setShowCompose] = useState(false);
  const [composeYaml, setComposeYaml] = useState("");
  const [composeParsed, setComposeParsed] = useState<ComposeService[] | null>(null);
  const [composeDeploying, setComposeDeploying] = useState(false);
  const [composeError, setComposeError] = useState("");
  const [composeName, setComposeName] = useState("");
  const [composeDomain, setComposeDomain] = useState("");
  const [composeSslEmail, setComposeSslEmail] = useState("");
  // Default `none` is today's blank-email behaviour spelled out: the operator
  // now picks a mode instead of the panel inferring one from an empty box.
  const [composeTlsMode, setComposeTlsMode] = useState<"none" | "acme" | "provided">("none");
  const [composeTlsCertificate, setComposeTlsCertificate] = useState("");
  // null = not asked yet. Fetched only when "Registered certificate" is chosen,
  // so a form that never uses the registry never pays for the request.
  const [registeredCerts, setRegisteredCerts] = useState<{ id: string; alias: string; dns_names: string[] }[] | null>(null);
  const [registeredCertsError, setRegisteredCertsError] = useState("");
  const [composeChecks, setComposeChecks] = useState<ComposeValidation | null>(null);

  // Stack edit state. `PUT /api/stacks/{id}` (redeploy with domain/TLS
  // replanning, rollback on failure) had zero frontend caller until s414 —
  // the field set mirrors the create modal above (minus name, which is
  // immutable) since GET /api/stacks/{id} already returns everything needed
  // to prefill it.
  const [editingStack, setEditingStack] = useState<StackInfo | null>(null);
  const [editYaml, setEditYaml] = useState("");
  const [editLoading, setEditLoading] = useState(false);
  const [editSaving, setEditSaving] = useState(false);
  const [editError, setEditError] = useState("");
  const [editDomain, setEditDomain] = useState("");
  const [editSslEmail, setEditSslEmail] = useState("");
  const [editTlsMode, setEditTlsMode] = useState<"none" | "acme" | "provided">("none");
  const [editTlsCertificate, setEditTlsCertificate] = useState("");

  // Image management state (Feature #6)
  const [showImages, setShowImages] = useState(false);
  const [images, setImages] = useState<{ repository: string; tag: string; id: string; size: string; created: string }[]>([]);
  const [imagesLoading, setImagesLoading] = useState(false);
  const [imagePruning, setImagePruning] = useState(false);
  const [pruneArmed, setPruneArmed] = useState(false);

  // App tags state (Feature #7)
  const [appTags, setAppTags] = useState<Record<string, string>>(() => {
    try { return JSON.parse(localStorage.getItem('dp-app-tags') || '{}'); } catch { return {}; }
  });
  const [tagFilter, setTagFilter] = useState("");

  // Container metrics history state (Feature #8)
  const [statsHistory, setStatsHistory] = useState<Record<string, { cpu: number; mem: number }[]>>({});

  // Health check config state (Feature #9)
  const [enableHealthCheck, setEnableHealthCheck] = useState(false);
  const [healthCmd, setHealthCmd] = useState("");
  const [healthInterval, setHealthInterval] = useState("");
  const [healthTimeout, setHealthTimeout] = useState("");
  const [healthRetries, setHealthRetries] = useState("");

  // Compose view state (Feature #11 — packages tab)
  const [composeView, setComposeView] = useState<"compose" | "packages">("compose");

  // Image update check state
  const [updateInfo, setUpdateInfo] = useState<Record<string, { update_available: boolean; check_error?: string }>>({});
  const [updateChecking, setUpdateChecking] = useState(false);

  // Stacks state
  const [stacks, setStacks] = useState<StackInfo[]>([]);
  const [expandedStack, setExpandedStack] = useState<string | null>(null);
  const [stackActionLoading, setStackActionLoading] = useState<string | null>(null);
  const [stackRemoveArmed, setStackRemoveArmed] = useState<string | null>(null);

  // Image vulnerability scan results — keyed by image ref. Hydrated once
  // alongside templates/apps; updated on per-app rescan.
  const [scanFindings, setScanFindings] = useState<Record<string, ScanFinding>>({});
  const [scanDrawerImage, setScanDrawerImage] = useState<string | null>(null);
  const [ollamaTarget, setOllamaTarget] = useState<string | null>(null);
  const [scanRescanning, setScanRescanning] = useState<string | null>(null);
  const [sbomLoading, setSbomLoading] = useState<string | null>(null);

  useEffect(() => {
    Promise.all([
      api.get<AppTemplate[]>("/apps/templates").catch(() => []),
      api.get<DeployedApp[]>("/apps").catch(() => []),
      api.get<StackInfo[]>("/stacks").catch(() => []),
      api.get<ScanFinding[]>("/image-scan/recent").catch(() => []),
      api.get<GpuInfo>("/apps/gpu-info").catch(() => null),
    ]).then(([tmpl, deployed, stacksData, scans, gpuInfo]) => {
      setTemplates(tmpl);
      setApps(deployed);
      setStacks(stacksData);
      const map: Record<string, ScanFinding> = {};
      for (const s of scans) map[s.image] = s;
      setScanFindings(map);
      if (gpuInfo && gpuInfo.available && gpuInfo.gpus.length > 0) {
        setAvailableGpus(gpuInfo.gpus.map(g => ({ index: g.index, name: g.name })));
      }
      setLoading(false);
    });
  }, []);

  // Keyed by the app's NAME, not its container id. `/api/apps/{name}/scan` and
  // `/api/apps/{name}/sbom` resolve the image by matching the agent's `name`
  // field; every other `/api/apps/{container_id}/…` route takes the hex id, and
  // passing that here matched nothing and answered 404 for every app.
  const rescanApp = async (appName: string, image: string) => {
    setScanRescanning(appName);
    try {
      const result = await api.post<ScanFinding>(`/apps/${encodeURIComponent(appName)}/scan`, {});
      setScanFindings(prev => ({ ...prev, [image]: result }));
      setMessage({ text: `Scanned ${image}`, type: "success" });
    } catch (e) {
      setMessage({ text: `Scan failed: ${(e as Error).message || "unknown"}`, type: "error" });
    } finally {
      setScanRescanning(null);
    }
  };

  const openScanDrawer = (image: string) => {
    setScanDrawerImage(image);
  };

  const downloadSbom = async (appName: string, image: string, forceRegenerate = false) => {
    setSbomLoading(appName);
    try {
      // A GET here serves the already-stored document instantly — no syft
      // run — via download_app_sbom. Only fall back to the generating POST
      // when there's no cached SBOM yet (404) or the caller explicitly asked
      // to regenerate. Previously this always POSTed, forcing a 180-240s
      // syft run on every click even when a fresh SBOM already existed.
      let spdx: unknown;
      if (!forceRegenerate) {
        try {
          spdx = await api.get(`/apps/${encodeURIComponent(appName)}/sbom`);
        } catch (e) {
          if (!(e instanceof ApiError) || e.status !== 404) throw e;
        }
      }
      if (spdx === undefined) {
        const result = await api.post<{ image: string; generated_at: string; spdx: unknown }>(
          `/apps/${encodeURIComponent(appName)}/sbom`,
          {}
        );
        spdx = result.spdx;
      }
      const blob = new Blob([JSON.stringify(spdx, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      const safe = appName.replace(/[^A-Za-z0-9._-]/g, "_");
      a.href = url;
      a.download = `${safe}.spdx.json`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      setMessage({ text: `SBOM downloaded for ${image}`, type: "success" });
    } catch (e) {
      const msg = (e as Error).message || "unknown";
      const hint = msg.includes("not installed") ? " — install syft from Settings → Services → SBOM" : "";
      setMessage({ text: `SBOM failed: ${msg}${hint}`, type: "error" });
    } finally {
      setSbomLoading(null);
    }
  };

  const scanSeverityClass = (f: ScanFinding | undefined): string => {
    if (!f) return "bg-dark-700 text-dark-300";
    if (f.critical_count > 0) return "bg-danger-500/15 text-danger-400";
    if (f.high_count > 0) return "bg-warn-500/15 text-warn-400";
    if (f.medium_count > 0) return "bg-warn-500/10 text-warn-500";
    if (f.low_count + f.unknown_count > 0) return "bg-accent-500/10 text-accent-400";
    return "bg-rust-500/15 text-rust-400";
  };

  const scanSeverityLabel = (f: ScanFinding | undefined): string => {
    if (!f) return "Not scanned";
    if (f.critical_count > 0) return `${f.critical_count}C / ${f.high_count}H`;
    if (f.high_count > 0) return `${f.high_count}H / ${f.medium_count}M`;
    if (f.medium_count > 0) return `${f.medium_count}M`;
    const minor = f.low_count + f.unknown_count;
    if (minor > 0) return `${minor}L`;
    return "Clean";
  };

  const loadApps = () => {
    api.get<DeployedApp[]>("/apps").then(setApps).catch(() => {});
    api.get<StackInfo[]>("/stacks").then(setStacks).catch(() => {});
  };

  const openDeploy = (tmpl: AppTemplate) => {
    setSelected(tmpl);
    setDeployError("");
    setAppName(tmpl.id);
    setAppPort(tmpl.default_port);
    setAppDomain("");
    setSslEmail("");
    const wantGpu = !!tmpl.gpu_recommended && availableGpus.length > 0;
    setGpuEnabled(wantGpu);
    setGpuMode(wantGpu ? "all" : "none");
    setGpuSelectedIndices([]);
    const defaults: Record<string, string> = {};
    tmpl.env_vars.forEach((v) => {
      defaults[v.name] = v.default;
    });
    setEnvValues(defaults);
  };

  const handleDeploy = async () => {
    if (!selected) return;
    setDeploying(true);
    setMessage({ text: "", type: "" });
    setDeployError("");
    try {
      const deployBody: Record<string, unknown> = {
        template_id: selected.id,
        name: appName,
        port: appPort,
        env: envValues,
        ...(appDomain ? { domain: appDomain } : {}),
        ...(appDomain && sslEmail && !externalTls ? { ssl_email: sslEmail } : {}),
        ...(appDomain && externalTls ? { external_tls: true } : {}),
        ...(memoryMb ? { memory_mb: parseInt(memoryMb) } : {}),
        ...(cpuPercent ? { cpu_percent: parseInt(cpuPercent) } : {}),
        ...(gpuEnabled ? { gpu_enabled: true } : {}),
        ...(gpuEnabled && gpuMode === "specific" && gpuSelectedIndices.length > 0
          ? { gpu_indices: gpuSelectedIndices }
          : {}),
      };
      if (enableHealthCheck && healthCmd) {
        deployBody.health_check = {
          cmd: healthCmd,
          ...(healthInterval ? { interval_s: parseInt(healthInterval) } : {}),
          ...(healthTimeout ? { timeout_s: parseInt(healthTimeout) } : {}),
          ...(healthRetries ? { retries: parseInt(healthRetries) } : {}),
        };
      }
      const result = await api.post<{ deploy_id?: string }>("/apps/deploy", deployBody);
      setSelected(null);
      if (result.deploy_id) {
        setDeployId(result.deploy_id);
      } else {
        setMessage({
          text: `${selected.name} deployed successfully`,
          type: "success",
        });
        loadApps();
        setDeploying(false);
      }
    } catch (e) {
      // Inside the dialog, next to the button that was pressed. The page-level
      // `message` banner renders ~700 lines above this modal and is covered by
      // the modal's own overlay, so a deploy refusal shown there is a refusal the
      // user never sees — the exact defect audit finding F1 turned out to be.
      setDeployError(e instanceof Error ? e.message : "Deploy failed");
      setDeploying(false);
    }
  };

  const handleAction = async (containerId: string, action: "stop" | "start" | "restart") => {
    setActionLoading(`${containerId}-${action}`);
    setMessage({ text: "", type: "" });
    try {
      await api.post(`/apps/${containerId}/${action}`);
      setMessage({ text: `App ${action}ed successfully`, type: "success" });
      loadApps();
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : `${action} failed`,
        type: "error",
      });
    } finally {
      setActionLoading(null);
    }
  };

  const fetchLogs = useCallback(async (containerId: string) => {
    try {
      const data = await api.get<{ logs: string }>(`/apps/${containerId}/logs`);
      setLogLines((data.logs || "").split("\n").filter(Boolean));
    } catch (e) {
      setLogLines([`Error: ${e instanceof Error ? e.message : "Failed to fetch logs"}`]);
    }
  }, []);

  const handleLogs = async (containerId: string) => {
    if (logsTarget === containerId) {
      closeLogs();
      return;
    }
    setLogsTarget(containerId);
    setLogLines([]);
    setLogSearch("");
    setLogAutoRefresh(false);
    setLogAutoScroll(true);
    if (logIntervalRef.current) clearInterval(logIntervalRef.current);
    await fetchLogs(containerId);
  };

  const closeLogs = () => {
    setLogsTarget(null);
    setLogLines([]);
    setLogSearch("");
    setLogAutoRefresh(false);
    if (logIntervalRef.current) { clearInterval(logIntervalRef.current); logIntervalRef.current = null; }
  };

  // Auto-refresh effect
  useEffect(() => {
    if (logAutoRefresh && logsTarget) {
      logIntervalRef.current = setInterval(() => fetchLogs(logsTarget), 3000);
      return () => { if (logIntervalRef.current) clearInterval(logIntervalRef.current); };
    } else {
      if (logIntervalRef.current) { clearInterval(logIntervalRef.current); logIntervalRef.current = null; }
    }
  }, [logAutoRefresh, logsTarget, fetchLogs]);

  // Auto-scroll to bottom
  useEffect(() => {
    if (logAutoScroll && logEndRef.current) {
      logEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [logLines, logAutoScroll]);

  // Shell output auto-scroll
  useEffect(() => {
    if (shellOutputRef.current) {
      shellOutputRef.current.scrollTop = shellOutputRef.current.scrollHeight;
    }
  }, [shellOutput]);

  const handleEnv = async (containerId: string) => {
    setEnvTarget(containerId);
    setEnvLoading(true);
    try {
      const data = await api.get<{ env: { key: string; value: string }[] }>(`/apps/${containerId}/env`);
      setEnvVars(data.env || []);
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Failed to load env vars", type: "error" });
      setEnvTarget(null);
    } finally {
      setEnvLoading(false);
    }
  };

  const handleEnvSave = async () => {
    if (!envTarget) return;
    // A blank key is an added row the operator never filled in — dropping it is
    // what "Add variable then change your mind" has to mean.
    const rows = envEditRows.filter(r => r.key.trim() !== "");
    const names = rows.map(r => r.key.trim());
    const duplicate = names.find((n, i) => names.indexOf(n) !== i);
    if (duplicate) {
      // Refused rather than silently collapsed: building the record from
      // duplicate rows would keep the last one and discard the other without
      // saying so, and the operator cannot see which value survived.
      setMessage({ text: `Duplicate variable name: ${duplicate}`, type: "error" });
      return;
    }
    setEnvSaving(true);
    try {
      const payload: Record<string, string> = {};
      rows.forEach(r => { payload[r.key.trim()] = r.value; });
      await api.put(`/apps/${envTarget}/env`, { env: payload });
      setMessage({ text: "Environment variables updated. Container was recreated.", type: "success" });
      setEnvTarget(null);
      setEnvEditing(false);
      loadApps();
    } catch (e) {
      // This recreate can legitimately take up to 15 minutes (large images,
      // slow uplinks), well past a proxy's own origin timeout — a network-level
      // failure (not an ApiError, so the backend never got to answer) means the
      // connection was cut, not that the update failed. The server keeps
      // running it in the background regardless.
      const text = !(e instanceof ApiError)
        ? "Connection lost while saving — the update continues in the background. Refresh in a minute before retrying."
        : e instanceof Error ? e.message : "Failed to update env vars";
      setMessage({ text, type: "error" });
    } finally {
      setEnvSaving(false);
    }
  };

  const handleStats = async (containerId: string) => {
    if (statsTarget === containerId) {
      setStatsTarget(null);
      setStatsData(null);
      return;
    }
    setStatsTarget(containerId);
    setStatsLoading(true);
    try {
      const data = await api.get<{ cpu_percent?: string; memory_usage?: string; memory_percent?: string; network_io?: string; block_io?: string; pids?: string }>(`/apps/${containerId}/stats`);
      setStatsData(data);
    } catch {
      setStatsData(null);
    } finally {
      setStatsLoading(false);
    }
  };

  const handleShell = async (containerId: string, name: string) => {
    setShellContainer({ id: containerId, name });
    setShellCmd("");
    setShellOutput("");
    setShellInfo(null);
    setShellInfoLoading(true);
    try {
      const info = await api.get<{ has_bash: boolean; has_sh: boolean }>(`/apps/${containerId}/shell-info`);
      setShellInfo(info);
    } catch {
      // Probe failed — fall back to letting the user try anyway.
      setShellInfo(null);
    } finally {
      setShellInfoLoading(false);
    }
  };

  const handleVolumes = async (containerId: string) => {
    setVolumeTarget(containerId);
    setVolumeLoading(true);
    try {
      const data = await api.get<{ volumes: typeof volumeData }>(`/apps/${containerId}/volumes`);
      setVolumeData(data.volumes || []);
    } catch {
      setVolumeData([]);
    } finally {
      setVolumeLoading(false);
    }
  };

  const loadRegistries = async () => {
    try {
      const data = await api.get<{ registries: string[] }>("/apps/registries");
      setRegistries(data.registries || []);
    } catch {
      setRegistries([]);
    }
  };

  const handleRegistryLogin = async () => {
    if (!regServer || !regUsername || !regPassword) return;
    setRegLoading(true);
    try {
      await api.post("/apps/registry-login", { server: regServer, username: regUsername, password: regPassword });
      setMessage({ text: `Logged in to ${regServer}`, type: "success" });
      setRegServer("");
      setRegUsername("");
      setRegPassword("");
      loadRegistries();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Registry login failed", type: "error" });
    } finally {
      setRegLoading(false);
    }
  };

  const handleRegistryLogout = async (server: string) => {
    try {
      await api.post("/apps/registry-logout", { server });
      setMessage({ text: `Logged out from ${server}`, type: "success" });
      loadRegistries();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Registry logout failed", type: "error" });
    }
  };

  const handleUpdate = async (containerId: string) => {
    setActionLoading(`${containerId}-update`);
    setMessage({ text: "", type: "" });
    try {
      const result = await api.post<{ deploy_id?: string }>(`/apps/${containerId}/update`);
      if (result.deploy_id) {
        setUpdateDeployId(result.deploy_id);
      } else {
        setMessage({ text: "App updated to latest image", type: "success" });
        loadApps();
      }
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Update failed", type: "error" });
    } finally {
      setActionLoading(null);
    }
  };

  const handleCheckUpdates = async () => {
    setUpdateChecking(true);
    setMessage({ text: "", type: "" });
    try {
      const result = await api.get<{ updates: { container_id: string; update_available: boolean; check_error?: string }[]; updates_available: number }>("/apps/updates");
      const info: Record<string, { update_available: boolean; check_error?: string }> = {};
      for (const u of result.updates) {
        info[u.container_id] = { update_available: u.update_available, check_error: u.check_error || undefined };
      }
      setUpdateInfo(info);
      // A registry that never answered scores `update_available: false`, exactly like
      // an image that is genuinely current, so the count alone cannot tell "nothing to
      // do" from "nothing could be asked". Reporting the second as success is how an
      // operator walks away from unpatched images believing the fleet is up to date —
      // and it needs nothing on the box to be broken: an anonymous registry rate limit,
      // a private registry, a deleted tag or a DNS blip all land here. The per-row
      // badges below already carry each reason; the summary has to stop contradicting
      // them.
      const unchecked = result.updates.filter(u => u.check_error).length;
      const n = result.updates_available;
      const plural = (c: number) => (c > 1 ? "s" : "");
      setMessage({
        text: n > 0
          ? `${n} update${plural(n)} available` +
            (unchecked > 0 ? ` · ${unchecked} image${plural(unchecked)} could not be reached` : "")
          : unchecked > 0
            ? `No updates found, but ${unchecked} image${plural(unchecked)} could not be reached — see the badge on each row`
            : "All containers are up to date",
        type: n > 0 || unchecked > 0 ? "warning" : "success",
      });
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Update check failed", type: "error" });
    } finally {
      setUpdateChecking(false);
    }
  };

  const downloadLogs = () => {
    const appName = apps.find(a => a.container_id === logsTarget)?.name || "container";
    const blob = new Blob([logLines.join("\n")], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${appName}-logs.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const handleRemove = async (containerId: string) => {
    try {
      await api.delete(`/apps/${containerId}`);
      setDeleteTarget(null);
      if (logsTarget === containerId) {
        closeLogs();
      }
      setMessage({ text: "App removed", type: "success" });
      loadApps();
    } catch (e) {
      setMessage({
        text: e instanceof Error ? e.message : "Remove failed",
        type: "error",
      });
    }
  };

  // Compose import handlers
  const handleComposeParse = async () => {
    if (!composeYaml.trim()) return;
    setComposeError("");
    setComposeParsed(null);
    setComposeChecks(null);
    try {
      const services = await api.post<ComposeService[]>("/apps/compose/parse", { yaml: composeYaml });
      setComposeParsed(services);
      // The panel has had a compose validator since v2.15 and no screen ever
      // called it — including the arm that says "no restart policy", which is
      // exactly what turned one failed boot into a permanently dead service.
      try {
        setComposeChecks(await api.post<ComposeValidation>("/apps/compose/validate", { yaml: composeYaml }));
      } catch {
        // Advisory only — never block a preview on it.
      }
    } catch (e) {
      setComposeError(e instanceof Error ? e.message : "Failed to parse YAML");
    }
  };

  // The TLS half of the compose form, reset in one place — on success, Cancel
  // and Escape alike — so a reopened dialog never carries a previous alias, and
  // the registry list is asked again (a certificate registered in another tab
  // is otherwise invisible for the life of the page).
  const resetComposeTls = () => {
    setComposeSslEmail("");
    setComposeTlsMode("none");
    setComposeTlsCertificate("");
    setRegisteredCerts(null);
    setRegisteredCertsError("");
  };

  const handleComposeDeploy = async () => {
    if (!composeYaml.trim()) return;
    const stackName = composeName.trim() || `stack-${Date.now()}`;
    setComposeDeploying(true);
    setComposeError("");
    try {
      const result = await api.post<{ id: string; deploy_result: ComposeDeployResult }>("/stacks", {
        name: stackName,
        yaml: composeYaml,
        domain: composeDomain.trim() || null,
        ssl_email: composeSslEmail.trim() || null,
        // Sent as a plain string, and the alias only in provided mode: neither
        // is a clearable column, so neither takes the null-for-empty spelling
        // the two lines above are the file's only allowed uses of.
        tls_mode: composeTlsMode,
        ...(composeTlsMode === "provided" ? { tls_certificate: composeTlsCertificate } : {}),
      });
      const failed = result.deploy_result.services.filter(s => s.status === "failed");
      // Refresh either way. A partial failure leaves real containers running
      // behind this dialog, and the list underneath used to stay stale until a
      // full page reload — so a second Deploy click made a second stack.
      loadApps();
      if (failed.length > 0) {
        setComposeError(
          `${failed.length} of ${result.deploy_result.services.length} service(s) failed:\n` +
            failed.map(s => `• ${s.name}: ${s.error}`).join("\n")
        );
      } else {
        setShowCompose(false);
        setComposeYaml("");
        setComposeParsed(null);
        setComposeChecks(null);
        setComposeName("");
        setComposeDomain("");
        resetComposeTls();
        const proxyNote = result.deploy_result.proxy_warning
          ? ` — but the domain could not be set up: ${result.deploy_result.proxy_warning}`
          : result.deploy_result.ssl_warning
            ? ` — served over HTTP for now: ${result.deploy_result.ssl_warning}`
            : "";
        setMessage({
          text: `Stack "${stackName}" deployed with ${result.deploy_result.services.length} service(s)${proxyNote}`,
          type: proxyNote ? "error" : "success",
        });
      }
    } catch (e) {
      // A refusal can arrive AFTER the stack exists: a registered certificate
      // that did not reach the vhost answers 502 with the containers running
      // and the row kept, so the list must show it — or a second Deploy click
      // makes a second stack under the same name.
      loadApps();
      setComposeError(e instanceof Error ? e.message : "Deploy failed");
    } finally {
      setComposeDeploying(false);
    }
  };

  const handleStackAction = async (stackId: string, action: string) => {
    setStackActionLoading(`${stackId}-${action}`);
    try {
      if (action === "remove") {
        await api.delete(`/stacks/${stackId}`);
        setMessage({ text: "Stack removed", type: "success" });
      } else {
        await api.post(`/stacks/${stackId}/${action}`);
        setMessage({ text: `Stack ${action}ed`, type: "success" });
      }
      loadApps();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : `Stack ${action} failed`, type: "error" });
    } finally {
      setStackActionLoading(null);
    }
  };

  const openEditStack = (stack: StackInfo) => {
    setEditingStack(stack);
    setEditError("");
    setEditYaml("");
    setEditDomain(stack.domain ?? "");
    setEditSslEmail(stack.ssl_email ?? "");
    setEditTlsMode(stack.tls_mode);
    setEditTlsCertificate(stack.tls_certificate ?? "");
    if (stack.tls_mode === "provided" && registeredCerts === null) {
      setRegisteredCertsError("");
      api.get<{ id: string; alias: string; dns_names: string[] }[]>("/tls-certificates")
        .then((rows) => setRegisteredCerts(rows))
        .catch((err) => {
          setRegisteredCertsError(err instanceof Error ? err.message : "Could not load registered certificates");
        });
    }
    // The list endpoint carries everything but the YAML itself, which is the
    // one field the create modal never has to fetch (it starts blank here).
    setEditLoading(true);
    api.get<{ yaml: string }>(`/stacks/${stack.id}`)
      .then((detail) => setEditYaml(detail.yaml))
      .catch((err) => setEditError(err instanceof Error ? err.message : "Could not load the stack's YAML"))
      .finally(() => setEditLoading(false));
  };

  const handleStackUpdate = async () => {
    if (!editingStack) return;
    setEditSaving(true);
    setEditError("");
    try {
      await api.put(`/stacks/${editingStack.id}`, {
        yaml: editYaml,
        domain: editDomain.trim() || null,
        ssl_email: editSslEmail.trim() || null,
        tls_mode: editTlsMode,
        ...(editTlsMode === "provided" ? { tls_certificate: editTlsCertificate } : {}),
      });
      setMessage({ text: `Stack "${editingStack.name}" updated`, type: "success" });
      setEditingStack(null);
      loadApps();
    } catch (e) {
      // A redeploy that fails rolls the stack back to its previous, saved YAML
      // (the handler's own contract) — the error names why, and the dialog
      // stays open so the operator can fix the YAML and retry rather than
      // lose what they typed.
      setEditError(e instanceof Error ? e.message : "Update failed");
    } finally {
      setEditSaving(false);
    }
  };

  // Image management handlers (Feature #6)
  const loadImages = async () => {
    setImagesLoading(true);
    try {
      const data = await api.get<{ images: typeof images }>("/apps/images");
      setImages(data.images || []);
    } catch {
      setImages([]);
    } finally {
      setImagesLoading(false);
    }
  };

  const handlePruneImages = async () => {
    setImagePruning(true);
    try {
      await api.post("/apps/images/prune");
      setMessage({ text: "Unused images pruned", type: "success" });
      loadImages();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Prune failed", type: "error" });
    } finally {
      setImagePruning(false);
    }
  };

  const handleRemoveImage = async (imageId: string) => {
    try {
      await api.delete(`/apps/images/${encodeURIComponent(imageId)}`);
      setMessage({ text: "Image removed", type: "success" });
      loadImages();
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Remove failed", type: "error" });
    }
  };

  // Container snapshot handler (Feature #12)
  const [snapshotTarget, setSnapshotTarget] = useState<{ id: string; name: string } | null>(null);
  const [snapshotTag, setSnapshotTag] = useState("");

  const handleSnapshot = async () => {
    if (!snapshotTarget || !snapshotTag) return;
    try {
      await api.post(`/apps/${snapshotTarget.id}/snapshot`, { tag: snapshotTag });
      setMessage({ text: `Snapshot saved as ${snapshotTag}`, type: "success" });
      setSnapshotTarget(null);
      setSnapshotTag("");
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Snapshot failed", type: "error" });
    }
  };

  // Container metrics history polling (Feature #8)
  const fetchAndRecordStats = async (containerId: string) => {
    try {
      const data = await api.get<{ cpu_percent?: string; memory_percent?: string }>(`/apps/${containerId}/stats`);
      const cpu = parseFloat(data.cpu_percent || '0');
      const mem = parseFloat(data.memory_percent || '0');
      setStatsHistory(prev => {
        const history = [...(prev[containerId] || []), { cpu, mem }].slice(-30);
        return { ...prev, [containerId]: history };
      });
    } catch { /* ignore */ }
  };

  // Poll stats history when stats panel is open
  useEffect(() => {
    if (!statsTarget) return;
    fetchAndRecordStats(statsTarget);
    const interval = setInterval(() => fetchAndRecordStats(statsTarget), 10000);
    return () => clearInterval(interval);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statsTarget]);

  // Stack templates (Feature #11)
  const stackTemplates = [
    {
      id: "wordpress-mysql",
      name: "WordPress + MySQL",
      description: "Full WordPress stack with dedicated MySQL database",
      services: 2,
      yaml: `services:
  wordpress:
    image: wordpress:latest
    restart: unless-stopped
    ports: ["8080:80"]
    environment:
      WORDPRESS_DB_HOST: db
      WORDPRESS_DB_USER: wordpress
      WORDPRESS_DB_PASSWORD: wp_password
      WORDPRESS_DB_NAME: wordpress
    depends_on: [db]
  db:
    image: mysql:8
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: wordpress
      MYSQL_USER: wordpress
      MYSQL_PASSWORD: wp_password
    volumes: [mysql_data:/var/lib/mysql]
volumes:
  mysql_data:`,
    },
    {
      id: "ghost-mysql",
      name: "Ghost + MySQL",
      description: "Ghost CMS with dedicated MySQL database",
      services: 2,
      yaml: `services:
  ghost:
    image: ghost:latest
    restart: unless-stopped
    ports: ["2368:2368"]
    environment:
      database__client: mysql
      database__connection__host: db
      database__connection__user: ghost
      database__connection__password: ghost_password
      database__connection__database: ghost
      url: http://localhost:2368
    depends_on: [db]
  db:
    image: mysql:8
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: ghost
      MYSQL_USER: ghost
      MYSQL_PASSWORD: ghost_password
    volumes: [ghost_mysql:/var/lib/mysql]
volumes:
  ghost_mysql:`,
    },
    {
      id: "nextcloud-mariadb-redis",
      name: "Nextcloud + MariaDB + Redis",
      description: "Full Nextcloud stack with database and cache",
      services: 3,
      yaml: `services:
  nextcloud:
    image: nextcloud:latest
    restart: unless-stopped
    ports: ["8081:80"]
    environment:
      MYSQL_HOST: db
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      MYSQL_PASSWORD: nc_password
      REDIS_HOST: redis
    depends_on: [db, redis]
    volumes: [nextcloud_data:/var/www/html]
  db:
    image: mariadb:11
    restart: unless-stopped
    environment:
      MYSQL_ROOT_PASSWORD: root_password
      MYSQL_DATABASE: nextcloud
      MYSQL_USER: nextcloud
      MYSQL_PASSWORD: nc_password
    volumes: [nc_mariadb:/var/lib/mysql]
  redis:
    image: redis:7-alpine
    restart: unless-stopped
volumes:
  nextcloud_data:
  nc_mariadb:`,
    },
    {
      id: "domain-watchdog",
      name: "Domain Watchdog",
      description: "Monitor domain names over RDAP, track their history, and catch them when they expire (GitHub #50)",
      services: 4,
      yaml: `# HTTP_SECURE_COOKIE is "false" so the first login works over plain HTTP.
# Once this is behind a domain with SSL, set it to "true" — the session cookie
# is a 7-day JWT and without it the cookie is sent unprotected.
services:
  domainwatchdog:
    image: maelgangloff/domain-watchdog:latest
    restart: unless-stopped
    ports: ["8085:80"]
    environment:
      APP_ENV: prod
      APP_SECRET: dw_app_secret
      SERVER_NAME: ":80"
      DATABASE_URL: postgresql://app:dw_password@database:5432/app?serverVersion=16&charset=utf8
      MESSENGER_ASYNC_TRANSPORT_DSN: redis://valkey:6379/messages
      MESSENGER_RDAP_LOW_TRANSPORT_DSN: redis://valkey:6379/messages-rdap-low
      MESSENGER_RDAP_HIGH_TRANSPORT_DSN: redis://valkey:6379/messages-rdap-high
      LOCK_DSN: redis://valkey:6379
      HTTP_SECURE_COOKIE: "false"
    depends_on: [database, valkey]
    volumes: [dw_caddy_data:/data, dw_caddy_config:/config]
  php-worker:
    image: maelgangloff/domain-watchdog:latest
    restart: always
    command: php /app/bin/console messenger:consume --all --time-limit=3600
    environment:
      APP_ENV: prod
      APP_SECRET: dw_app_secret
      DATABASE_URL: postgresql://app:dw_password@database:5432/app?serverVersion=16&charset=utf8
      MESSENGER_ASYNC_TRANSPORT_DSN: redis://valkey:6379/messages
      MESSENGER_RDAP_LOW_TRANSPORT_DSN: redis://valkey:6379/messages-rdap-low
      MESSENGER_RDAP_HIGH_TRANSPORT_DSN: redis://valkey:6379/messages-rdap-high
      LOCK_DSN: redis://valkey:6379
      MESSENGER_CONSUMER_NAME: worker
    depends_on: [database, valkey]
  database:
    image: postgres:16-alpine
    restart: unless-stopped
    environment:
      POSTGRES_DB: app
      POSTGRES_USER: app
      POSTGRES_PASSWORD: dw_password
    volumes: [dw_pgdata:/var/lib/postgresql/data]
  valkey:
    image: valkey/valkey:8-alpine
    restart: unless-stopped
volumes:
  dw_caddy_data:
  dw_caddy_config:
  dw_pgdata:`,
    },
  ];

  // Filter apps by tag (Feature #7)
  const standaloneApps = apps.filter(a => !a.stack_id);
  const filteredApps = standaloneApps.filter(a => !tagFilter || appTags[a.container_id] === tagFilter);

  // Crashed apps detection (Feature #10)
  //
  // A container the panel itself stopped is not a crash. Calling it one was
  // always wrong; since v2.144.0 it also matters more, because an expected stop
  // no longer raises an alert and this page is the only surface that speaks
  // about it at all.
  const stoppedApps = apps.filter(a => (a.status === 'exited' || a.status === 'dead'));
  const crashedApps = stoppedApps.filter(a => !a.expected_stop_reason);
  const intentionallyStopped = stoppedApps.filter(a => a.expected_stop_reason);

  return (
    <div>
      <div className="page-header">
        <div>
          <h1 className="page-header-title">Docker Apps</h1>
          <p className="page-header-subtitle">One-click deploy popular applications</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => { setShowImages(true); loadImages(); }}
            className="px-4 py-2 bg-dark-700 text-dark-200 rounded-lg text-sm font-medium hover:bg-dark-600 flex items-center gap-2 border border-dark-500"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M20.25 7.5l-.625 10.632a2.25 2.25 0 01-2.247 2.118H6.622a2.25 2.25 0 01-2.247-2.118L3.75 7.5M10 11.25h4M3.375 7.5h17.25c.621 0 1.125-.504 1.125-1.125v-1.5c0-.621-.504-1.125-1.125-1.125H3.375c-.621 0-1.125.504-1.125 1.125v1.5c0 .621.504 1.125 1.125 1.125z" />
            </svg>
            Images
          </button>
          <button
            onClick={() => { setShowRegistries(true); loadRegistries(); }}
            className="px-4 py-2 bg-dark-700 text-dark-200 rounded-lg text-sm font-medium hover:bg-dark-600 flex items-center gap-2 border border-dark-500"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z" />
            </svg>
            Registries
          </button>
          <button
            onClick={() => setShowCompose(true)}
            className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 flex items-center gap-2"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m6.75 12l-3-3m0 0l-3 3m3-3v6m-1.5-15H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
            </svg>
            Import Compose
          </button>
        </div>
      </div>

      <div className="p-6 lg:p-8">

      {/* Deploy provisioning log */}
      {deployId && (
        <ProvisionLog
          sseUrl={`/api/apps/deploy/${deployId}/log`}
          onComplete={() => {
            setDeployId(null);
            setDeploying(false);
            loadApps();
          }}
        />
      )}

      {/* Update provisioning log */}
      {updateDeployId && (
        <ProvisionLog
          sseUrl={`/api/apps/deploy/${updateDeployId}/log`}
          onComplete={() => {
            setUpdateDeployId(null);
            loadApps();
          }}
        />
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

      {/* Crashed apps banner (Feature #10) */}
      {crashedApps.length > 0 && (
        <div className="bg-danger-500/10 border border-danger-500/20 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-danger-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
            </svg>
            <span className="text-sm text-danger-400 font-medium">{crashedApps.length} container(s) crashed</span>
          </div>
          <div className="mt-2 space-y-1">
            {crashedApps.map(a => (
              <div key={a.container_id} className="flex items-center justify-between text-xs">
                <span className="text-dark-100 font-mono">{a.name} <span className="text-dark-300">({a.status})</span></span>
                <button onClick={() => handleAction(a.container_id, "start")} className="text-rust-400 hover:text-rust-300 font-medium">Start</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Stopped on purpose — not a crash, and deliberately not styled as one */}
      {intentionallyStopped.length > 0 && (
        <div className="bg-dark-800/60 border border-dark-600 rounded-lg p-4 mb-4">
          <div className="flex items-center gap-2">
            <svg className="w-5 h-5 text-dark-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M10 9v6m4-6v6m7-3a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <span className="text-sm text-dark-200 font-medium">
              {intentionallyStopped.length} container(s) stopped on purpose — not alerting
            </span>
          </div>
          <div className="mt-2 space-y-1">
            {intentionallyStopped.map(a => (
              <div key={a.container_id} className="flex items-center justify-between text-xs">
                <span className="text-dark-100 font-mono">
                  {a.name}{" "}
                  <span className="text-dark-300">
                    ({stopReasonLabel(a.expected_stop_reason)}
                    {a.expected_stop_by ? ` — ${a.expected_stop_by}` : ""})
                  </span>
                </span>
                <button
                  onClick={() => handleAction(a.container_id, "start")}
                  className="text-rust-400 hover:text-rust-300 font-medium"
                >
                  Start
                </button>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Compose Stacks */}
      {stacks.length > 0 && (
        <div className="mb-8">
          <h2 className="text-sm font-medium text-dark-200 uppercase font-mono tracking-widest mb-3">
            Compose Stacks
          </h2>
          <div className="space-y-3">
            {stacks.map((stack) => (
              <div key={stack.id} className="bg-dark-800 rounded-lg border border-dark-500">
                <div
                  className="flex items-center justify-between px-5 py-3 cursor-pointer hover:bg-dark-700/30 transition-colors"
                  onClick={() => setExpandedStack(expandedStack === stack.id ? null : stack.id)}
                >
                  <div className="flex items-center gap-3">
                    <svg className="w-4 h-4 text-dark-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M6.429 9.75L2.25 12l4.179 2.25m0-4.5l5.571 3 5.571-3m-11.142 0L2.25 7.5 12 2.25l9.75 5.25-4.179 2.25m0 0L12 12.75 6.429 9.75m11.142 0l4.179 2.25-4.179 2.25m0 0L12 17.25l-5.571-3m11.142 0l4.179 2.25L12 21.75l-9.75-5.25 4.179-2.25" />
                    </svg>
                    <span className="font-mono text-sm text-dark-50 font-medium">{stack.name}</span>
                    <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                      stack.status === "running" ? "bg-rust-500/15 text-rust-400" :
                      stack.status === "stopped" ? "bg-dark-600 text-dark-300" :
                      stack.status === "partial" ? "bg-warn-500/15 text-warn-400" :
                      "bg-dark-600 text-dark-400"
                    }`}>
                      {stack.status === "running" ? `${stack.running}/${stack.total} running` :
                       stack.status === "stopped" ? "stopped" :
                       stack.status === "partial" ? `${stack.running}/${stack.total} running` :
                       "removed"}
                    </span>
                    {stack.domain && (
                      <a
                        href={`${stack.tls_mode !== "none" ? "https" : "http"}://${stack.domain}`}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={(e) => e.stopPropagation()}
                        className="text-xs font-mono text-accent-400 hover:text-accent-300"
                      >
                        {stack.domain}
                      </a>
                    )}
                    {stack.domain && stack.tls_mode === "acme" && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-dark-700 text-dark-300" title="Certificate ordered from Let's Encrypt">
                        Let's Encrypt
                      </span>
                    )}
                    {stack.domain && stack.tls_mode === "provided" && (
                      <span className="px-1.5 py-0.5 rounded text-[10px] font-mono bg-dark-700 text-dark-300" title="Served by a registered certificate (Monitoring → Certificates)">
                        cert: {stack.tls_certificate ?? "?"}
                      </span>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    {stack.status !== "running" && stack.total > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStackAction(stack.id, "start"); }}
                        disabled={stackActionLoading !== null}
                        className="px-2 py-1 text-xs bg-dark-700 text-dark-200 rounded hover:bg-dark-600 disabled:opacity-50"
                      >
                        {stackActionLoading === `${stack.id}-start` ? "..." : "Start"}
                      </button>
                    )}
                    {stack.status === "running" && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStackAction(stack.id, "stop"); }}
                        disabled={stackActionLoading !== null}
                        className="px-2 py-1 text-xs bg-dark-700 text-dark-200 rounded hover:bg-dark-600 disabled:opacity-50"
                      >
                        {stackActionLoading === `${stack.id}-stop` ? "..." : "Stop"}
                      </button>
                    )}
                    {stack.total > 0 && (
                      <button
                        onClick={(e) => { e.stopPropagation(); handleStackAction(stack.id, "restart"); }}
                        disabled={stackActionLoading !== null}
                        className="px-2 py-1 text-xs bg-dark-700 text-dark-200 rounded hover:bg-dark-600 disabled:opacity-50"
                      >
                        {stackActionLoading === `${stack.id}-restart` ? "..." : "Restart"}
                      </button>
                    )}
                    <button
                      onClick={(e) => { e.stopPropagation(); openEditStack(stack); }}
                      disabled={stackActionLoading !== null}
                      className="px-2 py-1 text-xs bg-dark-700 text-dark-200 rounded hover:bg-dark-600 disabled:opacity-50"
                    >
                      Edit
                    </button>
                    {stackRemoveArmed === stack.id ? (
                      <>
                        <button
                          onClick={(e) => { e.stopPropagation(); setStackRemoveArmed(null); handleStackAction(stack.id, "remove"); }}
                          disabled={stackActionLoading !== null}
                          className="px-2 py-1 text-xs bg-danger-500 text-white rounded disabled:opacity-50"
                          title="Removes every container in this stack"
                        >
                          {stackActionLoading === `${stack.id}-remove` ? "..." : "Confirm"}
                        </button>
                        <button
                          onClick={(e) => { e.stopPropagation(); setStackRemoveArmed(null); }}
                          disabled={stackActionLoading !== null}
                          className="px-2 py-1 text-xs bg-dark-600 text-dark-200 rounded disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </>
                    ) : (
                      <button
                        onClick={(e) => { e.stopPropagation(); setStackRemoveArmed(stack.id); }}
                        disabled={stackActionLoading !== null}
                        className="px-2 py-1 text-xs text-danger-400 hover:text-danger-300 disabled:opacity-50"
                      >
                        {stackActionLoading === `${stack.id}-remove` ? "..." : "Remove"}
                      </button>
                    )}
                    <svg className={`w-4 h-4 text-dark-400 transition-transform ${expandedStack === stack.id ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
                    </svg>
                  </div>
                </div>
                {expandedStack === stack.id && stack.services.length > 0 && (
                  <div className="border-t border-dark-600 px-5 py-3">
                    <table className="w-full">
                      <thead>
                        <tr className="text-left">
                          <th className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest pb-2">Service</th>
                          <th className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest pb-2 hidden sm:table-cell">Image</th>
                          <th className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest pb-2 w-20">Port</th>
                          <th className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest pb-2 w-24">Status</th>
                          <th className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest pb-2 w-20 text-right">Logs</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-dark-700">
                        {stack.services.map((svc) => (
                          <tr key={svc.container_id} className="text-sm">
                            <td className="py-1.5 font-mono text-dark-100">{svc.name}</td>
                            <td className="py-1.5 text-dark-300 text-xs font-mono hidden sm:table-cell">{svc.image}</td>
                            <td className="py-1.5 text-dark-200 font-mono">{svc.port || "\u2014"}</td>
                            <td className="py-1.5">
                              <span className={`text-xs font-medium ${svc.status === "running" ? "text-rust-400" : "text-dark-400"}`}>
                                {svc.status}
                              </span>
                            </td>
                            {/* A stack service had no Logs button anywhere, so a
                                crashed one could not be diagnosed from the panel
                                at all \u2014 which is why bug reports about stacks
                                arrive with no detail in them. */}
                            <td className="py-1.5 text-right">
                              <button
                                onClick={(e) => { e.stopPropagation(); handleLogs(svc.container_id); }}
                                className="px-2 py-0.5 text-xs text-dark-200 hover:text-dark-50 border border-dark-600 rounded"
                              >
                                Logs
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Deployed Apps (standalone, not in stacks) */}
      {standaloneApps.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-3">
            <h2 className="text-sm font-medium text-dark-200 uppercase font-mono tracking-widest">
              Running Apps
            </h2>
            <div className="flex items-center gap-2">
              <button
                onClick={handleCheckUpdates}
                disabled={updateChecking}
                className="px-3 py-1.5 bg-dark-700 text-dark-200 rounded text-xs font-medium hover:bg-dark-600 border border-dark-500 disabled:opacity-50 transition-colors"
              >
                {updateChecking ? (
                  <span className="flex items-center gap-1.5">
                    <svg className="w-3 h-3 animate-spin" fill="none" viewBox="0 0 24 24"><circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" /><path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" /></svg>
                    Checking...
                  </span>
                ) : "Check for Updates"}
              </button>
              <select value={tagFilter} onChange={e => setTagFilter(e.target.value)} className="px-2 py-1.5 bg-dark-700 text-dark-200 rounded text-xs border border-dark-500">
                <option value="">All Apps</option>
                <option value="production">Production</option>
                <option value="staging">Staging</option>
                <option value="development">Development</option>
                <option value="internal">Internal</option>
              </select>
            </div>
          </div>
          <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="bg-dark-900 border-b border-dark-500">
                  <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-3">App</th>
                  <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-3 hidden sm:table-cell">Template</th>
                  <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-3 hidden md:table-cell">Domain</th>
                  <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-3 hidden sm:table-cell w-20">Port</th>
                  <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-3 hidden lg:table-cell w-24">Health</th>
                  <th scope="col" className="text-left text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-3 w-24">Status</th>
                  <th scope="col" className="text-right text-xs font-medium text-dark-200 uppercase font-mono tracking-widest px-5 py-3">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-600">
                {filteredApps.map((app) => (
                  <tr key={app.container_id} className="hover:bg-dark-700/30 transition-colors">
                    <td className="px-5 py-4 text-sm text-dark-50 font-medium font-mono">
                      <div className="flex items-center gap-2">
                        {app.name}
                        {updateInfo[app.container_id]?.update_available && (
                          <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-accent-500/15 text-accent-400 animate-pulse" title="Newer image available">
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4-4m0 0l-4 4m4-4v12" /></svg>
                            Update
                          </span>
                        )}
                        {/* The agent reports why a version check failed and the
                            panel used to drop it, so an app whose tag had been
                            deleted from the registry looked exactly like one that
                            was up to date — no badge, ordinary Update button. */}
                        {updateInfo[app.container_id]?.check_error && (
                          <span
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-medium bg-warn-500/15 text-warn-400"
                            title={`Could not check for a newer image: ${updateInfo[app.container_id]?.check_error}`}
                          >
                            <svg className="w-2.5 h-2.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" /></svg>
                            Check failed
                          </span>
                        )}
                        {app.image && (() => {
                          const f = scanFindings[app.image];
                          const label = scanSeverityLabel(f);
                          const aria = f
                            ? `Open vulnerability scan for ${app.image} — ${label}, last scanned ${timeAgo(f.scanned_at)}`
                            : `Open vulnerability scan for ${app.image} — not yet scanned`;
                          return (
                            <button
                              type="button"
                              onClick={(e) => { e.stopPropagation(); openScanDrawer(app.image!); }}
                              className={`inline-flex items-center px-1.5 py-0.5 rounded-full text-[10px] font-medium ${scanSeverityClass(f)} hover:opacity-80`}
                              title={f ? `Last scanned ${timeAgo(f.scanned_at)}` : "Image not yet scanned"}
                              aria-label={aria}
                            >
                              {label}
                            </button>
                          );
                        })()}
                        <select
                          value={appTags[app.container_id] || ''}
                          onChange={e => {
                            const next = { ...appTags, [app.container_id]: e.target.value };
                            setAppTags(next);
                            localStorage.setItem('dp-app-tags', JSON.stringify(next));
                          }}
                          onClick={e => e.stopPropagation()}
                          className="px-1 py-0.5 bg-dark-700 text-dark-200 rounded text-[10px] border-0 cursor-pointer"
                        >
                          <option value="">No tag</option>
                          <option value="production">Production</option>
                          <option value="staging">Staging</option>
                          <option value="development">Development</option>
                          <option value="internal">Internal</option>
                        </select>
                      </div>
                    </td>
                    <td className="px-5 py-4 text-sm text-dark-200 hidden sm:table-cell">{app.template}</td>
                    <td className="px-5 py-4 text-sm hidden md:table-cell">
                      {app.domain ? (
                        <a href={`${app.ssl ? "https" : "http"}://${app.domain}`} target="_blank" rel="noopener noreferrer" className="text-rust-400 hover:underline font-mono">{app.domain}</a>
                      ) : (
                        <span className="text-dark-300">{"\u2014"}</span>
                      )}
                    </td>
                    {/*
                      A published port is reachable, so make it reachable. Only
                      when the app has no domain \u2014 one that does already links
                      from the column before this, and two links to the same app
                      is noise. Always plain http: `app.ssl` describes whether
                      the SERVER terminates TLS for that domain's vhost, which
                      says nothing about a container's raw published port, so
                      reusing it here would produce an https:// link to a socket
                      that speaks http.
                    */}
                    <td className="px-5 py-4 text-sm text-dark-200 font-mono hidden sm:table-cell">
                      {app.port && !app.domain && appHost ? (
                        <a
                          href={`http://${appHost}:${app.port}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={e => e.stopPropagation()}
                          className="text-rust-400 hover:underline"
                          title={`Open http://${appHost}:${app.port} in a new tab`}
                        >
                          {app.port}
                        </a>
                      ) : (
                        app.port || "\u2014"
                      )}
                    </td>
                    <td className="px-5 py-4 hidden lg:table-cell">
                      {app.health ? (
                        <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${
                          app.health === "healthy" ? "bg-rust-500/15 text-rust-400" :
                          app.health === "unhealthy" ? "bg-danger-500/15 text-danger-400" :
                          "bg-warn-500/15 text-warn-400"
                        }`}>
                          <span className={`w-1.5 h-1.5 rounded-full ${
                            app.health === "healthy" ? "bg-rust-400" :
                            app.health === "unhealthy" ? "bg-danger-400" :
                            "bg-warn-400"
                          }`} />
                          {app.health}
                        </span>
                      ) : (
                        <span className="text-dark-300 text-xs">{"\u2014"}</span>
                      )}
                    </td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex px-2 py-0.5 rounded-full text-xs font-medium ${statusColors[app.status] || "bg-dark-700 text-dark-200"}`}>
                        {app.status}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <div className="flex items-center justify-end gap-1 flex-wrap">
                        {app.status === "running" ? (
                          <button
                            onClick={() => handleAction(app.container_id, "stop")}
                            disabled={actionLoading === `${app.container_id}-stop`}
                            className="px-2 py-1 bg-warn-500/10 text-warn-400 rounded text-xs font-medium hover:bg-warn-400/15 disabled:opacity-50"
                          >
                            {actionLoading === `${app.container_id}-stop` ? "..." : "Stop"}
                          </button>
                        ) : (
                          <button
                            onClick={() => handleAction(app.container_id, "start")}
                            disabled={actionLoading === `${app.container_id}-start`}
                            className="px-2 py-1 bg-rust-500/10 text-rust-400 rounded text-xs font-medium hover:bg-rust-500/20 disabled:opacity-50"
                          >
                            {actionLoading === `${app.container_id}-start` ? "..." : "Start"}
                          </button>
                        )}
                        <button
                          onClick={() => handleAction(app.container_id, "restart")}
                          disabled={!!actionLoading}
                          className="px-2 py-1 bg-accent-500/10 text-accent-400 rounded text-xs font-medium hover:bg-accent-500/15 disabled:opacity-50"
                        >
                          {actionLoading === `${app.container_id}-restart` ? "..." : "Restart"}
                        </button>
                        <button
                          onClick={() => handleLogs(app.container_id)}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            logsTarget === app.container_id
                              ? "bg-dark-500/20 text-dark-100"
                              : "bg-dark-700 text-dark-300 hover:bg-dark-600"
                          }`}
                        >
                          Logs
                        </button>
                        <button
                          onClick={() => handleEnv(app.container_id)}
                          className="px-2 py-1 rounded text-xs font-medium bg-accent-600/10 text-accent-400 hover:bg-accent-600/15"
                        >
                          Env
                        </button>
                        <button
                          onClick={() => handleStats(app.container_id)}
                          className={`px-2 py-1 rounded text-xs font-medium ${
                            statsTarget === app.container_id
                              ? "bg-rust-500/20 text-rust-400"
                              : "bg-dark-700 text-dark-300 hover:bg-dark-600"
                          }`}
                        >
                          Stats
                        </button>
                        {app.status === "running" && (
                          <button
                            onClick={() => handleShell(app.container_id, app.name)}
                            className="px-2 py-1 rounded text-xs font-medium bg-dark-600 text-dark-100 hover:bg-dark-500"
                          >
                            Shell
                          </button>
                        )}
                        {app.status === "running" && app.template === "ollama" && (
                          <button
                            onClick={() => setOllamaTarget(app.container_id)}
                            className="px-2 py-1 rounded text-xs font-medium bg-accent-500/20 text-accent-400 hover:bg-accent-500/30"
                          >
                            Models
                          </button>
                        )}
                        <button
                          onClick={() => handleVolumes(app.container_id)}
                          className="px-2 py-1 rounded text-xs font-medium bg-dark-700 text-dark-300 hover:bg-dark-600"
                        >
                          Volumes
                        </button>
                        <SnapshotFlow app={app} handleSnapshot={handleSnapshot} setSnapshotTag={setSnapshotTag} setSnapshotTarget={setSnapshotTarget} snapshotTag={snapshotTag} snapshotTarget={snapshotTarget} />
                        <button
                          onClick={() => handleUpdate(app.container_id)}
                          disabled={!!actionLoading}
                          className={`px-2 py-1 rounded text-xs font-medium disabled:opacity-50 ${
                            updateInfo[app.container_id]?.update_available
                              ? "bg-accent-500/20 text-accent-400 hover:bg-accent-500/30"
                              : "bg-dark-700 text-dark-300 hover:bg-dark-600"
                          }`}
                        >
                          {actionLoading === `${app.container_id}-update` ? "Updating..." : updateInfo[app.container_id]?.update_available ? "Update Now" : "Update"}
                        </button>
                        <button
                          onClick={async () => {
                            const cfg = await api.get<{ auto_sleep_enabled: boolean; sleep_after_minutes: number }>(`/apps/${app.container_id}/sleep-config`);
                            const newEnabled = !cfg.auto_sleep_enabled;
                            const res = await api.put<{ auto_heal_enabled?: boolean }>(`/apps/${app.container_id}/sleep-config`, {
                              auto_sleep_enabled: newEnabled,
                              sleep_after_minutes: cfg.sleep_after_minutes || 30,
                            });
                            // Auto-sleep runs as a step of the auto-healer. With
                            // that switched off the setting is stored and never
                            // acted on, so saying "enabled" would be a lie.
                            if (newEnabled && res?.auto_heal_enabled === false) {
                              setMessage({
                                text: "Auto-sleep saved, but it will not run until Auto-Healing is enabled in Settings.",
                                type: "error",
                              });
                            } else {
                              setMessage({ text: `Auto-sleep ${newEnabled ? "enabled" : "disabled"}`, type: "success" });
                            }
                          }}
                          className="px-2 py-1 rounded text-xs font-medium bg-dark-700 text-dark-300 hover:bg-dark-600"
                          title="Toggle auto-sleep (stop the container when its domain has served no requests for a while; requires Auto-Healing)"
                        >
                          Sleep
                        </button>
                        {deleteTarget === app.container_id ? (
                          <>
                            <button onClick={() => handleRemove(app.container_id)} className="px-2 py-1 bg-danger-500 text-white rounded text-xs">Confirm</button>
                            <button onClick={() => setDeleteTarget(null)} className="px-2 py-1 bg-dark-600 text-dark-200 rounded text-xs">Cancel</button>
                          </>
                        ) : (
                          <button onClick={() => setDeleteTarget(app.container_id)} className="px-2 py-1 bg-danger-500/10 text-danger-400 rounded text-xs font-medium hover:bg-danger-500/15">Remove</button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Stats inline */}
          {statsTarget && (<StatsDrawer apps={apps} handleStats={handleStats} setStatsData={setStatsData} setStatsTarget={setStatsTarget} statsData={statsData} statsHistory={statsHistory} statsLoading={statsLoading} statsTarget={statsTarget} />)}

          {/* Logs modal */}
          {logsTarget && (<LogsDrawer apps={apps} closeLogs={closeLogs} downloadLogs={downloadLogs} fetchLogs={fetchLogs} logAutoRefresh={logAutoRefresh} logAutoScroll={logAutoScroll} logEndRef={logEndRef} logLines={logLines} logSearch={logSearch} logsTarget={logsTarget} setLogAutoRefresh={setLogAutoRefresh} setLogAutoScroll={setLogAutoScroll} setLogSearch={setLogSearch} />)}
        </div>
      )}

      {/* Template Gallery */}
      <h2 className="text-sm font-medium text-dark-200 uppercase font-mono tracking-widest mb-3">
        App Templates
      </h2>
      {loading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {[...Array(8)].map((_, i) => (
            <div key={i} className="bg-dark-800 rounded-lg border border-dark-500 p-5 animate-pulse">
              <div className="h-5 bg-dark-700 rounded w-24 mb-2" />
              <div className="h-4 bg-dark-700 rounded w-full" />
            </div>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {templates.length === 0 && (
            <div className="col-span-full py-12 text-center">
              <svg className="w-12 h-12 text-dark-500 mx-auto mb-3" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M21 7.5l-2.25-1.313M21 7.5v2.25m0-2.25l-2.25 1.313M3 7.5l2.25-1.313M3 7.5l2.25 1.313M3 7.5v2.25m9 3l2.25-1.313M12 12.75l-2.25-1.313M12 12.75V15m0 6.75l2.25-1.313M12 21.75V19.5m0 2.25l-2.25-1.313m0-16.875L12 2.25l2.25 1.313M21 14.25v2.25l-2.25 1.313m-13.5 0L3 16.5v-2.25" />
              </svg>
              <p className="text-dark-300 font-medium">Could not load app templates</p>
              <p className="text-dark-300 text-xs mt-1">Check that the agent is running and accessible</p>
            </div>
          )}
          {templates.map((tmpl) => (
            <button
              key={tmpl.id}
              onClick={() => openDeploy(tmpl)}
              className="bg-dark-800 rounded-lg border border-dark-500 p-5 text-left hover:border-accent-500 hover:shadow-sm transition-all group card-interactive hover-lift"
            >
              <div className="flex items-center gap-3 mb-3">
                <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${categoryColors[tmpl.category] || "bg-dark-700"}`}>
                  <TemplateBrandIcon tmpl={tmpl} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-1.5">
                    <h3 className="text-sm font-semibold text-dark-50 group-hover:text-accent-400 truncate">
                      {tmpl.name}
                    </h3>
                    {tmpl.gpu_recommended && (
                      <span
                        title="GPU recommended — passthrough will be auto-enabled on deploy"
                        className="text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-rust-500/15 text-rust-400 border border-rust-500/30"
                      >
                        GPU
                      </span>
                    )}
                  </div>
                  <span className="text-[10px] text-dark-300 uppercase">{tmpl.category}</span>
                </div>
              </div>
              <p className="text-xs text-dark-200 line-clamp-2">{tmpl.description}</p>
              <div className="flex items-center justify-between mt-3">
                <span className="text-[10px] text-dark-300 font-mono truncate">{tmpl.image}</span>
                <span className="text-[10px] text-dark-300 ml-2 flex-none">:{tmpl.default_port}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {/* Deploy dialog */}
      {selected && (<DeployDrawer appDomain={appDomain} appName={appName} appPort={appPort} applySuggestion={applySuggestion} availableGpus={availableGpus} cpuPercent={cpuPercent} deployBlocker={deployBlocker} deployChecks={deployChecks} deployError={deployError} deploying={deploying} enableHealthCheck={enableHealthCheck} envValues={envValues} externalTls={externalTls} generateSecret={generateSecret} gpuEnabled={gpuEnabled} gpuMode={gpuMode} gpuSelectedIndices={gpuSelectedIndices} handleDeploy={handleDeploy} healthCmd={healthCmd} healthInterval={healthInterval} healthRetries={healthRetries} healthTimeout={healthTimeout} memoryMb={memoryMb} preflightChecking={preflightChecking} recheckDeploy={recheckDeploy} selected={selected} setAppDomain={setAppDomain} setAppName={setAppName} setAppPort={setAppPort} setCpuPercent={setCpuPercent} setEnableHealthCheck={setEnableHealthCheck} setEnvValues={setEnvValues} setExternalTls={setExternalTls} setGpuEnabled={setGpuEnabled} setGpuMode={setGpuMode} setGpuSelectedIndices={setGpuSelectedIndices} setHealthCmd={setHealthCmd} setHealthInterval={setHealthInterval} setHealthRetries={setHealthRetries} setHealthTimeout={setHealthTimeout} setMemoryMb={setMemoryMb} setSelected={setSelected} setSslEmail={setSslEmail} sslEmail={sslEmail} />)}

      {/* Env Vars Modal */}
      {envTarget && (<EnvDrawer ENV_MASK={ENV_MASK} apps={apps} envEditRows={envEditRows} envEditing={envEditing} envLoading={envLoading} envSaving={envSaving} envTarget={envTarget} envVars={envVars} handleEnvSave={handleEnvSave} setEnvEditRows={setEnvEditRows} setEnvEditing={setEnvEditing} setEnvTarget={setEnvTarget} />)}

      {/* Container Shell Modal */}
      {shellContainer && (<ShellDrawer setShellCmd={setShellCmd} setShellContainer={setShellContainer} setShellOutput={setShellOutput} shellCmd={shellCmd} shellContainer={shellContainer} shellInfo={shellInfo} shellInfoLoading={shellInfoLoading} shellOutput={shellOutput} shellOutputRef={shellOutputRef} />)}

      {/* Volume Browser Modal */}
      {volumeTarget && (<VolumeDrawer apps={apps} setVolumeTarget={setVolumeTarget} volumeData={volumeData} volumeLoading={volumeLoading} volumeTarget={volumeTarget} />)}

      {/* Private Registries Section */}
      {showRegistries && (<RegistriesPanel handleRegistryLogin={handleRegistryLogin} handleRegistryLogout={handleRegistryLogout} regLoading={regLoading} regPassword={regPassword} regServer={regServer} regUsername={regUsername} registries={registries} setRegPassword={setRegPassword} setRegServer={setRegServer} setRegUsername={setRegUsername} setShowRegistries={setShowRegistries} />)}

      {/* Docker Images Modal (Feature #6) */}
      {showImages && (<ImagesPanel handlePruneImages={handlePruneImages} handleRemoveImage={handleRemoveImage} imagePruning={imagePruning} images={images} imagesLoading={imagesLoading} loadImages={loadImages} pruneArmed={pruneArmed} setPruneArmed={setPruneArmed} setShowImages={setShowImages} />)}

      {/* Compose Import Dialog */}
      {showCompose && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 dp-modal-overlay"
          role="dialog"
          aria-labelledby="compose-dialog-title"
          onKeyDown={(e) => { if (e.key === "Escape") { setShowCompose(false); setComposeParsed(null); setComposeError(""); resetComposeTls(); }}}
        >
          <div className="bg-dark-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto dp-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 id="compose-dialog-title" className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">
                Deploy Multi-Container
              </h3>
              <div className="flex items-center gap-1 bg-dark-900 rounded-lg p-0.5">
                <button
                  onClick={() => setComposeView('compose')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${composeView === 'compose' ? 'bg-rust-500/15 text-rust-400' : 'text-dark-300 hover:text-dark-200'}`}
                >
                  Compose
                </button>
                <button
                  onClick={() => setComposeView('packages')}
                  className={`px-3 py-1.5 rounded text-xs font-medium transition-colors ${composeView === 'packages' ? 'bg-rust-500/15 text-rust-400' : 'text-dark-300 hover:text-dark-200'}`}
                >
                  Packages
                </button>
              </div>
            </div>

            {/* Packages view (Feature #11) */}
            {composeView === 'packages' && (
              <div>
                <p className="text-sm text-dark-200 mb-4">
                  Pre-configured multi-container stacks. Click to customize and deploy.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {stackTemplates.map(pkg => (
                    <div
                      key={pkg.id}
                      className="bg-dark-900 rounded-lg border border-dark-500 p-4 hover:border-dark-400 cursor-pointer transition-colors"
                      onClick={() => {
                        // Replace placeholder passwords with random ones for security.
                        // `getRandomValues`, not `randomUUID`: the latter is
                        // secure-context-only, and the installer's cert-failed
                        // branch leaves the operator on plain http:// — where
                        // this onClick would throw and the card would silently
                        // do nothing. Same reasoning as the generator above.
                        const randPw = () => {
                          const bytes = new Uint8Array(10);
                          crypto.getRandomValues(bytes);
                          return Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('');
                        };
                        const yaml = pkg.yaml
                          .replace(/wp_password/g, randPw())
                          .replace(/root_password/g, randPw())
                          .replace(/ghost_password/g, randPw())
                          .replace(/nc_password/g, randPw())
                          .replace(/dw_password/g, randPw())
                          // Upstream bakes a published APP_SECRET into the image;
                          // without this every install signs with the same one.
                          .replace(/dw_app_secret/g, randPw() + randPw());
                        setComposeYaml(yaml); setComposeView('compose'); setComposeParsed(null); setComposeChecks(null);
                      }}
                    >
                      <h4 className="text-sm font-medium text-dark-50">{pkg.name}</h4>
                      <p className="text-xs text-dark-300 mt-1">{pkg.description}</p>
                      <span className="text-[10px] text-dark-400 mt-2 inline-block">{pkg.services} services</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Compose view (original) */}
            {composeView === 'compose' && (<>
            <p className="text-sm text-dark-200 mb-4">
              Paste your docker-compose.yml to parse and deploy services. Only services with an <code className="text-xs bg-dark-700 px-1 rounded">image:</code> field are supported (no build context).
            </p>

            {composeError && (
              <div className="mb-4 px-4 py-3 rounded-lg text-sm border bg-danger-500/10 text-danger-400 border-danger-500/20">
                {composeError}
              </div>
            )}

            <div className="mb-4">
              <label htmlFor="compose-name" className="block text-sm font-medium text-dark-100 mb-1">Stack Name</label>
              <input
                id="compose-name"
                type="text"
                value={composeName}
                onChange={(e) => setComposeName(e.target.value)}
                placeholder="my-stack"
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
              />
              <p className="text-xs text-dark-300 mt-1">Name for this stack (used for grouping services)</p>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="compose-domain" className="block text-sm font-medium text-dark-100 mb-1">Domain <span className="text-dark-400 font-normal">(optional)</span></label>
                <input
                  id="compose-domain"
                  type="text"
                  value={composeDomain}
                  onChange={(e) => {
                    setComposeDomain(e.target.value);
                    // A TLS choice is meaningless without a domain, and the
                    // backend refuses a mode other than none for one — so
                    // emptying the box takes the choice with it rather than
                    // leaving a hidden "acme" behind a disabled select.
                    if (!e.target.value.trim()) {
                      setComposeTlsMode("none");
                      setComposeTlsCertificate("");
                      setComposeSslEmail("");
                    }
                  }}
                  placeholder="watchdog.example.com"
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                />
                <p className="text-xs text-dark-300 mt-1">
                  Serves the stack's first published port. Without one it is reachable only on 127.0.0.1 from the server itself.
                </p>
              </div>
              <div>
                <label htmlFor="compose-tls-mode" className="block text-sm font-medium text-dark-100 mb-1">HTTPS</label>
                <select
                  id="compose-tls-mode"
                  value={composeTlsMode}
                  disabled={!composeDomain.trim()}
                  onChange={(e) => {
                    const mode = e.target.value as "none" | "acme" | "provided";
                    setComposeTlsMode(mode);
                    // The email is only meaningful to an ACME order. Keeping a
                    // typed address behind a hidden input would send it with a
                    // `none` or `provided` stack, where the backend reads its
                    // presence as nothing but the payload still carries it.
                    if (mode !== "acme") setComposeSslEmail("");
                    if (mode !== "provided") setComposeTlsCertificate("");
                    if (mode === "provided" && registeredCerts === null) {
                      setRegisteredCertsError("");
                      api.get<{ id: string; alias: string; dns_names: string[] }[]>("/tls-certificates")
                        .then((rows) => setRegisteredCerts(rows))
                        .catch((err) => {
                          // Left at null so choosing the mode again asks again;
                          // an empty list here would read as "nothing registered"
                          // for the life of the page after one failed request.
                          setRegisteredCertsError(err instanceof Error ? err.message : "Could not load registered certificates");
                        });
                    }
                  }}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-500 rounded-lg text-sm text-dark-100 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 disabled:opacity-50"
                >
                  <option value="none">No HTTPS — plain HTTP, or TLS terminated upstream</option>
                  <option value="acme">Let's Encrypt certificate</option>
                  <option value="provided">Registered certificate</option>
                </select>
                {composeTlsMode === "acme" && (
                  <>
                    <input
                      id="compose-ssl-email"
                      type="email"
                      value={composeSslEmail}
                      onChange={(e) => setComposeSslEmail(e.target.value)}
                      placeholder="admin@example.com"
                      aria-label="SSL Email"
                      className="mt-2 w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                    />
                    <p className="text-xs text-dark-300 mt-1">
                      Account email for the Let's Encrypt order. Required in this mode.
                    </p>
                  </>
                )}
                {composeTlsMode === "provided" && (
                  <>
                    <select
                      id="compose-tls-certificate"
                      value={composeTlsCertificate}
                      onChange={(e) => setComposeTlsCertificate(e.target.value)}
                      aria-label="Registered certificate"
                      className="mt-2 w-full px-3 py-2 bg-dark-800 border border-dark-500 rounded-lg text-sm font-mono text-dark-100 focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
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
                        The certificate must cover the domain above; the claim is refused otherwise. Served by nginx only.
                      </p>
                    )}
                  </>
                )}
                {composeTlsMode === "none" && (
                  <p className="text-xs text-dark-300 mt-1">
                    {composeDomain.trim() ? "Serves plain HTTP on the domain." : "Enter a domain to choose how it is served."}
                  </p>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="compose-yaml" className="block text-sm font-medium text-dark-100 mb-1">docker-compose.yml</label>
              <textarea
                id="compose-yaml"
                value={composeYaml}
                onChange={(e) => { setComposeYaml(e.target.value); setComposeParsed(null); }}
                rows={12}
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                placeholder={`version: "3.8"\nservices:\n  web:\n    image: nginx:latest\n    ports:\n      - "8080:80"\n  redis:\n    image: redis:7-alpine\n    ports:\n      - "6379:6379"`}
                spellCheck={false}
              />
            </div>

            {!composeParsed && (
              <div className="flex justify-end gap-2">
                <button
                  onClick={() => { setShowCompose(false); setComposeYaml(""); setComposeParsed(null); setComposeError(""); resetComposeTls(); }}
                  className="px-4 py-2 text-dark-300 border border-dark-600 rounded-lg text-sm font-medium hover:text-dark-100 hover:border-dark-400"
                >
                  Cancel
                </button>
                <button
                  onClick={handleComposeParse}
                  disabled={!composeYaml.trim()}
                  className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
                >
                  Parse & Preview
                </button>
              </div>
            )}

            {/* Parsed services preview */}
            {composeParsed && (
              <>
                {composeChecks && (composeChecks.warnings.length > 0 || composeChecks.info.length > 0) && (
                  <div className="mb-4 rounded-lg border border-dark-500 bg-dark-900 p-3 space-y-1">
                    {composeChecks.warnings.map((w, i) => (
                      <p key={`w${i}`} className="text-xs text-warn-500">
                        {w.service ? <span className="font-mono">{w.service}: </span> : null}{w.message}
                      </p>
                    ))}
                    {composeChecks.info.map((n, i) => (
                      <p key={`i${i}`} className="text-xs text-dark-300">
                        {n.service ? <span className="font-mono">{n.service}: </span> : null}{n.message}
                      </p>
                    ))}
                  </div>
                )}
                <div className="mb-4">
                  <h4 className="text-sm font-medium text-dark-50 mb-2">
                    {composeParsed.length} service{composeParsed.length !== 1 ? "s" : ""} found:
                  </h4>
                  <p className="text-xs text-dark-300 mb-2">
                    Services reach each other by their compose name on a private network for this stack.
                  </p>
                  <div className="space-y-2">
                    {composeParsed.map((svc) => (
                      <div key={svc.name} className="bg-dark-900 rounded-lg p-3 border border-dark-500">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <span className="text-sm font-semibold text-dark-50">{svc.key}</span>
                            <span className="text-xs text-dark-300 font-mono">{svc.image}</span>
                          </div>
                          {svc.restart !== "no" && (
                            <span className="text-[10px] text-dark-300">restart: {svc.restart}</span>
                          )}
                        </div>
                        {svc.depends_on.length > 0 && (
                          <p className="mt-1 text-[10px] text-dark-400">starts after {svc.depends_on.join(", ")}</p>
                        )}
                        {svc.ports.length > 0 && (
                          <div className="mt-1.5 flex gap-2 flex-wrap">
                            {svc.ports.map((p, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-accent-500/10 text-accent-400 rounded text-[10px] font-mono">
                                {p.host}:{p.container}/{p.protocol}
                              </span>
                            ))}
                          </div>
                        )}
                        {Object.keys(svc.environment).length > 0 && (
                          <div className="mt-1.5 flex gap-2 flex-wrap">
                            {Object.entries(svc.environment).slice(0, 5).map(([k, v]) => (
                              <span key={k} className="px-1.5 py-0.5 bg-accent-600/10 text-accent-400 rounded text-[10px] font-mono">
                                {k}={v.length > 20 ? v.slice(0, 20) + "..." : v}
                              </span>
                            ))}
                            {Object.keys(svc.environment).length > 5 && (
                              <span className="text-[10px] text-dark-300">+{Object.keys(svc.environment).length - 5} more</span>
                            )}
                          </div>
                        )}
                        {svc.volumes.length > 0 && (
                          <div className="mt-1.5 flex gap-2 flex-wrap">
                            {svc.volumes.map((v, i) => (
                              <span key={i} className="px-1.5 py-0.5 bg-warn-500/10 text-warn-500 rounded text-[10px] font-mono">
                                {v}
                              </span>
                            ))}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    onClick={() => { setComposeParsed(null); setComposeError(""); }}
                    className="px-4 py-2 text-sm text-dark-200"
                  >
                    Edit YAML
                  </button>
                  <button
                    onClick={handleComposeDeploy}
                    // The backend refuses acme without an email and provided
                    // without an alias; refusing here too keeps the dialog
                    // from round-tripping a deploy it already knows will fail.
                    disabled={
                      composeDeploying ||
                      (composeTlsMode === "acme" && !composeSslEmail.trim()) ||
                      (composeTlsMode === "provided" && !composeTlsCertificate)
                    }
                    className="px-4 py-2 bg-rust-600 text-white rounded-lg text-sm font-medium hover:bg-rust-700 disabled:opacity-50 flex items-center gap-2"
                  >
                    {composeDeploying && (
                      <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                        <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                        <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                      </svg>
                    )}
                    {composeDeploying ? "Deploying..." : `Deploy ${composeParsed.length} Service${composeParsed.length !== 1 ? "s" : ""}`}
                  </button>
                </div>
              </>
            )}
            </>)}
          </div>
        </div>
      )}

      {/* Edit stack — reuses the create modal's field set (minus name, which
          PUT /api/stacks/{id} keeps immutable) since GET already returns
          everything needed to prefill it. */}
      {editingStack && (
        <div
          className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 dp-modal-overlay"
          role="dialog"
          aria-labelledby="edit-stack-dialog-title"
          onKeyDown={(e) => { if (e.key === "Escape" && !editSaving) setEditingStack(null); }}
        >
          <div className="bg-dark-800 rounded-lg shadow-xl p-6 w-full max-w-2xl max-h-[85vh] overflow-y-auto dp-modal">
            <h3 id="edit-stack-dialog-title" className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest mb-4">
              Edit Stack — {editingStack.name}
            </h3>

            {editError && (
              <div className="mb-4 px-4 py-3 rounded-lg text-sm border bg-danger-500/10 text-danger-400 border-danger-500/20">
                {editError}
              </div>
            )}

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label htmlFor="edit-stack-domain" className="block text-sm font-medium text-dark-100 mb-1">Domain <span className="text-dark-400 font-normal">(optional)</span></label>
                <input
                  id="edit-stack-domain"
                  type="text"
                  value={editDomain}
                  onChange={(e) => {
                    setEditDomain(e.target.value);
                    if (!e.target.value.trim()) {
                      setEditTlsMode("none");
                      setEditTlsCertificate("");
                      setEditSslEmail("");
                    }
                  }}
                  placeholder="watchdog.example.com"
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                />
              </div>
              <div>
                <label htmlFor="edit-stack-tls-mode" className="block text-sm font-medium text-dark-100 mb-1">HTTPS</label>
                <select
                  id="edit-stack-tls-mode"
                  value={editTlsMode}
                  disabled={!editDomain.trim()}
                  onChange={(e) => {
                    const mode = e.target.value as "none" | "acme" | "provided";
                    setEditTlsMode(mode);
                    if (mode !== "acme") setEditSslEmail("");
                    if (mode !== "provided") setEditTlsCertificate("");
                    if (mode === "provided" && registeredCerts === null) {
                      setRegisteredCertsError("");
                      api.get<{ id: string; alias: string; dns_names: string[] }[]>("/tls-certificates")
                        .then((rows) => setRegisteredCerts(rows))
                        .catch((err) => {
                          setRegisteredCertsError(err instanceof Error ? err.message : "Could not load registered certificates");
                        });
                    }
                  }}
                  className="w-full px-3 py-2 bg-dark-800 border border-dark-500 rounded-lg text-sm text-dark-100 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 disabled:opacity-50"
                >
                  <option value="none">No HTTPS — plain HTTP, or TLS terminated upstream</option>
                  <option value="acme">Let's Encrypt certificate</option>
                  <option value="provided">Registered certificate</option>
                </select>
                {editTlsMode === "acme" && (
                  <input
                    type="email"
                    value={editSslEmail}
                    onChange={(e) => setEditSslEmail(e.target.value)}
                    placeholder="admin@example.com"
                    aria-label="SSL Email"
                    className="mt-2 w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                  />
                )}
                {editTlsMode === "provided" && (
                  <>
                    <select
                      value={editTlsCertificate}
                      onChange={(e) => setEditTlsCertificate(e.target.value)}
                      aria-label="Registered certificate"
                      className="mt-2 w-full px-3 py-2 bg-dark-800 border border-dark-500 rounded-lg text-sm font-mono text-dark-100 focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
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
                    {registeredCertsError && (
                      <p className="text-xs text-danger-400 mt-1">{registeredCertsError}</p>
                    )}
                  </>
                )}
              </div>
            </div>

            <div className="mb-4">
              <label htmlFor="edit-stack-yaml" className="block text-sm font-medium text-dark-100 mb-1">docker-compose.yml</label>
              <textarea
                id="edit-stack-yaml"
                value={editYaml}
                onChange={(e) => setEditYaml(e.target.value)}
                rows={12}
                disabled={editLoading}
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 focus:border-accent-500 disabled:opacity-50"
                spellCheck={false}
              />
              <p className="text-xs text-dark-300 mt-1">
                Saving redeploys the stack with this YAML. If no service in the new definition stays running, the previous stack is redeployed and this YAML change is not kept.
              </p>
            </div>

            <div className="flex justify-end gap-2">
              <button
                onClick={() => setEditingStack(null)}
                disabled={editSaving}
                className="px-4 py-2 text-dark-300 border border-dark-600 rounded-lg text-sm font-medium hover:text-dark-100 hover:border-dark-400 disabled:opacity-50"
              >
                Cancel
              </button>
              <button
                onClick={handleStackUpdate}
                disabled={
                  editSaving ||
                  editLoading ||
                  !editYaml.trim() ||
                  (editTlsMode === "acme" && !editSslEmail.trim()) ||
                  (editTlsMode === "provided" && !editTlsCertificate)
                }
                className="px-4 py-2 bg-rust-600 text-white rounded-lg text-sm font-medium hover:bg-rust-700 disabled:opacity-50 flex items-center gap-2"
              >
                {editSaving && (
                  <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                {editSaving ? "Saving..." : "Save & Redeploy"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Image vulnerability scan drawer */}
      {scanDrawerImage && (<ScanDrawer apps={apps} downloadSbom={downloadSbom} rescanApp={rescanApp} sbomLoading={sbomLoading} scanDrawerImage={scanDrawerImage} scanFindings={scanFindings} scanRescanning={scanRescanning} setScanDrawerImage={setScanDrawerImage} />)}

      {/* Ollama Model Library drawer */}
      {ollamaTarget && <OllamaModels containerId={ollamaTarget} onClose={() => setOllamaTarget(null)} />}

      </div>
    </div>
  );
}
