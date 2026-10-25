// The diagnostics block in Security.tsx was exactly one line:
// `<DiagnosticsContent />` — the full Diagnostics page component, not a
// placeholder. This tab moves that delegate, so the tab renders the same
// real content it always did.
import DiagnosticsContent from "../Diagnostics";

export default function DiagnosticsTab() {
  return <DiagnosticsContent />;
}
