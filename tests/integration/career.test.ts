import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collections } from "@/db/mongo";
import { EMPTY_PROFILE } from "@/lib/model/types";
import { heuristicJob } from "@/lib/jobs/heuristic";
import { buildApplicationPlan } from "@/lib/career/plan";
import { researchCompany } from "@/lib/career/company";
import { interviewBank, mockCurriculum } from "@/lib/career/questions";
import { evaluateMockAnswer } from "@/lib/career/mock";
import type { MockFeedback } from "@/lib/career/types";
import { createJob, deleteJob } from "@/lib/services/jobs";
import { deleteUser, exportUserData } from "@/lib/services/account";
import { getProfile, saveProfile } from "@/lib/services/profile";
import { advanceMockSession, createMockSession, getCareerPlan, getMockSession, recordMockAnswer, saveCareerPlan, updateLearningProgress } from "@/lib/services/career";
import { makeUser, resetDb } from "./helpers";

const profile = { ...EMPTY_PROFILE, name: "Alex Example", skills: ["JavaScript"], projects: [{ id: "p1", name: "Tracker", link: "", bullets: ["Built a JavaScript tracker and tested invalid inputs."] }] };
const postText = "Job title: Python Developer\nCompany: Example Company\nRequirements\n- Python programming and automated testing.\n- JavaScript experience is required.\nPreferred\n- Docker knowledge.\nResponsibilities\n- Build and maintain reliable APIs.";
const context = { profile, postText, post: heuristicJob(postText) };
const noCompany = { sources: [], facts: [], warning: "No source" };
beforeEach(async () => { await resetDb(); vi.stubEnv("ANTHROPIC_API_KEY", ""); });
afterEach(() => vi.unstubAllEnvs());
async function setup() {
  const user = await makeUser();
  await saveProfile(user.id, profile);
  const job = await createJob(user.id, { url: null, postText, post: context.post, match: null });
  const plan = await buildApplicationPlan(context, noCompany);
  await saveCareerPlan(user.id, job.id, plan);
  return { user, job, plan };
}
const grade = (): MockFeedback => ({ method: "ai", score: 4.5, rubric: ["correctness", "depth", "communication", "confidence", "relevance"].map((criterion) => ({ criterion: criterion as MockFeedback["rubric"][number]["criterion"], score: 4, note: "Supported example" })), strengths: ["A concrete example"], improvements: ["Explain the trade-off"], corrections: [], modelAnswer: "Expected concepts", improvedAnswer: "My actual example", followUp: "What alternative would you consider and how would you compare it?" });

