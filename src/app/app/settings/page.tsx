import type { Metadata } from "next";
import { DeleteAccountForm } from "@/components/auth-forms";
import { removeSavedPushDevice } from "@/app/actions/discovery";
import { PushManager } from "@/components/discovery/push-manager";
import { SubmitButton } from "@/components/submit-button";
import { NotificationsSwitch } from "@/components/notifications-switch";
import { buttonClass, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { formatDay } from "@/lib/dates";
import { pushConfigured } from "@/lib/discovery/notifications";
import { deviceName } from "@/lib/discovery/push-endpoints";
import { listPushDevices } from "@/lib/services/discovery";
import { notificationsOn } from "@/lib/services/notification-settings";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  const on = notificationsOn(user);
  const devices = await listPushDevices(user.id);
  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader title="Settings" description={`${user.name} · ${user.email}`} />
      <section aria-label="Sign-in" className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-base font-semibold">Sign-in</h2>
        <p className="mt-2 break-all text-sm text-muted">You sign in with Google as {user.email}.</p>
        {user.emailVerifiedAt && <p className="mt-1 text-sm text-success">Email verified by Google</p>}
      </section>

      <section id="notifications" aria-labelledby="notifications-label" className="scroll-mt-20 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <NotificationsSwitch initialOn={on} />
        <div className="mt-5 border-t border-border pt-5">
          <PushManager publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} configured={pushConfigured()} accountOn={on} />
          {devices.length > 0 && (
            <div className="mt-5">
              <h3 className="text-sm font-semibold">Devices that get push alerts</h3>
              <ul className="mt-2 divide-y divide-border rounded-md border border-border">
                {devices.map((device) => (
                  <li key={device._id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 px-4 py-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{deviceName(device.deviceLabel)}</p>
                      <p className="text-xs text-muted">
                        Added {formatDay(device.createdAt)}
                        {device.lastSuccessAt ? ` · last alert ${formatDay(device.lastSuccessAt)}` : ""}
                      </p>
                    </div>
                    <form action={removeSavedPushDevice}>
                      <input type="hidden" name="subscriptionId" value={device._id} />
                      <SubmitButton variant="secondary" size="sm" pendingLabel="Removing…" aria-label={`Remove ${deviceName(device.deviceLabel)}, added ${formatDay(device.createdAt)}`}>
                        Remove
                      </SubmitButton>
                    </form>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      </section>

      <section aria-labelledby="your-data" className="space-y-3 border-t border-border pt-8">
        <h2 id="your-data" className="text-base font-semibold">
          Your data
        </h2>
        <p className="text-sm text-muted">A copy of everything you’ve given us: your profile, every job, tailored CV, cover letter and interview note, as one JSON file.</p>
        <a href="/app/settings/export" className={buttonClass("secondary")}>
          Download my data
        </a>
      </section>

      <section aria-labelledby="danger" className="space-y-3 rounded-md border border-danger/30 p-5">
        <h2 id="danger" className="text-base font-semibold text-danger">
          Delete account
        </h2>
        <DeleteAccountForm email={user.email} />
      </section>
    </div>
  );
}
