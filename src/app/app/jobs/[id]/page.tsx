import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { followUpAction, removeJob } from "@/app/actions/jobs";
import { PlanBuilder } from "@/components/career/plan-controls";
import { TrialNote } from "@/components/trial-note";
import { PlanView } from "@/components/career/plan-view";
import { ConfirmAction } from "@/components/confirm-action";
import { CopyButton } from "@/components/copy-button";
import { JobDescriptionEditor } from "@/components/job-description-editor";
import { jobHasCriteria } from "@/lib/jobs/quality";
import { NotesField } from "@/components/notes-field";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink, EmptyState, Eyebrow, inputClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { careerFingerprint } from "@/lib/career/evidence";
import { formatDay } from "@/lib/dates";
import { scoreLabel, scoreMatch } from "@/lib/match/score";
import { today } from "@/lib/plans";
import { getCareerPlan } from "@/lib/services/career";
import { ownedJob } from "@/lib/services/jobs";
import { getProfile, profileReady } from "@/lib/services/profile";
import { followUpMessage } from "@/lib/tailor/follow-up";

export const metadata: Metadata = { title: "Fit" };

/** Status is spelled out in words as well as colour, so it doesn't depend on seeing the colour. */
const STATUS_COPY = {
  shown: { label: "You show this", cls: "text-success", mark: "✓" },
  listed: { label: "Only in your skills list", cls: "text-warning", mark: "–" },
  missing: { label: "Not in your CV", cls: "text-danger", mark: "✕" },
} as const;

/**
 * The Fit tab: the instant keyword check, or the full analysis once it's built and still matches your CV and the job.
 * Only one of the two shows, so there is never more than one score on screen.
 */
