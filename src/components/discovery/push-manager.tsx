"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { registerPushSubscription, removePushSubscription, testPushNotification, type SerializedPushSubscription } from "@/app/actions/discovery";
import { useToast } from "@/components/toast";
import { Button, Switch } from "@/components/ui";

function applicationServerKey(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const raw = atob((value + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from([...raw].map((character) => character.charCodeAt(0)));
}

function serialized(subscription: PushSubscription): SerializedPushSubscription {
  const data = subscription.toJSON();
  return { endpoint: subscription.endpoint, keys: { p256dh: data.keys?.p256dh ?? "", auth: data.keys?.auth ?? "" } };
}

/** Why subscribing failed, in words a person can act on. Browsers throw terse, vendor-specific errors here. */
function subscribeError(error: unknown) {
  const text = error instanceof Error ? `${error.name} ${error.message}` : "";
  if (/push service|AbortError|Registration failed/i.test(text))
    return "The browser's push service refused. In Brave, turn on “Use Google services for push messaging” in Settings → Privacy, then try again.";
  if (/applicationServerKey|InvalidAccessError/i.test(text)) return "This server's push key is invalid. Check NEXT_PUBLIC_VAPID_PUBLIC_KEY.";
  return error instanceof Error ? error.message : "Try again in a moment.";
}

/** One switch: on subscribes this device to push alerts, off removes it. */
export function PushManager({ publicKey, configured, accountOn = true }: { publicKey: string; configured: boolean; accountOn?: boolean }) {
  const [supported, setSupported] = useState<boolean | null>(configured ? null : false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
  const [testing, setTesting] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (!configured) return;
    const available = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
    if (!available) {
      queueMicrotask(() => setSupported(false));
      return;
    }
    navigator.serviceWorker.register("/sw.js", { scope: "/", updateViaCache: "none" }).then((registration) => registration.pushManager.getSubscription()).then((current) => {
      setSubscription(current);
      setSupported(true);
    }).catch(() => setSupported(false));
  }, [configured]);

  async function enable() {
    const answer = await Notification.requestPermission();
    if (answer === "denied") throw new Error("Notifications are blocked for this site. Allow them in your browser's site settings, then try again.");
    if (answer !== "granted") return;
    const registration = await navigator.serviceWorker.ready;
    let next: PushSubscription;
    try {
      next = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: applicationServerKey(publicKey) });
    } catch (error) {
      throw new Error(subscribeError(error));
    }
    const saved = await registerPushSubscription(serialized(next), navigator.userAgent.slice(0, 80));
    if (!saved.success) {
      await next.unsubscribe().catch(() => {});
      throw new Error(saved.error);
    }
    setSubscription(next);
  }

  async function disable(current: PushSubscription) {
    await removePushSubscription(current.endpoint);
    await current.unsubscribe();
    setSubscription(null);
  }

  async function toggle() {
    setBusy(true);
    try {
      if (subscription) await disable(subscription);
      else await enable();
    } catch (error) {
      toast.show({ tone: "error", message: subscription ? "Could not turn off push notifications." : "Could not turn on push notifications.", description: error instanceof Error ? error.message : undefined });
    } finally {
      setBusy(false);
    }
  }

  async function sendTest() {
    setTesting(true);
    try {
      const result = await testPushNotification();
      if (result.success) toast.show({ tone: "success", message: "Test notification sent", description: "It should appear on this device in a few seconds." });
      else toast.show({ tone: "error", message: "Test notification not sent", description: result.error });
    } catch {
      toast.show({ tone: "error", message: "Test notification not sent", description: "Check your connection and try again." });
    } finally {
      setTesting(false);
    }
  }

  const on = Boolean(subscription);
  const hint = !configured ? "Not set up on this server." : supported === false ? "Not supported in this browser." : "Job Radar alerts on this device, whenever notifications are on for your account.";

  return (
    <div>
      <div className="flex items-start justify-between gap-4">
        <div className="min-w-0">
          <h3 id="push-label" className="text-sm font-semibold">
            Push notifications on this device
          </h3>
          <p id="push-hint" className="mt-0.5 text-sm text-muted">
            {hint}
          </p>
        </div>
        <Switch checked={on} busy={busy || (configured && supported === null)} disabled={!supported} onClick={toggle} aria-labelledby="push-label" aria-describedby="push-hint" className="mt-0.5" />
      </div>
      {on && !accountOn && (
        <p className="mt-3 text-[13px] text-warning">
          This device stays registered, but nothing is sent while notifications are off for your account.
        </p>
      )}
      {on && accountOn && (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <Button type="button" variant="secondary" size="sm" loading={testing} onClick={sendTest}>
            {testing ? "Sending…" : "Send a test notification"}
          </Button>
          <Link href="/app/radar#alert-settings" className="text-[13px] font-medium text-accent hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">
            Alert settings
          </Link>
        </div>
      )}
    </div>
  );
}
