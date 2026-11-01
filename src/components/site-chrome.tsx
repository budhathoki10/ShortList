import Link from "next/link";
import { getCurrentUser } from "@/lib/auth/session";
import { HeaderShell } from "./header-shell";
import { ButtonLink, Logo } from "./ui";

const navLink =
  "relative h-9 items-center max-sm:h-11 whitespace-nowrap rounded px-2.5 text-sm text-muted transition-colors duration-150 hover:text-foreground after:absolute after:inset-x-2.5 after:bottom-1.5 after:h-px after:origin-left after:scale-x-0 after:bg-accent after:transition-transform after:duration-200 after:ease-out hover:after:scale-x-100 focus-visible:after:scale-x-100";

export async function SiteHeader() {
  const user = await getCurrentUser();
  return (
    <HeaderShell>
      <div className="mx-auto flex h-14 max-w-5xl items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" aria-label="Shortlist home" className="inline-flex min-h-11 items-center rounded">
          <Logo />
        </Link>
        <nav aria-label="Site" className="flex items-center gap-1">
          <Link href="/#how" className={`${navLink} hidden sm:inline-flex`}>
            How it works
          </Link>
          <Link href="/templates" className={`${navLink} hidden sm:inline-flex`}>
            Templates
          </Link>
          <Link href="/#pricing" className={`${navLink} hidden sm:inline-flex`}>
            Pricing
          </Link>
          {user ? (
            <ButtonLink href="/app" size="sm">
              Go to your job hunt
            </ButtonLink>
          ) : (
            <>
              <Link href="/login" className={`inline-flex ${navLink}`}>
                Log in
              </Link>
              <ButtonLink href="/signup" size="sm">
                Start free
              </ButtonLink>
            </>
          )}
        </nav>
      </div>
    </HeaderShell>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-border">
      <div className="mx-auto flex max-w-5xl flex-col gap-3 px-4 py-8 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between sm:px-6">
        <span>© {new Date().getFullYear()} Shortlist</span>
        <nav aria-label="Footer" className="flex flex-wrap gap-x-5 gap-y-1">
          <Link href="/templates" className="py-1 hover:text-foreground max-sm:py-3">
            Templates
          </Link>
          <Link href="/terms" className="py-1 hover:text-foreground max-sm:py-3">
            Terms
          </Link>
          <Link href="/privacy" className="py-1 hover:text-foreground max-sm:py-3">
            Privacy
          </Link>
          <Link href="/refund" className="py-1 hover:text-foreground max-sm:py-3">
            Refunds
          </Link>
        </nav>
      </div>
    </footer>
  );
}
