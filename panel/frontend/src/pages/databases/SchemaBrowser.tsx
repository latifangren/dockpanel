import { useState, useEffect } from "react";
import { api } from "../../api";
import type { Database, QueryResult } from "./types";

interface SchemaOverview {
  tables?: QueryResult;
  foreign_keys?: QueryResult;
}

export default function SchemaBrowser({ database, onClose }: { database: Database; onClose: () => void }) {
  const [overview, setOverview] = useState<SchemaOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [tableSchema, setTableSchema] = useState<QueryResult | null>(null);
  const [tableIndexes, setTableIndexes] = useState<QueryResult | null>(null);
  const [detailError, setDetailError] = useState("");

  useEffect(() => {
    (async () => {
      try {
        const data = await api.get<SchemaOverview>(`/databases/${database.id}/schema-overview`);
        setOverview(data);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Failed to load schema");
      } finally {
        setLoading(false);
      }
    })();
  }, [database.id]);

  // Settled, not all-or-nothing, and never silent. These are two independent
  // endpoints against two independent statements; sharing one `Promise.all` meant
  // the first rejection discarded the other's result, so when the columns query
  // broke in `29d959b` it took the working index pane down with it. And the
  // rejection landed in a bare `catch {}`, which is why five months of a dead pane
  // produced not one report: the panes render empty either way, so an empty pane
  // could mean "no columns", "request failed" or "never asked".
  const loadTableDetails = async (table: string) => {
    setSelectedTable(table);
    setTableSchema(null);
    setTableIndexes(null);
    setDetailError("");

    const [schema, indexes] = await Promise.allSettled([
      api.get<QueryResult>(`/databases/${database.id}/tables/${encodeURIComponent(table)}`),
      api.get<QueryResult>(`/databases/${database.id}/indexes/${encodeURIComponent(table)}`),
    ]);

    if (schema.status === "fulfilled") setTableSchema(schema.value);
    if (indexes.status === "fulfilled") setTableIndexes(indexes.value);

    const failed = [
      schema.status === "rejected" ? "columns" : null,
      indexes.status === "rejected" ? "indexes" : null,
    ].filter(Boolean);
    if (failed.length) {
      const reason = [schema, indexes].find(r => r.status === "rejected") as PromiseRejectedResult;
      const detail = reason.reason instanceof Error ? reason.reason.message : "request failed";
      setDetailError(`Could not load ${failed.join(" or ")} for ${table}: ${detail}`);
    }
  };

  const tables = overview?.tables?.rows || [];
  const fks = overview?.foreign_keys?.rows || [];
  const fkCols = overview?.foreign_keys?.columns || [];

  // Map FK columns to named fields
  const srcTableIdx = fkCols.indexOf("source_table");
  const srcColIdx = fkCols.indexOf("source_column");
  const tgtTableIdx = fkCols.indexOf("target_table");
  const tgtColIdx = fkCols.indexOf("target_column");

  return (
    <div className="animate-fade-up">
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-dark-600">
        <button onClick={onClose} className="px-3 py-1.5 text-sm text-dark-300 border border-dark-600 rounded-lg hover:text-dark-100 hover:border-dark-400 transition-colors">
          &larr; Back
        </button>
        <h1 className="text-sm font-medium text-dark-300 uppercase font-mono tracking-widest">Schema Browser</h1>
        <span className="text-sm font-mono text-dark-50">{database.name}</span>
        <span className="px-2 py-0.5 bg-dark-700 text-dark-200 rounded text-xs font-medium">{database.engine}</span>
      </div>

      {loading && <p className="text-dark-400 text-sm">Loading schema...</p>}
      {error && <div className="bg-danger-500/10 text-danger-400 text-sm px-4 py-3 rounded-lg border border-danger-500/20">{error}</div>}

      {!loading && !error && (
        <div className="flex gap-4" style={{ minHeight: "calc(100vh - 220px)" }}>
          {/* Left: Table list */}
          <div className="w-56 shrink-0 bg-dark-800 rounded-lg border border-dark-500 overflow-hidden flex flex-col">
            <div className="px-3 py-2.5 border-b border-dark-600">
              <span className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">
                Tables ({tables.length})
              </span>
            </div>
            <div className="overflow-y-auto flex-1 py-1">
              {tables.map((row: string[]) => {
                const name = row[0];
                const rowCount = row[2] || "0";
                const sizeKb = row[3] || "0";
                const hasFk = fks.some((fk: string[]) => fk[srcTableIdx] === name || fk[tgtTableIdx] === name);
                return (
                  <button
                    key={name}
                    onClick={() => loadTableDetails(name)}
                    className={`w-full text-left px-3 py-2 text-sm hover:bg-dark-700 transition-colors flex items-center justify-between ${
                      selectedTable === name ? "bg-dark-700 text-dark-50" : "text-dark-200"
                    }`}
                  >
                    <span className="flex items-center gap-1.5 truncate">
                      {hasFk && <span className="w-1.5 h-1.5 rounded-full bg-rust-400 shrink-0" title="Has relationships" />}
                      {name}
                    </span>
                    <span className="text-xs text-dark-400 shrink-0 ml-2">{rowCount}r</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: Table detail + relationships */}
          <div className="flex-1 space-y-4">
            {selectedTable && (tableSchema || tableIndexes || detailError) ? (
              <>
                {detailError && (
                  <div className="bg-danger-500/10 text-danger-400 text-sm px-4 py-3 rounded-lg border border-danger-500/20">
                    {detailError}
                  </div>
                )}

                {tableSchema && (
                <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
                  <div className="px-4 py-3 border-b border-dark-600 flex items-center justify-between">
                    <h3 className="text-sm font-medium text-dark-100 font-mono">{selectedTable}</h3>
                    <span className="text-xs text-dark-400">{tableSchema.rows?.length || 0} columns</span>
                  </div>
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-dark-600 bg-dark-700/50">
                        <th className="text-left px-4 py-2 text-xs text-dark-300 uppercase">Column</th>
                        <th className="text-left px-4 py-2 text-xs text-dark-300 uppercase">Type</th>
                        <th className="text-left px-4 py-2 text-xs text-dark-300 uppercase">Nullable</th>
                        <th className="text-left px-4 py-2 text-xs text-dark-300 uppercase">Default</th>
                        {database.engine !== "postgres" && <th className="text-left px-4 py-2 text-xs text-dark-300 uppercase">Key</th>}
                      </tr>
                    </thead>
                    <tbody>
                      {(tableSchema.rows || []).map((col: string[], i: number) => (
                        <tr key={i} className="border-b border-dark-700 hover:bg-dark-700/30">
                          <td className="px-4 py-2 font-mono text-dark-100">{col[0]}</td>
                          <td className="px-4 py-2 font-mono text-accent-400">{col[1]}</td>
                          <td className="px-4 py-2 text-dark-300">{col[database.engine === "postgres" ? 3 : 2] === "YES" ? "Yes" : "No"}</td>
                          <td className="px-4 py-2 text-dark-400 font-mono text-xs">{col[database.engine === "postgres" ? 4 : 3] || "-"}</td>
                          {database.engine !== "postgres" && <td className="px-4 py-2 text-rust-400">{col[4] || ""}</td>}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                )}

                {/* Indexes. Rendered independently of the columns pane above — they are
                    separate endpoints and one must not be able to blank the other. */}
                {tableIndexes && tableIndexes.rows?.length > 0 && (
                  <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
                    <div className="px-4 py-3 border-b border-dark-600">
                      <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Indexes</h3>
                    </div>
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="border-b border-dark-600 bg-dark-700/50">
                          {(tableIndexes.columns || []).map((c: string, i: number) => (
                            <th key={i} className="text-left px-4 py-2 text-xs text-dark-300 uppercase">{c}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {(tableIndexes.rows || []).map((row: string[], i: number) => (
                          <tr key={i} className="border-b border-dark-700">
                            {row.map((cell: string, j: number) => (
                              <td key={j} className="px-4 py-2 font-mono text-dark-200 text-xs">{cell}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                {/* Foreign Keys involving this table */}
                {(() => {
                  const relatedFks = fks.filter((fk: string[]) => fk[srcTableIdx] === selectedTable || fk[tgtTableIdx] === selectedTable);
                  if (relatedFks.length === 0) return null;
                  return (
                    <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-hidden">
                      <div className="px-4 py-3 border-b border-dark-600">
                        <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">Relationships</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        {relatedFks.map((fk: string[], i: number) => (
                          <div key={i} className="flex items-center gap-2 text-sm">
                            <span className="font-mono text-dark-100">{fk[srcTableIdx]}</span>
                            <span className="text-dark-400">.</span>
                            <span className="font-mono text-accent-400">{fk[srcColIdx]}</span>
                            <svg className="w-4 h-4 text-rust-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                            <span className="font-mono text-dark-100">{fk[tgtTableIdx]}</span>
                            <span className="text-dark-400">.</span>
                            <span className="font-mono text-accent-400">{fk[tgtColIdx]}</span>
                            {fk[4] && <span className="text-xs text-dark-400 ml-2">({fk[4]})</span>}
                          </div>
                        ))}
                      </div>
                    </div>
                  );
                })()}
              </>
            ) : (
              <div className="bg-dark-800 rounded-lg border border-dark-500 p-8 text-center">
                <p className="text-dark-400 text-sm">Select a table to view its schema, indexes, and relationships.</p>
                {fks.length > 0 && (
                  <div className="mt-6 text-left">
                    <h3 className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest mb-3">All Relationships ({fks.length})</h3>
                    <div className="space-y-1.5">
                      {fks.map((fk: string[], i: number) => (
                        <div key={i} className="flex items-center gap-2 text-sm">
                          <button onClick={() => loadTableDetails(fk[srcTableIdx])} className="font-mono text-dark-100 hover:text-rust-400">{fk[srcTableIdx]}</button>
                          <span className="text-dark-400">.</span>
                          <span className="font-mono text-accent-400">{fk[srcColIdx]}</span>
                          <svg className="w-3 h-3 text-dark-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M14 5l7 7m0 0l-7 7m7-7H3" /></svg>
                          <button onClick={() => loadTableDetails(fk[tgtTableIdx])} className="font-mono text-dark-100 hover:text-rust-400">{fk[tgtTableIdx]}</button>
                          <span className="text-dark-400">.</span>
                          <span className="font-mono text-accent-400">{fk[tgtColIdx]}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
