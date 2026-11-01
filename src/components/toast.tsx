"use client";

import Link from "next/link";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type PointerEvent, type ReactNode } from "react";

type Tone = "default" | "error" | "success";
type ToastAction = { label: string; onClick?: () => void; href?: string };
type ToastInput = {
  /** The headline: what happened, in a few words. */
  message: string;
  /** Optional second line: why, or what to do. */
  description?: string;
  tone?: Tone;
  /** One next step that lives inside the toast: Undo, Reset password, View. A link when `href` is set. */
  action?: ToastAction;
  /** Milliseconds before it goes away on its own. Defaults to 4s for success, 5s otherwise, 8s for errors or with an action. */
  duration?: number;
  /** Showing a toast with the same key replaces the one on screen instead of stacking a copy (repeated failed logins). */
  key?: string;
};
type Toast = ToastInput & { id: number; leaving: boolean; bump: number };

type ToastApi = { show: (toast: ToastInput) => number; dismiss: (id: number) => void };

const Ctx = createContext<ToastApi | null>(null);

export function useToast(): ToastApi {
  const api = useContext(Ctx);
  if (!api) throw new Error("useToast must be used inside <ToastProvider>");
  return api;
}

function ToneIcon({ tone }: { tone: Tone }) {
  if (tone === "default") return null;
  return (
    <span aria-hidden="true" className={`mt-px grid size-5 shrink-0 place-items-center rounded-full text-surface ${tone === "error" ? "bg-danger" : "bg-success"}`}>
      <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
        {tone === "success" ? <path d="M5 12.5l4.5 4.5L19 7.5" /> : <path d="M12 7v6M12 17h.01" />}
      </svg>
    </span>
  );
}

function ToastItem({ toast, onDismiss }: { toast: Toast; onDismiss: () => void }) {
  const [paused, setPaused] = useState(false);
  const [dx, setDx] = useState(0);
  const drag = useRef<{ x: number; id: number } | null>(null);
  const tone = toast.tone ?? "default";
  const duration = toast.duration ?? (toast.action || tone === "error" ? 8_000 : tone === "success" ? 4_000 : 5_000);

  // Restarts when the same toast is shown again (`bump`), and waits while you are reading or using it.
  useEffect(() => {
    if (paused || toast.leaving) return;
    const timer = setTimeout(onDismiss, duration);
    return () => clearTimeout(timer);
  }, [paused, duration, onDismiss, toast.bump, toast.leaving]);

  // Swipe sideways to dismiss on touch screens.
  const down = (e: PointerEvent<HTMLLIElement>) => {
    if (e.pointerType === "mouse" || (e.target as HTMLElement).closest("a,button")) return;
    drag.current = { x: e.clientX, id: e.pointerId };
    e.currentTarget.setPointerCapture(e.pointerId);
    setPaused(true);
  };
  const move = (e: PointerEvent<HTMLLIElement>) => drag.current && setDx(e.clientX - drag.current.x);
  const up = () => {
    if (!drag.current) return;
    drag.current = null;
    setPaused(false);
    if (Math.abs(dx) > 80) onDismiss();
    else setDx(0);
  };

  const actionClass = "mt-2 inline-flex rounded-sm text-[13px] font-medium text-accent underline-offset-4 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent";
  return (
    <li
      role={tone === "error" ? "alert" : "status"}
      aria-atomic="true"
      className={`pointer-events-auto relative flex w-full touch-pan-y select-none items-start gap-3 rounded-xl border border-border bg-surface py-3 pl-3.5 pr-11 shadow-[0_16px_40px_-14px_rgb(17_19_26/0.3)] ${
        toast.leaving ? "toast-leave" : toast.bump > 0 ? "toast-bump" : "toast-enter"
      }`}
      style={dx ? { transform: `translateX(${dx}px)`, opacity: Math.max(0.2, 1 - Math.abs(dx) / 220), transition: "none" } : undefined}
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={() => setPaused(false)}
      onPointerDown={down}
      onPointerMove={move}
      onPointerUp={up}
      onPointerCancel={up}
    >
      <ToneIcon tone={tone} />
      <div className="min-w-0 flex-1 [overflow-wrap:anywhere]">
        <p className="text-sm font-medium leading-5 text-foreground">{toast.message}</p>
        {toast.description && <p className="mt-0.5 text-[13px] leading-5 text-muted">{toast.description}</p>}
        {toast.action &&
          (toast.action.href ? (
            <Link href={toast.action.href} className={actionClass} onClick={onDismiss}>
              {toast.action.label}
            </Link>
          ) : (
            <button
              type="button"
              className={actionClass}
              onClick={() => {
                toast.action?.onClick?.();
                onDismiss();
              }}
            >
              {toast.action.label}
            </button>
          ))}
      </div>
      <button
        type="button"
        aria-label="Dismiss notification"
        className="absolute right-2 top-2 grid size-7 place-items-center rounded-md text-faint transition-colors duration-150 hover:bg-surface-hover hover:text-foreground max-sm:size-9"
        onClick={onDismiss}
      >
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <path d="M18 6 6 18M6 6l12 12" />
        </svg>
      </button>
    </li>
  );
}

