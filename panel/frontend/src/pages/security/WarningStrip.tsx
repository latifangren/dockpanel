import type { UnreachableServer } from "../../components/PanicReport";

/**
 * A degraded-coverage banner: something an operator is looking at is missing or
 * unreadable, and the surface it is missing from would otherwise look calm.
 *
 * Same grammar as <PanicReport/> — icon, one-line headline that names the
 * machines, detail underneath, then the per-host reasons — because it reports
 * the same class of fact: a host nobody reached. Used as a band inside a card
 * header (the default `className`) and as a standalone box on the lockdown tab.
 */

export default function WarningStrip({
  tone = "warn",
  title,
  detail,
  servers,
  className = "px-5 py-3 border-b",
}: {
  tone?: "warn" | "danger";
  title: string;
  detail: string;
  servers?: UnreachableServer[];
  className?: string;
}) {
  // Full literal class strings — Tailwind scans source text, so these cannot be
  // assembled from a token fragment.
  const t =
    tone === "danger"
      ? { border: "border-danger-500/30", bg: "bg-danger-500/10", accent: "text-danger-400" }
      : { border: "border-warn-500/30", bg: "bg-warn-500/10", accent: "text-warn-400" };

  return (
    <div role="alert" className={`${className} ${t.border} ${t.bg} flex items-start gap-3`}>
      <svg
        className={`w-5 h-5 shrink-0 mt-0.5 ${t.accent}`}
        fill="none"
        viewBox="0 0 24 24"
        stroke="currentColor"
        strokeWidth={2}
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          d="M12 9v4m0 4h.01M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z"
        />
      </svg>
      <div className="min-w-0">
        <p className={`text-xs font-bold uppercase font-mono tracking-widest ${t.accent}`}>{title}</p>
        <p className="text-xs text-dark-200 font-mono mt-1">{detail}</p>
        {servers && servers.length > 0 && (
          <ul className="mt-2 space-y-1">
            {servers.map((s) => (
              <li key={s.server_id} className="flex flex-col sm:flex-row sm:items-baseline gap-0.5 sm:gap-4">
                <span className={`text-xs font-bold font-mono shrink-0 sm:w-48 ${t.accent}`}>{s.server_name}</span>
                <span className="text-xs text-dark-200 font-mono break-all">{s.reason}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
