import Link from "next/link";
import type { CSSProperties, ReactNode } from "react";
import { SITE } from "@/lib/site";
import { Logo } from "./ui";

/** What the product does, in the words the landing page uses. Shown beside the form on wide screens. */
const POINTS = [
  { title: "Roles that fit your CV", text: "Job Radar reads public job sources and explains every match, including what you’re missing." },
  { title: "Tailored with only what’s true", text: "Every CV and cover letter change is checked against your own CV before you see it." },
  { title: "Every application, tracked", text: "Follow-ups, interview practice and mock interviews, all in one place." },
];

/**
 * The sign-in screen: the form, centred, on the left; what you get, on a flat dark panel on the right (hidden on phones
 * and tablets, where the form is the whole screen). Used by log-in and sign-up.
 */
export function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <div className="grid flex-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <div className="relative isolate flex min-h-dvh flex-col overflow-hidden px-5 py-6 sm:px-10 lg:min-h-0">
        <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 lg:hidden">
          <div className="dots absolute inset-0 opacity-50" />
        </div>
        <header>
          <Link href="/" aria-label={`${SITE.name} home`} className="inline-flex min-h-11 items-center rounded">
            <Logo />
          </Link>
        </header>

        <main id="main" className="flex flex-1 items-center justify-center py-10">
          <div className="w-full max-w-sm">
            <h1 className="rise text-center text-[1.75rem] font-semibold leading-tight tracking-[-0.025em] text-balance sm:text-[2rem]">{title}</h1>
            {subtitle && (
              <p className="rise mt-2.5 text-center text-[15px] leading-6 text-muted text-balance" style={{ "--d": "60ms" } as CSSProperties}>
                {subtitle}
              </p>
            )}
            <div className="fade mt-8" style={{ "--d": "140ms" } as CSSProperties}>
              {children}
            </div>
          </div>
        </main>

        <footer className="text-center text-[13px] text-faint">© {new Date().getFullYear()} {SITE.name}</footer>
      </div>

      <aside aria-label={`About ${SITE.name}`} className="hidden border-l border-sidebar-border bg-sidebar text-sidebar-fg lg:flex lg:items-center lg:px-14 xl:px-24">
        <div className="w-full max-w-md py-16">
          <p className="text-balance text-[2.5rem] font-semibold leading-[1.08] tracking-[-0.035em] xl:text-5xl">
            A CV for every job.
            <span className="block text-sidebar-muted">Nothing made up.</span>
          </p>

          <ol className="mt-14 divide-y divide-sidebar-border border-y border-sidebar-border">
            {POINTS.map((point, i) => (
              <li key={point.title} className="grid grid-cols-[2.25rem_minmax(0,1fr)] py-5">
                <span className="pt-0.5 font-mono text-xs tabular-nums text-sidebar-muted">{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <p className="text-[15px] font-medium">{point.title}</p>
                  <p className="mt-1 text-sm leading-6 text-sidebar-muted">{point.text}</p>
                </div>
              </li>
            ))}
          </ol>

          <p className="mt-6 text-sm text-sidebar-muted">Free for your first job. No card needed.</p>
        </div>
      </aside>
    </div>
  );
}
