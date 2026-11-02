import type { Metadata } from "next";
import { ProfileEditor } from "@/components/profile-editor";
import { ProfileImport } from "@/components/profile-import";
import { FlashToast } from "@/components/toast";
import { buttonClass, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { getProfileRow, profileReady } from "@/lib/services/profile";
import { profileNeedsRepair } from "@/lib/cv/quality";

export const metadata: Metadata = { title: "Your CV" };

export default async function ProfilePage({ searchParams }: PageProps<"/app/profile">) {
  const user = await requireUser();
  const [{ welcome, needed, imported, at }, row] = await Promise.all([searchParams, getProfileRow(user.id)]);
  const profile = row?.data ?? null;
  const ready = profileReady(profile);

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <PageHeader
          title={profile ? "Your CV" : "Start with your CV"}
          eyebrow={welcome === "1" ? "Step 1 of 2" : "Your application foundation"}
          description="Your experience, in one place. Review each section once, then use it for every application."
          actions={ready && !profileNeedsRepair(profile) ? <a href={row?.original?.type === "application/pdf" ? "/app/download/profile" : "/app/print/profile"} target={row?.original?.type === "application/pdf" ? undefined : "_blank"} className={buttonClass("secondary")}>{row?.original?.type === "application/pdf" ? "Download original PDF" : "Download CV"}</a> : undefined}
        />
        <FlashToast
          message={imported === "ai" ? "CV imported. Your profile is filled in; check it below." : imported ? "CV imported. AI reading was unavailable, so check each section below." : null}
          tone={imported === "ai" ? "success" : "default"}
          clear={["imported"]}
        />
        {needed === "1" && !ready && <Notice title="Upload your CV to continue">Add your CV first so Shortlist can prepare it for applications.</Notice>}
      </div>

      {profile && profileNeedsRepair(profile) && <Notice tone="warning" title="Review your CV import">Some project descriptions appear in title fields. Upload your original CV below to recover the structure and embedded links. Your saved profile stays in place until you approve the replacement.</Notice>}
      {profile ? (
        <details open={profileNeedsRepair(profile)} className="group rounded-md border border-border bg-surface">
          <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between px-5 text-sm font-medium [&::-webkit-details-marker]:hidden">
            Replace from a new CV file
            <span aria-hidden="true" className="text-faint transition-transform duration-150 group-open:rotate-90">
              ›
            </span>
          </summary>
          <div className="border-t border-border p-5">
            <ProfileImport replacing />
          </div>
        </details>
      ) : (
        <div className="rounded-md border border-border bg-surface p-5 sm:p-6">
          <ProfileImport replacing={false} />

        </div>
      )}

      {/* Remount only after an import, so saving keeps the form (and its message) in place. */}
      {profile && <ProfileEditor key={typeof at === "string" ? at : "profile"} initial={profile} />}
    </div>
  );
}
