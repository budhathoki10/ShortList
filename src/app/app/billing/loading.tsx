import { Skeleton } from "@/components/ui";

/** The billing page's own outline (plan card, usage, plans, table), so nothing jumps when the real page arrives. */
export default function BillingLoading() {
  return (
    <div className="max-w-3xl space-y-12" role="status" aria-label="Loading">
      <div className="space-y-2">
        <Skeleton className="h-7 w-48" />
        <Skeleton className="h-4 w-72 max-w-full" />
      </div>
      <Skeleton className="h-36" />
      <div className="space-y-4">
        <Skeleton className="h-5 w-24" />
        <Skeleton className="h-24" />
      </div>
      <div className="space-y-4">
        <Skeleton className="h-5 w-40" />
        <div className="grid gap-3 sm:grid-cols-2">
          <Skeleton className="h-40" />
          <Skeleton className="h-40" />
        </div>
      </div>
      <Skeleton className="h-64" />
    </div>
  );
}
