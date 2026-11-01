"use client";

import { useEffect, useState } from "react";
import { registerPushSubscription, removePushSubscription, type SerializedPushSubscription } from "@/app/actions/discovery";
import { useToast } from "@/components/toast";

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
export function PushManager({ publicKey, configured }: { publicKey: string; configured: boolean }) {
  const [supported, setSupported] = useState<boolean | null>(configured ? null : false);
  const [subscription, setSubscription] = useState<PushSubscription | null>(null);
  const [busy, setBusy] = useState(false);
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

  const on = Boolean(subscription);
  const hint = !configured ? "Not set up on this server." : supported === false ? "Not supported in this browser." : null;

  return (
    <div className="flex items-center justify-between gap-4">
      <div className="min-w-0">
        <p id="push-label" className="text-base font-semibold">Push notifications</p>
        {hint && <p className="mt-0.5 text-sm text-muted">{hint}</p>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={on}
        aria-labelledby="push-label"
        aria-busy={busy || supported === null}
        disabled={busy || !supported}
        onClick={toggle}
        className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer items-center rounded-full transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-50 ${on ? "bg-accent hover:bg-accent-hover" : "bg-strong-border hover:bg-faint"}`}
      >
        <span aria-hidden="true" className={`inline-block size-5 rounded-full bg-white shadow-sm transition-transform duration-150 ${on ? "translate-x-[22px]" : "translate-x-0.5"}`} />
      </button>
    </div>
  );
}
