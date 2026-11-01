import Link from "next/link";
import { cloneElement, useId, type ComponentProps, type ReactElement, type ReactNode } from "react";

/* ---------- Buttons ---------- */

type Variant = "primary" | "dark" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANTS: Record<Variant, string> = {
  primary: "bg-accent text-on-accent hover:bg-accent-hover active:bg-accent-hover",
  dark: "bg-ink text-on-ink hover:bg-ink-hover active:bg-ink-hover",
  secondary: "border border-strong-border bg-surface text-foreground hover:bg-surface-hover active:bg-sunken",
  ghost: "text-muted hover:bg-surface-hover hover:text-foreground active:bg-sunken",
  danger: "border border-danger/40 bg-surface text-danger hover:bg-danger hover:text-on-accent active:bg-danger",
};

// 36px (32px small) tall with a mouse; 44px on phones and any touch screen, small or not, so every button is easy to tap.
const SIZES: Record<Size, string> = {
  md: "h-9 px-3.5 text-sm max-sm:h-11 pointer-coarse:h-11",
  sm: "h-8 px-3 text-[13px] max-sm:h-11 pointer-coarse:h-11",
  lg: "h-11 px-6 text-[15px] max-sm:h-12 pointer-coarse:h-12",
};

const BASE =
  "inline-flex shrink-0 select-none items-center justify-center gap-2 whitespace-nowrap rounded font-medium transition-[background-color,color,border-color,transform] duration-150 ease-out active:translate-y-px disabled:pointer-events-none disabled:opacity-50 aria-disabled:pointer-events-none aria-disabled:opacity-50";

export const buttonClass = (variant: Variant = "primary", size: Size = "md", className = "") => `${BASE} ${VARIANTS[variant]} ${SIZES[size]} ${className}`;

