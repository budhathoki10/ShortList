"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import type { User } from "@/db/types";
import { requireUser } from "@/lib/auth/session";
import { scoreMatch } from "@/lib/match/score";
import type { UsageKind } from "@/lib/plans";
import { getCoverLetter, getInterview, saveCoverLetter, saveInterview, savePracticeAnswer, saveTailoredCv, setAllChangesAccepted, setChangeAccepted } from "@/lib/services/documents";
import { ownedJob, setMatch } from "@/lib/services/jobs";
import { getProfile, profileReady } from "@/lib/services/profile";
import { denialMessage, refundAllowance, spendAllowance } from "@/lib/services/usage";
import { writeCoverLetter } from "@/lib/tailor/cover-letter";
import { answerFeedback, interviewQuestions } from "@/lib/tailor/interview";
import { proposeChanges } from "@/lib/tailor/tailor";
import { jobHasCriteria } from "@/lib/jobs/quality";
import { getCareerPlan } from "@/lib/services/career";
import { careerFingerprint } from "@/lib/career/evidence";
import { buildApplicationPlan } from "@/lib/career/plan";
import type { CareerContext } from "@/lib/career/types";
import { saveCareerPlan } from "@/lib/services/career";
import { INTERVIEW_QUESTION_VERSION } from "@/lib/career/questions";
import { aiEnabled } from "@/lib/ai";
import { overLimit } from "@/lib/services/rate-limit";

/** `upgrade` marks a refusal the paid plan would lift, so the message can link to the plans. */
export type TailorState = { error?: string; success?: string; upgrade?: true; verify?: true } | undefined;

async function applicationEvidence(userId: string, jobId: string, context: CareerContext) {
  const saved = await getCareerPlan(userId, jobId);
  if (saved?.plan.fingerprint === careerFingerprint(context)) return saved.plan;
  const plan = await buildApplicationPlan(context, { sources: [], facts: [], warning: "No current company website research. Add the employer’s official website in the application plan." });
  await saveCareerPlan(userId, jobId, plan);
  return plan;
}

async function context(jobId: FormDataEntryValue | null) {
  const user = await requireUser();
  const job = await ownedJob(user.id, String(jobId ?? ""));
  if (!job) redirect("/app/jobs");
  if (!jobHasCriteria(job.post)) redirect(`/app/jobs/${job.id}#job-description`);
  const profile = await getProfile(user.id);
  if (!profileReady(profile)) redirect("/app/profile?needed=1");
  // Always score against the latest profile.
  const match = scoreMatch(profile, job.post);
  await setMatch(user.id, job.id, match);
  return { user, job, profile, match };
}

/** Per-hour ceilings on top of the plan's allowance, so a script can't burn a month of AI calls in minutes. */
const HOURLY: Partial<Record<UsageKind, number>> = { tailor: 20, cover: 20, interview: 60 };
const SLOW_DOWN = "You’re working faster than we can keep up with. Wait a few minutes, then try again.";
/** The plain-code fallback ran because no AI model answered: a weaker result the user shouldn't pay a use for. */
const FALLBACK_NOTE = " AI was unavailable, so this is a simpler draft and it didn’t use your allowance. Try again later for a full AI version.";

/** Run AI work for a job against the user's allowance, giving the use back if the work throws. */
async function metered<T>(user: User, kind: UsageKind, jobId: string, work: () => Promise<T>): Promise<{ value: T } | { denied: NonNullable<TailorState> }> {
  if (await overLimit(`ai-${kind}:${user.id}`, HOURLY[kind] ?? 20, 60 * 60_000)) return { denied: { error: SLOW_DOWN } };
  const spend = await spendAllowance(user, kind, { jobId });
  if (!spend.ok) return { denied: denialMessage(user, kind, spend.reason) };
  try {
    return { value: await work() };
  } catch (err) {
    await refundAllowance(user, kind);
    throw err;
  }
}

export async function tailorCv(_: TailorState, formData: FormData): Promise<TailorState> {
  const { user, job, profile, match } = await context(formData.get("jobId"));
  const run = await metered(user, "tailor", job.id, async () => {
    const plan = await applicationEvidence(user.id, job.id, { profile, post: job.post, postText: job.postText });
    return proposeChanges(profile, job.post, match, job.postText, JSON.stringify(plan.requirements));
  });
  if ("denied" in run) return run.denied;
  const result = run.value;
  const aiFailed = aiEnabled() && result.method === "basic";
  if (aiFailed) await refundAllowance(user, "tailor");
  await saveTailoredCv(user.id, job.id, { changes: result.changes, closeGaps: result.closeGaps });
  revalidatePath(`/app/jobs/${job.id}/cv`);
  const blocked = result.changes.filter((c) => c.flags.length > 0).length;
  const summary =
    result.changes.length === 0
      ? "No supported changes were identified. Review your CV against the job requirements before applying."
      : `${result.changes.length} suggested change${result.changes.length === 1 ? "" : "s"}.${blocked ? ` ${blocked} blocked because they added something that isn't in your CV.` : ""}`;
  return { success: `${summary}${aiFailed ? FALLBACK_NOTE : ""}` };
}

