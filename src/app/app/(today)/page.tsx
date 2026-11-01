import { FlashToast } from "@/components/toast";
import type { Metadata } from "next";
import Link from "next/link";
import { followUpAction } from "@/app/actions/jobs";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink, PageHeader } from "@/components/ui";
import { JobMatchBadge } from "@/components/job-match-badge";
import { jobHasCriteria } from "@/lib/jobs/quality";
import { profileNeedsRepair } from "@/lib/cv/quality";
import { requireUser } from "@/lib/auth/session";
import { formatDay } from "@/lib/dates";
import { dueFollowUps, isStatus, listJobs, progress, STATUS_LABELS } from "@/lib/services/jobs";
import { getProfile, profileReady } from "@/lib/services/profile";
import { planUsage } from "@/lib/services/usage";
import { UsageMeter } from "@/components/usage-meter";

export const metadata: Metadata = { title: "Today" };

export default async function Today({ searchParams }: PageProps<"/app">) {
  const user = await requireUser();
  const [{ verified, reset }, profile, jobs, due, stats, usage] = await Promise.all([
    searchParams,
    getProfile(user.id),
    listJobs(user.id),
    dueFollowUps(user.id),
    progress(user.id),
    planUsage(user),
  ]);
  const ready = profileReady(profile);
  const recent = jobs.filter((j) => j.status === "saved" || j.status === "interview").slice(0, 6);
  const givenName = (profile?.name || user.name).split(" ")[0];
  const firstName = givenName === givenName.toUpperCase() ? givenName.charAt(0) + givenName.slice(1).toLowerCase() : givenName;
  const incomplete = jobs.find((j) => !jobHasCriteria(j.post));
  const interview = recent.find((j) => j.status === "interview");
  const nextJob = incomplete || due[0] || interview || recent[0];
  const repair = !!profile && profileNeedsRepair(profile);
  const next = repair || !ready ? { label: repair ? "Repair your CV import" : "Start with your experience", note: repair ? "Some descriptions were saved as project titles. Re-import your original CV to recover the structure and links." : "Upload your original CV, review what we read, and build a reliable foundation for every application.", href: "/app/profile", action: repair ? "Review your CV" : "Add your CV" }
    : incomplete ? { label: "Finish reading this vacancy", note: `${incomplete.post.title} needs its actual job description before a match score or tailored application will be useful.`, href: `/app/jobs/${incomplete.id}#job-description`, action: "Add the description" }
    : due[0] ? { label: "A good time to follow up", note: `You’re waiting to hear about ${due[0].post.title}. Your follow-up message is ready to review.`, href: `/app/jobs/${due[0].id}`, action: "Review follow-up" }
    : interview ? { label: "Get ready for the conversation", note: `Practise for ${interview.post.title} at ${interview.post.company || "your next company"}, using examples from your own CV.`, href: `/app/jobs/${interview.id}/interview`, action: "Practise interview" }
    : nextJob ? { label: "Turn a saved role into an application", note: `Review your fit for ${nextJob.post.title}, then prepare a focused CV and letter.`, href: `/app/jobs/${nextJob.id}`, action: "Continue application" }
    : { label: "Find a role worth applying for", note: "Your CV is ready. Save a specific vacancy to see how your experience connects to what the employer needs.", href: "/app/jobs", action: "Add a job" };

  return (
    <div className="space-y-6">
      <FlashToast
        message={verified === "1" ? "Email confirmed." : reset === "1" ? "Password changed. You're logged in." : verified === "0" ? "That link has expired or was already used. Request a new one from Settings → Email address." : null}
        tone={verified === "0" ? "error" : "success"}
        clear={["verified", "reset"]}
      />
      <PageHeader
        eyebrow={new Date().toLocaleDateString("en-GB", { weekday: "long", day: "numeric", month: "long" })}
        title={`Hi ${firstName}`}
        description="A clear next step for your job search."
        actions={
          ready && (
            <><ButtonLink href="/app/strategy" variant="secondary">Application strategy</ButtonLink><ButtonLink href="/app/jobs" variant="secondary">Add a job</ButtonLink></>
          )
        }
      />

      <section aria-label="Your next step" className="grid overflow-hidden rounded-xl border border-accent/25 bg-surface shadow-[0_12px_32px_-22px_rgb(47_91_234/0.4)] lg:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="bg-tint p-6 sm:p-7"><p className="t-label text-accent-strong">Your next step</p><h2 className="mt-2 text-xl font-semibold tracking-tight">{next.label}</h2><p className="mt-3 max-w-2xl text-sm leading-relaxed text-muted">{next.note}</p><div className="mt-5"><ButtonLink href={next.href}>{next.action} <span aria-hidden="true">→</span></ButtonLink></div></div>
        <div className="border-t border-border bg-background p-6 lg:border-l lg:border-t-0"><p className="text-sm font-medium">Your CV foundation</p>{profile ? <><p className="mt-2 text-xs leading-relaxed text-muted">{profile.headline || "Your experience, skills and projects"}</p><dl className="mt-4 grid grid-cols-3 gap-3">{[["Roles", profile.experience.length], ["Projects", profile.projects.length], ["Skills", profile.skills.length]].map(([label, count]) => <div key={label}><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-xl font-semibold tabular-nums">{count}</dd></div>)}</dl><Link href="/app/profile" className="mt-5 inline-flex text-xs font-medium text-accent hover:underline">Review profile & links ↗</Link></> : <p className="mt-2 text-sm leading-relaxed text-muted">Keep your projects, experience and links together. You’ll review the extraction before anything is saved.</p>}</div>
      </section>

      {due.length > 0 && (
        <section aria-labelledby="follow-ups" className="space-y-3">
          <h2 id="follow-ups" className="text-base font-semibold">
            Worth a follow-up
          </h2>
          <ul className="divide-y divide-border rounded-md border border-border bg-surface">
            {due.map((j) => (
              <li key={j.id} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3">
                <div className="min-w-0 flex-1">
                  <Link href={`/app/jobs/${j.id}`} className="block truncate font-medium hover:underline" title={j.post.title}>
                    {j.post.title || "Untitled job"}
                  </Link>
                  <p className="truncate text-[13px] text-muted">
                    {j.post.company && `${j.post.company} · `}applied {j.appliedOn ? formatDay(j.appliedOn) : ""}, no answer yet
                  </p>
                </div>
                <form action={followUpAction} className="flex items-center gap-2">
                  <input type="hidden" name="jobId" value={j.id} />
                  <ButtonLink href={`/app/jobs/${j.id}`} size="sm">
                    See the message
                  </ButtonLink>
                  <SubmitButton name="op" value="done" variant="secondary" size="sm">
                    Done
                  </SubmitButton>
                </form>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ready && jobs.length > 0 && (
        <dl aria-label="This week" className="grid grid-cols-2 overflow-hidden rounded-md border border-border bg-surface md:grid-cols-4">
          {[
            { id: "applied-week", label: "Applied this week", value: String(stats.appliedThisWeek) },
            { id: "waiting", label: "Waiting to hear", value: String(stats.waiting) },
            { id: "interviews", label: "Interviews", value: String(stats.interviews) },
            { id: "response", label: "Response rate", value: stats.responseRate === null ? "–" : `${stats.responseRate}%` },
          ].map((s, i) => (
            <div key={s.id} className={`px-4 py-3.5 ${i % 2 ? "border-l border-border" : ""} ${i > 1 ? "border-t border-border md:border-t-0" : ""} ${i === 2 ? "md:border-l" : ""}`}>
              <dt className="text-[13px] text-muted">{s.label}</dt>
              <dd data-testid={`stat-${s.id}`} className="mt-1 text-2xl font-semibold tabular-nums">
                {s.value}
              </dd>
            </div>
          ))}
        </dl>
      )}

      {recent.length > 0 && (
        <section className="space-y-3">
          <div className="flex items-baseline justify-between">
            <h2 className="text-base font-semibold">In progress</h2>
            <Link href="/app/jobs" className="text-[13px] text-muted hover:text-foreground hover:underline">
              All jobs
            </Link>
          </div>
          <ul className="divide-y divide-border rounded-md border border-border bg-surface">
            {recent.map((j) => (
              <li key={j.id}>
                <Link href={`/app/jobs/${j.id}`} className="flex min-h-14 items-center gap-3 px-4 py-2 transition-colors duration-150 hover:bg-surface-hover">
                  <div className="min-w-0 flex-1">
                    <p className="truncate font-medium" title={j.post.title}>
                      {j.post.title || "Untitled job"}
                    </p>
                    <p className="truncate text-[13px] text-muted">{j.post.company || "Company not stated"}</p>
                  </div>
                  <span className="hidden text-[13px] text-muted sm:inline">{isStatus(j.status) ? STATUS_LABELS[j.status] : j.status}</span>
                  <JobMatchBadge post={j.post} match={j.match} />
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}

      {ready && (
        <section aria-labelledby="usage" className="space-y-4 rounded-xl border border-border bg-surface p-5">
          <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
            <h2 id="usage" className="text-base font-semibold">
              {usage.plan === "paid" ? "Plan usage this month" : "Your free trial"}
            </h2>
            {usage.plan === "free" && (
              <Link href="/app/billing" className="text-[13px] text-accent hover:underline">
                See paid plans
              </Link>
            )}
          </div>
          {usage.plan === "free" && (
            <p className="text-sm text-muted">
              {usage.trialJob ? (
                <>
                  Running on{" "}
                  <Link href={`/app/jobs/${usage.trialJob.id}`} className="font-medium text-foreground hover:underline">
                    {usage.trialJob.title}
                    {usage.trialJob.company ? ` at ${usage.trialJob.company}` : ""}
                  </Link>
                  . Upgrade to do the same for every job you apply to.
                </>
              ) : !usage.trialClaimed && !usage.verified ? (
                <>
                  Confirm your email to start it: analysis, a tailored CV, a cover letter and interview practice for one job, free.{" "}
                  <Link href="/app/settings" className="font-medium text-accent hover:underline">
                    Resend the link
                  </Link>
                </>
              ) : usage.trialClaimed ? (
                "Your free trial has been used. Upgrade to tailor CVs, write cover letters and practise interviews for every job."
              ) : (
                "Pick one job and get the full application for it, free: analysis, a tailored CV, a cover letter and interview practice."
              )}
            </p>
          )}
          {/* Before the trial starts the bars read 0 of N: they show what the trial includes. Hidden only once it's spent. */}
          {(usage.plan === "paid" || usage.trialJob || !usage.trialClaimed) && (
            <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
              <UsageMeter label="Tailoring runs" used={usage.used.tailor} max={usage.limits.tailor} period={usage.plan === "paid" ? "this month" : "in your free trial"} />
              <UsageMeter label="Cover letter drafts" used={usage.used.cover} max={usage.limits.cover} period={usage.plan === "paid" ? "this month" : "in your free trial"} />
              <UsageMeter label="Answer feedback" used={usage.used.interview} max={usage.limits.interview} period={usage.plan === "paid" ? "this month" : "in your free trial"} />
              <UsageMeter label="Mock interviews" used={usage.used.mock} max={usage.limits.mock} period={usage.plan === "paid" ? "this month" : "in your free trial"} />
            </div>
          )}
        </section>
      )}
    </div>
  );
}
