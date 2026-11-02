"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { abandonCheckoutAction, cancelSubscriptionAction, confirmCheckout, startCheckout } from "@/app/actions/subscription";
import { ConfirmAction } from "./confirm-action";
import { useToast } from "./toast";
import { Badge, Button, Notice } from "./ui";

/** `badge` is a short fact about the price ("Save 17%"); `recommended` gives that choice the primary button. */
export type PlanChoice = { interval: "monthly" | "yearly"; title: string; price: string | null; note: string; badge?: string | null; recommended?: boolean };

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

/**
 * Monthly and yearly choices. Clicking one asks the SERVER to prepare checkout (it decides the plan, price, sandbox
 * flag and locks the buyer's email to this account), then opens Freemius's overlay with what it returned. When the overlay
 * reports a finished payment, this only asks the server to go and confirm it with Freemius: the browser never tells
 * the server a payment happened, so there is nothing here to forge.
 */
export function SubscribePlans({ plans, disabledReason }: { plans: PlanChoice[]; disabledReason: string | null }) {
  const router = useRouter();
  const toast = useToast();
  const [busy, setBusy] = useState<PlanChoice["interval"] | null>(null);
  const [waiting, setWaiting] = useState(false);
  const opened = useRef(false);

  // After a payment, give the confirmation a minute to land (a webhook or the server's own lookup), refreshing as it does.
  async function awaitConfirmation() {
    setWaiting(true);
    for (let i = 0; i < 15; i++) {
      const result = await confirmCheckout();
      router.refresh();
      if (result?.active) {
        toast.show({ tone: "success", message: "You're subscribed. Paid features are unlocked." });
        break;
      }
      await sleep(4_000);
    }
    setWaiting(false);
  }

  async function open(interval: PlanChoice["interval"]) {
    setBusy(interval);
    try {
      const data = new FormData();
      data.set("interval", interval);
      const result = await startCheckout(undefined, data);
      if (!result?.options) {
        toast.show({ tone: "error", key: "checkout", message: "Checkout didn't open", description: result?.error ?? "Try again in a moment." });
        router.refresh();
        return;
      }
      const { Checkout } = await import("@freemius/checkout");
      opened.current = false;
      new Checkout(result.options).open({
        purchaseCompleted: () => {
          opened.current = true;
          void awaitConfirmation();
        },
        success: () => {
          opened.current = true;
          void awaitConfirmation();
        },
        // Closed without paying: free the "one checkout at a time" slot straight away.
        cancel: () => {
          if (!opened.current) void abandonCheckoutAction().then(() => router.refresh());
        },
      });
    } catch {
      toast.show({ tone: "error", key: "checkout", message: "Checkout didn't open", description: "Check your connection and try again." });
    } finally {
      setBusy(null);
    }
  }

  return (
    <div className="space-y-3">
      <div className="grid gap-3 sm:grid-cols-2">
        {plans.map((p) => (
          <div key={p.interval} className={`flex flex-col justify-between gap-5 rounded-md border bg-surface p-5 ${p.recommended ? "border-strong-border" : "border-border"}`}>
            <div>
              <div className="flex min-h-5 items-center justify-between gap-2">
                <p className="text-sm font-medium">{p.title}</p>
                {p.badge && <Badge tone="accent">{p.badge}</Badge>}
              </div>
              <p className="mt-2 text-2xl font-semibold tracking-[-0.02em] tabular-nums">{p.price ?? "Price shown at checkout"}</p>
              <p className="mt-1 text-[13px] text-muted">{p.note}</p>
            </div>
            <Button
              type="button"
              variant={p.recommended ? "primary" : "secondary"}
              className="w-full"
              onClick={() => open(p.interval)}
              loading={busy === p.interval}
              disabled={!!disabledReason || waiting || busy !== null}
            >
              {busy === p.interval ? "Opening checkout…" : `Subscribe ${p.interval}`}
            </Button>
          </div>
        ))}
      </div>
      {disabledReason && <p className="text-sm text-muted">{disabledReason}</p>}
      {waiting && <Notice title="Confirming your subscription">Checkout is complete. We’re waiting for confirmation from the payment provider before updating your access.</Notice>}
    </div>
  );
}

/** Check with Freemius again. It sends nothing: the server asks Freemius and shows what it says. */
export function CheckAgain() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      loading={busy}
      onClick={async () => {
        setBusy(true);
        await confirmCheckout();
        router.refresh();
        setBusy(false);
      }}
    >
      {busy ? "Checking…" : "Check again"}
    </Button>
  );
}

/** Asking to cancel: named, confirmed, and honest that what's paid for stays usable. */
export function CancelSubscription({ subscriptionId, paidThrough }: { subscriptionId: string; paidThrough: string | null }) {
  const router = useRouter();
  const toast = useToast();
  return (
    <ConfirmAction
      trigger="Cancel subscription"
      title="Cancel your subscription?"
      confirmLabel="Cancel subscription"
      pendingLabel="Cancelling…"
      fields={{ subscriptionId }}
      action={async (formData) => {
        const result = await cancelSubscriptionAction(formData);
        toast.show({ tone: result?.error ? "error" : "success", message: result?.error ?? result?.success ?? "Done." });
        router.refresh();
      }}
    >
      It won&apos;t renew. You keep everything until {paidThrough ?? "the end of the period you've paid for"}.
    </ConfirmAction>
  );
}
