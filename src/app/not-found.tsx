import Link from "next/link";
import { ButtonLink, Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main id="main" className="mx-auto w-full max-w-md flex-1 px-4 py-16 sm:py-24">
      <Link href="/" aria-label="Shortlist home" className="inline-flex min-h-11 items-center rounded">
        <Logo />
      </Link>
      <p className="mt-14 font-mono text-sm text-faint">404</p>
      <h1 className="t-heading mt-2">Page not found</h1>
      <p className="mt-2 text-sm text-muted">The link may be mistyped, or the page has been removed or belongs to someone else’s account.</p>
      <div className="mt-6 flex gap-2">
        <ButtonLink href="/app" variant="secondary">
          Your job hunt
        </ButtonLink>
        <ButtonLink href="/" variant="ghost">
          Home page
        </ButtonLink>
      </div>
    </main>
  );
}
