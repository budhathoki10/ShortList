import type { Metadata } from "next";
import { DeleteAccountForm, VerifyEmailBanner } from "@/components/auth-forms";
import { PushManager } from "@/components/discovery/push-manager";
import { buttonClass, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { pushConfigured } from "@/lib/discovery/notifications";

export const metadata: Metadata = { title: "Settings" };

export default async function SettingsPage() {
  const user = await requireUser();
  return (
    <div className="max-w-3xl space-y-10">
      <PageHeader title="Settings" description={`${user.name} · ${user.email}`} />
      <section aria-label="Email verification" className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-base font-semibold">Email address</h2>
        {user.emailVerifiedAt ? <p className="mt-2 text-sm text-success">Verified · {user.email}</p> : <VerifyEmailBanner email={user.email} />}
      </section>

      <section aria-label="Notifications" className="rounded-xl border border-border bg-surface p-5 sm:p-6">
        <PushManager publicKey={process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY ?? ""} configured={pushConfigured()} />
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
        <DeleteAccountForm />
      </section>
    </div>
  );
}
