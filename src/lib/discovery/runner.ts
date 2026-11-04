import "server-only";
import { randomUUID } from "node:crypto";
import { collections, isDuplicateKey } from "@/db/mongo";
import type { Filter } from "mongodb";
import type { DiscoveredJobDoc } from "@/db/types";
import { evaluateJob, roleCompatibility } from "./match";
import { postedAt, postingCutoff, RECOMMENDATION_RETENTION_DAYS } from "./retention";
import { configuredSources, fetchSource, SOURCES, type SourceConfig, type SourcePosting } from "./sources";

/**
 * New or changed postings read with AI per run. The time budget is the real limit; this only stops a runaway run.
 * Anything left over is picked up by the next run (every 15 minutes), so nothing is dropped.
 */
const MAX_EXTRACTIONS_PER_RUN = Number(process.env.DISCOVERY_MAX_EXTRACTIONS) || 500;
/** AI reads in flight at once. They were one at a time, which alone could outlast the host's function time limit. */
const EXTRACTION_CONCURRENCY = 5;
/**
 * Time a run spends fetching before it stops and leaves the rest for the next run (the scheduler calls every 15 minutes).
 * Serverless hosts kill a function at their time limit without a word, which left sources neither healthy nor failed.
 * Raise it with DISCOVERY_TIME_BUDGET_MS once you know your host's limit.
 */
const DEFAULT_TIME_BUDGET_MS = 8_000;
/** A partial feed stops listing older jobs; one not seen for this long is treated as closed. */
const PARTIAL_FEED_STALE_DAYS = 21;
import { extractJob } from "@/lib/jobs/extract";
import { profileReady } from "@/lib/services/profile";
import { backfillPassports } from "@/lib/services/discovery";
import { enqueueRecommendationNotifications, sendImmediateDiscoveryNotifications, type OwnerCache } from "./notifications";

