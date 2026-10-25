// Moved verbatim from panel/frontend/src/pages/Settings.tsx (email tab, original lines 1251-1378).
// The shell in Settings.tsx keeps all state, loaders and helpers;
// this component destructures exactly the shell identifiers it uses,
// under the same names, so the JSX body below is unchanged.
import type { Dispatch, SetStateAction } from "react";

interface EmailTabProps {
  saving: string | null;
  smtpProvider: string;
  smtpHost: string;
  setSmtpHost: Dispatch<SetStateAction<string>>;
  smtpPort: string;
  setSmtpPort: Dispatch<SetStateAction<string>>;
  smtpUser: string;
  setSmtpUser: Dispatch<SetStateAction<string>>;
  smtpPass: string;
  setSmtpPass: Dispatch<SetStateAction<string>>;
  smtpFrom: string;
  setSmtpFrom: Dispatch<SetStateAction<string>>;
  smtpFromName: string;
  setSmtpFromName: Dispatch<SetStateAction<string>>;
  smtpEncryption: string;
  setSmtpEncryption: Dispatch<SetStateAction<string>>;
  testingEmail: boolean;
  saveSMTP: () => Promise<void>;
  handleTestEmail: () => Promise<void>;
  applyPreset: (provider: string) => void;
}

export function EmailTab({
  saving,
  smtpProvider,
  smtpHost,
  setSmtpHost,
  smtpPort,
  setSmtpPort,
  smtpUser,
  setSmtpUser,
  smtpPass,
  setSmtpPass,
  smtpFrom,
  setSmtpFrom,
  smtpFromName,
  setSmtpFromName,
  smtpEncryption,
  setSmtpEncryption,
  testingEmail,
  saveSMTP,
  handleTestEmail,
  applyPreset
}: EmailTabProps) {
  return (
    <>
        <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600">
            <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">SMTP Configuration</h3>
            <p className="text-xs text-dark-200 mt-0.5">Configure outgoing email for all sites on this server</p>
          </div>
          <div className="p-5 space-y-4">
            {/* Provider Preset */}
            <div>
              <label htmlFor="smtp-provider" className="block text-sm font-medium text-dark-100 mb-1">Provider</label>
              <select
                id="smtp-provider"
                value={smtpProvider}
                onChange={(e) => applyPreset(e.target.value)}
                className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm bg-dark-800 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
              >
                <option value="custom">Custom SMTP</option>
                <option value="mailgun">Mailgun</option>
                <option value="ses">Amazon SES</option>
                <option value="sendgrid">SendGrid</option>
                <option value="resend">Resend</option>
                <option value="gmail">Gmail</option>
                <option value="outlook">Outlook / Microsoft 365</option>
                <option value="zoho">Zoho Mail</option>
              </select>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <label htmlFor="smtp_host" className="block text-sm font-medium text-dark-100 mb-1">Host</label>
                <input
                  id="smtp_host"
                  type="text"
                  value={smtpHost}
                  onChange={(e) => setSmtpHost(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none font-mono"
                  placeholder="smtp.example.com"
                />
              </div>
              <div>
                <label htmlFor="smtp_port" className="block text-sm font-medium text-dark-100 mb-1">Port</label>
                <input
                  id="smtp_port"
                  type="text"
                  value={smtpPort}
                  onChange={(e) => setSmtpPort(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none font-mono"
                  placeholder="587"
                />
              </div>
              <div>
                <label htmlFor="smtp-encryption" className="block text-sm font-medium text-dark-100 mb-1">Encryption</label>
                <select
                  id="smtp-encryption"
                  value={smtpEncryption}
                  onChange={(e) => setSmtpEncryption(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm bg-dark-800 focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                >
                  <option value="starttls">STARTTLS (port 587)</option>
                  <option value="tls">TLS/SSL (port 465)</option>
                  <option value="none">None (port 25)</option>
                </select>
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="smtp_user" className="block text-sm font-medium text-dark-100 mb-1">Username</label>
                <input
                  id="smtp_user"
                  type="text"
                  value={smtpUser}
                  onChange={(e) => setSmtpUser(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                  placeholder="user@example.com"
                />
              </div>
              <div>
                <label htmlFor="smtp_pass" className="block text-sm font-medium text-dark-100 mb-1">Password</label>
                <input
                  id="smtp_pass"
                  type="password"
                  value={smtpPass}
                  onChange={(e) => setSmtpPass(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                  placeholder="Enter password or API key"
                />
              </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label htmlFor="smtp_from" className="block text-sm font-medium text-dark-100 mb-1">From Address</label>
                <input
                  id="smtp_from"
                  type="text"
                  value={smtpFrom}
                  onChange={(e) => setSmtpFrom(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                  placeholder="noreply@example.com"
                />
              </div>
              <div>
                <label htmlFor="smtp_from_name" className="block text-sm font-medium text-dark-100 mb-1">From Name</label>
                <input
                  id="smtp_from_name"
                  type="text"
                  value={smtpFromName}
                  onChange={(e) => setSmtpFromName(e.target.value)}
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500 outline-none"
                  placeholder="DockPanel"
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <button
                onClick={handleTestEmail}
                disabled={testingEmail || !smtpHost}
                className="px-4 py-2 text-sm font-medium text-dark-100 bg-dark-700 rounded-lg hover:bg-dark-600 disabled:opacity-50"
              >
                {testingEmail ? "Sending..." : "Send Test Email"}
              </button>
              <button
                onClick={saveSMTP}
                disabled={saving === "smtp"}
                className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
              >
                {saving === "smtp" ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </div>
    </>
  );
}
