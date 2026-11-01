import "server-only";
import { randomUUID } from "node:crypto";
import { stripHtmlDeep } from "@/lib/jobs/html";
import { collections, fromDoc } from "@/db/mongo";
import type { Job } from "@/db/types";
import { addDays } from "@/lib/dates";
import { scoreMatch } from "@/lib/match/score";
import type { JobPost, Match, Profile } from "@/lib/model/types";
import { today } from "@/lib/plans";
import { jobHasCriteria } from "@/lib/jobs/quality";

import type { Status } from "./job-status";

export { isStatus, STATUS_LABELS, STATUSES, type Status } from "./job-status";

/** Days after applying before we suggest a polite follow-up. */
export const FOLLOW_UP_AFTER_DAYS = 7;

export async function createJob(userId: string, input: { url: string | null; postText: string; post: JobPost; match: Match | null }): Promise<Job> {
  const now = new Date();
  const job: Job = { id: randomUUID(), userId, ...input, status: "saved", appliedOn: null, followUpOn: null, notes: null, createdAt: now, updatedAt: now };
  const { id, ...rest } = job;
  await (await collections()).jobs.insertOne({ _id: id, ...rest });
  return job;
}

export async function ownedJob(userId: string, jobId: string): Promise<Job | null> {
  if (!/^[0-9a-f-]{36}$/i.test(jobId)) return null;
  const doc = await (await collections()).jobs.findOne({ _id: jobId, userId: String(userId) });
  return doc ? stripHtmlDeep(fromDoc<Job>(doc)) : null;
}

export async function listJobs(userId: string): Promise<Job[]> {
  const docs = await (await collections()).jobs.find({ userId: String(userId) }).sort({ updatedAt: -1 }).toArray();
  return docs.map((d) => stripHtmlDeep(fromDoc<Job>(d)));
}

export async function setMatch(jobId: string, match: Match) {
  await (await collections()).jobs.updateOne({ _id: String(jobId) }, { $set: { match } });
}

/** Re-score every job after the profile changes, so match badges stay current. Plain code, no AI. */
export async function rescoreAll(userId: string, profile: Profile) {
  const { jobs } = await collections();
  const rows = await jobs.find({ userId: String(userId) }, { projection: { post: 1 } }).toArray();
  if (rows.length === 0) return;
  await jobs.bulkWrite(rows.map((j) => ({ updateOne: { filter: { _id: j._id, userId: String(userId) }, update: { $set: { match: jobHasCriteria(j.post) ? scoreMatch(profile, j.post) : null } } } })));
}

/**
 * Move a job along. Applying sets a follow-up a week out; any answer from the employer
 * (interview, offer, rejection) clears it.
 */
export async function setStatus(userId: string, jobId: string, status: Status, day = today()) {
  const job = await ownedJob(userId, jobId);
  if (!job) return null;
  const patch: Partial<Job> = { status, updatedAt: new Date() };
  if (status === "applied") {
    patch.appliedOn = job.appliedOn ?? day;
    patch.followUpOn = job.status === "applied" ? job.followUpOn : addDays(day, FOLLOW_UP_AFTER_DAYS);
  } else if (status === "saved") {
    patch.followUpOn = null;
  } else {
    patch.followUpOn = null;
    patch.appliedOn = job.appliedOn ?? day;
  }
  await (await collections()).jobs.updateOne({ _id: job.id, userId: job.userId }, { $set: patch });
  return status;
}

export async function setFollowUp(userId: string, jobId: string, day: string | null) {
  await (await collections()).jobs.updateOne({ _id: String(jobId), userId: String(userId) }, { $set: { followUpOn: day, updatedAt: new Date() } });
}

export async function setNotes(userId: string, jobId: string, notes: string) {
  await (await collections()).jobs.updateOne({ _id: String(jobId), userId: String(userId) }, { $set: { notes: notes || null, updatedAt: new Date() } });
}

/** Delete the job and everything written for it. */
export async function deleteJob(userId: string, jobId: string) {
  const c = await collections();
  const { deletedCount } = await c.jobs.deleteOne({ _id: String(jobId), userId: String(userId) });
  if (!deletedCount) return;
  await Promise.all([c.documents.deleteMany({ jobId: String(jobId), userId: String(userId) }), c.interviews.deleteOne({ _id: String(jobId), userId: String(userId) }), c.careerPlans.deleteOne({ _id: String(jobId), userId: String(userId) }), c.mockSessions.deleteMany({ jobId: String(jobId), userId: String(userId) })]);
}

const dueFilter = (userId: string, day: string) => ({ userId: String(userId), status: "applied", followUpOn: { $type: "string" as const, $lte: day } });

export async function dueFollowUps(userId: string, day = today()): Promise<Job[]> {
  const docs = await (await collections()).jobs.find(dueFilter(userId, day)).sort({ followUpOn: 1 }).toArray();
  return docs.map((d) => stripHtmlDeep(fromDoc<Job>(d)));
}

export async function dueFollowUpCount(userId: string, day = today()) {
  return (await collections()).jobs.countDocuments(dueFilter(userId, day));
}

/** Applications sent, replies and interviews: overall and for the last 7 days. */
export async function progress(userId: string, day = today()) {
  const { jobs: coll } = await collections();
  const jobs = await coll.find({ userId: String(userId) }, { projection: { status: 1, appliedOn: 1 } }).toArray();
  const weekAgo = addDays(day, -6);
  const applied = jobs.filter((j) => j.appliedOn);
  const heardBack = applied.filter((j) => j.status === "interview" || j.status === "offer" || j.status === "rejected");
  const interviews = jobs.filter((j) => j.status === "interview" || j.status === "offer");
  return {
    saved: jobs.length,
    applied: applied.length,
    appliedThisWeek: applied.filter((j) => j.appliedOn! >= weekAgo).length,
    responseRate: applied.length ? Math.round((heardBack.length / applied.length) * 100) : null,
    interviews: interviews.length,
    offers: jobs.filter((j) => j.status === "offer").length,
    waiting: applied.filter((j) => j.status === "applied").length,
  };
}

/** Everyone with follow-ups due today, for the daily email. */
export async function allDueFollowUps(day = today()) {
  const { jobs, users } = await collections();
  const docs = await jobs.find({ status: "applied", followUpOn: { $type: "string", $lte: day, $gte: addDays(day, -60) } }).toArray();
  if (docs.length === 0) return [];
  // Reminders are non-essential: only to a confirmed address, and never when the person turned notifications off in Settings.
  const owners = await users
    .find({ _id: { $in: [...new Set(docs.map((d) => d.userId))] }, emailVerifiedAt: { $ne: null }, notificationsOff: { $ne: true } }, { projection: { email: 1, name: 1 } })
    .toArray();
  const byId = new Map(owners.map((u) => [u._id, u]));
  return docs.flatMap((d) => {
    const owner = byId.get(d.userId);
    return owner ? [{ job: stripHtmlDeep(fromDoc<Job>(d)), email: owner.email, name: owner.name }] : [];
  });
}
