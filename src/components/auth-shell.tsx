import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "./ui";

/** Narrow single-column layout shared by sign-up, log-in and password pages. */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main id="main" className="relative isolate flex-1 overflow-hidden">
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
        <div className="dots absolute inset-0 opacity-50" />
        <div className="wash absolute -left-40 top-10 size-[34rem] max-sm:size-[22rem]" />
      </div>
      <div className="mx-auto w-full max-w-[27rem] px-4 py-10 sm:py-16">
        <Link href="/" aria-label="Shortlist Job Radar home" className="rise inline-flex min-h-11 items-center rounded">
          <Logo />
        </Link>
        <h1 className="t-heading rise mt-10" style={{ animationDelay: "60ms" }}>
          {title}
        </h1>
        {subtitle && (
          <p className="rise mt-1.5 text-sm text-muted" style={{ animationDelay: "120ms" }}>
            {subtitle}
          </p>
        )}
        <div className="fade mt-7 rounded-xl border border-border bg-surface p-5 shadow-[0_10px_30px_-18px_rgb(17_19_26/0.2)] sm:p-6" style={{ animationDelay: "180ms" }}>
          {children}
        </div>
      </div>
    </main>
  );
}
