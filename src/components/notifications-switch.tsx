"use client";

import { useState, useTransition } from "react";
import { setNotifications } from "@/app/actions/settings";
import { useToast } from "@/components/toast";
import { Switch } from "@/components/ui";

/** The account-wide switch for job alerts, push and follow-up reminders. Security email is never affected. */
export function NotificationsSwitch({ initialOn }: { initialOn: boolean }) {
  const [on, setOn] = useState(initialOn);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const toast = useToast();

  function toggle() {
    const next = !on;
    setError(null);
    startTransition(async () => {
      let result: Awaited<ReturnType<typeof setNotifications>>;
      try {
        result = await setNotifications(next);
      } catch {
        result = { success: false, error: "We couldn't reach Shortlist Job Radar. Check your connection and try again." };
      }
      if (!result.success) {
        setError(result.error);
        return;
      }
      setOn(result.on);
      toast.show({ tone: "success", message: result.on ? "Notifications turned on" : "Notifications turned off" });
    });
  }

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h2 id="notifications-label" className="text-base font-semibold">
            Notifications
          </h2>
          <p id="notifications-hint" className="mt-1 text-sm text-muted">
            Job-match emails, push alerts and follow-up reminders. Emails about your account’s security, such as password resets, always arrive.
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-3 pt-0.5">
          <span aria-hidden="true" className={`w-7 text-right text-sm font-medium ${on ? "text-foreground" : "text-muted"}`}>
            {on ? "On" : "Off"}
          </span>
          <Switch checked={on} busy={pending} onClick={toggle} aria-labelledby="notifications-label" aria-describedby="notifications-hint" data-testid="notifications-switch" />
        </div>
      </div>
      {error && (
        <p role="alert" className="mt-3 text-sm text-danger">
          {error}
        </p>
      )}
      {!on && !error && (
        <p className="mt-3 rounded border border-border bg-sunken px-3 py-2 text-[13px] text-muted">
          Notifications are off. Nothing from Job Radar or follow-up reminders will reach you until you turn them back on.
        </p>
      )}
    </div>
  );
}
