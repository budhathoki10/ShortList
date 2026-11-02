"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { AppNav, OPEN_PALETTE } from "./app-nav";
import { icons } from "./icons";
import { Logo } from "./ui";

/** Below `lg` the sidebar becomes a drawer. A native <dialog>: Esc closes it and focus returns to the menu button. */
export function MobileNav({ followUps, email, paid }: { followUps: number; email: string; paid: boolean }) {
  const ref = useRef<HTMLDialogElement>(null);
  const pathname = usePathname();
  // The menu's contents exist only while it is open, so the page never holds two copies of the navigation.
  const [open, setOpen] = useState(false);

  // A navigation (link, back button, palette) always closes the drawer.
  useEffect(() => {
    ref.current?.close();
  }, [pathname]);

  useEffect(() => {
    if (open) ref.current?.showModal();
  }, [open]);

  return (
    <div className="sticky top-0 z-30 flex h-[calc(3.5rem+env(safe-area-inset-top))] items-center gap-1 border-b border-border bg-surface px-2 pt-[env(safe-area-inset-top)] lg:hidden print:hidden">
      <button
        type="button"
        aria-label="Open menu"
        onClick={() => setOpen(true)}
        className="grid size-11 place-items-center rounded text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-foreground"
      >
        <icons.menu width={20} height={20} />
      </button>
      <span className="flex-1">
        <Logo />
      </span>
      <button
        type="button"
        aria-label="Search or jump to"
        onClick={() => window.dispatchEvent(new Event(OPEN_PALETTE))}
        className="grid size-11 place-items-center rounded text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-foreground"
      >
        <icons.search width={20} height={20} />
      </button>

      <dialog ref={ref} aria-label="Menu" className="drawer" onClose={() => setOpen(false)} onClick={(e) => e.target === ref.current && ref.current?.close()}>
        {open && (
          <>
            <div className="absolute right-2 top-[calc(.5rem+env(safe-area-inset-top))]">
              <button
                type="button"
                aria-label="Close menu"
                onClick={() => ref.current?.close()}
                className="grid size-11 place-items-center rounded text-sidebar-muted transition-colors duration-150 hover:bg-sidebar-hover hover:text-sidebar-fg"
              >
                <icons.close width={18} height={18} />
              </button>
            </div>
            <AppNav variant="full" followUps={followUps} email={email} paid={paid} onNavigate={() => ref.current?.close()} />
          </>
        )}
      </dialog>
    </div>
  );
}
