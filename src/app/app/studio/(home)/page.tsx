import type { Metadata } from "next";
import Link from "next/link";
import { deleteTemplateAction, duplicateTemplateAction } from "@/app/actions/templates";
import { CvMini } from "@/components/cv/cv-mini";
import { StudioIcon as Icon } from "@/components/icons";
import { PhotoUpload } from "@/components/studio/photo-upload";
import { AtsBadge, TemplateThumb } from "@/components/studio/template-bits";
import { FlashToast } from "@/components/toast";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { photoStatus } from "@/lib/services/photos";
import { getProfile, profileReady } from "@/lib/services/profile";
import { listMyTemplates, MAX_TEMPLATES, resolveCvStyle } from "@/lib/services/templates";
import { atsReport } from "@/lib/templates/checks";
import { recommendTemplates } from "@/lib/templates/registry";
import { SAMPLE_PROFILE } from "@/lib/templates/sample";
import { parseSpec } from "@/lib/templates/spec";

export const metadata: Metadata = { title: "CV Studio" };

export default async function Studio({ searchParams }: PageProps<"/app/studio">) {
  const user = await requireUser();
  const [{ deleted, full, ready: built }, profile, photo, mine, style] = await Promise.all([
    searchParams,
    getProfile(user.id),
    photoStatus(user.id),
    listMyTemplates(user.id),
    resolveCvStyle(user.id),
  ]);
  const ready = profileReady(profile);
  const cv = ready ? profile : SAMPLE_PROFILE;
  const shownPhoto = ready ? (photo?.onCv ? photo.url : null) : "/sample-photo.svg";
  const recommended = recommendTemplates(cv, null, 4);

  return (
    <div className="space-y-10">
      <PageHeader
        title="CV Studio"
        description="Choose from 100 templates or design your own. The facts always come from your CV."
        actions={
          <Link href="/app/studio/templates" className="inline-flex h-9 items-center max-sm:h-11 gap-1.5 rounded-lg bg-accent px-3.5 text-sm font-medium text-on-accent hover:bg-accent-hover">
            <Icon name="studio" size={16} /> Browse templates
          </Link>
        }
      />
      <FlashToast message={built === "1" ? "Your CV is ready. It’s saved, and this is now your default look." : null} clear={["ready"]} />
      <FlashToast message={deleted === "1" ? "Template deleted. Jobs that used it now use your default." : null} clear={["deleted"]} />
      <FlashToast message={full === "1" ? `You can keep up to ${MAX_TEMPLATES} templates. Delete one to make room.` : null} tone="error" clear={["full"]} />
      {!ready && (
        <p className="rounded-lg border border-border bg-sunken px-4 py-3 text-sm">
          Previews use a sample CV for now.{" "}
          <Link href="/app/profile" className="font-medium underline underline-offset-4">
            Add your CV
          </Link>{" "}
          to see yours.
        </p>
      )}

      <div className="grid gap-10 border-y border-border py-8 ">
        <div className="grid gap-6 sm:grid-cols-[200px_1fr]">
          <Link href={`/app/studio/edit/${style.template.id}`} className="block w-full max-w-[200px] self-start overflow-hidden rounded-md ring-1 ring-border transition hover:ring-strong-border sm:max-w-none" >
            <span className="sr-only">Edit {style.template.name}</span>
            <CvMini spec={style.spec} cv={cv} photoUrl={shownPhoto} />
          </Link>
          <div className="space-y-4">
            <div>
              <p className="text-[13px] text-muted">Your default look</p>
              <h2 className="mt-0.5 text-xl font-semibold tracking-tight">{style.template.name}</h2>
              <div className="mt-2">
                <AtsBadge level={atsReport(style.spec).level} />
              </div>
            </div>
            <p className="text-sm text-muted">New jobs use this look. You can change it for any single job on its Tailored CV tab.</p>
            <div className="flex flex-wrap gap-2">
              <Link href="/app/studio/templates" className="inline-flex h-9 items-center max-sm:h-11 rounded-lg border border-strong-border px-3 text-[13px] font-medium hover:border-strong-border">
                Change
              </Link>
              <Link href={`/app/studio/edit/${style.template.id}`} className="inline-flex h-9 items-center max-sm:h-11 gap-1.5 rounded-lg border border-strong-border px-3 text-[13px] font-medium hover:border-strong-border">
                <Icon name="sparkle" size={15} /> Customise
              </Link>
            </div>
            <div id="photo" className="scroll-mt-20 border-t border-border pt-4">
              <p className="mb-3 text-[13px] font-medium">Photo</p>
              <PhotoUpload photoUrl={photo?.url ?? null} onCv={photo?.onCv ?? true} />
            </div>
          </div>
        </div>
      </div>

      <section aria-labelledby="mine" className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="mine" className="text-base font-semibold">
            My templates
          </h2>
          <span className="text-[13px] tabular-nums text-muted">
            {mine.length} of {MAX_TEMPLATES}
          </span>
        </div>
        {mine.length === 0 ? (
          <div className="rounded-xl border border-dashed border-strong-border p-8 text-center">
            <p className="font-medium">Make a template that&apos;s yours</p>
            <p className="mx-auto mt-1 max-w-md text-sm text-muted">Open any template, change the layout, fonts, colours and sections, then save it here.</p>
            <Link href={`/app/studio/edit/${style.template.id}`} className="mt-4 inline-flex h-9 items-center max-sm:h-11 gap-1.5 rounded-lg bg-accent px-4 text-[13px] font-medium text-on-accent hover:bg-accent-hover">
              <Icon name="sparkle" size={15} /> Start from your default
            </Link>
          </div>
        ) : (
          <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-5">
            {mine.map((t) => {
              const spec = parseSpec(t.spec);
              if (!spec) return null;
              return (
                <li key={t.id} className="space-y-2">
                  <Link href={`/app/studio/edit/${t.id}`}  className="block overflow-hidden rounded-md ring-1 ring-border transition hover:-translate-y-0.5 hover:ring-strong-border">
                    <span className="sr-only">Edit {t.name}</span>
                    <CvMini spec={spec} cv={cv} photoUrl={shownPhoto} />
                  </Link>
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium">{t.name}</p>
                      <p className="text-[12px] text-muted">Edited {t.updatedAt.toLocaleDateString("en-GB", { day: "numeric", month: "short" })}</p>
                    </div>
                    <div className="flex shrink-0">
                      <form action={duplicateTemplateAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit" className="rounded p-1.5 text-muted hover:bg-surface hover:text-foreground" aria-label={`Duplicate ${t.name}`} title="Duplicate">
                          <Icon name="copy" size={15} />
                        </button>
                      </form>
                      <form action={deleteTemplateAction}>
                        <input type="hidden" name="id" value={t.id} />
                        <button type="submit" className="rounded p-1.5 text-muted hover:bg-danger-soft hover:text-danger" aria-label={`Delete ${t.name}`} title="Delete">
                          <Icon name="trash" size={15} />
                        </button>
                      </form>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section aria-labelledby="rec" className="space-y-4">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="rec" className="text-base font-semibold">
            Picked for you
          </h2>
          <Link href="/app/studio/templates" className="text-[13px] underline underline-offset-4 hover:text-accent max-sm:inline-flex max-sm:min-h-11 max-sm:items-center">
            See all 100
          </Link>
        </div>
        <ul className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          {recommended.map((t) => (
            <li key={t.id}>
              <Link href={`/app/studio/edit/${t.id}`} className="group block">
                <div className="overflow-hidden rounded-md ring-1 ring-border transition group-hover:-translate-y-0.5 group-hover:ring-strong-border">
                  <TemplateThumb id={t.id} name={t.name} />
                </div>
                <p className="mt-2 text-sm font-medium">{t.name}</p>
              </Link>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}
