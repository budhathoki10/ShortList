import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { MockInterviewEntry } from "@/components/career/mock-entry";
import { TrialNote } from "@/components/trial-note";
import { aiEnabled } from "@/lib/ai";
import { prepareInterview } from "@/app/actions/tailor";
import { AiActionButton } from "@/components/ai-action-button";
import { InterviewWorkspace } from "@/components/interview-workspace";
import { answerGuide } from "@/lib/tailor/interview";
import { ButtonLink, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { getInterview } from "@/lib/services/documents";
import { ownedJob } from "@/lib/services/jobs";
import { getProfile, profileReady } from "@/lib/services/profile";
import { jobHasCriteria } from "@/lib/jobs/quality";
import { INTERVIEW_QUESTION_VERSION } from "@/lib/career/questions";

export const metadata: Metadata = { title: "Interview prep" };

export default async function InterviewTab({ params, searchParams }: PageProps<"/app/jobs/[id]/interview">) {
  const user = await requireUser();
  const [{ id }, query] = await Promise.all([params, searchParams]);
  const [job, profile, session] = await Promise.all([ownedJob(user.id, id), getProfile(user.id), getInterview(user.id, id)]);
  if (!job) notFound();
  if (!jobHasCriteria(job.post)) return <EmptyState title="Add the role’s requirements first" action={<ButtonLink href={`/app/jobs/${id}#job-description`}>Add job description</ButtonLink>}>Questions come from the actual vacancy.</EmptyState>;
  if (!profileReady(profile)) return <EmptyState title="Add your CV first" action={<ButtonLink href="/app/profile">Add your CV</ButtonLink>}>Questions are built from it and the job.</EmptyState>;
  const mock = query.mode === "mock";
  const needsUpdate = !!session && session.questionVersion < INTERVIEW_QUESTION_VERSION;
  const ready = session && !session.sourceNeedsReview && !needsUpdate;
  const earlier = [...(session?.previousQuestions ?? []), ...(needsUpdate ? session?.questions.filter((q) => q.answer) ?? [] : [])];
  return <div className="space-y-6">
    <div><h2 className="t-title">Interview preparation</h2><p className="mt-2 text-sm text-muted">Learn an answer in practice, then try a full conversation.</p></div>
    <nav aria-label="Interview mode" className="flex gap-1 border-b border-border">{[{ mode: "practice", label: "Question practice" }, { mode: "mock", label: "Mock interview" }].map((item) => <Link key={item.mode} href={`/app/jobs/${id}/interview?mode=${item.mode}`} aria-current={(mock ? "mock" : "practice") === item.mode ? "page" : undefined} className={`border-b-2 px-4 py-3 text-sm font-medium ${(mock ? "mock" : "practice") === item.mode ? "border-accent text-accent" : "border-transparent text-muted hover:text-foreground"}`}>{item.label}</Link>)}</nav>
    {mock ? <MockInterviewEntry userId={user.id} jobId={id} context={{ profile, post: job.post, postText: job.postText }} note={<TrialNote user={user} jobId={id} kind="mock" />} /> : <>
      {!ready ? <div className="max-w-2xl space-y-4 rounded-lg border border-border bg-surface p-5 sm:p-6"><h3 className="text-lg font-semibold">{needsUpdate ? "Clearer questions for this role" : "Start with one question"}</h3><p className="text-sm leading-relaxed text-muted">Focused questions, hints and example explanations based on your CV and the job. You can get help with even a short answer.</p><AiActionButton action={prepareInterview} jobId={id} label={session ? "Update practice questions" : "Get my questions"} pendingLabel="Preparing questions…" /><p className="text-xs text-muted">Question guides are free. Earlier submitted answers stay in your saved practice.</p></div> : <>
        {aiEnabled() && <TrialNote user={user} jobId={id} kind="interview" />}
        <InterviewWorkspace key={session.questions.map((q) => q.id).join()} jobId={id} questions={session.questions.map((q) => ({ ...q, guide: answerGuide(q.question, profile, q.prompt) }))} />
        <div className="border-t border-border pt-5"><AiActionButton action={prepareInterview} jobId={id} label="Refresh practice questions" pendingLabel="Preparing…" variant="secondary" /><p className="mt-2 text-xs text-muted">Starts a fresh set. Submitted answers remain in saved earlier practice.</p></div>
      </>}
      {earlier.length > 0 && <details className="rounded-lg border border-border p-4"><summary className="cursor-pointer text-sm font-medium">Saved earlier practice · {earlier.length} answers</summary><ol className="mt-4 space-y-5">{earlier.map((q, i) => <li key={`${q.id}-${i}`}><p className="text-sm font-medium">{q.question}</p><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{q.answer}</p></li>)}</ol></details>}
    </>}
  </div>;
}
