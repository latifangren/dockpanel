// Moved verbatim from panel/frontend/src/pages/Settings.tsx (subcomponent ServiceInstallers).
// Signature unchanged; only the module imports below are new.
import { useState, useEffect } from "react";
import { api } from "../../api";
import ProvisionLog from "../../components/ProvisionLog";
import ConfirmDialog from "../../components/ConfirmDialog";
import type { ServiceStatus } from "../Settings";

// ── Service Installers Component ────────────────────────────────────────

export function ServiceInstallers({ pdnsApiUrl, setPdnsApiUrl, pdnsApiKey, setPdnsApiKey, showPdnsGuide, setShowPdnsGuide, saving, setSaving, setMessage }: {
  pdnsApiUrl: string;
  setPdnsApiUrl: (v: string) => void;
  pdnsApiKey: string;
  setPdnsApiKey: (v: string) => void;
  showPdnsGuide: boolean;
  setShowPdnsGuide: (v: boolean) => void;
  saving: string | null;
  setSaving: (v: string | null) => void;
  setMessage: (v: { text: string; type: string }) => void;
}) {
  const [status, setStatus] = useState<ServiceStatus | null>(null);
  const [mailStatus, setMailStatus] = useState<{ installed: boolean; running: boolean } | null>(null);
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
    api.get<{ installed: boolean; running: boolean }>("/mail/status")
      .then((d) => setMailStatus(d))
      .catch(() => setMailStatus({ installed: false, running: false }));
  };

  useEffect(refreshStatus, []);

  const [pdnsBackend, setPdnsBackend] = useState<"sqlite" | "pgsql">("sqlite");

  const install = async (service: string, _label: string, body?: Record<string, unknown>) => {
    setInstalling(service);
    setInstallId(null);
    setMsg({ text: "", type: "" });
    try {
      const endpoint = service === "mail" ? "/mail/install" : `/services/install/${service}`;
      const result = await api.post<{ install_id?: string }>(endpoint, body ?? {});
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
      const endpoint = service === "mail" ? "/mail/uninstall" : `/services/uninstall/${service}`;
      await api.post(endpoint, {});
      setMsg({ text: `${label} uninstalled successfully`, type: "success" });
      refreshStatus();
    } catch (e) {
      setMsg({ text: e instanceof Error ? e.message : "Uninstall failed", type: "error" });
    } finally {
      setUninstalling(null);
    }
  };

  const services = [
    { id: "php", label: "PHP", desc: "PHP-FPM for dynamic websites (WordPress, Laravel, etc.)", field: "php", checkInstalled: (s: ServiceStatus) => s?.php?.installed, checkRunning: (s: ServiceStatus) => s?.php?.running, extra: (s: ServiceStatus) => s?.php?.version ? `v${s.php.version}` : null },
    { id: "certbot", label: "Certbot", desc: "Let's Encrypt SSL certificates with auto-renewal", field: "certbot", checkInstalled: (s: ServiceStatus) => s?.certbot?.installed, checkRunning: () => true, extra: () => null },
    { id: "ufw", label: "UFW Firewall", desc: "Firewall with default rules (SSH, HTTP, HTTPS, mail ports)", field: "ufw", checkInstalled: (s: ServiceStatus) => s?.ufw?.installed, checkRunning: (s: ServiceStatus) => s?.ufw?.active, extra: () => null },
    { id: "fail2ban", label: "Fail2Ban", desc: "Intrusion prevention with SSH, Nginx, Postfix jails", field: "fail2ban", checkInstalled: (s: ServiceStatus) => s?.fail2ban?.installed, checkRunning: (s: ServiceStatus) => s?.fail2ban?.running, extra: () => null },
    { id: "powerdns", label: "PowerDNS", desc: "Self-hosted authoritative DNS server with HTTP API", field: "powerdns", checkInstalled: (s: ServiceStatus) => s?.powerdns?.installed, checkRunning: (s: ServiceStatus) => s?.powerdns?.running, extra: () => null },
    { id: "mail", label: "Mail Server", desc: "Postfix + Dovecot + OpenDKIM for email hosting", field: "mail", checkInstalled: () => mailStatus?.installed ?? null, checkRunning: () => mailStatus?.running ?? false, extra: () => null },
    { id: "redis", label: "Redis", desc: "In-memory cache and data store for PHP applications", field: "redis", checkInstalled: (s: ServiceStatus) => s?.redis?.installed, checkRunning: (s: ServiceStatus) => s?.redis?.running, extra: () => null },
    { id: "nodejs", label: "Node.js", desc: "JavaScript runtime for builds, SSR, and npm packages", field: "nodejs", checkInstalled: (s: ServiceStatus) => s?.nodejs?.installed, checkRunning: () => null, extra: () => null },
    { id: "composer", label: "Composer", desc: "PHP dependency manager for Laravel, Symfony, Drupal", field: "composer", checkInstalled: (s: ServiceStatus) => s?.composer?.installed, checkRunning: () => null, extra: () => null },
    { id: "waf", label: "WAF (ModSecurity)", desc: "Web Application Firewall with OWASP CRS — blocks SQL injection, XSS, and OWASP Top 10", field: "waf", checkInstalled: (s: ServiceStatus) => s?.waf?.installed, checkRunning: () => null, extra: () => null },
    { id: "cloudflared", label: "Cloudflare Tunnel", desc: "Expose sites without port forwarding — zero-trust access via Cloudflare's network", field: "cloudflared", checkInstalled: (s: ServiceStatus) => s?.cloudflared?.installed, checkRunning: (s: ServiceStatus) => s?.cloudflared?.running, extra: () => null },
    { id: "sshpass", label: "sshpass", desc: "Required for password-authenticated SFTP backup destinations — not needed for SSH-key or S3 destinations", field: "sshpass", checkInstalled: (s: ServiceStatus) => s?.sshpass?.installed, checkRunning: () => null, extra: () => null },
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
            <p><span className="text-dark-100 font-medium">PHP</span> — Installs PHP-FPM + common extensions (mysql, curl, gd, mbstring, xml, zip, opcache). Required for WordPress and PHP sites.</p>
            <p><span className="text-dark-100 font-medium">Certbot</span> — Installs Let's Encrypt certbot with nginx plugin. Enables auto-renewal timer. Required for free SSL certificates.</p>
            <p><span className="text-dark-100 font-medium">UFW</span> — Installs firewall, opens SSH/HTTP/HTTPS/SMTP/IMAPS ports, enables with deny-by-default policy.</p>
            <p><span className="text-dark-100 font-medium">Fail2Ban</span> — Installs intrusion prevention. Creates jails for SSH brute-force, nginx auth failures, Postfix, and Dovecot.</p>
            <p><span className="text-dark-100 font-medium">PowerDNS</span> — Installs an authoritative DNS server with your choice of SQLite (no database server required) or PostgreSQL backend. Auto-configures the HTTP API and saves credentials to Settings.</p>
            <p><span className="text-dark-100 font-medium">Mail Server</span> — Installs Postfix (SMTP), Dovecot (IMAP/POP3), and OpenDKIM (DKIM signing). Creates vmail user, configures virtual mailbox hosting with SASL auth and submission port (587). Manage domains and mailboxes from the Mail page.</p>
            <p><span className="text-dark-100 font-medium">Redis</span> — Installs Redis in-memory data store. Used as cache backend for PHP applications (WordPress object cache, Laravel, Drupal). Runs as a systemd service on port 6379.</p>
            <p><span className="text-dark-100 font-medium">Node.js</span> — Installs Node.js 22 LTS and npm via NodeSource. Used for build tools, SSR frameworks (Next.js, Nuxt), and running JavaScript/TypeScript applications.</p>
            <p><span className="text-dark-100 font-medium">Composer</span> — Installs Composer globally at /usr/local/bin. The standard PHP dependency manager used by Laravel, Symfony, Drupal, and most PHP frameworks.</p>
          </div>
        )}

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {services.map((svc) => {
            const installed = status ? svc.checkInstalled(status) : null;
            const running = status ? svc.checkRunning(status) : null;
            const extra = status ? svc.extra(status) : null;

            return (
              <div key={svc.id} className="border border-dark-500 bg-dark-900/50 p-4 flex items-center justify-between">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-medium text-dark-50">{svc.label}</span>
                    {extra && <span className="text-[10px] text-dark-300">{extra}</span>}
                    {installed === true && running !== null && (
                      <span className={`w-2 h-2 rounded-full ${running ? "bg-rust-400" : "bg-warn-400"}`} title={running ? "Running" : "Installed but not running"} />
                    )}
                  </div>
                  <p className="text-[10px] text-dark-300 mt-0.5">{svc.desc}</p>
                  {svc.id === "powerdns" && !installed && (
                    <div className="flex items-center gap-1.5 mt-2">
                      <span className="text-[10px] text-dark-400 uppercase tracking-wider">Backend</span>
                      <div className="flex items-center rounded-lg border border-dark-600 overflow-hidden text-[10px] font-medium" title="SQLite needs no database server and is recommended for most setups.">
                        <button
                          type="button"
                          onClick={() => setPdnsBackend("sqlite")}
                          className={`px-2 py-1 ${pdnsBackend === "sqlite" ? "bg-dark-600 text-dark-50" : "bg-dark-800 text-dark-400 hover:text-dark-200"}`}
                        >SQLite</button>
                        <button
                          type="button"
                          onClick={() => setPdnsBackend("pgsql")}
                          className={`px-2 py-1 ${pdnsBackend === "pgsql" ? "bg-dark-600 text-dark-50" : "bg-dark-800 text-dark-400 hover:text-dark-200"}`}
                        >PostgreSQL</button>
                      </div>
                    </div>
                  )}
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
                    onClick={() => install(svc.id, svc.label, svc.id === "powerdns" ? { backend: pdnsBackend } : undefined)}
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

        {/* PowerDNS API Configuration */}
        <div className="border-t border-dark-600 pt-4 mt-2 space-y-3">
          <div className="flex items-center justify-between">
            <h4 className="text-xs font-medium text-dark-200 uppercase font-mono tracking-widest">PowerDNS API Configuration</h4>
            <button
              onClick={() => setShowPdnsGuide(!showPdnsGuide)}
              className="flex items-center gap-1.5 text-xs text-accent-400 hover:text-accent-300 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M11.25 11.25l.041-.02a.75.75 0 011.063.852l-.708 2.836a.75.75 0 001.063.853l.041-.021M21 12a9 9 0 11-18 0 9 9 0 0118 0zm-9-3.75h.008v.008H12V8.25z" />
              </svg>
              {showPdnsGuide ? "Hide guide" : "Setup guide"}
            </button>
          </div>

          {showPdnsGuide && (
            <div className="bg-dark-900 border border-dark-500 p-4 space-y-3 text-sm">
              <p className="text-dark-200">The one-click <span className="text-dark-100 font-medium">Install</span> button above does all of this for you — choose <span className="text-dark-100 font-mono">SQLite</span> (no database server needed, recommended for most setups) or <span className="text-dark-100 font-mono">PostgreSQL</span>, and the API URL + key are generated and saved automatically.</p>
              <p className="text-dark-200 font-medium">Prefer to set it up by hand? SQLite backend:</p>
              <pre className="bg-dark-950 border border-dark-600 p-3 text-xs text-dark-100 font-mono overflow-x-auto whitespace-pre">{`# Install PowerDNS with the SQLite backend
apt install pdns-server pdns-backend-sqlite3 sqlite3

# Create the database from the bundled schema
mkdir -p /var/lib/powerdns
sqlite3 /var/lib/powerdns/pdns.sqlite3 < /usr/share/doc/pdns-backend-sqlite3/schema.sqlite3.sql
chown -R pdns:pdns /var/lib/powerdns`}</pre>
              <p className="text-dark-200 font-medium">Configure <span className="text-dark-100 font-mono">/etc/powerdns/pdns.conf</span>:</p>
              <pre className="bg-dark-950 border border-dark-600 p-3 text-xs text-dark-100 font-mono overflow-x-auto whitespace-pre">{`launch=gsqlite3
gsqlite3-database=/var/lib/powerdns/pdns.sqlite3

# Enable HTTP API
api=yes
api-key=your-secret-key-here
webserver=yes
webserver-address=127.0.0.1
webserver-port=8081
webserver-allow-from=127.0.0.1`}</pre>
              <p className="text-xs text-dark-300">On Ubuntu (and anywhere <span className="font-mono text-dark-200">systemd-resolved</span> is running) port 53 is already taken by the stub resolver on <span className="font-mono text-dark-200">127.0.0.53</span>, so PowerDNS's default wildcard bind fails with <span className="font-mono text-dark-200">Address already in use</span> and the service restart-loops. Add a <span className="font-mono text-dark-200">local-address</span> line listing your real IPs — the one-click installer detects this and does it for you:</p>
              <pre className="bg-dark-950 border border-dark-600 p-3 text-xs text-dark-100 font-mono overflow-x-auto whitespace-pre">{`local-address=YOUR.PUBLIC.IP.HERE,127.0.0.1`}</pre>
              <p className="text-xs text-dark-300">Prefer PostgreSQL? DockPanel's database runs in the <span className="font-mono text-dark-200">dockpanel-postgres</span> container, not on localhost — so <span className="font-mono text-dark-200">sudo -u postgres createdb pdns</span> won't work. Use the one-click installer's PostgreSQL option (it creates the <span className="font-mono text-dark-200">pdns</span> database inside the container for you).</p>
              <p className="text-dark-200 font-medium">Then restart and verify:</p>
              <pre className="bg-dark-950 border border-dark-600 p-3 text-xs text-dark-100 font-mono overflow-x-auto whitespace-pre">{`systemctl restart pdns
curl -s -H "X-API-Key: your-secret-key-here" \\
  http://127.0.0.1:8081/api/v1/servers/localhost | jq .`}</pre>
              <p className="text-xs text-dark-300">After setup, enter the API URL and key below, then create zones from the DNS page.</p>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div>
              <label htmlFor="pdns-url" className="block text-xs font-medium text-dark-100 mb-1">API URL</label>
              <input
                id="pdns-url"
                type="url"
                value={pdnsApiUrl}
                onChange={(e) => setPdnsApiUrl(e.target.value)}
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none font-mono"
                placeholder="http://127.0.0.1:8081"
              />
            </div>
            <div>
              <label htmlFor="pdns-key" className="block text-xs font-medium text-dark-100 mb-1">API Key</label>
              <input
                id="pdns-key"
                type="password"
                value={pdnsApiKey}
                onChange={(e) => setPdnsApiKey(e.target.value)}
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 outline-none font-mono"
                placeholder="PowerDNS API key"
              />
              <p className="text-xs text-dark-300 mt-1">The api-key value from /etc/powerdns/pdns.conf</p>
            </div>
          </div>
          <div className="flex justify-end">
            <button
              onClick={async () => {
                setSaving("pdns");
                setMessage({ text: "", type: "" });
                try {
                  const body: Record<string, string> = { pdns_api_url: pdnsApiUrl };
                  if (pdnsApiKey && pdnsApiKey !== "********") {
                    body.pdns_api_key = pdnsApiKey;
                  }
                  await api.put("/settings", body);
                  setMessage({ text: "PowerDNS settings saved", type: "success" });
                } catch (e) {
                  setMessage({ text: e instanceof Error ? e.message : "Failed", type: "error" });
                } finally {
                  setSaving(null);
                }
              }}
              disabled={saving === "pdns"}
              className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
            >
              {saving === "pdns" ? "Saving..." : "Save PowerDNS Config"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
