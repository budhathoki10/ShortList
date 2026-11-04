import type { Metadata } from "next";
import { Badge, ButtonLink, EmptyState, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { careerFingerprint } from "@/lib/career/evidence";
import { listCareerPlans } from "@/lib/services/career";
import { listJobsWithText } from "@/lib/services/jobs";
import { getProfile, profileReady } from "@/lib/services/profile";
import { collections } from "@/db/mongo";

export const metadata: Metadata = { title: "Application strategy" };
export default async function ApplicationStrategy() {
  const user = await requireUser();
  const [jobs, profile, plans, sessions] = await Promise.all([listJobsWithText(user.id), getProfile(user.id), listCareerPlans(user.id), (await collections()).mockSessions.find({ userId: user.id, status: "complete" }, { projection: { report: 1, jobId: 1, createdAt: 1 } }).sort({ createdAt: -1 }).toArray()]);
  if (!profileReady(profile)) return <EmptyState title="Add your CV first" action={<ButtonLink href="/app/profile">Add CV</ButtonLink>}>Compare job requirements with your actual experience before prioritising applications.</EmptyState>;
  const ranked = jobs.filter((j) => j.status !== "rejected" && j.status !== "offer").map((job) => {
    const saved = plans.find((p) => p._id === job.id);
    const plan = saved?.plan.fingerprint === careerFingerprint({ profile, postText: job.postText, post: job.post }) ? saved.plan : null;
    const complete = plan?.roadmap.filter((t) => saved?.progress[t.id]?.completed).length ?? 0;
    return { job, plan, complete, priority: job.status === "interview" ? 1000 : job.status === "applied" ? 500 : plan?.fit.score ?? -1 };
  }).sort((a, b) => b.priority - a.priority);
  const learned = plans.reduce((n, p) => n + Object.values(p.progress).filter((t) => t.completed).length, 0);
  const assessed = sessions.filter((s) => s.report?.overall !== null);
  return <div className="space-y-6"><PageHeader eyebrow="Choose where to invest your effort" title="Application strategy" description="Interviewing and applied jobs come first, then saved roles by current CV evidence coverage. Scores describe evidence, not your chance of getting hired." actions={<ButtonLink href="/app/jobs" variant="secondary">Add a job</ButtonLink>} />
    <dl className="grid gap-3 sm:grid-cols-3">{[["Current application plans", ranked.filter((r) => r.plan).length], ["Practice tasks recorded", learned], ["Completed mock interviews", sessions.length]].map(([label, value]) => <div key={label} className="rounded-lg border border-border bg-surface p-4"><dt className="text-xs text-muted">{label}</dt><dd className="mt-1 text-2xl font-medium tabular-nums">{value}</dd></div>)}</dl>
    {assessed.length >= 2 && <p className="text-sm text-muted">Latest AI-reviewed session: {assessed[0].report?.overall}/5. Earliest recorded AI-reviewed session: {assessed.at(-1)?.report?.overall}/5. Roles and difficulty differ; compare the detailed feedback before judging improvement.</p>}
    {!ranked.length ? <EmptyState title="No active roles to prioritise" action={<ButtonLink href="/app/jobs">Browse your jobs</ButtonLink>}>Save a specific vacancy to build an application and learning plan.</EmptyState> : <ol className="divide-y divide-border rounded-lg border border-border bg-surface">{ranked.map(({ job, plan, complete }, index) => <li key={job.id} className="space-y-3 p-5"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-0"><p className="text-xs text-muted">Priority {index + 1} · {job.status === "interview" ? "Interviewing" : job.status}</p><h2 className="mt-1 text-base font-semibold">{job.post.title}</h2><p className="mt-1 text-sm text-muted">{job.post.company}</p></div>{plan ? <Badge tone={plan.fit.priority === "apply" ? "good" : "warn"}>{plan.fit.score}/100 evidence</Badge> : <Badge>Needs current analysis</Badge>}</div><p className="text-sm text-muted">{job.status === "interview" ? "Prepare examples and run a mock interview before the next conversation." : job.status === "applied" ? "Track the response, prepare for a screening call and follow up when due." : !plan ? "Read the complete job and map its requirements before deciding whether to apply." : plan.fit.priority === "apply" ? "Prioritise a truthful tailored CV and a company-specific application." : plan.fit.priority === "prepare" ? "Strengthen the most important missing evidence and clarify eligibility before spending time on this application." : "Consider an adjacent or more junior role while building the required evidence."}</p>{plan && <p className="text-xs text-muted">{plan.fit.missing} requirements lack evidence · {plan.fit.unclear} need verification · {complete}/{plan.roadmap.length} practice tasks recorded</p>}<div className="flex flex-wrap gap-2"><ButtonLink href={`/app/jobs/${job.id}/plan`} variant="secondary" size="sm">{plan ? "Review application plan" : "Analyse this role"}</ButtonLink><ButtonLink href={`/app/jobs/${job.id}/interview`} variant="ghost" size="sm">Interview preparation</ButtonLink></div></li>)}</ol>}
    <p className="text-xs leading-relaxed text-muted">Practice records do not automatically add skills to the CV. Update your profile only with work you can explain and demonstrate, then refresh the affected plans.</p>
  </div>;
}