describe("application preparation lifecycle", () => {
  it("keeps learning evidence private and does not convert self-reported completion into CV skills or fit points", async () => {
    const { user, job, plan } = await setup();
    const other = await makeUser();
    expect(await getCareerPlan(other.id, job.id)).toBeNull();
    expect(await saveCareerPlan(other.id, job.id, plan)).toBe(false);
    const task = plan.roadmap[0];
    const progress = { completed: true, evidenceUrl: "https://example.com/practice", notes: "I completed the checks and documented limitations.", updatedAt: new Date().toISOString() };
    expect(await updateLearningProgress(other.id, job.id, task.id, plan.fingerprint, progress)).toBe(false);
    expect(await updateLearningProgress(user.id, job.id, task.id, "outdated", progress)).toBe(false);
    expect(await updateLearningProgress(user.id, job.id, "__proto__", plan.fingerprint, progress)).toBe(false);
    expect(await updateLearningProgress(user.id, job.id, task.id, plan.fingerprint, progress)).toBe(true);
    expect((await getCareerPlan(user.id, job.id))!.plan.fit.score).toBe(plan.fit.score);
    expect((await getProfile(user.id))!.skills).toEqual(["JavaScript"]);
  });
  it("allows only one active session, and only one concurrent answer write for the current question", async () => {
    const { user, job, plan } = await setup();
    const queue = mockCurriculum(interviewBank(context, plan));
    const [a, b] = await Promise.all([createMockSession(user.id, job.id, plan.fingerprint, queue), createMockSession(user.id, job.id, plan.fingerprint, queue)]);
    expect(a!._id).toBe(b!._id);
    const other = await makeUser();
    expect(await getMockSession(other.id, a!._id)).toBeNull();
    expect(await recordMockAnswer(other.id, a!._id, 0, "A forged answer", grade())).toBe(false);
    const writes = await Promise.all([recordMockAnswer(user.id, a!._id, 0, "My real answer", grade()), recordMockAnswer(user.id, a!._id, 0, "Another answer", grade())]);
    expect(writes.filter(Boolean)).toHaveLength(1);
    expect(await advanceMockSession(user.id, a!._id, 0)).toBe(false);
    expect(await advanceMockSession(user.id, a!._id, 1)).toBe(true);
    const current = (await getMockSession(user.id, a!._id))!;
    expect(current.turns).toHaveLength(2);
    expect(current.turns[1].followUpDepth).toBe(1);
    expect(current.turns[1].question.question).toBe(grade().followUp);
    expect(await recordMockAnswer(user.id, a!._id, 2, "A deeper answer", grade())).toBe(true);
    expect(await advanceMockSession(user.id, a!._id, 3)).toBe(true);
    const next = (await getMockSession(user.id, a!._id))!.turns.at(-1)!;
    expect(next.question.difficulty).toBe(3);
    expect(next.question.question).toContain("compare two approaches");
  });
  it("finishes a complete bounded interview, including closing questions, with a persisted unscored report", async () => {
    const { user, job, plan } = await setup();
    let session = (await createMockSession(user.id, job.id, plan.fingerprint, mockCurriculum(interviewBank(context, plan))))!;
    while (session.status === "active") {
      const question = session.turns.at(-1)!.question;
      const feedback = await evaluateMockAnswer(question, "I built a JavaScript tracker.", context, session.turns);
      expect(await recordMockAnswer(user.id, session._id, session.version, "I built a JavaScript tracker.", feedback)).toBe(true);
      expect(await advanceMockSession(user.id, session._id, session.version + 1)).toBe(true);
      session = (await getMockSession(user.id, session._id))!;
    }
    expect(session.turns.length).toBeLessThanOrEqual(18);
    expect(session.turns.at(-1)!.question.kind).toBe("closing");
    expect(session.report?.overall).toBeNull();
    expect(session.report?.localAnswers).toBe(session.turns.length);
    expect(session.report?.assessedAnswers).toBe(0);
  });
  it("exports preparation work and removes it with the job or account", async () => {
    const { user, job, plan } = await setup();
    const queue = mockCurriculum(interviewBank(context, plan));
    const session = (await createMockSession(user.id, job.id, plan.fingerprint, queue))!;
    const exported = await exportUserData(user);
    expect(exported.applicationPlans).toHaveLength(1);
    expect(exported.mockInterviews).toHaveLength(1);
    const other = await makeUser();
    await deleteJob(other.id, job.id);
    expect(await getCareerPlan(user.id, job.id)).not.toBeNull();
    await deleteJob(user.id, job.id);
    expect(await getCareerPlan(user.id, job.id)).toBeNull();
    expect(await getMockSession(user.id, session._id)).toBeNull();
    const next = await createJob(user.id, { url: null, postText, post: context.post, match: null });
    await saveCareerPlan(user.id, next.id, plan);
    await createMockSession(user.id, next.id, plan.fingerprint, queue);
    await deleteUser(user.id);
    const c = await collections();
    expect(await c.careerPlans.countDocuments({ userId: user.id })).toBe(0);
    expect(await c.mockSessions.countDocuments({ userId: user.id })).toBe(0);
  });
});

describe("company source research", () => {
  it("reads only the supplied website and linked first-party pages, retaining dated source quotations", async () => {
    const research = await researchCompany(`${process.env.FIXTURE_BASE}/company`);
    expect(research.sources).toHaveLength(3);
    expect(research.sources.every((s) => s.url.startsWith(process.env.FIXTURE_BASE!))).toBe(true);
    expect(research.facts.some((f) => f.category === "technology" && f.quote.includes("Python"))).toBe(true);
    expect(research.facts.some((f) => f.category === "hiring")).toBe(true);
    expect(research.facts.find((f) => f.category === "culture")?.quote).toContain("remote team values collaboration");
    for (const fact of research.facts) expect(research.sources.find((s) => s.id === fact.sourceId)?.text).toContain(fact.quote);
  });
  it("does not invent a company domain or fabricate results for blocked sites", async () => {
    expect((await researchCompany("")).sources).toHaveLength(0);
    expect((await researchCompany(`${process.env.FIXTURE_BASE}/jobs/login-wall`)).facts).toHaveLength(0);
    vi.stubEnv("FETCH_ALLOW_PRIVATE_HOSTS", "0");
    const blocked = await researchCompany("http://127.0.0.1/company");
    expect(blocked.sources).toHaveLength(0);
    expect(blocked.warning).toContain("blocked");
  });
});