export default async function FitTab({ params }: PageProps<"/app/jobs/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const [job, profile, planRow] = await Promise.all([ownedJob(user.id, id), getProfile(user.id), getCareerPlan(user.id, id)]);
  if (!job) notFound();
  const ready = profileReady(profile);
  // Scored live, so edits to the profile show up straight away. It's plain code and fast.
  const match = ready && jobHasCriteria(job.post) ? scoreMatch(profile, job.post) : null;
  const planCurrent = !!planRow && !!match && planRow.plan.fingerprint === careerFingerprint({ profile: profile!, post: job.post, postText: job.postText });
  const due = job.status === "applied" && job.followUpOn && job.followUpOn <= today();
  const nudge = followUpMessage({ name: profile?.name || user.name, title: job.post.title, company: job.post.company, appliedOn: job.appliedOn });
  const nudgeText = `${nudge.subject}\n\n${nudge.body}`;
  const listed = match?.requirements.filter((r) => r.status === "listed").length ?? 0;
  const missing = match?.requirements.filter((r) => r.status === "missing" && r.kind === "must").length ?? 0;
  const bar = match ? (match.score >= 70 ? "bg-success" : match.score >= 40 ? "bg-warning" : "bg-danger") : "";

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0 space-y-8">
        {!jobHasCriteria(job.post) ? <JobDescriptionEditor jobId={job.id} /> : !match ? (
          <EmptyState title="Add your CV to see how well you match" action={<ButtonLink href="/app/profile">Add your CV</ButtonLink>}>
            The match check compares this post with what’s in your CV, so it needs one to start from.
          </EmptyState>
        ) : (
          <>
            {planCurrent ? (
              <PlanView jobId={job.id} row={planRow!} />
            ) : (
              <>
            <section className="flex flex-wrap items-end gap-x-8 gap-y-4 border-b border-border pb-6">
              <div>
                <p className="font-mono text-5xl font-medium leading-none tabular-nums tracking-tight" data-testid="match-score">
                  {match.score}
                  <span className="text-lg text-faint">%</span>
                </p>
                <div className="mt-3 flex w-40 gap-[3px]" role="img" aria-label={`${match.score} out of 100`}>
                  {Array.from({ length: 20 }, (_, i) => (
                    <span key={i} className={`h-1.5 flex-1 rounded-[1px] ${i < Math.round(match.score / 5) ? bar : "bg-border"}`} />
                  ))}
                </div>
              </div>
              <div className="min-w-0 flex-1 basis-64">
                <p className="t-title" title="A keyword guide, not a hiring probability">{scoreLabel(match.score)}</p>
                <p className="mt-1 text-sm text-muted">
                  {[missing > 0 ? `${missing} must-have${missing === 1 ? "" : "s"} missing` : "No must-haves missing", listed > 0 ? `${listed} only in your skills list` : ""].filter(Boolean).join(" · ")}
                </p>
              </div>
              <ButtonLink href={`/app/jobs/${job.id}/cv`}>Tailor my CV</ButtonLink>
            </section>

            <section>
              <h2 className="mb-2 text-sm font-semibold">What they ask for</h2>
              {match.requirements.length === 0 ? (
                <p className="text-sm text-muted">We couldn’t find a clear list of requirements in this post.</p>
              ) : (
                <ol className="divide-y divide-border border-y border-border">
                  {match.requirements.map((r, i) => (
                    <li key={i} className="grid gap-1 py-2.5 sm:grid-cols-[minmax(0,1fr)_10rem] sm:gap-4">
                      <div className="min-w-0">
                        <p className="text-sm">
                          {r.text}
                          {r.kind === "nice" && <span className="ml-2 text-xs text-muted">nice to have</span>}
                        </p>
                        {r.evidence && (
                          <p className="mt-1 truncate text-[13px] text-muted" title={r.evidence}>
                            From your CV: {r.evidence}
                          </p>
                        )}
                      </div>
                      <p className={`flex items-start gap-1.5 text-[13px] font-medium sm:justify-end ${STATUS_COPY[r.status].cls}`}>
                        <span aria-hidden="true" className="w-3 text-center">
                          {STATUS_COPY[r.status].mark}
                        </span>
                        {STATUS_COPY[r.status].label}
                      </p>
                    </li>
                  ))}
                </ol>
              )}
            </section>

            {planRow && (
              <p role="alert" className="rounded-md bg-warning-soft px-4 py-2.5 text-sm text-warning">
                Your CV or the job changed since the full analysis. Refresh it below.
              </p>
            )}
            <div className="space-y-2">
              <PlanBuilder jobId={job.id} exists={!!planRow} companyUrl={planRow?.plan.company.sources[0]?.url} />
              <TrialNote user={user} jobId={job.id} kind="tailor" />
            </div>
              </>
            )}

          </>
        )}
      </div>

      <aside className="space-y-6 lg:border-l lg:border-border lg:pl-8">
        {due && (
          <section className="space-y-2 rounded-md border border-accent/30 bg-accent-soft p-4">
            <Eyebrow>Follow up</Eyebrow>
            <p className="text-sm">It’s been a week since you applied{job.appliedOn ? ` on ${formatDay(job.appliedOn)}` : ""}. A short note often gets things moving.</p>
            <textarea readOnly rows={8} aria-label="Follow-up message" value={nudgeText} className={`${inputClass} text-[13px]`} />
            <div className="flex flex-wrap items-center gap-2">
              <CopyButton text={nudgeText} label="Copy message" what="Message copied" />
              <form action={followUpAction} className="flex flex-wrap gap-2">
                <input type="hidden" name="jobId" value={job.id} />
                <SubmitButton name="op" value="done" variant="secondary" size="sm">
                  I followed up
                </SubmitButton>
                <SubmitButton name="op" value="later" variant="ghost" size="sm">
                  Remind me later
                </SubmitButton>
              </form>
            </div>
          </section>
        )}

        <section className="space-y-2 text-sm">
          <Eyebrow>About this job</Eyebrow>
          {job.url && (
            <a href={job.url} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-accent hover:underline" title={job.url}>
              Original post
            </a>
          )}
          {job.post.summary && <p className="text-muted">{job.post.summary}</p>}
          <p className="text-[13px] text-muted">
            Added {formatDay(job.createdAt)}
            {job.appliedOn && ` · applied ${formatDay(job.appliedOn)}`}
          </p>
        </section>

        <NotesField jobId={job.id} initial={job.notes ?? ""} />

        <div className="space-y-2 border-t border-border pt-6">
          <ConfirmAction
            trigger="Delete this job"
            title={`Delete “${job.post.title || "Untitled job"}”?`}
            confirmLabel="Delete job"
            pendingLabel="Deleting…"
            action={removeJob}
            fields={{ jobId: job.id }}
          >
            This also removes its tailored CV, cover letter and interview notes. It can’t be undone.
          </ConfirmAction>
        </div>
        <p className="text-xs text-muted">
          <Link href="/app/profile" className="text-accent hover:underline">
            Edit your CV
          </Link>{" "}
          to change what counts as shown.
        </p>
      </aside>
    </div>
  );
}