/** Accept or reject one suggested change. Changes the fact check blocked can't be accepted. */
export async function toggleChange(formData: FormData) {
  const user = await requireUser();
  const job = await ownedJob(user.id, String(formData.get("jobId") ?? ""));
  if (!job) return;
  await setChangeAccepted(user.id, job.id, String(formData.get("changeId") ?? ""), formData.get("accept") === "1");
}

/** Use every unblocked suggestion, or none of them. */
export async function toggleAllChanges(formData: FormData) {
  const user = await requireUser();
  const job = await ownedJob(user.id, String(formData.get("jobId") ?? ""));
  if (!job) return;
  await setAllChangesAccepted(user.id, job.id, formData.get("accept") === "1");
}

export async function writeCover(_: TailorState, formData: FormData): Promise<TailorState> {
  const { user, job, profile, match } = await context(formData.get("jobId"));
  const run = await metered(user, "cover", job.id, async () => {
    const plan = await applicationEvidence(user.id, job.id, { profile, post: job.post, postText: job.postText });
    return writeCoverLetter(profile, job.post, match, JSON.stringify(plan.company.facts));
  });
  if ("denied" in run) return run.denied;
  const result = run.value;
  if (result.aiFailed) await refundAllowance(user, "cover");
  await saveCoverLetter(user.id, job.id, result.text, { replace: true, method: result.method });
  revalidatePath(`/app/jobs/${job.id}/cover-letter`);
  return { success: `Cover letter draft ready. Review the details and personalise the wording before sending.${result.aiFailed ? FALLBACK_NOTE : ""}` };
}

export async function saveCover(_: TailorState, formData: FormData): Promise<TailorState> {
  const user = await requireUser();
  const job = await ownedJob(user.id, String(formData.get("jobId") ?? ""));
  if (!job) return { error: "This job is no longer available. Return to Jobs and select a saved vacancy." };
  const text = String(formData.get("text") ?? "").slice(0, 8000);
  if (!(await getCoverLetter(user.id, job.id)) && !text.trim()) return { error: "Add your cover letter text before saving." };
  await saveCoverLetter(user.id, job.id, text);
  revalidatePath(`/app/jobs/${job.id}/cover-letter`);
  return { success: "Cover letter saved." };
}

export async function prepareInterview(_: TailorState, formData: FormData): Promise<TailorState> {
  const { user, job, profile, match } = await context(formData.get("jobId"));
  const saved = await getCareerPlan(user.id, job.id);
  const fresh = saved?.plan.fingerprint === careerFingerprint({ profile, post: job.post, postText: job.postText });
  const questions = await interviewQuestions(profile, job.post, match, job.postText, fresh ? saved?.plan : undefined);
  await saveInterview(user.id, job.id, questions, { questionVersion: INTERVIEW_QUESTION_VERSION, archive: true });
  revalidatePath(`/app/jobs/${job.id}/interview`);
  return { success: `${questions.length} questions to practise.` };
}

/** AI review uses an allowance; reference guidance remains free and unscored. */
export async function practiseAnswer(_: TailorState, formData: FormData): Promise<TailorState> {
  const { user, job, profile } = await context(formData.get("jobId"));
  const session = await getInterview(user.id, job.id);
  const qid = String(formData.get("questionId") ?? "");
  const answer = String(formData.get("answer") ?? "").trim().slice(0, 6000);
  const q = session?.questions.find((x) => x.id === qid);
  if (!session || !q) return { error: "This question has been replaced. Copy your draft, then refresh the page to load the current questions." };
  if (session.sourceNeedsReview) return { error: "Your CV or job description changed. Prepare fresh interview questions first." };
  if (answer.length < 3) return { error: "Add a starting thought, even one short sentence, and we’ll help you build on it." };
  const review = () => answerFeedback(q.question, answer, profile, job.post, q.prompt, job.postText);
  const charged = aiEnabled();
  const run = charged ? await metered(user, "interview", job.id, review) : { value: await review() };
  if ("denied" in run) return run.denied;
  const feedback = run.value;
  if (charged && feedback.method === "checklist") await refundAllowance(user, "interview");
  if (!(await savePracticeAnswer(user.id, job.id, qid, answer, feedback))) return { error: "The questions changed while reviewing. Your draft is still here; refresh the question set before retrying." };
  revalidatePath(`/app/jobs/${job.id}/interview`);
  return { success: "Answer saved. Your review is ready below." };
}
