// Moved verbatim from panel/frontend/src/pages/Settings.tsx (subcomponent AcmeSettings).
// Signature unchanged; only the module imports below are new.
import { useState, useEffect } from "react";
import { api } from "../../api";

// ── ACME profile selection ────────────────────────────────────────────
//
// Lets the admin pick the default Let's Encrypt profile new certs use.
// Maps to RFC 8555 + RFC 9773 "profiles" extension. LE currently exposes:
//   classic     — 90-day certs, default
//   tlsserver   — 90-day today; flips to 45-day on 2026-05-13 (opt-in)
//   shortlived  — ~6-day certs, for the highest-automation subscribers
//
// When the CA doesn't advertise profiles, the card hides itself.

interface ProfileMeta { name: string; description: string }
interface AcmeProfilesResp { profiles: ProfileMeta[]; default: string | null }

export function AcmeSettings({ setMessage }: { setMessage: (m: { text: string; type: string }) => void }) {
  const [s, setS] = useState<AcmeProfilesResp | null>(null);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  useEffect(() => {
    api.get<AcmeProfilesResp>("/ssl/profiles")
      .then((r) => { setS(r); setLoadError(null); })
      .catch((e) => setLoadError((e as Error).message || "failed to load"));
  }, []);

  const setProfile = async (profile: string | null) => {
    setSaving(true);
    try {
      await api.post("/ssl/default-profile", { profile });
      setS((prev) => prev ? { ...prev, default: profile } : prev);
      setMessage({ text: profile ? `Default ACME profile: ${profile}` : "Default ACME profile cleared", type: "success" });
    } catch (e) {
      setMessage({ text: `Failed: ${(e as Error).message || "unknown"}`, type: "error" });
    } finally {
      setSaving(false);
    }
  };

  if (loadError) {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600">
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">ACME Profile</h3>
        </div>
        <div className="p-5 text-sm text-dark-300">
          Couldn't reach the ACME directory ({loadError}). The CA's profile list is only available once an admin has an ACME account — this loads after your first SSL issuance.
        </div>
      </div>
    );
  }

  if (!s) {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600">
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">ACME Profile</h3>
        </div>
        <div className="p-5 text-sm text-dark-300">Loading...</div>
      </div>
    );
  }

  if (s.profiles.length === 0) {
    return (
      <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
        <div className="px-5 py-3 border-b border-dark-600">
          <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">ACME Profile</h3>
        </div>
        <div className="p-5 text-sm text-dark-300">
          The configured CA doesn't advertise the ACME profiles extension — DockPanel will request its default profile.
        </div>
      </div>
    );
  }

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">ACME Profile</h3>
        <p className="text-xs text-dark-200 mt-0.5">
          Default profile for new Let's Encrypt certificates. Renewal uses the CA's ARI (RFC 9773) hints, falling back to a profile-aware threshold.
        </p>
      </div>
      <div className="p-5 space-y-3">
        <div className="border border-dark-600 bg-dark-900/50 rounded p-4">
          <div className="text-sm font-medium text-dark-50 mb-2">Default for new certificates</div>
          <div className="flex items-center gap-2">
            <select
              value={s.default ?? ""}
              onChange={(e) => setProfile(e.target.value || null)}
              disabled={saving}
              className="flex-1 bg-dark-900 border border-dark-500 text-dark-50 rounded px-3 py-1.5 text-sm disabled:opacity-50"
            >
              <option value="">CA default</option>
              {s.profiles.map((p) => (
                <option key={p.name} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <p className="text-[10px] text-dark-300 mt-2">
            "CA default" lets Let's Encrypt pick — today that's <span className="font-mono">classic</span> (90-day).
            Existing certs keep their current profile until renewal.
          </p>
        </div>
        <div className="border border-dark-600 bg-dark-900/50 rounded p-4">
          <div className="text-sm font-medium text-dark-50 mb-2">Available profiles</div>
          <div className="space-y-2">
            {s.profiles.map((p) => (
              <div key={p.name} className="flex items-start gap-2 text-xs">
                <span className="font-mono text-rust-400 min-w-20 shrink-0">{p.name}</span>
                <span className="text-dark-200">{p.description}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
