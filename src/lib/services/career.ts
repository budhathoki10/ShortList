import "server-only";
import { randomUUID } from "node:crypto";
import { collections, isDuplicateKey } from "@/db/mongo";
import { stripHtmlDeep } from "@/lib/jobs/html";
import type { ApplicationPlan, CareerQuestion, LearningProgress, MockFeedback, MockSessionDoc } from "@/lib/career/types";
import { mockReport, nextDifficulty } from "@/lib/career/mock";
import { MAX_MOCK_TURNS } from "@/lib/career/scoring";
import { adaptQuestion } from "@/lib/career/questions";
import { ownedJob } from "./jobs";

export async function getCareerPlan(userId: string, jobId: string) {
  const row = await (await collections()).careerPlans.findOne({ _id: String(jobId), userId: String(userId) });
  return row ? stripHtmlDeep(row) : null;
}
export async function saveCareerPlan(userId: string, jobId: string, plan: ApplicationPlan) {
  if (!(await ownedJob(userId, jobId))) return false;
  const c = await collections();
  const old = await getCareerPlan(userId, jobId);
  const progress: LearningProgress = {};
  // Retain work only for tasks that still exist. Completion never adds facts to the CV or boosts the score.
  for (const task of plan.roadmap) if (old?.progress[task.id]) progress[task.id] = old.progress[task.id];
  await c.careerPlans.updateOne({ _id: String(jobId), userId: String(userId) }, { $set: { plan, progress, updatedAt: new Date() } }, { upsert: true });
  return true;
}
export async function updateLearningProgress(userId: string, jobId: string, taskId: string, fingerprint: string, progress: LearningProgress[string]) {
  const row = await getCareerPlan(userId, jobId);
  if (!row || row.plan.fingerprint !== fingerprint || !row.plan.roadmap.some((t) => t.id === taskId)) return false;
  const result = await (await collections()).careerPlans.updateOne({ _id: jobId, userId, "plan.fingerprint": fingerprint }, { $set: { [`progress.${taskId}`]: progress, updatedAt: new Date() } });
  return result.matchedCount === 1;
}
export async function listCareerPlans(userId: string) {
  return (await (await collections()).careerPlans.find({ userId: String(userId) }).toArray()).map(stripHtmlDeep);
}
export async function listMockSessions(userId: string, jobId: string) {
  return (await collections()).mockSessions.find({ userId: String(userId), jobId: String(jobId) }, { projection: { queue: 0 } }).sort({ createdAt: -1 }).limit(10).toArray();
}
export async function getMockSession(userId: string, id: string) {
  return (await collections()).mockSessions.findOne({ _id: String(id), userId: String(userId) });
}
export async function createMockSession(userId: string, jobId: string, fingerprint: string, queue: CareerQuestion[], requestedId = randomUUID()) {
  if (!queue.length || queue.length > 9 || !(await ownedJob(userId, jobId))) return null;
  const c = await collections();
  const active = await c.mockSessions.findOne({ userId, jobId, status: "active" });
  if (active) return active;
  const now = new Date();
  const row: MockSessionDoc = { _id: requestedId, userId, jobId, fingerprint, version: 0, status: "active", queue, mainIndex: 0, turns: [{ id: randomUUID(), question: queue[0], answer: "", feedback: null, followUpDepth: 0 }], report: null, createdAt: now, updatedAt: now };
  try { await c.mockSessions.insertOne(row); return row; }
  catch (err) { if (!isDuplicateKey(err)) throw err; return c.mockSessions.findOne({ userId, jobId, status: "active" }); }
}
export async function recordMockAnswer(userId: string, id: string, version: number, answer: string, feedback: MockFeedback) {
  const row = await getMockSession(userId, id);
  if (!row || row.status !== "active" || row.version !== version || row.turns.at(-1)?.feedback) return false;
  const turns = row.turns.map((t, i) => i === row.turns.length - 1 ? { ...t, answer, feedback } : t);
  const result = await (await collections()).mockSessions.updateOne({ _id: id, userId, version, status: "active" }, { $set: { turns, updatedAt: new Date() }, $inc: { version: 1 } });
  return result.modifiedCount === 1;
}
export async function advanceMockSession(userId: string, id: string, version: number, finish = false) {
  const row = await getMockSession(userId, id);
  const current = row?.turns.at(-1);
  if (!row || row.status !== "active" || row.version !== version || (!current?.feedback && !finish)) return false;
  const followUp = !finish && current?.feedback && current.followUpDepth === 0 && current.question.kind !== "closing" && row.turns.length < MAX_MOCK_TURNS - 1;
  const mainIndex = followUp ? row.mainIndex : row.mainIndex + 1;
  const complete = finish || mainIndex >= row.queue.length || row.turns.length >= MAX_MOCK_TURNS;
  const question: CareerQuestion | undefined = !complete ? followUp ? { ...current!.question, id: randomUUID(), question: current!.feedback!.followUp, assesses: "Explain or defend the previous answer with concrete reasoning.", difficulty: nextDifficulty(current!.question.difficulty, current!.feedback!) } : adaptQuestion(row.queue[mainIndex], current?.feedback ? nextDifficulty(row.queue[mainIndex].difficulty, current.feedback) : row.queue[mainIndex].difficulty) : undefined;
  const turns = question ? [...row.turns, { id: randomUUID(), question, answer: "", feedback: null, followUpDepth: followUp ? 1 : 0 }] : row.turns;
  const result = await (await collections()).mockSessions.updateOne({ _id: id, userId, version, status: "active" }, { $set: { turns, mainIndex, status: complete ? "complete" : "active", report: complete ? mockReport(turns) : null, updatedAt: new Date() }, $inc: { version: 1 } });
  return result.modifiedCount === 1;
}
