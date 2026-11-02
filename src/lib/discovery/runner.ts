import "server-only";
import { randomUUID } from "node:crypto";
import { collections, isDuplicateKey } from "@/db/mongo";
import type { Filter } from "mongodb";
import type { DiscoveredJobDoc } from "@/db/types";
import { evaluateJob, roleCompatibility } from "./match";
import { configuredSources, fetchSource, SOURCES, type SourceConfig, type SourcePosting } from "./sources";

/** New or changed postings read with AI per run. The rest wait for the next run, which keeps a run inside its time limit. */
const MAX_EXTRACTIONS_PER_RUN = 40;
/** A partial feed stops listing older jobs; one not seen for this long is treated as closed. */
const PARTIAL_FEED_STALE_DAYS = 21;
import { extractJob } from "@/lib/jobs/extract";
import { profileReady } from "@/lib/services/profile";
import { backfillPassports } from "@/lib/services/discovery";
import { enqueueRecommendationNotifications, sendImmediateDiscoveryNotifications } from "./notifications";

/** Store one posting. Null when it's new or changed but this run's extraction budget is spent: the next run takes it. */
async function upsertPosting(posting: SourcePosting, budget: { left: number }): Promise<{ job: DiscoveredJobDoc; changed: boolean } | null> {
  const c = await collections();
  const existing = await c.discoveredJobs.findOne({ sourceType: posting.sourceType, sourceKey: posting.sourceKey, externalId: posting.externalId });
  const now = new Date();
  if (existing && existing.contentHash === posting.contentHash) {
    await c.discoveredJobs.updateOne({ _id: existing._id }, { $set: { lastSeenAt: now, closedAt: null } });
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

async function matchChangedJobs(jobs: DiscoveredJobDoc[]) {
  if (!jobs.length) return 0;
  const c = await collections();
  const passports = await c.careerPassports.find({ discoveryEnabled: true }).toArray();
  if (!passports.length) return 0;
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
      // A dismissed match stays quiet even when the employer edits the posting.
      if (existing?.status !== "dismissed" && (!existing || existing.jobContentHash !== job.contentHash) && passport.alertStates.includes(decision.state)) {
        await enqueueRecommendationNotifications(passport, recommendationId, notificationVersion);
      }
    }
  }
  return created;
}

export async function runJobDiscovery() {
  const sources = configuredSources();
  const c = await collections();
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
  const openSourcePairs = await c.discoveredJobs.find({ closedAt: null }, { projection: { sourceType: 1, sourceKey: 1, company: 1 } }).toArray();
  const closedSourceIds = new Set<string>();
  for (const job of openSourcePairs) {
    const id = `${job.sourceType}:${job.sourceKey.toLowerCase()}`;
    if (configuredSourceIds.has(id) || closedSourceIds.has(id)) continue;
    closedSourceIds.add(id);
    await closeMissing({ type: job.sourceType, key: job.sourceKey, company: job.company }, []);
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
      const { postings, seen } = await fetchSource(source, { wanted, known });
      found += seen.length;
      const changedJobs: DiscoveredJobDoc[] = [];
      for (const posting of postings) {
        // Only roles someone is looking for are stored and read with AI. A board lists every role it has each run,
        // so if someone later targets a role, its postings are picked up on the next run.
        if (!wanted(posting.title)) continue;
        const result = await upsertPosting(posting, budget);
        if (result?.changed) changedJobs.push(result.job);
      }
      // Still listed but not read in full this run (a SmartRecruiters posting already stored): it's still open.
      const returned = new Set(postings.map((posting) => posting.externalId));
      const listedOnly = seen.filter((id) => known.has(id) && !returned.has(id));
      if (listedOnly.length) await c.discoveredJobs.updateMany({ sourceType: source.type, sourceKey: source.key, externalId: { $in: listedOnly }, closedAt: null }, { $set: { lastSeenAt: new Date() } });
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
  recommendations = await matchChangedJobs(await c.discoveredJobs.find({ closedAt: null }).toArray());
  const delivered = await sendImmediateDiscoveryNotifications();
  await c.discoveryRuns.updateOne({ _id: lease._id }, { $set: { status: attemptedSources > 0 && failures.length === attemptedSources ? "failed" : "complete", found, changed, recommendations, failureReason: failures.length ? failures.join(" | ").slice(0, 500) : null, completedAt: new Date() } });
  return { sources: sources.length, attemptedSources, skippedSources, found, changed, recommendations, delivered, failures };
}
