// Moved verbatim from panel/frontend/src/pages/Settings.tsx (subcomponent CredentialEncryptionCard).
// Signature unchanged; only the module imports below are new.
import { useState } from "react";
import { api } from "../../api";

interface ReencryptSubject {
  subject: string;
  examined: number;
  rewritten: number;
  already_current: number;
  unreadable: number;
  raced: number;
}

interface ReencryptResult {
  examined: number;
  rewritten: number;
  unreadable: number;
  raced: number;
  subjects: ReencryptSubject[];
  covered_modules: string[];
}

/// The operator half of SECRETS_ENCRYPTION_KEY.
///
/// Shipping the endpoint without this card would have reproduced the exact
/// shape this session spent its verification budget criticising elsewhere in
/// the panel: a complete, authz-scoped backend reachable only by hand-crafted
/// HTTP, with nothing in the UI able to run it.
export function CredentialEncryptionCard({ setMessage }: { setMessage: (m: { text: string; type: string }) => void }) {
  const [running, setRunning] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [result, setResult] = useState<ReencryptResult | null>(null);

  const run = async () => {
    setConfirming(false);
    setRunning(true);
    try {
      const r = await api.post<ReencryptResult>("/settings/credentials/reencrypt", {});
      setResult(r);
      if (r.unreadable > 0) {
        setMessage({
          text: `${r.rewritten} re-encrypted, but ${r.unreadable} value(s) could not be read and were left untouched`,
          type: "error",
        });
      } else if (r.raced > 0) {
        setMessage({
          text: `${r.rewritten} re-encrypted, but ${r.raced} value(s) changed while this ran and were safely skipped — run it again to pick them up`,
          type: "error",
        });
      } else if (r.rewritten === 0) {
        setMessage({ text: "Everything is already under the current key — nothing to do", type: "success" });
      } else {
        setMessage({ text: `${r.rewritten} credential(s) re-encrypted under the current key`, type: "success" });
      }
    } catch (e) {
      setMessage({ text: e instanceof Error ? e.message : "Re-encryption failed", type: "error" });
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden mt-4">
      <div className="px-5 py-3 border-b border-dark-600">
        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Credential Encryption</h3>
        <p className="text-xs text-dark-200 mt-0.5">Rewrite stored credentials under the current encryption key</p>
      </div>
      <div className="px-5 py-4 space-y-3">
        <p className="text-xs text-dark-300">
          Stored credentials and Secrets Manager values are encrypted with a key derived from{" "}
          <code className="text-dark-100">JWT_SECRET</code>, or from{" "}
          <code className="text-dark-100">SECRETS_ENCRYPTION_KEY</code> when you set one. After changing
          either, run this once so every value is rewritten under the new key — until you do, the panel
          is reading old values through a fallback and the previous key still has to be derivable.
        </p>
        <p className="text-xs text-dark-400">
          Safe to re-run. A value the panel cannot read is reported and left untouched rather than
          overwritten.
        </p>

        {!confirming ? (
          <button
            type="button"
            onClick={() => setConfirming(true)}
            disabled={running}
            className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
          >
            {running ? "Re-encrypting…" : "Re-encrypt credentials"}
          </button>
        ) : (
          <div className="flex items-center gap-2">
            <span className="text-xs text-dark-200">Rewrite every stored credential now?</span>
            <button
              type="button"
              onClick={run}
              className="px-3 py-1.5 bg-rust-500 text-white rounded-lg text-xs font-medium hover:bg-rust-600"
            >
              Yes, re-encrypt
            </button>
            <button
              type="button"
              onClick={() => setConfirming(false)}
              className="px-3 py-1.5 bg-dark-700 text-dark-200 rounded-lg text-xs font-medium hover:bg-dark-600"
            >
              Cancel
            </button>
          </div>
        )}

        {result && (
          <div className="mt-2 border border-dark-600 rounded-lg overflow-hidden">
            <table className="w-full text-xs">
              <thead className="bg-dark-900 text-dark-400">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Store</th>
                  <th className="text-right px-3 py-2 font-medium">Examined</th>
                  <th className="text-right px-3 py-2 font-medium">Rewritten</th>
                  <th className="text-right px-3 py-2 font-medium">Already current</th>
                  <th className="text-right px-3 py-2 font-medium">Unreadable</th>
                  <th className="text-right px-3 py-2 font-medium">Raced</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-dark-700">
                {result.subjects.map((s) => (
                  <tr key={s.subject}>
                    <td className="px-3 py-2 font-mono text-dark-200">{s.subject}</td>
                    <td className="px-3 py-2 text-right text-dark-300">{s.examined}</td>
                    <td className="px-3 py-2 text-right text-dark-100">{s.rewritten}</td>
                    <td className="px-3 py-2 text-right text-dark-400">{s.already_current}</td>
                    <td className={`px-3 py-2 text-right ${s.unreadable > 0 ? "text-danger-400" : "text-dark-400"}`}>
                      {s.unreadable}
                    </td>
                    <td className={`px-3 py-2 text-right ${s.raced > 0 ? "text-warn-400" : "text-dark-400"}`}>
                      {s.raced}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
