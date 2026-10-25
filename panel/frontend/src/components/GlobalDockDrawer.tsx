import { useState, useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { Terminal as XTerm } from "@xterm/xterm";
import { FitAddon } from "@xterm/addon-fit";
import "@xterm/xterm/css/xterm.css";
import { api } from "../api";

// Global dock drawer, ported from the AI Studio v2 pattern (bottom drawer,
// header buttons + Ctrl+` toggle, terminal tab + live-log tab, mounted in
// CommandLayout only) with v2's simulated terminal REMOVED and replaced:
// - Terminal tab: a real xterm session over the real WebSocket, using the
//   exact handshake the full Terminal page uses — GET /terminal/token, then
//   ws(s)://host/agent/terminal/ws?token=…&domain=…&cols=…&rows=… with
//   JSON {type:"input", data} frames. Nothing here fabricates shell output:
//   a failed token or socket shows the real error, and closing the drawer
//   closes the socket.
// - Logs tab: polls the real log endpoints the Logs page already uses —
//   GET /logs?type=…&lines=…, /logs/service/{service}?lines=…, and
//   /logs/docker/{container}?lines=… — every 4 seconds while open and
//   unpaused. An API error is shown as an error line, never as invented
//   log lines.

export type DockTab = "terminal" | "logs";

type LogSource = "system" | "service" | "docker";

const SYSTEM_LOG_TYPES = ["nginx_access", "nginx_error", "syslog", "auth", "php_fpm"];

export default function GlobalDockDrawer({
  open,
  onClose,
  initialTab,
}: {
  open: boolean;
  onClose: () => void;
  initialTab: DockTab;
}) {
  const [activeTab, setActiveTab] = useState<DockTab>(initialTab);
  const [expanded, setExpanded] = useState(false);

  const [termError, setTermError] = useState("");
  const termContainerRef = useRef<HTMLDivElement | null>(null);
  const termRef = useRef<XTerm | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [logSource, setLogSource] = useState<LogSource>("system");
  const [systemType, setSystemType] = useState("nginx_access");
  const [logTarget, setLogTarget] = useState("");
  const [dockerContainers, setDockerContainers] = useState<string[]>([]);
  const [logLines, setLogLines] = useState<string[]>([]);
  const [logPaused, setLogPaused] = useState(false);
  const [logError, setLogError] = useState("");

  useEffect(() => {
    if (open) setActiveTab(initialTab);
  }, [open, initialTab]);

  // Real terminal session, alive only while the drawer is open on this tab.
  useEffect(() => {
    if (!open || activeTab !== "terminal") return;
    let cancelled = false;
    const container = termContainerRef.current;
    if (!container) return;

    const term = new XTerm({
      fontSize: 13,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      cursorBlink: true,
      theme: { background: "#0a0a0a", foreground: "#e5e5e5", cursor: "#ffffff" },
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.open(container);
    try {
      fit.fit();
    } catch {
      // fit needs a laid-out container; a missed fit only affects sizing
    }
    termRef.current = term;
    term.writeln("Connecting to server…");

    api
      .get<{ token: string; domain: string | null }>("/terminal/token")
      .then((data) => {
        if (cancelled) return;
        const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
        const wsUrl =
          `${proto}//${window.location.host}/agent/terminal/ws` +
          `?token=${encodeURIComponent(data.token)}` +
          `&domain=${encodeURIComponent(data.domain || "")}` +
          `&cols=${term.cols}&rows=${term.rows}`;
        const ws = new WebSocket(wsUrl);
        wsRef.current = ws;
        ws.onopen = () => {
          term.clear();
          setTermError("");
        };
        ws.onmessage = (event) => {
          term.write(event.data);
        };
        ws.onclose = () => {
          if (!cancelled) setTermError("Terminal connection closed.");
        };
        ws.onerror = () => {
          if (!cancelled) setTermError("Terminal connection failed.");
        };
        term.onData((inputData) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "input", data: inputData }));
          }
        });
      })
      .catch((e) => {
        if (!cancelled) {
          setTermError(e instanceof Error ? e.message : "Failed to get a terminal token.");
        }
      });

    return () => {
      cancelled = true;
      try {
        wsRef.current?.close();
      } catch {
        // already closed
      }
      wsRef.current = null;
      term.dispose();
      termRef.current = null;
    };
  }, [open, activeTab]);

  // Docker container list for the logs tab (real endpoint, best-effort).
  useEffect(() => {
    if (!open || activeTab !== "logs" || logSource !== "docker") return;
    api
      .get<{ containers: string[] }>("/logs/docker")
      .then((data) => {
        setDockerContainers(data.containers || []);
        if (!logTarget && data.containers?.length > 0) setLogTarget(data.containers[0]);
      })
      .catch(() => setDockerContainers([]));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, activeTab, logSource]);

  // Live logs: poll the real endpoint for the selected source.
  useEffect(() => {
    if (!open || activeTab !== "logs" || logPaused) return;
    const fetchLogs = async () => {
      try {
        if (logSource === "system") {
          const data = await api.get<string[]>(`/logs?type=${systemType}&lines=100`);
          setLogLines(Array.isArray(data) ? data : []);
          setLogError("");
        } else if (logSource === "service") {
          if (!logTarget.trim()) return;
          const data = await api.get<{ logs: string }>(
            `/logs/service/${encodeURIComponent(logTarget.trim())}?lines=100`,
          );
          setLogLines(data.logs ? data.logs.split("\n") : []);
          setLogError("");
        } else {
          if (!logTarget) return;
          const data = await api.get<{ logs: string }>(
            `/logs/docker/${encodeURIComponent(logTarget)}?lines=100`,
          );
          setLogLines(data.logs ? data.logs.split("\n") : []);
          setLogError("");
        }
      } catch (e) {
        setLogError(e instanceof Error ? e.message : "Failed to load logs.");
      }
    };
    fetchLogs();
    const timer = setInterval(fetchLogs, 4000);
    return () => clearInterval(timer);
  }, [open, activeTab, logSource, systemType, logTarget, logPaused]);

  if (!open) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-dark-900 border-t border-dark-600 shadow-2xl flex flex-col"
      style={{ height: expanded ? "420px" : "280px" }}
    >
      <div className="flex items-center gap-2 px-4 py-2 border-b border-dark-700 shrink-0">
        <div className="flex gap-1 p-0.5 bg-dark-800 rounded-lg border border-dark-600">
          {(["terminal", "logs"] as DockTab[]).map((tab) => (
            <button
              key={tab}
              type="button"
              onClick={() => setActiveTab(tab)}
              className={`px-3 py-1 rounded-md text-xs font-medium transition-colors ${
                activeTab === tab ? "bg-rust-500 text-white" : "text-dark-300 hover:text-dark-100"
              }`}
            >
              {tab === "terminal" ? "Terminal" : "Live Logs"}
            </button>
          ))}
        </div>
        <span className="text-xs text-dark-400 hidden sm:inline">
          {activeTab === "terminal"
            ? "Real terminal session (closes with the drawer)"
            : "Live logs, refreshed every 4s"}
        </span>
        <div className="ml-auto flex items-center gap-1">
          {activeTab === "logs" && (
            <button
              type="button"
              onClick={() => setLogPaused((p) => !p)}
              className="px-2 py-1 text-xs text-dark-300 hover:text-dark-100 rounded hover:bg-dark-700"
            >
              {logPaused ? "Resume" : "Pause"}
            </button>
          )}
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="px-2 py-1 text-xs text-dark-300 hover:text-dark-100 rounded hover:bg-dark-700"
          >
            {expanded ? "Collapse" : "Expand"}
          </button>
          <Link
            to="/terminal"
            className="px-2 py-1 text-xs text-dark-300 hover:text-dark-100 rounded hover:bg-dark-700"
          >
            Full terminal →
          </Link>
          <button
            type="button"
            onClick={onClose}
            className="px-2 py-1 text-xs text-dark-300 hover:text-dark-100 rounded hover:bg-dark-700"
            aria-label="Close dock drawer"
          >
            ×
          </button>
        </div>
      </div>

      {activeTab === "terminal" ? (
        <div className="flex-1 min-h-0 px-2 py-2">
          {termError && (
            <p className="text-xs text-danger-400 px-2 pb-1">{termError}</p>
          )}
          <div ref={termContainerRef} className="h-full w-full" />
        </div>
      ) : (
        <div className="flex-1 min-h-0 flex flex-col px-4 py-2">
          <div className="flex flex-wrap items-center gap-2 mb-2 shrink-0">
            <select
              value={logSource}
              onChange={(e) => setLogSource(e.target.value as LogSource)}
              className="px-2 py-1 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100"
            >
              <option value="system">System logs</option>
              <option value="service">Service logs</option>
              <option value="docker">Docker logs</option>
            </select>
            {logSource === "system" && (
              <select
                value={systemType}
                onChange={(e) => setSystemType(e.target.value)}
                className="px-2 py-1 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100"
              >
                {SYSTEM_LOG_TYPES.map((t) => (
                  <option key={t} value={t}>{t}</option>
                ))}
              </select>
            )}
            {logSource === "service" && (
              <input
                value={logTarget}
                onChange={(e) => setLogTarget(e.target.value)}
                placeholder="Service name (e.g. nginx)"
                className="px-2 py-1 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100 w-48"
              />
            )}
            {logSource === "docker" && (
              <select
                value={logTarget}
                onChange={(e) => setLogTarget(e.target.value)}
                className="px-2 py-1 bg-dark-800 border border-dark-600 rounded text-xs text-dark-100 max-w-xs"
              >
                {dockerContainers.length === 0 && <option value="">No containers</option>}
                {dockerContainers.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            )}
          </div>
          {logError && <p className="text-xs text-danger-400 pb-1 shrink-0">{logError}</p>}
          <pre className="flex-1 min-h-0 overflow-auto font-mono text-xs text-dark-200 whitespace-pre-wrap">
            {logLines.length === 0 ? "No log lines yet." : logLines.join("\n")}
          </pre>
        </div>
      )}
    </div>
  );
}