/**
 * Notifications, the way the best apps do them: compact cards in the top-right corner (full width at the top on a phone,
 * clear of its keyboard), newest first, at most three. Each says what happened and offers one next step; they go
 * away by themselves, wait while you hover or focus them, slide away when dismissed, and can be swiped off on touch.
 * Errors are announced at once (role="alert"); everything else politely (role="status").
 */
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(0);

  const dismiss = useCallback((id: number) => {
    setToasts((all) => all.map((t) => (t.id === id ? { ...t, leaving: true } : t)));
    setTimeout(() => setToasts((all) => all.filter((t) => t.id !== id)), 160);
  }, []);

  const show = useCallback((toast: ToastInput) => {
    const id = ++next.current;
    setToasts((all) => {
      const same = toast.key ? all.find((t) => t.key === toast.key && !t.leaving) : undefined;
      // Same key: update the card that is already there and give it a small nudge, rather than stacking a duplicate.
      if (same) return all.map((t) => (t === same ? { ...toast, id: same.id, leaving: false, bump: t.bump + 1 } : t));
      return [...all.filter((t) => !t.leaving).slice(-2), { ...toast, id, leaving: false, bump: 0 }];
    });
    return id;
  }, []);

  const api = useMemo(() => ({ show, dismiss }), [show, dismiss]);

  return (
    <Ctx.Provider value={api}>
      {children}
      <section
        aria-label="Notifications"
        className="pointer-events-none fixed inset-x-0 top-0 z-[60] flex justify-center px-4 pt-[max(0.75rem,env(safe-area-inset-top))] sm:justify-end sm:px-5 sm:pt-5 print:hidden"
      >
        <ol className="flex w-full max-w-[24rem] flex-col gap-2">
          {[...toasts].reverse().map((t) => (
            <ToastItem key={`${t.id}-${t.bump}`} toast={t} onDismiss={() => dismiss(t.id)} />
          ))}
        </ol>
      </section>
    </Ctx.Provider>
  );
}

/**
 * Shows a one-off message carried in the address (?saved=1), then removes the flag so reloading or sharing
 * the link doesn't show it again.
 */
export function FlashToast({ message, tone = "success", clear }: { message: string | null | undefined; tone?: Tone; clear: string[] }) {
  const { show } = useToast();
  const shown = useRef(false);
  useEffect(() => {
    if (!message || shown.current) return;
    shown.current = true;
    show({ tone, ...split(message) });
    const url = new URL(window.location.href);
    for (const key of clear) url.searchParams.delete(key);
    window.history.replaceState(window.history.state, "", url);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- runs once per message; `clear` is a fresh array each render
  }, [message, tone]);
  return null;
}

/** "Profile saved. Your job matches have been updated." becomes a short title with the rest as the detail line. */
function split(text: string, title?: string): Pick<ToastInput, "message" | "description"> {
  if (title) return { message: title, description: text };
  const parts = text.match(/^(.+?[.!?])\s+([\s\S]+)$/);
  return parts ? { message: parts[1], description: parts[2] } : { message: text };
}

/** `upgrade`: a paid plan lifts this refusal. `verify`: confirming the email does. Either way the toast offers the way there. */
type Outcome = { error?: string | null; success?: string | null; upgrade?: boolean; verify?: boolean } | null | undefined;

/**
 * Turns a server action's result into one toast, once per result: errors as error toasts, confirmations as success
 * toasts. Renders nothing itself, so a form never shifts when its outcome arrives. `only` keeps a form to one kind.
 */
export function ActionToast({ state, only, errorTitle, toastKey }: { state: Outcome; only?: "error" | "success"; errorTitle?: string; toastKey?: string }) {
  const { show } = useToast();
  const seen = useRef(state);
  useEffect(() => {
    if (!state || state === seen.current) return;
    seen.current = state;
    if (state.error && only !== "success") show({ tone: "error", key: toastKey, ...split(state.error, errorTitle), ...(state.upgrade ? { action: { label: "See plans", href: "/app/billing" } } : state.verify ? { action: { label: "Resend link", href: "/app/settings" } } : {}) });
    else if (state.success && only !== "error") show({ tone: "success", key: toastKey, ...split(state.success) });
  }, [state, only, errorTitle, toastKey, show]);
  return null;
}
