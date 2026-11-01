import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { MockAnswerForm, MockContinue } from "@/components/career/mock-controls";
import { InterviewFeedback } from "@/components/interview-feedback";
import { Badge, ButtonLink } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { careerFingerprint } from "@/lib/career/evidence";
import { getMockSession } from "@/lib/services/career";
import { ownedJob } from "@/lib/services/jobs";
import { getProfile } from "@/lib/services/profile";

export const metadata: Metadata = { title: "Mock interview" };

export default async function MockInterviewPage({ params }: PageProps<"/app/jobs/[id]/interview/mock/[sessionId]">) {
  const user = await requireUser();
  const { id, sessionId } = await params;
  const [job, profile, session] = await Promise.all([ownedJob(user.id, id), getProfile(user.id), getMockSession(user.id, sessionId)]);
  if (!job || !profile || !session || session.jobId !== id) notFound();
  const stale = session.fingerprint !== careerFingerprint({ profile, post: job.post, postText: job.postText });
  const current = session.turns.at(-1)!;
  const feedback = current.feedback;
  const report = session.report;
  const answered = session.turns.filter((t) => t.feedback).length;
  return <div className="mx-auto max-w-4xl space-y-6 [overflow-wrap:anywhere]">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><p className="text-xs text-muted">{job.post.company || "Your target employer"} · {job.post.title}</p><h2 className="mt-1 text-xl font-semibold">{session.status === "complete" ? "Your interview report" : "Mock interview"}</h2></div><ButtonLink href={`/app/jobs/${id}/interview?mode=mock`} variant="secondary" size="sm">Interview preparation</ButtonLink></div>
    {stale && <p role="alert" className="rounded-md bg-warning-soft p-4 text-sm text-warning">This session is out of date. Start a new mock interview.</p>}
    {session.status === "complete" && report ? <section aria-label="Mock interview report" className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-6">
      <div className="flex flex-wrap items-end justify-between gap-3"><div><p className="text-sm text-muted">{report.overall === null ? "Unscored practice" : "AI coaching estimate"}</p><p className="mt-1 text-3xl font-semibold">{report.overall === null ? `${answered} answer${answered === 1 ? "" : "s"} reviewed` : `${report.overall}/5`}</p></div><p className="text-xs text-muted">{report.assessedAnswers} AI-reviewed · {report.localAnswers} local checklists</p></div>
      <p className="text-sm leading-relaxed text-muted">This report describes this practice session. It is not a validated assessment or a prediction of hiring success. Unscored answers are excluded from averages; technical correctness was not assessed for local checklists.</p>
      <dl className="grid gap-3 sm:grid-cols-2">{report.criteria.map((r) => <div key={r.criterion} className="flex items-center justify-between rounded-md border border-border p-3 text-sm"><dt className="capitalize">{r.criterion === "confidence" ? "Clarity of confidence (text only)" : r.criterion}</dt><dd className="font-medium">{r.score === null ? "Unassessed" : `${r.score}/5`}</dd></div>)}</dl>
      {report.firstHalf !== null && report.secondHalf !== null && <p className="text-sm text-muted">First-half average {report.firstHalf}/5 · second-half average {report.secondHalf}/5. Question topics and difficulty vary, so this is a practice trend rather than a controlled improvement measure.</p>}
      {([["Strengths", report.strengths], ["Work on next", report.weaknesses], ["Next practice steps", report.nextSteps]] as const).map(([label, items]) => <div key={label}><h3 className="text-sm font-semibold">{label}</h3>{items.length ? <ul className="mt-2 list-disc space-y-2 pl-5 text-sm text-muted">{items.map((s, i) => <li key={i}>{s}</li>)}</ul> : <p className="mt-1 text-sm text-muted">No observations recorded.</p>}</div>)}
      <div className="flex flex-wrap gap-2"><ButtonLink href={`/app/jobs/${id}#gaps`}>Work on the gaps</ButtonLink><ButtonLink href={`/app/jobs/${id}/interview`} variant="secondary">Practise again</ButtonLink></div>
    </section> : <>
      <section aria-label="Current mock interview question" className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-xs text-muted">Main question {session.mainIndex + 1} of {session.queue.length} · {answered} answer{answered === 1 ? "" : "s"} saved{current.followUpDepth ? " · Follow-up" : ""}</p><Badge>{current.question.kind} · Level {current.question.difficulty}</Badge></div>
        <h3 className="text-lg font-semibold leading-relaxed">{current.question.question}</h3><p className="text-sm text-muted">{current.question.assesses}</p>
        {!feedback && !stale ? <MockAnswerForm key={current.id} jobId={id} sessionId={sessionId} version={session.version} turn={current} /> : <p className="whitespace-pre-wrap rounded-md bg-background p-4 text-sm leading-relaxed">{current.answer || "No answer submitted."}</p>}
      </section>
      {feedback && <section aria-label="Mock answer feedback" className="space-y-4"><InterviewFeedback review={{ ...feedback, rubric: feedback.rubric.map((r) => ({ ...r, label: r.criterion })) }} />{!stale && <MockContinue sessionId={sessionId} version={session.version} label={current.question.kind === "closing" ? "View final report" : "Continue interview"} />}</section>}
      <MockContinue sessionId={sessionId} version={session.version} finish label="Finish session and view report" />
    </>}
    <details className="rounded-md border border-border p-4"><summary className="cursor-pointer text-sm font-medium">Your saved conversation · {answered} answer{answered === 1 ? "" : "s"}</summary><ol className="mt-4 space-y-5">{session.turns.filter((t) => t.feedback).map((t) => <li key={t.id}><p className="text-sm font-medium">{t.question.question}</p><p className="mt-2 whitespace-pre-wrap text-sm text-muted">{t.answer}</p><p className="mt-1 text-xs text-muted">{t.feedback?.score == null ? "Unscored checklist" : `${t.feedback.score}/5 coaching estimate`}</p></li>)}</ol></details>
  </div>;
}
