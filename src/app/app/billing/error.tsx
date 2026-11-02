"use client";

import { ErrorView } from "@/components/error-view";

// `retry` re-fetches the page's data (Next 16.3+), which is what a failed load needs; `reset` would only re-render.
export default function BillingError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  return (
    <ErrorView error={error} reset={retry} home="/app">
      We couldn’t load your plan and payments. Your subscription and any payment you made are not affected. Please try again in a moment.
    </ErrorView>
  );
}
