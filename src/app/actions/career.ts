"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { careerFingerprint } from "@/lib/career/evidence";
import { researchCompany } from "@/lib/career/company";
import { buildApplicationPlan } from "@/lib/career/plan";
import { interviewBank, mockCurriculum } from "@/lib/career/questions";
import { evaluateMockAnswer } from "@/lib/career/mock";
import { webUrl } from "@/lib/cv/links";
import { jobHasCriteria } from "@/lib/jobs/quality";
import { ownedJob } from "@/lib/services/jobs";
import { getProfile, profileReady } from "@/lib/services/profile";
import { advanceMockSession, createMockSession, getCareerPlan, getMockSession, listMockSessions, recordMockAnswer, saveCareerPlan, updateLearningProgress } from "@/lib/services/career";
import { overLimit } from "@/lib/services/rate-limit";
import { denialMessage, refundAllowance, spendAllowance } from "@/lib/services/usage";
import { collections } from "@/db/mongo";

export type CareerState = { error?: string; success?: string; upgrade?: true; verify?: true } | undefined;
async function contextFor(form: FormData) {
  const user = await requireUser();
  const job = await ownedJob(user.id, String(form.get("jobId") ?? ""));
  if (!job) redirect("/app/jobs");
  const profile = await getProfile(user.id);
  if (!profileReady(profile)) redirect("/app/profile?needed=1");
  if (!jobHasCriteria(job.post)) redirect(`/app/jobs/${job.id}#job-description`);
  return { user, job, context: { profile, post: job.post, postText: job.postText } };
}

export async function prepareApplicationPlan(_: CareerState, form: FormData): Promise<CareerState> {
  const { user, job, context } = await contextFor(form);
  if (await overLimit(`career-plan:${user.id}`, 8, 60 * 60_000)) return { error: "Please wait before analysing another application plan." };
  const website = String(form.get("companyUrl") ?? "").trim().slice(0, 2000);
  if (website && !webUrl(website)) return { error: "Enter a valid public company website URL, or leave it blank." };
  const spend = await spendAllowance(user, "tailor", { jobId: job.id });
  if (!spend.ok) return denialMessage(user, "tailor", spend.reason);
  try {
    const company = await researchCompany(website);
    const plan = await buildApplicationPlan(context, company);
    if (!plan.requirements.length) { await refundAllowance(user, "tailor"); return { error: "No source-backed requirements could be mapped. Add the complete job description first." }; }
    await saveCareerPlan(user.id, job.id, plan);
  } catch { await refundAllowance(user, "tailor"); return { error: "The application plan could not be saved. Your allowance was returned; try again." }; }
  revalidatePath(`/app/jobs/${job.id}`, "layout");
  revalidatePath("/app/strategy");
  return { success: "Full analysis ready. Start with the required gaps." };
}

export async function saveLearningTask(_: CareerState, form: FormData): Promise<CareerState> {
  const { user, job, context } = await contextFor(form);
  const row = await getCareerPlan(user.id, job.id);
  const fingerprint = careerFingerprint(context);
  if (!row || row.plan.fingerprint !== fingerprint) return { error: "Your CV or the job changed. Refresh the analysis before recording progress." };
  const taskId = String(form.get("taskId") ?? "");
  const notes = String(form.get("notes") ?? "").trim().slice(0, 2000);
  const url = String(form.get("evidenceUrl") ?? "").trim();
  const evidenceUrl = url ? webUrl(url) : "";
  if (url && !evidenceUrl) return { error: "Use a valid public URL for the work sample." };
  const completed = form.get("completed") === "on";
  if (completed && !evidenceUrl && notes.length < 40) return { error: "Record a work sample URL or at least a short explanation of what you completed and checked." };
  if (!(await updateLearningProgress(user.id, job.id, taskId, fingerprint, { completed, notes, evidenceUrl: evidenceUrl || "", updatedAt: new Date().toISOString() }))) return { error: "This learning task changed. Reload the plan." };
  revalidatePath(`/app/jobs/${job.id}`);
  revalidatePath("/app/strategy");
  return { success: "Progress saved. Your CV and evidence score are unchanged; add only demonstrated work to your profile after reviewing it." };
}

