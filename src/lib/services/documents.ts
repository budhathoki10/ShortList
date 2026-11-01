import "server-only";
import { randomUUID } from "node:crypto";
import { collections, fromDoc } from "@/db/mongo";
import type { Document } from "@/db/types";
import type { AnswerFeedback, InterviewQuestion, TailoredCv } from "@/lib/model/types";

async function find(userId: string, jobId: string, kind: "cv" | "cover_letter"): Promise<Document | null> {
  const doc = await (await collections()).documents.findOne({ userId: String(userId), jobId: String(jobId), kind });
  return doc ? fromDoc<Document>(doc) : null;
}

export const getTailoredCv = (userId: string, jobId: string) => find(userId, jobId, "cv");
export const getCoverLetter = (userId: string, jobId: string) => find(userId, jobId, "cover_letter");

/** Update-or-create in one step; the unique (jobId, kind) index keeps it to one document per job. */
async function upsert(userId: string, jobId: string, kind: "cv" | "cover_letter", fields: { cv: TailoredCv } | { text: string; generationMethod?: "ai" | "basic" }) {
  const now = new Date();
  // The field this call doesn't write starts out null on a new document.
  const other = "cv" in fields ? { text: null } : { cv: null };
  const { documents } = await collections();
  await documents.updateOne(
    { userId: String(userId), jobId: String(jobId), kind },
    { $set: { ...fields, sourceNeedsReview: false, updatedAt: now }, $setOnInsert: { _id: randomUUID(), createdAt: now, ...other } },
    { upsert: true },
  );
}

export async function saveTailoredCv(userId: string, jobId: string, cv: TailoredCv) {
  await upsert(userId, jobId, "cv", { cv });
}

/** Save edits in place. A fresh draft (`replace`) starts a new document, so the editor knows to reload. */
export async function saveCoverLetter(userId: string, jobId: string, text: string, opts: { replace?: boolean; method?: "ai" | "basic" } = {}) {
  if (opts.replace) {
    const { documents } = await collections();
    await documents.deleteOne({ userId: String(userId), jobId: String(jobId), kind: "cover_letter" });
  }
  await upsert(userId, jobId, "cover_letter", { text, ...(opts.method ? { generationMethod: opts.method } : {}) });
}

export async function getInterview(userId: string, jobId: string) {
  const doc = await (await collections()).interviews.findOne({ _id: String(jobId), userId: String(userId) });
  return doc ? { jobId: doc._id, userId: doc.userId, questions: doc.questions, updatedAt: doc.updatedAt, sourceNeedsReview: doc.sourceNeedsReview ?? false, questionVersion: doc.questionVersion ?? 1, previousQuestions: doc.previousQuestions ?? [] } : null;
}

export async function saveInterview(userId: string, jobId: string, questions: InterviewQuestion[], opts: { questionVersion?: number; archive?: boolean } = {}) {
  const existing = opts.archive ? await getInterview(userId, jobId) : null;
  const previousQuestions = existing ? [...existing.previousQuestions, ...existing.questions.filter((q) => q.answer)].slice(-100) : undefined;
  await (await collections()).interviews.updateOne({ _id: String(jobId), userId: String(userId) }, { $set: { questions, sourceNeedsReview: false, updatedAt: new Date(), ...(opts.questionVersion ? { questionVersion: opts.questionVersion } : {}), ...(previousQuestions ? { previousQuestions } : {}) } }, { upsert: true });
}

export async function savePracticeAnswer(userId: string, jobId: string, questionId: string, answer: string, feedback: AnswerFeedback) {
  const result = await (await collections()).interviews.updateOne({ _id: String(jobId), userId: String(userId), sourceNeedsReview: { $ne: true }, "questions.id": questionId }, { $set: { "questions.$.answer": answer, "questions.$.feedback": feedback, updatedAt: new Date() } });
  return result.modifiedCount > 0;
}

/**
 * Accept or reject one suggested change. Atomic on that one entry, so quick successive toggles
 * can't overwrite each other, and a change the fact check blocked (it has flags) can never be switched on.
 */
export async function setChangeAccepted(userId: string, jobId: string, changeId: string, accepted: boolean) {
  const { documents } = await collections();
  await documents.updateOne(
    { userId: String(userId), jobId: String(jobId), kind: "cv" },
    { $set: { "cv.changes.$[c].accepted": accepted, updatedAt: new Date() } },
    { arrayFilters: [{ "c.id": String(changeId), "c.flags.0": { $exists: false } }] },
  );
}

/** Switch every change that isn't blocked on or off in one step. */
export async function setAllChangesAccepted(userId: string, jobId: string, accepted: boolean) {
  const { documents } = await collections();
  await documents.updateOne(
    { userId: String(userId), jobId: String(jobId), kind: "cv" },
    { $set: { "cv.changes.$[c].accepted": accepted, updatedAt: new Date() } },
    // Switching everything on leaves out the optional trims and reorders: those change what the CV says or its date order.
    { arrayFilters: [accepted ? { "c.flags.0": { $exists: false }, "c.optional": { $ne: true } } : { "c.flags.0": { $exists: false } }] },
  );
}
