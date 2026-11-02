"use client";

import { useEffect } from "react";
import { Button, ButtonLink } from "./ui";

/** Says what failed in plain words and offers the way forward. Never shows the error itself: it can contain someone's data. */
export function ErrorView({ error, reset, home, children }: { error: Error & { digest?: string }; reset: () => void; home: string; children?: React.ReactNode }) {
  useEffect(() => {
    console.error(error);
  }, [error]);
  return (
    <div role="alert" className="mx-auto max-w-md py-16">
      <h1 className="t-heading">Unable to load this page</h1>
      <p className="mt-2 text-sm text-muted">{children ?? "Please try again. If the problem continues, return to this page in a few minutes."}</p>
      {error.digest && <p className="mt-2 font-mono text-xs text-faint">Reference {error.digest}</p>}
      <div className="mt-6 flex gap-2">
        <Button onClick={reset}>Try again</Button>
        <ButtonLink href={home} variant="secondary">
          Go back
        </ButtonLink>
      </div>
    </div>
  );
}
