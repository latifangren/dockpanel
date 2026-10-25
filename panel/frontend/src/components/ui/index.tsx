import type { ButtonHTMLAttributes, ReactNode } from "react";

// Shared UI primitives for the DockPanel Lite frontend.
//
// Built for this codebase's tokens, NOT copied from the AI Studio v2 kit:
// surfaces use the `dark-*` ramp (which the lite themes invert, so the same
// classes render light in lite-mix/lite-clean and dark in lite-warm/
// lite-midnight), the accent is `rust-500`, and corners use the lite
// rounded tokens (rounded-lg / rounded-xl). Moved page bodies keep their
// existing classes; only NEW chrome (shells, tabs, drawers) should use
// these primitives, so a restyle can never hide a parity break.

export function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string;
  subtitle?: string;
  actions?: ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-bold text-dark-50">{title}</h1>
        {subtitle && <p className="text-sm text-dark-300 mt-1">{subtitle}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}

type ButtonVariant = "primary" | "secondary" | "danger" | "ghost";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-rust-500 text-white hover:bg-rust-600",
  secondary: "bg-dark-700 text-dark-100 hover:bg-dark-600",
  danger: "bg-danger-500/15 text-danger-400 hover:bg-danger-500/25",
  ghost: "text-dark-200 hover:text-dark-50",
};

export function Button({
  variant = "primary",
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant }) {
  return (
    <button
      type="button"
      {...props}
      className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 ${BUTTON_VARIANTS[variant]} ${className}`}
    />
  );
}

export function SectionCard({
  title,
  subtitle,
  actions,
  children,
  className = "",
}: {
  title?: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={`bg-dark-800/50 border border-dark-600 rounded-lg p-4 ${className}`}>
      {(title || actions) && (
        <div className="flex flex-wrap items-start justify-between gap-2 mb-3">
          <div>
            {title && <h3 className="text-sm font-semibold text-dark-100">{title}</h3>}
            {subtitle && <p className="text-xs text-dark-400 mt-0.5">{subtitle}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

export function FormField({
  label,
  hint,
  children,
  className = "",
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-sm font-medium text-dark-100 mb-1">{label}</span>
      {children}
      {hint && <span className="block text-xs text-dark-400 mt-1">{hint}</span>}
    </label>
  );
}

export function SegmentedTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: string }[];
  active: T;
  onChange: (id: T) => void;
}) {
  return (
    <div className="flex flex-wrap gap-1 p-1 bg-dark-800 rounded-lg border border-dark-600 w-fit">
      {tabs.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => onChange(t.id)}
          className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
            active === t.id ? "bg-rust-500 text-white" : "text-dark-300 hover:text-dark-100"
          }`}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="py-16 text-center bg-dark-800/50 border border-dark-600 rounded-lg">
      <p className="text-dark-200 font-medium">{title}</p>
      {description && <p className="text-dark-400 text-sm mt-1 max-w-md mx-auto">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
    </div>
  );
}

type BadgeTone = "default" | "success" | "warning" | "danger" | "primary";

const BADGE_TONES: Record<BadgeTone, string> = {
  default: "bg-dark-700 text-dark-200",
  success: "bg-success-500/15 text-success-400",
  warning: "bg-warning-500/15 text-warning-400",
  danger: "bg-danger-500/15 text-danger-400",
  primary: "bg-rust-500/15 text-rust-400",
};

export function Badge({
  tone = "default",
  children,
  className = "",
}: {
  tone?: BadgeTone;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${BADGE_TONES[tone]} ${className}`}
    >
      {children}
    </span>
  );
}

export function Drawer({
  open,
  onClose,
  title,
  children,
  wide = false,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  wide?: boolean;
}) {
  if (!open) return null;
  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4 dp-modal-overlay">
      <div
        className={`bg-dark-800 rounded-lg shadow-xl p-6 w-full ${
          wide ? "max-w-2xl" : "max-w-lg"
        } max-h-[85vh] overflow-y-auto dp-modal`}
      >
        <div className="flex items-start justify-between gap-2 mb-4">
          <h3 className="text-lg font-bold text-dark-50">{title}</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-dark-400 hover:text-dark-100 text-xl leading-none px-1"
            aria-label="Close"
          >
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}
