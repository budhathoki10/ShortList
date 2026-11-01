"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions/auth";
import { icons, type IconName } from "./icons";

export const NAV: { href: string; label: string; icon: IconName }[] = [
  { href: "/app", label: "Today", icon: "today" },
  { href: "/app/radar", label: "Job Radar", icon: "radar" },
  { href: "/app/jobs", label: "Jobs", icon: "jobs" },
  { href: "/app/profile", label: "Your CV", icon: "cv" },
  { href: "/app/studio", label: "Templates", icon: "studio" },
  { href: "/app/progress", label: "Progress", icon: "progress" },
  { href: "/app/settings", label: "Settings", icon: "settings" },
];

export const OPEN_PALETTE = "shortlist:palette";

const base =
  "group/item relative flex h-11 w-full items-center rounded-md text-sm outline-offset-[-2px] transition-colors duration-150 focus-visible:outline-sidebar-fg max-lg:h-12";
// Idle and selected are separate sets (never both on one element), so their text colours can't fight.
const idle = "text-sidebar-muted hover:bg-sidebar-hover hover:text-sidebar-fg";
const on =
  "bg-sidebar-active font-medium text-sidebar-fg before:absolute before:inset-y-2.5 before:left-0 before:w-[3px] before:rounded-full before:bg-accent";

/** The desktop icon rail expands over the page on hover or keyboard focus. */
export function AppNav({
  followUps = 0,
  email,
  paid,
  variant = "rail",
  onNavigate,
}: {
  followUps?: number;
  email: string;
  paid: boolean;
  variant?: "rail" | "full";
  onNavigate?: () => void;
}) {
  const pathname = usePathname();
  const rail = variant === "rail";
  // Labels stay accessible while hidden, and the mobile drawer always shows them.
  const label = rail ? "opacity-0 transition-opacity duration-150 group-hover/rail:opacity-100 group-focus-within/rail:opacity-100" : "";
  const cell = "grid h-11 w-12 shrink-0 place-items-center max-lg:h-12";

  const body = (
    <div className="flex h-full flex-col gap-1 px-3 py-4">
      <div className="mb-3 flex h-11 items-center">
        <Link href="/app" aria-label="Shortlist Job Radar, your job hunt" onClick={onNavigate} className={`${base} gap-0 text-sidebar-fg`}>
          <span className={cell}>
            <svg width="22" height="22" viewBox="0 0 20 20" aria-hidden="true">
              <rect width="20" height="20" rx="5" fill="currentColor" />
              <path d="M5.5 10.5l3 3 6-6.5" fill="none" stroke="var(--sidebar)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </span>
          <span className={`whitespace-nowrap text-base font-semibold tracking-[-0.02em] ${label}`}>Shortlist Job Radar</span>
        </Link>
      </div>

      <button
        type="button"
        onClick={() => {
          onNavigate?.();
          window.dispatchEvent(new Event(OPEN_PALETTE));
        }}
        className={`${base} ${idle} mb-2`}
      >
        <span className={cell}>
          <icons.search width={20} height={20} />
        </span>
        <span className={`flex-1 whitespace-nowrap pr-2 text-left ${label}`}>Search or jump to…</span>
      </button>

      <nav aria-label="Main" className="flex flex-col gap-1">
        {NAV.map((n) => {
          const active = n.href === "/app" ? pathname === "/app" : pathname.startsWith(n.href);
          const Icon = icons[n.icon];
          return (
            <Link
              key={n.href}
              href={n.href}
              onClick={onNavigate}
              aria-current={active ? "page" : undefined}
              className={`${base} ${active ? on : idle}`}
            >
              <span className={cell}>
                <Icon width={20} height={20} />
                {n.href === "/app" && followUps > 0 && (
                  <span
                    className="absolute left-7 top-1.5 grid min-w-4 place-items-center rounded-full bg-accent px-1 font-mono text-[10px] leading-4 text-on-accent tabular-nums"
                    aria-label={`${followUps} to follow up`}
                  >
                    {followUps}
                  </span>
                )}
              </span>
              <span className={`flex-1 whitespace-nowrap pr-2 ${label}`}>{n.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-1 border-t border-sidebar-border pt-3">
        <Link href="/app/billing" onClick={onNavigate} aria-current={pathname.startsWith("/app/billing") ? "page" : undefined} className={`${base} ${pathname.startsWith("/app/billing") ? on : idle}`}>
          <span className={cell}>
            <icons.billing width={20} height={20} />
          </span>
          <span className={`whitespace-nowrap ${label}`}>{paid ? "Paid plan" : "Free plan · Upgrade"}</span>
        </Link>
        <div className="flex h-11 items-center text-sidebar-muted max-lg:h-12" title={email}>
          <span className={cell}>
            <span aria-hidden="true" className="grid size-7 place-items-center rounded-full bg-sidebar-active text-xs font-medium uppercase text-sidebar-fg">
              {email.charAt(0)}
            </span>
          </span>
          <span className={`min-w-0 flex-1 truncate pr-2 text-xs ${label}`}>{email}</span>
        </div>
        <form action={logout}>
          <button type="submit" className={`${base} ${idle}`}>
            <span className={cell}>
              <icons.logout width={20} height={20} />
            </span>
            <span className={`whitespace-nowrap ${label}`}>Log out</span>
          </button>
        </form>
      </div>
    </div>
  );

  if (!rail) return <div className="h-full w-full bg-sidebar text-sidebar-fg">{body}</div>;

  return (
    <div className="group/rail absolute inset-y-0 left-0 z-40 w-[4.5rem] overflow-hidden bg-sidebar text-sidebar-fg shadow-none transition-[width,box-shadow] duration-200 ease-out hover:w-60 hover:shadow-2xl hover:shadow-black/30 focus-within:w-60 focus-within:shadow-2xl focus-within:shadow-black/30">
      <div className="h-full w-60">{body}</div>
    </div>
  );
}
