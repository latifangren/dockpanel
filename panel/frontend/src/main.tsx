import { StrictMode, Suspense, lazy, Component, type ReactNode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { AuthProvider } from "./context/AuthContext";
import { ServerProvider } from "./context/ServerContext";
import { BrandingProvider } from "./context/BrandingContext";
import LayoutShell from "./components/LayoutShell";
import Login from "./pages/Login";
import Setup from "./pages/Setup";
import Dashboard from "./pages/Dashboard";
import "./index.css";

// Theme + layout attributes. This is a `<script type="module">` (index.html), so
// it is DEFERRED — public/theme-init.js, a render-blocking classic script, has
// already set data-theme and data-color-scheme before first paint. The writes
// below are an idempotent backstop for those two, and the only setter for
// data-layout.
//
// It deliberately does NOT persist the resolved theme. Writing dp-theme here on
// every load turned "the user never chose a theme" into "the user chose
// midnight" after a single page view, which is why no prefers-color-scheme
// default could ever be added. Persistence belongs to the user-initiated path
// only (applyTheme in hooks/useLayoutState.ts).
(() => {
  const stored = localStorage.getItem("dp-theme");
  let theme = stored || "lite-mix";
  if (theme === "dark" || theme === "nexus-dark") theme = "lite-midnight";
  if (theme === "light" || theme === "nexus") theme = "lite-clean";
  if (theme === "terminal") theme = "lite-mix";
  // Layout initialization
  const layout = localStorage.getItem("dp-layout") || "command";
  document.documentElement.setAttribute("data-theme", theme);
  document.documentElement.setAttribute("data-layout", layout);
  document.documentElement.setAttribute("data-color-scheme", (theme === "clean" || theme === "arctic" || theme === "lite-mix" || theme === "lite-clean") ? "light" : "dark");
})();

// Retry lazy import — handles stale chunks after deploy
function lazyRetry(importFn: () => Promise<{ default: React.ComponentType }>) {
  return lazy(() =>
    importFn().catch(() => {
      // Chunk failed to load (likely stale hash after deploy) — reload once
      const key = "chunk_reload";
      if (!sessionStorage.getItem(key)) {
        sessionStorage.setItem(key, "1");
        window.location.reload();
      }
      return importFn(); // return promise anyway to satisfy types
    })
  );
}

// Error boundary — catches chunk load failures and shows reload button
class ChunkErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false };
  }
  static getDerivedStateFromError() {
    return { hasError: true };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="flex flex-col items-center justify-center h-screen gap-4 bg-dark-900">
          <p className="text-dark-200 text-sm font-mono">Page failed to load — a new version may have been deployed.</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-rust-500 text-white rounded-lg text-sm font-medium hover:bg-rust-600"
          >
            Reload
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

const Register = lazyRetry(() => import("./pages/Register"));
const ForgotPassword = lazyRetry(() => import("./pages/ForgotPassword"));
const ResetPassword = lazyRetry(() => import("./pages/ResetPassword"));
const VerifyEmail = lazyRetry(() => import("./pages/VerifyEmail"));
const Monitoring = lazyRetry(() => import("./pages/Monitoring"));

// Lazy-loaded pages (split into separate chunks)
const Databases = lazyRetry(() => import("./pages/Databases"));
const Files = lazyRetry(() => import("./pages/Files"));
const Terminal = lazyRetry(() => import("./pages/Terminal"));
const Projects = lazyRetry(() => import("./pages/Projects"));
const Logs = lazyRetry(() => import("./pages/Logs"));
const Apps = lazyRetry(() => import("./pages/Apps"));
const Security = lazyRetry(() => import("./pages/Security"));
const Settings = lazyRetry(() => import("./pages/Settings"));
const Account = lazyRetry(() => import("./pages/Account"));
const Servers = lazyRetry(() => import("./pages/Servers"));
const BackupOrchestrator = lazyRetry(() => import("./pages/BackupOrchestrator"));
const PublicStatusPage = lazyRetry(() => import("./pages/PublicStatusPage"));
const SecretsManager = lazyRetry(() => import("./pages/SecretsManager"));
const Notifications = lazyRetry(() => import("./pages/Notifications"));
const Integrations = lazyRetry(() => import("./pages/Integrations"));
const Users = lazyRetry(() => import("./pages/Users"));
const ContainerPolicies = lazyRetry(() => import("./pages/ContainerPolicies"));
const System = lazyRetry(() => import("./pages/System"));
const Telemetry = lazyRetry(() => import("./pages/Telemetry"));

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <BrandingProvider>
    <AuthProvider>
      <ServerProvider>
      <BrowserRouter>
        <ChunkErrorBoundary>
        <Suspense fallback={<div className="flex items-center justify-center h-screen bg-dark-900"><div className="w-6 h-6 border-2 border-dark-600 border-t-rust-500 rounded-full animate-spin" /></div>}>
          <Routes>
            <Route path="/login" element={<Login />} />
            <Route path="/setup" element={<Setup />} />
            <Route path="/register" element={<Register />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/reset-password" element={<ResetPassword />} />
            <Route path="/verify-email" element={<VerifyEmail />} />
            <Route element={<LayoutShell />}>
              <Route path="/" element={<Dashboard />} />
              <Route path="/files" element={<Files />} />
              <Route path="/files/*" element={<Files />} />
              <Route path="/projects" element={<Navigate to="/" replace />} />
              <Route path="/databases" element={<Navigate to="/" replace />} />
              <Route path="/terminal" element={<Terminal />} />
              <Route path="/logs" element={<Logs />} />
              <Route path="/apps" element={<Apps />} />
              {/* B9: /integrations redirects to / (hosting-era tabs), so its
                  former aliases point at / directly instead of chaining
                  through a redirect that no longer lands anywhere. */}
              <Route path="/extensions" element={<Navigate to="/" replace />} />
              <Route path="/security" element={<Security />} />
              <Route path="/diagnostics" element={<Navigate to="/security?tab=diagnostics" replace />} />
              <Route path="/settings" element={<Settings />} />
              <Route path="/account" element={<Account />} />
              <Route path="/updates" element={<Navigate to="/system" replace />} />
              <Route path="/activity" element={<Navigate to="/logs?tab=audit" replace />} />
              <Route path="/system-logs" element={<Navigate to="/logs?tab=system" replace />} />
              <Route path="/servers" element={<Navigate to="/" replace />} />
              <Route path="/users" element={<Users />} />
              <Route path="/container-policies" element={<Navigate to="/apps" replace />} />
              <Route path="/backup-orchestrator" element={<BackupOrchestrator />} />
              {/* Incidents live in Monitoring's Status Page tab, so land there
                  rather than on the default Monitors tab. `resolveTab` clamps a
                  non-admin back to Monitors, so this is safe for both roles. */}
              <Route path="/incidents" element={<Navigate to="/monitoring?tab=statuspage" replace />} />
              <Route path="/secrets" element={<SecretsManager />} />
              {/* B9: Integrations (Webhooks/Extensions/WHMCS/Migrations) has no
                  unique phone-operator function; it redirects like the other
                  pruned hosting pages instead of living on, hidden, at a URL. */}
              <Route path="/integrations" element={<Navigate to="/" replace />} />
              <Route path="/webhooks" element={<Navigate to="/" replace />} />
              <Route path="/notifications" element={<Notifications />} />
              <Route path="/monitoring" element={<Monitoring />} />
              <Route path="/system" element={<System />} />
              <Route path="/telemetry" element={<Telemetry />} />
              <Route path="/security-hardening" element={<Navigate to="/security?tab=lockdown" replace />} />
              <Route path="/monitors" element={<Navigate to="/monitoring" replace />} />
              <Route path="/alerts" element={<Navigate to="/monitoring?tab=alerts" replace />} />
            </Route>
            <Route path="/status" element={<PublicStatusPage />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
        </ChunkErrorBoundary>
      </BrowserRouter>
      </ServerProvider>
    </AuthProvider>
    </BrandingProvider>
  </StrictMode>
);
