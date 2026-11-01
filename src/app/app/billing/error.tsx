"use client";

import { ErrorView } from "@/components/error-view";

export default function BillingError(props: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <ErrorView {...props} home="/app">
      We couldn’t load your plan and payments. Your subscription and any payment you made are not affected. Please try again in a moment.
    </ErrorView>
  );
}
