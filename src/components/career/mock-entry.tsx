import Link from "next/link";
import type { ReactNode } from "react";
import { startMockInterview } from "@/app/actions/career";
import { careerFingerprint } from "@/lib/career/evidence";
import { interviewBank } from "@/lib/career/questions";
import type { CareerContext } from "@/lib/career/types";
import { getCareerPlan, listMockSessions } from "@/lib/services/career";
import { AiActionButton } from "../ai-action-button";
import { ButtonLink } from "../ui";

/** `note` sits under the start button: what starting a session costs (see TrialNote). */
export async function MockInterviewEntry({ userId, jobId, context, note }: { userId: string; jobId: string; context: CareerContext; note?: ReactNode }) {
  const [row, sessions] = await Promise.all([getCareerPlan(userId, jobId), listMockSessions(userId, jobId)]);
  const fresh = row?.plan.fingerprint === careerFingerprint(context);
  const active = sessions.find((s) => s.status === "active");
  const bank = row && fresh ? interviewBank(context, row.plan) : [];
  return <section aria-label="Mock interview preparation" className="space-y-4 rounded-lg border border-border bg-surface p-5 sm:p-6">
    <div><p className="text-xs font-medium text-accent">A complete practice conversation</p><h2 className="mt-1 text-lg font-semibold">Mock interview</h2><p className="mt-2 max-w-2xl text-sm leading-relaxed text-muted">One question at a time, with answer-specific follow-ups, technical review and a final report. Includes introduction, role and project questions, gaps, practical work when relevant, and closing questions.</p></div>
    <div className="flex flex-wrap items-center gap-3">{active ? <ButtonLink href={`/app/jobs/${jobId}/interview/mock/${active._id}`}>Resume mock interview</ButtonLink> : fresh ? <AiActionButton action={startMockInterview} jobId={jobId} label="Start mock interview" pendingLabel="Starting your interview…" /> : <ButtonLink href={`/app/jobs/${jobId}`}>Build the full analysis first</ButtonLink>}<p className="text-xs text-muted">One interview allowance covers the whole session, up to 18 answers and follow-ups.</p></div>
    {!active && fresh && note}
    <p className="text-xs leading-relaxed text-muted">AI scores are coaching estimates, not a validated hiring assessment. Without AI, the session provides unscored practice checks. Confidence feedback concerns written explanation only. Code is reviewed, not executed.</p>
    {sessions.filter((s) => s.status === "complete").length > 0 && <div className="border-t border-border pt-3"><h3 className="text-sm font-medium">Previous sessions</h3><ul className="mt-2 space-y-2">{sessions.filter((s) => s.status === "complete").map((s) => <li key={s._id}><Link href={`/app/jobs/${jobId}/interview/mock/${s._id}`} className="text-sm text-accent underline underline-offset-4">{s.createdAt.toISOString().slice(0, 10)} · {s.report?.overall != null ? `${s.report.overall}/5 coaching estimate` : "Unscored practice"} · {s.turns.filter((t) => t.feedback).length} answers</Link></li>)}</ul></div>}
    {bank.length > 0 && <details className="border-t border-border pt-3"><summary className="cursor-pointer py-2 text-sm font-medium">Explore your question bank · {bank.length} questions</summary><p className="mt-2 text-xs text-muted">Covers every saved skill and project, role requirements and relevant gap questions. These are practice questions, not leaked company questions.</p><div className="mt-3 max-h-[32rem] space-y-2 overflow-y-auto">{bank.map((q) => <details key={q.id} className="rounded-md border border-border p-3"><summary className="cursor-pointer text-sm"><span className="mr-2 text-xs text-muted">{q.kind}</span>{q.question}</summary><p className="mt-2 text-xs text-muted">{q.assesses}</p><ul className="mt-2 list-disc space-y-1 pl-4 text-xs text-muted">{q.expected.map((e, i) => <li key={i}>{e}</li>)}</ul><p className="mt-2 break-words text-xs text-muted">Based on: {q.source}</p></details>)}</div></details>}
  </section>;
}