export async function startMockInterview(_: CareerState, form: FormData): Promise<CareerState> {
  const { user, job, context } = await contextFor(form);
  const row = await getCareerPlan(user.id, job.id);
  if (!row || row.plan.fingerprint !== careerFingerprint(context)) return { error: "Build or refresh this job’s full analysis first." };
  const sessions = await listMockSessions(user.id, job.id);
  const active = sessions.find((s) => s.status === "active");
  if (active) redirect(`/app/jobs/${job.id}/interview/mock/${active._id}`);
  if (await overLimit(`mock-start:${user.id}`, 10, 60 * 60_000)) return { error: "Please wait before starting another mock interview." };
  const spend = await spendAllowance(user, "mock", { jobId: job.id });
  if (!spend.ok) return denialMessage(user, "mock", spend.reason);
  const requestedId = randomUUID();
  let session;
  try {
    const attempt = await (await collections()).mockSessions.countDocuments({ userId: user.id, jobId: job.id });
    session = await createMockSession(user.id, job.id, row.plan.fingerprint, mockCurriculum(interviewBank(context, row.plan), attempt), requestedId);
  } catch { await refundAllowance(user, "mock"); return { error: "The session could not be started. Your allowance was returned; try again." }; }
  if (!session || session._id !== requestedId) await refundAllowance(user, "mock");
  if (!session) return { error: "The session could not be started. Your allowance was returned; try again." };
  revalidatePath(`/app/jobs/${job.id}/interview`);
  redirect(`/app/jobs/${job.id}/interview/mock/${session._id}`);
}

export async function submitMockAnswer(_: CareerState, form: FormData): Promise<CareerState> {
  const { user, job, context } = await contextFor(form);
  const session = await getMockSession(user.id, String(form.get("sessionId") ?? ""));
  const version = Number(form.get("version"));
  if (!session || session.jobId !== job.id || session.status !== "active" || session.version !== version || session.turns.at(-1)?.feedback) return { error: "This question has already changed. Reload to continue the saved session." };
  if (session.fingerprint !== careerFingerprint(context)) return { error: "Your CV or job changed. Finish this session and start a new one from the refreshed plan." };
  const answer = String(form.get("answer") ?? "").trim();
  if (answer.length < 3 || answer.length > 12_000) return { error: "Write a starting answer between 3 and 12,000 characters. It is fine to say what you do not know." };
  if (await overLimit(`mock-answer:${user.id}`, 50, 60 * 60_000)) return { error: "Please wait before submitting another interview answer." };
  const feedback = await evaluateMockAnswer(session.turns.at(-1)!.question, answer, context, session.turns.slice(0, -1));
  if (!(await recordMockAnswer(user.id, session._id, version, answer, feedback))) return { error: "Another submission already updated this session. Reload to see the saved answer." };
  revalidatePath(`/app/jobs/${job.id}/interview/mock/${session._id}`);
  return { success: "Answer saved. Review the feedback before continuing." };
}

export async function continueMockInterview(_: CareerState, form: FormData): Promise<CareerState> {
  const user = await requireUser();
  const session = await getMockSession(user.id, String(form.get("sessionId") ?? ""));
  if (!session || !(await ownedJob(user.id, session.jobId))) return { error: "Session not found." };
  if (!(await advanceMockSession(user.id, session._id, Number(form.get("version")), form.get("finish") === "1"))) return { error: "The session changed. Reload to see its latest state." };
  revalidatePath(`/app/jobs/${session.jobId}/interview/mock/${session._id}`);
  revalidatePath("/app/strategy");
  return { success: "Session updated." };
}
