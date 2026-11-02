// Moved verbatim from panel/frontend/src/pages/Settings.tsx (subcomponent ServiceInstallers).
// Signature unchanged; only the module imports below are new.
import { useState, useEffect } from "react";
import { api } from "../../api";
import ProvisionLog from "../../components/ProvisionLog";
import ConfirmDialog from "../../components/ConfirmDialog";
import type { ServiceStatus } from "../Settings";

// ── Service Installers Component ────────────────────────────────────────

export function ServiceInstallers({ setMessage }: {
  setMessage: (v: { text: string; type: string }) => void;
}) {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [installing, setInstalling] = useState<string | null>(null);
  const [installId, setInstallId] = useState<string | null>(null);
  const [uninstalling, setUninstalling] = useState<string | null>(null);
  const [msg, setMsg] = useState({ text: "", type: "" });
  const [showGuide, setShowGuide] = useState(false);
  const [svcPendingConfirm, setSvcPendingConfirm] = useState<{ service: string; label: string } | null>(null);

  const refreshStatus = () => {
    api.get<ServiceStatus>("/services/install-status")
      .then((d) => setStatus(d))
      .catch(() => {});
  };

  useEffect(refreshStatus, []);

  const install = async (service: string, _label: string) => {
    setInstalling(service);
    setInstallId(null);
    setMsg({ text: "", type: "" });
    try {
      const result = await api.post<{ install_id?: string }>(`/services/install/${service}`, {});
      if (result.install_id) {
        setInstallId(result.install_id);
      } else {
        setMsg({ text: `${_label} installed successfully`, type: "success" });
        refreshStatus();
        setInstalling(null);
      }
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Installation failed", type: "error" });
      setInstalling(null);
    }
  };

  const uninstall = (service: string, label: string) => {
    setSvcPendingConfirm({ service, label });
  };

  const executeUninstall = async () => {
    if (!svcPendingConfirm) return;
    const { service, label } = svcPendingConfirm;
    setSvcPendingConfirm(null);
    setUninstalling(service);
    setMsg({ text: "", type: "" });
    try {
      await api.post(`/services/uninstall/${service}`, {});
      setMsg({ text: `${label} uninstalled successfully`, type: "success" });
      refreshStatus();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Uninstall failed", type: "error" });
    } finally {
      setUninstalling(null);
    }
  };

  const services = [
    { id: "certbot", label: "Certbot", desc: "Let's Encrypt SSL certificates with auto-renewal", field: "certbot", checkInstalled: (s: ServiceStatus) => s?.certbot?.installed, checkRunning: () => true },
    { id: "ufw", label: "UFW Firewall", desc: "Firewall with default rules (SSH, HTTP, HTTPS, mail ports)", field: "ufw", checkInstalled: (s: ServiceStatus) => s?.ufw?.installed, checkRunning: (s: ServiceStatus) => s?.ufw?.active },
    { id: "fail2ban", label: "Fail2Ban", desc: "Intrusion prevention with SSH, Nginx, Postfix jails", field: "fail2ban", checkInstalled: (s: ServiceStatus) => s?.fail2ban?.installed, checkRunning: (s: ServiceStatus) => s?.fail2ban?.running },
    { id: "redis", label: "Redis", desc: "In-memory cache and data store for PHP applications", field: "redis", checkInstalled: (s: ServiceStatus) => s?.redis?.installed, checkRunning: (s: ServiceStatus) => s?.redis?.running },
    { id: "nodejs", label: "Node.js", desc: "JavaScript runtime for builds, SSR, and npm packages", field: "nodejs", checkInstalled: (s: ServiceStatus) => s?.nodejs?.installed, checkRunning: () => null },
    { id: "cloudflared", label: "Cloudflare Tunnel", desc: "Expose sites without port forwarding — zero-trust access via Cloudflare's network", field: "cloudflared", checkInstalled: (s: ServiceStatus) => s?.cloudflared?.installed, checkRunning: (s: ServiceStatus) => s?.cloudflared?.running },
    { id: "sshpass", label: "sshpass", desc: "Required for password-authenticated SFTP backup destinations — not needed for SSH-key or S3 destinations", field: "sshpass", checkInstalled: (s: ServiceStatus) => s?.sshpass?.installed, checkRunning: () => null },
  ];

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Services</h3>
        <p className="text-xs text-dark-200 mt-0.5">One-click install for common server software</p>
      </div>
      <div className="p-5 space-y-4">
        {installId && (
          <ProvisionLog
            sseUrl={`/api/services/install/${installId}/log`}
            onComplete={() => {
              setInstallId(null);
              setInstalling(null);
              refreshStatus();
            }}
          />
        )}

        {msg.text && (
          <div className={`px-4 py-2 rounded-lg text-sm border ${msg.type === "success" ? "bg-rust-500/10 text-rust-400 border-rust-500/20" : "bg-danger-500/10 text-danger-400 border-danger-500/20"}`}>
            {msg.text}
          </div>
        )}

        {/* Issue #120: this detached uninstall bar rendered here, above the
            service list, while the Uninstall buttons that arm it sit in the rows
            below. It is a portalled dialog now — see components/ConfirmDialog. */}
        {svcPendingConfirm && (
          <ConfirmDialog
            label={`Uninstall ${svcPendingConfirm.label}?`}
            tone="danger"
            onConfirm={executeUninstall}
            onCancel={() => setSvcPendingConfirm(null)}
          />
        )}

        <button
          onClick={() => setShowGuide(!showGuide)}
          className="flex items-center gap-2 text-sm text-accent-400 hover:text-accent-300 transition-colors"
        >
          <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
          </svg>
          {showGuide ? "Hide details" : "What do these install?"}
          <svg className={`w-3 h-3 transition-transform ${showGuide ? "rotate-180" : ""}`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 8.25l-7.5 7.5-7.5-7.5" />
          </svg>
        </button>

        {showGuide && (
          <div className="bg-dark-900 border border-dark-500 p-4 text-xs text-dark-200 space-y-2">
            <p><span className="text-dark-100 font-medium">Certbot</span> — Installs Let's Encrypt certbot with nginx plugin. Enables auto-renewal timer. Required for free SSL certificates.</p>
            <p><span className="text-dark-100 font-medium">UFW</span> — Installs firewall, opens SSH/HTTP/HTTPS/SMTP/IMAPS ports, enables with deny-by-default policy.</p>
            <p><span className="text-dark-100 font-medium">Fail2Ban</span> — Installs intrusion prevention. Creates jails for SSH brute-force, nginx auth failures, Postfix, and Dovecot.</p>
            <p><span className="text-dark-100 font-medium">Redis</span> — Installs Redis in-memory data store. Used as cache backend for PHP applications (WordPress object cache, Laravel, Drupal). Runs as a systemd service on port 6379.</p>
            <p><span className="text-dark-100 font-medium">Node.js</span> — Installs Node.js 22 LTS and npm via NodeSource. Used for build tools, SSR frameworks (Next.js, Nuxt), and running JavaScript/TypeScript applications.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {services.map((svc) => {
            const installed = status ? svc.checkInstalled(status) : null;
            const running = status ? svc.checkRunning(status) : null;

            return (
              <div key={svc.id} className="border border-dark-500 bg-dark-900/50 p-4 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-dark-50">{svc.label}</span>
                    {installed === true && running !== null && (
                      <span className={`w-2 h-2 rounded-full ${running ? "bg-rust-400" : "bg-warn-400"}`} title={running ? "Running" : "Installed but not running"} />
                    )}
                  </div>
                  <p className="text-[10px] text-dark-300 mt-0.5">{svc.desc}</p>
                </div>
                {installed ? (
                  <div className="flex items-center gap-2 shrink-0 ml-3">
                    <span className="text-[10px] text-dark-300 uppercase tracking-wider">Installed</span>
                    {(
                      <button
                        onClick={() => uninstall(svc.id, svc.label)}
                        disabled={uninstalling !== null || installing !== null}
                        className="px-2.5 py-1 bg-danger-500/10 text-danger-400 border border-danger-500/20 rounded-lg text-[10px] font-medium hover:bg-danger-500/20 disabled:opacity-50"
                      >
                        {uninstalling === svc.id ? "Removing..." : "Uninstall"}
                      </button>
                    )}
                  </div>
                ) : (
                  <button
                    onClick={() => install(svc.id, svc.label)}
                    disabled={installing !== null}
                    className="px-3 py-1.5 bg-rust-500 text-white rounded-lg text-xs font-medium hover:bg-rust-600 disabled:opacity-50 shrink-0 ml-3"
                  >
                    {installing === svc.id ? "Installing..." : "Install"}
                  </button>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
