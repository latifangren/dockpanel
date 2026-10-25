import { useState, useEffect, useRef, useCallback } from "react";
import { api } from "../../api";
import type { Database, QueryResult } from "./types";
import { engineLabels } from "./types";

export default function SqlBrowser({
  database,
  onClose,
}: {
  database: Database;
  onClose: () => void;
}) {
  const [tables, setTables] = useState<string[]>([]);
  const [tablesLoading, setTablesLoading] = useState(true);
  const [selectedTable, setSelectedTable] = useState<string | null>(null);
  const [sql, setSql] = useState("");
  const [result, setResult] = useState<QueryResult | null>(null);
  const [queryLoading, setQueryLoading] = useState(false);
  const [queryError, setQueryError] = useState("");
  const [history, setHistory] = useState<string[]>([]);
  const [historyIdx, setHistoryIdx] = useState(-1);
  const editorRef = useRef<HTMLTextAreaElement>(null);

  const engine = database.engine;
  const q = engine === "postgres" ? '"' : "`";

  const loadTables = useCallback(async () => {
    setTablesLoading(true);
    try {
      const res = await api.get<QueryResult>(
        `/databases/${database.id}/tables`
      );
      setTables(res.rows.map((r) => r[0]));
    } catch (e) {
      setQueryError(e instanceof Error ? e.message : "Failed to load tables");
    } finally {
      setTablesLoading(false);
    }
  }, [database.id]);

  useEffect(() => {
    loadTables();
  }, [loadTables]);

  const executeQuery = useCallback(
    async (queryStr?: string) => {
      const toRun = queryStr || sql;
      if (!toRun.trim()) return;

      setQueryLoading(true);
      setQueryError("");
      setResult(null);
      try {
        const res = await api.post<QueryResult>(
          `/databases/${database.id}/query`,
          { sql: toRun }
        );
        setResult(res);
        // Add to history (deduplicate)
        setHistory((prev) => {
          const deduped = prev.filter((h) => h !== toRun);
          return [toRun, ...deduped].slice(0, 50);
        });
        setHistoryIdx(-1);
      } catch (e) {
        setQueryError(e instanceof Error ? e.message : "Query failed");
      } finally {
        setQueryLoading(false);
      }
    },
    [database.id, sql]
  );

  const selectTable = (table: string) => {
    setSelectedTable(table);
    const query = `SELECT * FROM ${q}${table}${q} LIMIT 100`;
    setSql(query);
    executeQuery(query);
  };

  const showSchema = async (table: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setSelectedTable(table);
    setQueryLoading(true);
    setQueryError("");
    try {
      const res = await api.get<QueryResult>(
        `/databases/${database.id}/tables/${encodeURIComponent(table)}`
      );
      setResult(res);
      setSql("");
    } catch (err) {
      setQueryError(
        err instanceof Error ? err.message : "Failed to load schema"
      );
    } finally {
      setQueryLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if ((e.ctrlKey || e.metaKey) && e.key === "Enter") {
      e.preventDefault();
      executeQuery();
    }
    // History navigation with Ctrl+Up/Down
    if (e.ctrlKey && e.key === "ArrowUp" && history.length > 0) {
      e.preventDefault();
      const next = Math.min(historyIdx + 1, history.length - 1);
      setHistoryIdx(next);
      setSql(history[next]);
    }
    if (e.ctrlKey && e.key === "ArrowDown" && historyIdx > 0) {
      e.preventDefault();
      const next = historyIdx - 1;
      setHistoryIdx(next);
      setSql(history[next]);
    }
  };

  return (
    <div className="animate-fade-up">
      {/* Header */}
      <div className="flex items-center gap-3 mb-5 pb-4 border-b border-dark-600">
        <button
          onClick={onClose}
          className="px-3 py-1.5 text-sm text-dark-300 border border-dark-600 rounded-lg hover:text-dark-100 hover:border-dark-400 transition-colors"
        >
          &larr; Back
        </button>
        <h1 className="text-sm font-medium text-dark-300 uppercase font-mono tracking-widest">
          SQL Browser
        </h1>
        <span className="text-sm font-mono text-dark-50">{database.name}</span>
        <span className="px-2 py-0.5 bg-dark-700 text-dark-200 rounded text-xs font-medium">
          {engineLabels[engine] || engine}
        </span>
      </div>

      {/* Two-column layout */}
      <div className="flex gap-4" style={{ minHeight: "calc(100vh - 220px)" }}>
        {/* Left: Tables sidebar */}
        <div className="w-52 shrink-0 bg-dark-800 rounded-lg border border-dark-500 overflow-hidden flex flex-col">
          <div className="px-3 py-2.5 border-b border-dark-600 flex items-center justify-between">
            <span className="text-xs font-medium text-dark-300 uppercase font-mono tracking-widest">
              Tables
            </span>
            <button
              onClick={loadTables}
              className="text-dark-400 hover:text-dark-200 transition-colors"
              title="Refresh tables"
            >
              <svg
                className="w-3.5 h-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M16.023 9.348h4.992v-.001M2.985 19.644v-4.992m0 0h4.992m-4.993 0 3.181 3.183a8.25 8.25 0 0 0 13.803-3.7M4.031 9.865a8.25 8.25 0 0 1 13.803-3.7l3.181 3.182"
                />
              </svg>
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-1.5">
            {tablesLoading ? (
              <div className="space-y-1.5 p-2">
                {[...Array(5)].map((_, i) => (
                  <div
                    key={i}
                    className="h-5 bg-dark-700 rounded animate-pulse"
                  />
                ))}
              </div>
            ) : tables.length === 0 ? (
              <div className="text-center text-dark-400 text-xs py-6">
                No tables found
              </div>
            ) : (
              tables.map((t) => (
                <div
                  key={t}
                  onClick={() => selectTable(t)}
                  className={`group flex items-center justify-between px-2.5 py-1.5 rounded cursor-pointer text-sm font-mono transition-colors ${
                    selectedTable === t
                      ? "bg-dark-600 text-dark-50"
                      : "text-dark-200 hover:bg-dark-700"
                  }`}
                >
                  <span className="truncate">{t}</span>
                  <button
                    onClick={(e) => showSchema(t, e)}
                    title="View schema"
                    className="opacity-0 group-hover:opacity-100 text-dark-400 hover:text-dark-200 transition-opacity shrink-0 ml-1"
                  >
                    <svg
                      className="w-3.5 h-3.5"
                      fill="none"
                      viewBox="0 0 24 24"
                      stroke="currentColor"
                      strokeWidth={2}
                    >
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        d="m11.25 11.25.041-.02a.75.75 0 0 1 1.063.852l-.708 2.836a.75.75 0 0 0 1.063.853l.041-.021M21 12a9 9 0 1 1-18 0 9 9 0 0 1 18 0Zm-9-3.75h.008v.008H12V8.25Z"
                      />
                    </svg>
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right: Editor + Results */}
        <div className="flex-1 min-w-0 flex flex-col gap-4">
          {/* SQL Editor */}
          <div className="bg-dark-800 rounded-lg border border-dark-500 p-3">
            <textarea
              ref={editorRef}
              value={sql}
              onChange={(e) => setSql(e.target.value)}
              onKeyDown={handleKeyDown}
              className="w-full h-28 bg-dark-900 border border-dark-500 rounded-lg p-3 text-sm font-mono text-dark-100 resize-y focus:outline-none focus:border-dark-400 placeholder-dark-500"
              placeholder="SELECT * FROM ..."
              spellCheck={false}
            />
            <div className="flex items-center justify-between mt-2">
              <div className="flex items-center gap-3">
                <button
                  onClick={() => executeQuery()}
                  disabled={queryLoading || !sql.trim()}
                  className="flex items-center gap-2 px-4 py-1.5 bg-rust-500 text-white rounded text-sm font-medium hover:bg-rust-600 disabled:opacity-50 transition-colors"
                >
                  {queryLoading && (
                    <span className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  )}
                  Execute
                </button>
                <span className="text-xs text-dark-400">Ctrl+Enter</span>
                {engine === "postgres" && (
                  <span className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        const q =
                          "SELECT query, calls, total_exec_time, mean_exec_time, rows FROM pg_stat_statements ORDER BY total_exec_time DESC LIMIT 20;";
                        setSql(q);
                        executeQuery(q);
                      }}
                      className="px-2 py-1 text-xs text-dark-300 hover:text-dark-100 border border-dark-500 rounded hover:bg-dark-700"
                      title="Runs a real query against pg_stat_statements. Fails with the database's own error if the extension is not installed — no demo rows are ever shown."
                    >
                      Slow queries
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        const q =
                          "SELECT pid, usename, application_name, state, query_start, query FROM pg_stat_activity WHERE state <> 'idle' ORDER BY query_start;";
                        setSql(q);
                        executeQuery(q);
                      }}
                      className="px-2 py-1 text-xs text-dark-300 hover:text-dark-100 border border-dark-500 rounded hover:bg-dark-700"
                      title="Runs a real query against pg_stat_activity."
                    >
                      Active queries
                    </button>
                  </span>
                )}
              </div>
              {result && (
                <span className="text-xs text-dark-300">
                  {result.execution_time_ms}ms &middot; {result.row_count} row
                  {result.row_count !== 1 ? "s" : ""}
                  {result.truncated && " (truncated to 1000)"}
                </span>
              )}
            </div>
          </div>

          {/* Error */}
          {queryError && (
            <div
              role="alert"
              className="bg-danger-500/10 text-danger-400 text-sm px-4 py-3 rounded-lg border border-danger-500/20"
            >
              <button
                onClick={() => setQueryError("")}
                className="float-right font-bold ml-2"
                aria-label="Close error"
              >
                &times;
              </button>
              <pre className="whitespace-pre-wrap font-mono text-xs">
                {queryError}
              </pre>
            </div>
          )}

          {/* Results table */}
          {result && result.columns.length > 0 && (
            <div className="bg-dark-800 rounded-lg border border-dark-500 overflow-x-auto flex-1">
              <table className="w-full">
                <thead className="sticky top-0">
                  <tr className="border-b border-dark-500 bg-dark-900">
                    <th className="text-left text-[10px] font-medium text-dark-400 uppercase font-mono px-3 py-2 w-10">
                      #
                    </th>
                    {result.columns.map((col, i) => (
                      <th
                        key={i}
                        className="text-left text-xs font-medium text-dark-200 uppercase tracking-widest font-mono px-3 py-2 whitespace-nowrap"
                      >
                        {col}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-dark-700">
                  {result.rows.map((row, i) => (
                    <tr
                      key={i}
                      className="hover:bg-dark-700/30 transition-colors"
                    >
                      <td className="px-3 py-1.5 text-[10px] text-dark-400 font-mono">
                        {i + 1}
                      </td>
                      {row.map((val, j) => (
                        <td
                          key={j}
                          className="px-3 py-1.5 text-sm text-dark-100 font-mono whitespace-nowrap max-w-xs truncate"
                          title={val}
                        >
                          {val === "" || val === "\\N" ? (
                            <span className="text-dark-400 italic text-xs">
                              NULL
                            </span>
                          ) : (
                            val
                          )}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {/* Empty result (DML/DDL) */}
          {result &&
            result.columns.length === 0 &&
            result.rows.length === 0 &&
            !queryError && (
              <div className="bg-dark-800 rounded-lg border border-dark-500 p-8 text-center text-dark-300 text-sm">
                <svg
                  className="w-8 h-8 mx-auto text-rust-400 mb-2"
                  fill="none"
                  viewBox="0 0 24 24"
                  stroke="currentColor"
                  strokeWidth={2}
                >
                  <path
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    d="M4.5 12.75l6 6 9-13.5"
                  />
                </svg>
                Query executed successfully ({result.execution_time_ms}ms)
              </div>
            )}

          {/* Initial state */}
          {!result && !queryError && !queryLoading && (
            <div className="bg-dark-800 rounded-lg border border-dark-500 p-12 text-center flex-1 flex flex-col items-center justify-center">
              <svg
                className="w-10 h-10 text-dark-400 mb-3"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={1}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M20.25 6.375c0 2.278-3.694 4.125-8.25 4.125S3.75 8.653 3.75 6.375m16.5 0c0-2.278-3.694-4.125-8.25-4.125S3.75 4.097 3.75 6.375m16.5 0v11.25c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125V6.375m16.5 0v3.75m-16.5-3.75v3.75m16.5 0v3.75C20.25 16.153 16.556 18 12 18s-8.25-1.847-8.25-4.125v-3.75m16.5 0c0 2.278-3.694 4.125-8.25 4.125s-8.25-1.847-8.25-4.125"
                />
              </svg>
              <p className="text-dark-300 text-sm">
                Select a table or write a query
              </p>
              <p className="text-dark-400 text-xs mt-1">
                Ctrl+Up/Down to navigate query history
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
