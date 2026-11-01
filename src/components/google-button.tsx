"use client";

import { useEffect, useState } from "react";
import { Spinner } from "./ui";

function GoogleMark() {
  return (
    <svg width="20" height="20" viewBox="0 0 18 18" aria-hidden="true">
      <path fill="#4285F4" d="M17.64 9.2c0-.64-.06-1.25-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.88 2.68-6.62Z" />
      <path fill="#34A853" d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.92-2.26c-.8.54-1.84.86-3.04.86-2.34 0-4.33-1.58-5.04-3.7H.96v2.33A9 9 0 0 0 9 18Z" />
      <path fill="#FBBC05" d="M3.96 10.72A5.4 5.4 0 0 1 3.68 9c0-.6.1-1.18.28-1.72V4.95H.96A9 9 0 0 0 0 9c0 1.45.35 2.83.96 4.05l3-2.33Z" />
      <path fill="#EA4335" d="M9 3.58c1.32 0 2.5.45 3.44 1.35l2.58-2.58C13.46.9 11.43 0 9 0A9 9 0 0 0 .96 4.95l3 2.33C4.67 5.16 6.66 3.58 9 3.58Z" />
    </svg>
  );
}

/**
 * Starts Google sign-in. It is a plain link, so the browser makes a normal request to the sign-in route and nothing
 * prefetches it. Once pressed it says what is happening and ignores a second press, until the person comes back.
 */
export function GoogleButton({ href }: { href: string }) {
  const [pending, setPending] = useState(false);

  // Pressing Back from Google restores this page exactly as it was, so the button must not stay on "Opening Google…".
  useEffect(() => {
    const restore = (event: PageTransitionEvent) => {
      if (event.persisted) setPending(false);
    };
    window.addEventListener("pageshow", restore);
    return () => window.removeEventListener("pageshow", restore);
  }, []);

  return (
    <a
      href={href}
      aria-busy={pending || undefined}
      aria-disabled={pending || undefined}
      onClick={(event) => {
        if (pending) event.preventDefault();
        else setPending(true);
      }}
      className="flex h-12 w-full select-none items-center justify-center gap-3 rounded-lg border border-strong-border bg-surface text-[15px] font-medium text-foreground shadow-[0_1px_2px_rgb(17_19_26/0.06)] transition-[background-color,border-color,box-shadow,transform] duration-150 ease-out hover:border-faint hover:bg-surface-hover hover:shadow-sm active:translate-y-px aria-disabled:pointer-events-none aria-disabled:opacity-70"
    >
      {pending ? <Spinner className="size-5" /> : <GoogleMark />}
      {pending ? "Opening Google…" : "Continue with Google"}
    </a>
  );
}