export function Spinner({ className = "" }: { className?: string }) {
  return (
    <svg className={`size-3.5 animate-spin ${className}`} viewBox="0 0 16 16" fill="none" aria-hidden="true">
      <circle cx="8" cy="8" r="6" stroke="currentColor" strokeOpacity="0.25" strokeWidth="2" />
      <path d="M14 8a6 6 0 0 0-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

export function Button({
  variant = "primary",
  size = "md",
  loading = false,
  className = "",
  children,
  disabled,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size; loading?: boolean }) {
  return (
    <button className={buttonClass(variant, size, className)} disabled={disabled || loading} aria-busy={loading || undefined} {...props}>
      {loading && <Spinner />}
      {children}
    </button>
  );
}

export function ButtonLink({ variant = "primary", size = "md", className = "", ...props }: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

/** Keyboard shortcut hint, shown next to the actions it triggers. */
export function Kbd({ children, className = "" }: { children: ReactNode; className?: string }) {
  return (
    <kbd className={`inline-flex min-w-5 items-center justify-center rounded border border-border bg-sunken px-1 font-mono text-[11px] leading-5 text-muted ${className}`}>
      {children}
    </kbd>
  );
}

/* ---------- Surfaces ---------- */

/** A short muted label above a section or heading. Sentence case. */
export function Eyebrow({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <p className={`text-[13px] font-medium text-muted ${className}`}>{children}</p>;
}

const BADGES = {
  neutral: "border-border bg-sunken text-muted",
  good: "border-transparent bg-success-soft text-success",
  warn: "border-transparent bg-warning-soft text-warning",
  bad: "border-transparent bg-danger-soft text-danger",
  accent: "border-transparent bg-accent-soft text-accent",
} as const;

export function Badge({ tone = "neutral", children }: { tone?: keyof typeof BADGES; children: ReactNode }) {
  return <span className={`inline-flex items-center whitespace-nowrap rounded border px-1.5 py-px text-xs font-medium tabular-nums ${BADGES[tone]}`}>{children}</span>;
}

export function scoreTone(score: number): keyof typeof BADGES {
  return score >= 70 ? "good" : score >= 40 ? "warn" : "bad";
}

/** Page title with an optional description and actions, so every screen opens the same way. */
export function PageHeader({ title, description, eyebrow, actions }: { title: ReactNode; description?: ReactNode; eyebrow?: ReactNode; actions?: ReactNode }) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
      <div className="min-w-0">
        {eyebrow && <Eyebrow className="mb-1">{eyebrow}</Eyebrow>}
        <h1 className="t-heading text-balance">{title}</h1>
        {description && <p className="mt-1.5 max-w-2xl text-sm text-muted">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Names what belongs here and offers the way to create it. */
export function EmptyState({ title, children, action, className = "" }: { title: string; children?: ReactNode; action?: ReactNode; className?: string }) {
  return (
    <div className={`rounded-md border border-dashed border-strong-border px-6 py-10 ${className}`}>
      <h2 className="text-base font-semibold">{title}</h2>
      {children && <p className="mt-1 max-w-md text-sm text-muted">{children}</p>}
      {action && <div className="mt-4 flex flex-wrap gap-2">{action}</div>}
    </div>
  );
}

/** Placeholder with the same footprint as the content it stands in for, so nothing moves when data arrives. */
export function Skeleton({ className = "" }: { className?: string }) {
  return <div aria-hidden="true" className={`animate-pulse rounded bg-sunken ${className}`} />;
}

/* ---------- Switch ---------- */

/**
 * An on/off control (role="switch"). The track is 24px tall, but the hit area reaches 44px so it is easy to tap.
 * Pass `busy` while the change is saving: the switch keeps its place, shows a spinner and ignores clicks.
 */
export function Switch({
  checked,
  busy = false,
  className = "",
  disabled,
  ...props
}: Omit<ComponentProps<"button">, "role" | "type" | "children"> & { checked: boolean; busy?: boolean }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      aria-busy={busy || undefined}
      disabled={disabled || busy}
      className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 after:absolute after:-inset-2.5 after:content-[''] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 aria-busy:cursor-progress aria-busy:opacity-80 ${checked ? "bg-accent hover:bg-accent-hover" : "bg-strong-border hover:bg-faint"} ${className}`}
      {...props}
    >
      <span
        aria-hidden="true"
        className={`inline-flex size-5 items-center justify-center rounded-full bg-white text-accent shadow-sm transition-transform duration-150 motion-reduce:transition-none ${checked ? "translate-x-[22px]" : "translate-x-0.5"}`}
      >
        {busy && <Spinner className="size-3 text-faint" />}
      </span>
    </button>
  );
}

/* ---------- Forms ---------- */

type ControlProps = { id?: string; "aria-describedby"?: string; "aria-invalid"?: boolean };

export const inputClass =
  "w-full rounded border border-strong-border bg-surface px-3 py-2 text-sm leading-5 transition-colors duration-150 placeholder:text-faint hover:border-faint focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30 disabled:cursor-not-allowed disabled:bg-sunken disabled:opacity-60 aria-[invalid=true]:border-danger max-sm:min-h-11 max-sm:text-base pointer-coarse:min-h-11";

/**
 * Label above the control, with an optional hint and error. Both are linked with aria-describedby
 * rather than nested in the label, so screen readers announce "Email", not "Email We'll never share…".
 */
export function Field({ label, hint, error, invalid = false, children }: { label: string; hint?: string; error?: string | null; invalid?: boolean; children: ReactElement<ControlProps> }) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint && hintId, error && errorId].filter(Boolean).join(" ") || undefined;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="t-label block">
        {label}
      </label>
      {cloneElement(children, { id, "aria-describedby": describedBy, "aria-invalid": error || invalid ? true : undefined })}
      {hint && !error && (
        <p id={hintId} className="text-xs text-muted">
          {hint}
        </p>
      )}
      {error && (
        <p id={errorId} className="text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

type NoticeAction = { href: string; label: string };

/** Calm, accessible feedback. Colour supports the icon; the message remains readable without it. */
export function Notice({ tone = "info", title, children, action }: { tone?: "error" | "success" | "info" | "warning"; title?: string; children: ReactNode; action?: NoticeAction }) {
  const colour = { error: "text-danger", success: "text-success", info: "text-accent", warning: "text-warning" }[tone];
  return <div role={tone === "error" || tone === "warning" ? "alert" : "status"} aria-atomic="true" className="flex items-start gap-3 rounded-md border border-border bg-surface px-4 py-3 text-sm [overflow-wrap:anywhere]">
    <svg className={`mt-0.5 size-4 shrink-0 ${colour}`} viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true"><circle cx="10" cy="10" r="7.5" />{tone === "success" ? <path d="m6.5 10 2.3 2.4 4.7-4.8" strokeLinecap="round" strokeLinejoin="round" /> : tone === "info" ? <><circle cx="10" cy="6.2" r=".8" fill="currentColor" stroke="none" /><path d="M10 9.2v4.5" strokeLinecap="round" /></> : <><path d="M10 6.2v4.5" strokeLinecap="round" /><circle cx="10" cy="13.5" r=".8" fill="currentColor" stroke="none" /></>}</svg>
    <div className="min-w-0 flex-1 leading-relaxed">{title && <p className="font-medium text-foreground">{title}</p>}<div className={title ? "mt-1 text-[13px] text-muted" : "text-[13px] text-foreground"}>{children}</div>{action && <Link href={action.href} className="mt-2 inline-flex min-h-7 items-center text-[13px] font-medium text-accent underline underline-offset-4 hover:text-accent-hover max-sm:min-h-11">{action.label}</Link>}</div>
  </div>;
}

export function FormMessage({ error, success, errorTitle, successTitle, action }: { error?: string | null; success?: string | null; errorTitle?: string; successTitle?: string; action?: NoticeAction }) {
  if (!error && !success) return null;
  return <Notice tone={error ? "error" : "success"} title={error ? errorTitle : successTitle} action={action}>{error || success}</Notice>;
}

/* ---------- Brand ---------- */

export function Logo() {
  return (
    <span className="inline-flex items-center gap-2 text-base font-semibold leading-none tracking-[-0.02em]">
      <svg width="20" height="20" viewBox="0 0 20 20" aria-hidden="true">
        <rect width="20" height="20" rx="5" fill="var(--ink)" />
        <path d="M5.5 10.5l3 3 6-6.5" fill="none" stroke="var(--on-ink)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      Shortlist Job Radar
    </span>
  );
}