/** Store one posting. Null when it's new or changed but this run's extraction budget is spent: the next run takes it. */
async function upsertPosting(posting: SourcePosting, budget: { left: number }, existing: DiscoveredJobDoc | undefined): Promise<{ job: DiscoveredJobDoc; changed: boolean } | null> {
  const c = await collections();
  const now = new Date();
  if (existing && existing.contentHash === posting.contentHash) {
    // Still open and unchanged: the run refreshes lastSeenAt for all of these in one write. Only a reopened posting needs its own.
    if (existing.closedAt !== null) await c.discoveredJobs.updateOne({ _id: existing._id }, { $set: { lastSeenAt: now, closedAt: null } });
    return { job: { ...existing, lastSeenAt: now, closedAt: null }, changed: existing.closedAt !== null };
  }
  if (budget.left <= 0) return null;
  budget.left -= 1;
  const extracted = await extractJob(`${posting.title}\nCompany: ${posting.company}\nLocation: ${posting.location}\n${posting.text}`);
  const post = { ...extracted.post, title: posting.title, company: posting.company, location: posting.location || extracted.post.location };
  const job: DiscoveredJobDoc = {
    _id: existing?._id ?? randomUUID(),
    ...posting,
    post,
    firstSeenAt: existing?.firstSeenAt ?? now,
    lastSeenAt: now,
    closedAt: null,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await c.discoveredJobs.replaceOne({ _id: job._id }, job, { upsert: true });
  return { job, changed: true };
}

/** A complete feed or board lists every open job, so one it no longer lists has closed. */
async function closeMissing(source: SourceConfig, seen: string[]) {
  return closeWhere({ sourceType: source.type, sourceKey: source.key, externalId: { $nin: seen }, closedAt: null });
}

/** A partial feed only lists its newest jobs: close the ones past their stated expiry, or not seen for weeks. */
async function closeStale(source: SourceConfig) {
  const now = Date.now();
  return closeWhere({
    sourceType: source.type,
    sourceKey: source.key,
    closedAt: null,
    $or: [{ expiresAt: { $lt: new Date(now) } }, { lastSeenAt: { $lt: new Date(now - PARTIAL_FEED_STALE_DAYS * 24 * 60 * 60_000) } }],
  });
}

/** Close the matching postings, close their recommendations and stop any alerts still waiting to go out. */
async function closeWhere(filter: Filter<DiscoveredJobDoc>) {
  const c = await collections();
  const closing = await c.discoveredJobs.find(filter, { projection: { _id: 1 } }).toArray();
  if (!closing.length) return;
  const ids = closing.map((row) => row._id);
  const recommendations = await c.jobRecommendations.find({ discoveredJobId: { $in: ids }, status: { $in: ["active", "saved"] } }, { projection: { _id: 1 } }).toArray();
  await Promise.all([
    c.discoveredJobs.updateMany({ _id: { $in: ids } }, { $set: { closedAt: new Date(), updatedAt: new Date() } }),
    c.jobRecommendations.updateMany({ discoveredJobId: { $in: ids }, status: { $in: ["active", "saved"] } }, { $set: { status: "closed", updatedAt: new Date() } }),
  ]);
  if (recommendations.length) {
    await c.notificationDeliveries.updateMany({ recommendationId: { $in: recommendations.map((row) => row._id) }, state: "pending" }, { $set: { state: "failed", failureReason: "Source posting closed" } });
  }
}

/**
 * Remove matches the user never responded to (still "active", not saved, not dismissed) after the retention window,
 * with any alert still waiting to go out. The row is kept as a hidden "expired" marker while its posting is open, or the
 * next run would recommend the same job again; the marker is deleted once the posting closes or disappears.
 */
async function expireUnansweredRecommendations() {
  const c = await collections();
  const cutoff = new Date(Date.now() - RECOMMENDATION_RETENTION_DAYS * 24 * 60 * 60_000);
  const stale = await c.jobRecommendations.find({ status: "active", trackerJobId: null, createdAt: { $lt: cutoff } }, { projection: { _id: 1 } }).toArray();
  if (stale.length) {
    const ids = stale.map((row) => row._id);
    await c.jobRecommendations.updateMany({ _id: { $in: ids }, status: "active" }, { $set: { status: "expired", updatedAt: new Date() } });
    await c.notificationDeliveries.updateMany({ recommendationId: { $in: ids }, state: "pending" }, { $set: { state: "failed", failureReason: "Match expired unanswered" } });
  }
  const expired = await c.jobRecommendations.find({ status: "expired" }, { projection: { _id: 1, discoveredJobId: 1 } }).toArray();
  if (!expired.length) return;
  const open = new Set((await c.discoveredJobs.find({ _id: { $in: expired.map((row) => row.discoveredJobId) }, closedAt: null }, { projection: { _id: 1 } }).toArray()).map((row) => row._id));
  const gone = expired.filter((row) => !open.has(row.discoveredJobId)).map((row) => row._id);
  if (gone.length) await c.jobRecommendations.deleteMany({ _id: { $in: gone }, status: "expired" });
}

async function matchChangedJobs(jobs: DiscoveredJobDoc[]) {
  if (!jobs.length) return 0;
  const c = await collections();
  const passports = await c.careerPassports.find({ discoveryEnabled: true }).toArray();
  if (!passports.length) return 0;
  const ownerCache: OwnerCache = new Map();
  const profiles = await c.profiles.find({ _id: { $in: passports.map((row) => row._id) } }, { projection: { data: 1, updatedAt: 1 } }).toArray();
  const byUser = new Map(profiles.map((row) => [row._id, row]));
  let created = 0;
  for (const passport of passports) {
    const profile = byUser.get(passport._id);
    if (!profile || !profileReady(profile.data)) continue;
    // One query per user for what they already have, instead of one per user and job.
    const existingRows = await c.jobRecommendations.find({ userId: passport._id, discoveredJobId: { $in: jobs.map((job) => job._id) } }).toArray();
    const existingByJob = new Map(existingRows.map((row) => [row.discoveredJobId, row]));
    for (const job of jobs) {
      const existing = existingByJob.get(job._id);
      // Postings older than a week are never newly recommended (or emailed), however long they stay open.
      if (!existing && postedAt(job) < postingCutoff()) continue;
      // Nothing that feeds the decision has changed: skip before scoring.
      if (existing && existing.status !== "closed" && existing.jobContentHash === job.contentHash && existing.passportVersion === passport.version && existing.profileUpdatedAt.valueOf() === profile.updatedAt.valueOf()) continue;
      const decision = evaluateJob(profile.data, profile.updatedAt, passport, job);
      if (!decision) continue;
      const now = new Date();
      const recommendationId = existing?._id ?? randomUUID();
      const notificationVersion = existing ? existing.notificationVersion + 1 : 1;
      const statusPatch = !existing || existing.status === "closed" ? { status: "active" as const } : {};
      await c.jobRecommendations.updateOne(
        { _id: recommendationId },
        {
          $set: { ...decision, notificationVersion, updatedAt: now, ...statusPatch },
          $setOnInsert: { userId: passport._id, discoveredJobId: job._id, trackerJobId: null, dismissalReason: null, createdAt: now },
        },
        { upsert: true },
      );
      if (!existing) created += 1;
      // A dismissed or expired match stays quiet even when the employer edits the posting.
      if (existing?.status !== "dismissed" && existing?.status !== "expired" && (!existing || existing.jobContentHash !== job.contentHash) && passport.alertStates.includes(decision.state)) {
        await enqueueRecommendationNotifications(passport, recommendationId, notificationVersion, ownerCache);
      }
    }
  }
  return created;
}

export async function runJobDiscovery() {
  const deadline = Date.now() + (Number(process.env.DISCOVERY_TIME_BUDGET_MS) || DEFAULT_TIME_BUDGET_MS);
  const c = await collections();
  // The source that has waited longest goes first, so a run cut short at the deadline never starves the same ones.
  const lastRun = new Map((await c.jobSources.find({}, { projection: { lastRunAt: 1 } }).toArray()).map((row) => [row._id, row.lastRunAt?.valueOf() ?? 0]));
  const sources = configuredSources().sort((a, b) => (lastRun.get(`${a.type}:${a.key.toLowerCase()}`) ?? 0) - (lastRun.get(`${b.type}:${b.key.toLowerCase()}`) ?? 0));
  const sourceIds = sources.map((source) => `${source.type}:${source.key.toLowerCase()}`);
  const configuredAt = new Date();
  for (const source of sources) {
    const _id = `${source.type}:${source.key.toLowerCase()}`;
    await c.jobSources.updateOne(
      { _id },
      { $set: { type: source.type, key: source.key, company: source.company, enabled: true, updatedAt: configuredAt }, $setOnInsert: { failureCount: 0, lastRunAt: null, lastSuccessAt: null, nextAttemptAt: null, lastFailureReason: null, createdAt: configuredAt } },
      { upsert: true },
    );
  }
  await c.jobSources.updateMany({ _id: { $nin: sourceIds }, enabled: true }, { $set: { enabled: false, updatedAt: configuredAt } });
  const lease = { _id: "discovery-lock", source: "all", status: "running" as const, found: 0, changed: 0, recommendations: 0, failureReason: null, startedAt: new Date(), completedAt: null };
  try {
    const { _id: leaseId, ...leaseFields } = lease;
    await c.discoveryRuns.updateOne(
      { _id: leaseId, $or: [{ status: { $ne: "running" } }, { startedAt: { $lt: new Date(Date.now() - 10 * 60_000) } }] },
      { $set: leaseFields, $setOnInsert: { _id: leaseId } },
      { upsert: true },
    );
  } catch (error) {
    if (isDuplicateKey(error)) return { sources: sources.length, found: 0, changed: 0, recommendations: 0, delivered: 0, failures: [], skipped: "A discovery run is already active" };
    throw error;
  }
  const configuredSourceIds = new Set(sourceIds);
  // One row per source with open postings, instead of reading every open posting just to find the source names.
  const openSources = await c.discoveredJobs
    .aggregate<{ _id: { sourceType: SourceConfig["type"]; sourceKey: string }; company: string }>([
      { $match: { closedAt: null } },
      { $group: { _id: { sourceType: "$sourceType", sourceKey: "$sourceKey" }, company: { $first: "$company" } } },
    ])
    .toArray();
  for (const { _id, company } of openSources) {
    if (configuredSourceIds.has(`${_id.sourceType}:${_id.sourceKey.toLowerCase()}`)) continue;
    await closeMissing({ type: _id.sourceType, key: _id.sourceKey, company }, []);
  }
  // People who saved a CV before passports filled themselves still get searched for.
  await backfillPassports();
  let found = 0;
  let changed = 0;
  let recommendations = 0;
  let attemptedSources = 0;
  let skippedSources = 0;
  const failures: string[] = [];
  // Feeds list thousands of jobs across every field. Only roles someone is actually looking for are stored and read.
  const targets = (await c.careerPassports.find({ discoveryEnabled: true }, { projection: { targetRoles: 1 } }).toArray()).flatMap((row) => row.targetRoles ?? []);
  const budget = { left: MAX_EXTRACTIONS_PER_RUN };

  for (const source of sources) {
    if (Date.now() > deadline) {
      skippedSources += 1;
      continue;
    }
    const runId = randomUUID();
    const startedAt = new Date();
    const sourceId = `${source.type}:${source.key.toLowerCase()}`;
    const sourceHealth = await c.jobSources.findOne({ _id: sourceId });
    if (sourceHealth?.nextAttemptAt && sourceHealth.nextAttemptAt > startedAt) {
      skippedSources += 1;
      continue;
    }
    attemptedSources += 1;
    await c.discoveryRuns.insertOne({ _id: runId, source: `${source.type}:${source.key}`, status: "running", found: 0, changed: 0, recommendations: 0, failureReason: null, startedAt, completedAt: null });
    try {
      await c.jobSources.updateOne({ _id: sourceId }, { $set: { lastRunAt: new Date(), updatedAt: new Date() } });
      const info = SOURCES[source.type];
      const wanted = (title: string) => roleCompatibility(title, targets) >= 45;
      const known = new Set((await c.discoveredJobs.find({ sourceType: source.type, sourceKey: source.key }, { projection: { externalId: 1 } }).toArray()).map((row) => row.externalId));
      const { postings, seen } = await fetchSource(source, { wanted, known, deadline });
      found += seen.length;
      const changedJobs: DiscoveredJobDoc[] = [];
      // Only roles someone is looking for are stored and read with AI. A board lists every role it has each run,
      // so if someone later targets a role, its postings are picked up on the next run.
      const todo = postings.filter((posting) => wanted(posting.title));
      // One query for the stored copies of this source's postings, instead of one per posting.
      const stored = new Map((await c.discoveredJobs.find({ sourceType: source.type, sourceKey: source.key, externalId: { $in: todo.map((posting) => posting.externalId) } }).toArray()).map((row) => [row.externalId, row]));
      for (let i = 0; i < todo.length; i += EXTRACTION_CONCURRENCY) {
        // Past the deadline nothing new is read: the posting is picked up again next run.
        if (Date.now() > deadline) budget.left = 0;
        const results = await Promise.all(todo.slice(i, i + EXTRACTION_CONCURRENCY).map((posting) => upsertPosting(posting, budget, stored.get(posting.externalId))));
        for (const result of results) if (result?.changed) changedJobs.push(result.job);
      }
      // Everything stored that the source still lists is still open: refresh them all in one write.
      const listed = seen.filter((id) => known.has(id));
      if (listed.length) await c.discoveredJobs.updateMany({ sourceType: source.type, sourceKey: source.key, externalId: { $in: listed }, closedAt: null }, { $set: { lastSeenAt: new Date() } });
      if (info.partial) await closeStale(source);
      else await closeMissing(source, seen);
      changed += changedJobs.length;
      await c.discoveryRuns.updateOne({ _id: runId }, { $set: { status: "complete", found: seen.length, changed: changedJobs.length, recommendations: 0, completedAt: new Date() } });
      // Feeds ask not to be fetched constantly: wait their interval before the next fetch.
      const nextAttemptAt = info.minIntervalMinutes ? new Date(Date.now() + info.minIntervalMinutes * 60_000) : null;
      await c.jobSources.updateOne({ _id: sourceId }, { $set: { lastSuccessAt: new Date(), nextAttemptAt, lastFailureReason: null, failureCount: 0, updatedAt: new Date() } });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 240) : "Unknown source error";
      failures.push(`${source.type}:${source.key}: ${reason}`);
      await c.discoveryRuns.updateOne({ _id: runId }, { $set: { status: "failed", failureReason: reason, completedAt: new Date() } });
      const nextFailureCount = (sourceHealth?.failureCount ?? 0) + 1;
      const delayMinutes = Math.min(360, 5 * 2 ** Math.min(nextFailureCount - 1, 6));
      await c.jobSources.updateOne({ _id: sourceId }, { $set: { lastFailureReason: reason, nextAttemptAt: new Date(Date.now() + delayMinutes * 60_000), updatedAt: new Date() }, $inc: { failureCount: 1 } });
    }
  }
  await expireUnansweredRecommendations();
  recommendations = await matchChangedJobs(await c.discoveredJobs.find({ closedAt: null }).toArray());
  const delivered = await sendImmediateDiscoveryNotifications();
  await c.discoveryRuns.updateOne({ _id: lease._id }, { $set: { status: attemptedSources > 0 && failures.length === attemptedSources ? "failed" : "complete", found, changed, recommendations, failureReason: failures.length ? failures.join(" | ").slice(0, 500) : null, completedAt: new Date() } });
  return { sources: sources.length, attemptedSources, skippedSources, found, changed, recommendations, delivered, failures };
}
