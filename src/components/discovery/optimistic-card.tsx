"use client";

import { createContext, useContext, useOptimistic, useTransition, type ReactNode } from "react";
import { dismissRadarMatch } from "@/app/actions/discovery";
import { Button } from "@/components/ui";
import { useToast } from "@/components/toast";

const HideContext = createContext<((run: () => Promise<void>) => void) | null>(null);

/**
 * A Radar match card that leaves the list the moment it is dismissed, before the server answers.
 * If the save fails the card comes back and a toast says so. On success the page refresh removes it for good.
 */
export function OptimisticCard({ children, className }: { children: ReactNode; className?: string }) {
  const [hidden, setHidden] = useOptimistic(false);
  const [, startTransition] = useTransition();
  const hideWhile = (run: () => Promise<void>) =>
    startTransition(async () => {
      setHidden(true);
      await run();
    });
  if (hidden) return null;
  return (
    <HideContext.Provider value={hideWhile}>
      <article className={className}>{children}</article>
    </HideContext.Provider>
  );
}

export function DismissMatch({ recommendationId, reasons }: { recommendationId: string; reasons: string[] }) {
  const hideWhile = useContext(HideContext);
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const submit = (formData: FormData) => {
    const run = async () => {
      try {
        await dismissRadarMatch(formData);
      } catch {
        toast.show({ tone: "error", message: "Couldn’t dismiss this match. Check your connection and try again." });
      }
    };
    // Inside a card: hide it at once. On its own: just run in the background.
    if (hideWhile) hideWhile(run);
    else startTransition(run);
  };

  return (
    <form action={submit} className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
      <input type="hidden" name="recommendationId" value={recommendationId} />
      <label className="sr-only" htmlFor={`dismiss-${recommendationId}`}>Dismiss reason</label>
      <select id={`dismiss-${recommendationId}`} name="reason" defaultValue="not interested" className="h-8 max-w-44 rounded border border-border bg-surface px-2 text-xs text-muted max-sm:h-11">
        {reasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
      </select>
      <Button type="submit" variant="ghost" size="sm" loading={pending}>Dismiss</Button>
    </form>
  );
}
