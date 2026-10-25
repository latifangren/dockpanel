import { useState, useEffect, useCallback } from "react";
import { api, ApiError } from "../../api";
import type { Database } from "./types";
import { formatBytes } from "./types";

interface DumpFile {
  filename: string;
  size_bytes: number;
  created_at: string;
  /** Present when the file is not a database backup at all (agent's verdict). */
  unsupported?: string;
  /** Present when it IS a backup but cannot go into THIS database (panel's verdict). */
  import_blocked?: string;
}

export default function ImportDatabase({ database, onClose }: { database: Database; onClose: () => void }) {
  const [dumps, setDumps] = useState<DumpFile[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [done, setDone] = useState("");
  const [confirmFile, setConfirmFile] = useState<string | null>(null);
  const [importing, setImporting] = useState<string | null>(null);

  const dir = `/var/backups/dockpanel/databases/${database.name}`;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const list = await api.get<DumpFile[]>(`/databases/${database.id}/dumps`);
      setDumps(Array.isArray(list) ? list : []);
      setError("");
    } catch (e) {
      // Binding and surfacing is the whole point: a listing that fails silently is
      // indistinguishable from a directory with nothing in it, which is exactly the
      // ambiguity this feature exists to remove.
      setError(e instanceof Error ? e.message : "Could not read the dump directory");
    } finally {
      setLoading(false);
    }
  }, [database.id]);

  useEffect(() => {
    load();
  }, [load]);

  const handleImport = async (filename: string) => {
    if (confirmFile !== filename) {
      setConfirmFile(filename);
      return;
    }
    setConfirmFile(null);
    setError("");
    setNotice("");
    setDone("");
    setImporting(filename);
    try {
      await api.post(`/databases/${database.id}/import`, { filename });
      setDone(`Imported ${filename} into ${database.name}.`);
    } catch (e) {
      // A 504 here is the panel giving up on WATCHING, not the import failing — the
      // backend says so in as many words and the operator must not be told to retry, so
      // it gets its own tone rather than the red banner that means "this did not happen".
      if (e instanceof ApiError && (e.status === 504 || e.status === 524)) {
        setNotice(
          e.status === 524
            ? `The import is still running on the server — it was NOT cancelled and must not be started again. The connection was cut by Cloudflare at 100 seconds, which is shorter than the panel's own limit. Browse the tables in a few minutes to see it finish.`
            : e.message
        );
      } else {
        setError(e instanceof Error ? e.message : "Import failed");
      }
    } finally {
      setImporting(null);
    }
  };

  const importable = dumps.filter((d) => !d.unsupported && !d.import_blocked);
  const rejected = dumps.filter((d) => d.unsupported || d.import_blocked);

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-dark-600">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-dark-300 border border-dark-600 rounded-lg hover:text-dark-100 hover:border-dark-400 transition-colors">
          &larr; Back
        </button>
        <h1 className="text-sm font-medium text-dark-300 uppercase font-mono tracking-widest">Import</h1>
        <span className="text-sm font-mono text-dark-50">{database.name}</span>
        <span className="px-2 py-0.5 bg-dark-700 text-dark-200 rounded text-xs font-medium">{database.engine}</span>
      </div>

      <div className="bg-dark-800 border border-dark-600 rounded-lg p-4 mb-5">
        <p className="text-sm text-dark-200">
          Put the dump on the server yourself, then pick it here. The file manager is not the
          route: an upload travels base64-encoded inside a JSON body and tops out around 1.5 MB,
          which no real dump fits inside.
        </p>
        <p className="text-xs text-dark-400 mt-2">
          Copy it into <code className="text-dark-200">{dir}</code> over SSH, as root:
        </p>
        <pre className="mt-2 px-3 py-2 bg-dark-900 border border-dark-600 rounded text-xs font-mono text-dark-200 overflow-x-auto">
{`mkdir -p ${dir}
scp dump.sql.gz root@server:${dir}/
chmod 600 ${dir}/dump.sql.gz`}
        </pre>
        <p className="text-xs text-dark-400 mt-2">
          The directory only exists once this database has been backed up at least once, so
          create it if it is missing. It is root-owned and re-tightened to{" "}
          <code className="text-dark-200">0700</code> every time the agent starts.{" "}
          <code className="text-dark-200">/tmp/</code> will not work: the agent runs with a
          private <code className="text-dark-200">/tmp</code> and cannot see the host's.
        </p>
      </div>

      {error && <div className="bg-danger-500/10 text-danger-400 text-sm px-4 py-3 rounded-lg border border-danger-500/20 mb-4">{error}</div>}
      {notice && <div className="bg-warn-500/10 text-warn-400 text-sm px-4 py-3 rounded-lg border border-warn-500/20 mb-4">{notice}</div>}
      {done && <div className="bg-accent-500/10 text-accent-400 text-sm px-4 py-3 rounded-lg border border-accent-500/20 mb-4">{done}</div>}

      {loading && <p className="text-dark-400 text-sm">Reading {dir}...</p>}

      {!loading && !error && importable.length === 0 && rejected.length === 0 && (
        <div className="bg-dark-800 rounded-lg border border-dark-500 p-12 text-center">
          <p className="text-dark-200 font-medium">Nothing here to import</p>
          <p className="text-dark-300 text-sm mt-2 max-w-md mx-auto">
            No <code className="text-dark-200">.sql.gz</code> or{" "}
            <code className="text-dark-200">.archive.gz</code> file is in{" "}
            <code className="text-dark-200">{dir}</code>. Copy one there with the commands above,
            then refresh.
          </p>
          <button
            onClick={load}
            className="mt-4 px-3 py-1.5 rounded text-xs font-medium bg-dark-700 text-dark-200 hover:bg-dark-600 transition-colors"
          >
            Refresh
          </button>
        </div>
      )}

      {!loading && importable.length > 0 && (
        <div className="bg-dark-800 rounded-lg border border-dark-600 overflow-hidden">
          <div className="px-5 py-3 border-b border-dark-600 flex items-center justify-between">
            <span className="text-xs uppercase tracking-widest font-mono text-dark-400">Available dumps</span>
            <button
              onClick={load}
              className="px-2 py-1 rounded text-xs font-medium bg-dark-700 text-dark-200 hover:bg-dark-600 transition-colors"
            >
              Refresh
            </button>
          </div>
          {importable.map((d) => (
            <div key={d.filename} className="px-5 py-3 border-b border-dark-700 last:border-0 flex items-center justify-between gap-3">
              <div className="min-w-0">
                <div className="text-sm font-mono text-dark-50 truncate">{d.filename}</div>
                <div className="text-xs text-dark-400 mt-0.5">
                  {formatBytes(d.size_bytes)} &middot; {d.created_at}
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {confirmFile === d.filename ? (
                  <>
                    <span className="text-xs text-danger-400">Replace data in {database.name}?</span>
                    <button
                      onClick={() => handleImport(d.filename)}
                      disabled={importing !== null}
                      className="px-2 py-1 bg-danger-600 text-white rounded text-xs hover:bg-danger-700 disabled:opacity-50"
                    >
                      {importing === d.filename ? "..." : "Yes"}
                    </button>
                    <button
                      onClick={() => setConfirmFile(null)}
                      className="px-2 py-1 bg-dark-600 text-dark-100 rounded text-xs hover:bg-dark-500"
                    >
                      No
                    </button>
                  </>
                ) : (
                  <button
                    onClick={() => handleImport(d.filename)}
                    disabled={importing !== null}
                    className="px-2 py-1 rounded text-xs font-medium bg-rust-500/15 text-rust-400 hover:bg-rust-500/25 disabled:opacity-50 transition-colors"
                  >
                    {importing === d.filename ? "Importing..." : "Import"}
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {rejected.length > 0 && (
        <div className="bg-dark-800 rounded-lg border border-dark-600 overflow-hidden mt-5">
          <div className="px-5 py-3 border-b border-dark-600">
            <span className="text-xs uppercase tracking-widest font-mono text-dark-400">
              In the directory, but not importable
            </span>
          </div>
          {rejected.map((d) => (
            <div key={d.filename} className="px-5 py-3 border-b border-dark-700 last:border-0">
              <div className="text-sm font-mono text-dark-300 truncate">{d.filename}</div>
              <div className="text-xs text-warn-400 mt-1">{d.unsupported || d.import_blocked}</div>
            </div>
          ))}
        </div>
      )}

      {importing && (
        <p className="text-xs text-dark-400 mt-4">
          Importing streams the dump straight into the database container. Large dumps can take
          several minutes — leave this page open.
        </p>
      )}
    </div>
  );
}
