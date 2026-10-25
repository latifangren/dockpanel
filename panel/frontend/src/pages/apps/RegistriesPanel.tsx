import type { Dispatch, SetStateAction } from "react";

// Moved verbatim from pages/Apps.tsx (shell identifiers passed as props,
// destructured under the same names, so the body below is unchanged).
export function RegistriesPanel({
  handleRegistryLogin,
  handleRegistryLogout,
  regLoading,
  regPassword,
  regServer,
  regUsername,
  registries,
  setRegPassword,
  setRegServer,
  setRegUsername,
  setShowRegistries
}: {
  handleRegistryLogin: () => void;
  handleRegistryLogout: (server: string) => void;
  regLoading: boolean;
  regPassword: string;
  regServer: string;
  regUsername: string;
  registries: string[];
  setRegPassword: Dispatch<SetStateAction<string>>;
  setRegServer: Dispatch<SetStateAction<string>>;
  setRegUsername: Dispatch<SetStateAction<string>>;
  setShowRegistries: Dispatch<SetStateAction<boolean>>
}) {
  return (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 dp-modal-overlay"
          onKeyDown={(e) => { if (e.key === "Escape") setShowRegistries(false); }}
        >
          <div className="bg-dark-800 rounded-lg shadow-xl p-6 w-full max-w-lg max-h-[80vh] overflow-y-auto border border-dark-500 dp-modal">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">
                Private Registries
              </h3>
              <button onClick={() => setShowRegistries(false)} className="text-dark-300 hover:text-dark-50">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>

            {/* Configured registries */}
            {registries.length > 0 && (
              <div className="mb-4">
                <p className="text-xs font-medium text-dark-200 mb-2">Configured Registries</p>
                <div className="space-y-1.5">
                  {registries.map((reg) => (
                    <div key={reg} className="flex items-center justify-between bg-dark-900 rounded px-3 py-2 border border-dark-600">
                      <span className="text-xs font-mono text-dark-100">{reg}</span>
                      <button
                        onClick={() => handleRegistryLogout(reg)}
                        className="text-xs text-danger-400 hover:text-danger-300"
                      >
                        Logout
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Login form */}
            <div className="border-t border-dark-600 pt-4">
              <p className="text-xs font-medium text-dark-200 mb-3">Add Registry</p>
              <div className="space-y-3">
                <input
                  type="text"
                  value={regServer}
                  onChange={(e) => setRegServer(e.target.value)}
                  placeholder="registry.example.com"
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm font-mono focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                />
                <input
                  type="text"
                  value={regUsername}
                  onChange={(e) => setRegUsername(e.target.value)}
                  placeholder="Username"
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                />
                <input
                  type="password"
                  value={regPassword}
                  onChange={(e) => setRegPassword(e.target.value)}
                  placeholder="Password or token"
                  className="w-full px-3 py-2 border border-dark-500 rounded-lg text-sm focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                />
                <button
                  onClick={handleRegistryLogin}
                  disabled={regLoading || !regServer || !regUsername || !regPassword}
                  className="w-full px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600 disabled:opacity-50"
                >
                  {regLoading ? "Logging in..." : "Login"}
                </button>
              </div>
              <p className="text-[10px] text-dark-300 mt-3">
                Registry credentials persist on the server. Images from private registries can be used in templates and compose deployments.
              </p>
            </div>
          </div>
        </div>
  );
}
