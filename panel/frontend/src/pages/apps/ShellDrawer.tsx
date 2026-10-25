import type { Dispatch, RefObject, SetStateAction } from "react";
import { api } from "../../api";

// Moved verbatim from pages/Apps.tsx (shell identifiers passed as props,
// destructured under the same names, so the body below is unchanged).
export function ShellDrawer({
  setShellCmd,
  setShellContainer,
  setShellOutput,
  shellCmd,
  shellContainer,
  shellInfo,
  shellInfoLoading,
  shellOutput,
  shellOutputRef
}: {
  setShellCmd: Dispatch<SetStateAction<string>>;
  setShellContainer: Dispatch<SetStateAction<{ id: string; name: string } | null>>;
  setShellOutput: Dispatch<SetStateAction<string>>;
  shellCmd: string;
  shellContainer: { id: string; name: string };
  shellInfo: { has_bash: boolean; has_sh: boolean } | null;
  shellInfoLoading: boolean;
  shellOutput: string;
  shellOutputRef: RefObject<HTMLDivElement | null>
}) {
  return (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 dp-modal-overlay">
          <div className="bg-dark-800 rounded-lg border border-dark-500 w-full max-w-2xl max-h-[80vh] flex flex-col dp-modal">
            <div className="px-4 py-3 border-b border-dark-600 flex justify-between items-center">
              <div className="flex items-center gap-2">
                <svg className="w-4 h-4 text-dark-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M8 9l3 3-3 3m5 0h3M5 20h14a2 2 0 002-2V6a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" /></svg>
                <h3 className="text-sm font-medium text-dark-100 font-mono">{shellContainer.name}</h3>
                <span className="text-[10px] text-dark-300">30s timeout per command</span>
              </div>
              <button onClick={() => setShellContainer(null)} className="text-dark-300 hover:text-dark-100">
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              </button>
            </div>
            <div ref={shellOutputRef} className="flex-1 overflow-y-auto p-4 bg-dark-950 font-mono text-xs text-dark-200 whitespace-pre-wrap min-h-[300px]">
              {shellOutput || "Type a command and press Enter.\n"}
            </div>
            {shellInfo && !shellInfo.has_bash && !shellInfo.has_sh && (
              <div className="px-4 py-2 border-t border-dark-600 bg-danger-500/10 text-danger-400 text-xs">
                No shell available in this image — neither bash nor sh could be found.
              </div>
            )}
            <div className="px-4 py-3 border-t border-dark-600 flex gap-2 items-center">
              <span className="text-rust-400 font-mono text-sm">$</span>
              <input
                value={shellCmd}
                onChange={(e) => setShellCmd(e.target.value)}
                disabled={!!shellInfo && !shellInfo.has_bash && !shellInfo.has_sh}
                onKeyDown={async (e) => {
                  if (e.key === "Enter" && shellCmd.trim()) {
                    const cmd = shellCmd;
                    setShellCmd("");
                    setShellOutput((prev) => prev + `$ ${cmd}\n`);
                    try {
                      const result = await api.post<{ stdout?: string; stderr?: string; exit_code?: number }>(`/apps/${shellContainer.id}/exec`, { command: cmd });
                      setShellOutput((prev) => prev + (result.stdout || "") + (result.stderr ? result.stderr : "") + "\n");
                    } catch (err) {
                      setShellOutput((prev) => prev + `Error: ${err}\n`);
                    }
                  }
                }}
                placeholder={shellInfoLoading ? "Checking shell availability..." : "Enter command..."}
                autoFocus
                className="flex-1 bg-transparent text-dark-100 font-mono text-sm outline-none disabled:opacity-50"
              />
            </div>
          </div>
        </div>
  );
}
