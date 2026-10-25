// Moved verbatim from panel/frontend/src/pages/Settings.tsx (subcomponent AcmeContactSettings).
// Signature unchanged; only the module imports below are new.
import { useState, useEffect } from "react";
import { api } from "../../api";

// ── ACME contact address ──────────────────────────────────────────────
//
// The panel hands an email to Let's Encrypt as the account contact. Until
// v2.28.0 that was silently the operator's panel login address, unvalidated —
// so registering the panel as e.g. admin@box.test made the CA refuse the
// contact and EVERY certificate fail, with no reason in the UI and none in
// journalctl either. This card makes the address visible, says plainly whether
// it works, and lets an admin set a usable one without changing their login.

interface AcmeContactResp {
  contact_email: string | null;
  login_email: string;
  login_email_usable: boolean;
  effective_contact: string | null;
  contact_problem: string | null;
}

export function AcmeContactSettings({ setMessage }: { setMessage: (m: { text: string; type: string }) => void }) {
  const [s, setS] = useState<AcmeContactResp | null>(null);
  const [draft, setDraft] = useState("");
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = () => {
    api.get<AcmeContactResp>("/ssl/contact-email")
      .then((r) => { setS(r); setDraft(r.contact_email ?? ""); setLoadError(null); })
      .catch((e) => setLoadError((e as Error).message || "failed to load"));
  };

  useEffect(load, []);

  const save = async (email: string | null) => {
    setSaving(true);
    try {
      await api.post("/ssl/contact-email", { email });
      load();
      setMessage({
        text: email ? `ACME contact address set to ${email}` : "ACME contact address cleared",
        type: "success",
      });
    } catch (e) {
      setMessage({ text: `Failed: ${(e as Error).message || "unknown"}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">ACME Contact</h3>
        <p className="text-xs text-dark-200 mt-0.5">
          The address DockPanel registers with Let's Encrypt. Certificates cannot be issued without one the CA accepts.
        </p>
      </div>
      <div className="p-5 space-y-3">
        {loadError && (
          <div role="alert" className="text-sm text-danger-400">Couldn't load the ACME contact ({loadError}).</div>
        )}
        {!s && !loadError && <div className="text-sm text-dark-300">Loading...</div>}
        {s && (
          <>
            {s.contact_problem ? (
              <div role="alert" className="border border-danger-500/30 bg-danger-500/10 rounded p-4">
                <div className="text-sm font-medium text-danger-400 mb-1">SSL cannot be issued right now</div>
                <p className="text-xs text-danger-400/90">{s.contact_problem}</p>
              </div>
            ) : (
              <div className="border border-dark-600 bg-dark-900/50 rounded p-4">
                <div className="text-sm font-medium text-dark-50 mb-1">Certificates are requested as</div>
                <p className="text-xs font-mono text-rust-400">{s.effective_contact}</p>
                <p className="text-[10px] text-dark-300 mt-2">
                  {s.contact_email
                    ? "From the panel-wide contact address below."
                    : <>Your login address (<span className="font-mono">{s.login_email}</span>). Set an override below to use a different one.</>}
                </p>
              </div>
            )}

            {!s.login_email_usable && (
              <p className="text-xs text-warn-400">
                Your login address <span className="font-mono">{s.login_email}</span> can't be used as a Let's Encrypt
                contact, so the panel-wide address below is required.
              </p>
            )}

            <div className="border border-dark-600 bg-dark-900/50 rounded p-4">
              <label htmlFor="acme-contact" className="block text-sm font-medium text-dark-50 mb-2">
                Panel-wide contact address
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="acme-contact"
                  type="email"
                  value={draft}
                  onChange={(e) => setDraft(e.target.value)}
                  placeholder={s.login_email_usable ? s.login_email : "you@yourdomain.com"}
                  className="flex-1 bg-dark-900 border border-dark-500 text-dark-50 rounded px-3 py-1.5 text-sm disabled:opacity-50"
                  disabled={saving}
                />
                <button
                  type="button"
                  onClick={() => save(draft.trim() || null)}
                  disabled={saving || draft.trim() === (s.contact_email ?? "")}
                  className="px-3 py-1.5 bg-rust-500 text-white rounded text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
                >
                  {saving ? "Saving..." : "Save"}
                </button>
                {s.contact_email && (
                  <button
                    type="button"
                    onClick={() => { setDraft(""); save(null); }}
                    disabled={saving}
                    className="px-3 py-1.5 bg-dark-700 text-dark-100 rounded text-sm font-medium hover:bg-dark-600 disabled:opacity-50"
                  >
                    Clear
                  </button>
                )}
              </div>
              <p className="text-[10px] text-dark-300 mt-2">
                Leave empty to use each user's own login address. Reserved domains
                (<span className="font-mono">.test</span>, <span className="font-mono">.local</span>,
                {" "}<span className="font-mono">.internal</span>, …) are rejected — Let's Encrypt refuses them.
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
