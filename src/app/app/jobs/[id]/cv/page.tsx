import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { tailorCv } from "@/app/actions/tailor";
import { AiActionButton } from "@/components/ai-action-button";
import { CvWorkbench } from "@/components/cv-workbench";
import { GapCloser } from "@/components/gap-closer";
import type { LookOption } from "@/components/studio/job-cv-look";
import { ButtonLink, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { limitsFor } from "@/lib/plans";
import { getTailoredCv } from "@/lib/services/documents";
import { ownedJob } from "@/lib/services/jobs";
import { photoUrl } from "@/lib/services/photos";
import { getProfileRow, profileReady } from "@/lib/services/profile";
import { listMyTemplates, resolveCvStyle } from "@/lib/services/templates";
import { recommendTemplates } from "@/lib/templates/registry";
import { usageThisMonth } from "@/lib/services/usage";
import { jobHasCriteria } from "@/lib/jobs/quality";
import { scoreMatch } from "@/lib/match/score";
import { isAddableSkill } from "@/lib/match/skills";

export const metadata: Metadata = { title: "Tailored CV" };

export default async function CvTab({ params }: PageProps<"/app/jobs/[id]/cv">) {
  const user = await requireUser();
  const { id } = await params;
  const [job, row, doc, usage] = await Promise.all([ownedJob(user.id, id), getProfileRow(user.id), getTailoredCv(user.id, id), usageThisMonth(user.id)]);
  const profile = row?.data ?? null;
  if (!job) notFound();
  if (!jobHasCriteria(job.post)) return <EmptyState title="Add this vacancy’s requirements first" action={<ButtonLink href={`/app/jobs/${job.id}#job-description`}>Add job description</ButtonLink>}>A search-results page does not tell us what this employer needs. Add the actual description before tailoring.</EmptyState>;
  if (!profileReady(profile)) {
    return (
      <EmptyState title="Add your CV first" action={<ButtonLink href="/app/profile">Add your CV</ButtonLink>}>
        There has to be something to tailor. It takes a minute to upload.
      </EmptyState>
    );
  }
  const limits = limitsFor(user);
  const left = Math.max(0, limits.tailor - usage.tailor);
  // What the post asks for that your CV doesn't mention at all. Scored live, so an addition disappears at once.
  const gaps = scoreMatch(profile, job.post)
    .keywords.filter((k) => k.where === "missing" && isAddableSkill(k.keyword))
    .map((k) => k.keyword)
    .slice(0, 8);
  const roles = profile.experience.map((e) => ({ id: e.id, label: [e.title, e.company].filter(Boolean).join(", ") || "Untitled role" }));
  const gapCloser = <GapCloser gaps={gaps} roles={roles} closeGaps={doc?.cv?.closeGaps} />;

  if (!doc || doc.sourceNeedsReview) {
    const intro = (
      <div className="max-w-2xl space-y-4 rounded-md border border-border bg-surface p-5 sm:p-6">
        <h2 className="t-title">Tailor your CV for this job</h2>
        {doc?.sourceNeedsReview && <p className="rounded-md bg-warning-soft p-3 text-sm text-warning">Your CV changed. Suggest changes again so this job uses the latest version.</p>}
        <p className="text-sm text-muted">We rebuild your CV around this job: a summary and headline for the role, your most relevant work and skills first, and wording that uses the employer’s terms. Only what’s already true in your CV is used. You approve each change.</p>
        <AiActionButton action={tailorCv} jobId={job.id} label="Suggest changes" pendingLabel="Reading the job and your CV…" />
        <p className="text-xs text-muted">
          {left} of {limits.tailor} this month{limits.tailor < 100 ? " on the free plan" : ""}.
        </p>
      </div>
    );
    return (
      <div className="max-w-2xl space-y-6">
        {intro}
        {gapCloser}
      </div>
    );
  }

  const changes = doc.cv?.changes ?? [];
  const [style, photo, mine] = await Promise.all([resolveCvStyle(user.id, job), photoUrl(user.id), listMyTemplates(user.id)]);
  const options: LookOption[] = [
    { id: style.template.id, name: style.template.name, spec: style.template.spec },
    ...recommendTemplates(profile, job.post, 4).map((t) => ({ id: t.id, name: t.name, spec: t.spec })),
    ...mine.map((t) => ({ id: t.id, name: t.name, spec: t.spec })),
  ].filter((o, i, all) => all.findIndex((x) => x.id === o.id) === i);
  return (
    <CvWorkbench
      jobId={job.id}
      profile={profile}
      initial={changes}
      original={row?.original ?? null}
      docx={limits.docx}
      look={{ photoUrl: photo, current: { id: style.template.id, name: style.template.name }, spec: style.spec, fitted: Boolean(style.fit), fitKey: JSON.stringify(style.fit), options }}
      action={
        <>
          <div className="mb-5 empty:hidden">{gapCloser}</div>
          <AiActionButton action={tailorCv} jobId={job.id} label="Suggest again" pendingLabel="Working…" variant="secondary" />
          <p className="mt-1.5 text-xs text-muted">Uses one of your {left} tailorings left this month. Replaces the suggestions above.</p>
        </>
      }
    />
  );
}
