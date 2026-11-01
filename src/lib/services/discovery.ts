import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { collections } from "@/db/mongo";
import type { AlertFrequency, CareerPassportDoc, RecommendationState } from "@/db/types";
import { createJob } from "@/lib/services/jobs";
import { encryptPushSecret } from "@/lib/discovery/push-crypto";
import { isPushServiceEndpoint } from "@/lib/discovery/push-endpoints";

export type PassportInput = {
  targetRoles: string[];
  excludedRoles: string[];
  locations: string[];
  workCountries: string[];
  remoteModes: CareerPassportDoc["remoteModes"];
  needsSponsorship: boolean;
  graduationDate: string | null;
  minimumSalary: number | null;
  employmentTypes: string[];
  excludedCompanies: string[];
  discoveryEnabled: boolean;
  emailFrequency: AlertFrequency;
  pushFrequency: AlertFrequency;
  alertStates: RecommendationState[];
  quietStart: string;
  quietEnd: string;
  timezone: string;
};

export async function getCareerPassport(userId: string) {
  return (await collections()).careerPassports.findOne({ _id: String(userId) });
}

export async function saveCareerPassport(userId: string, input: PassportInput) {
  const now = new Date();
  const { careerPassports } = await collections();
  const existing = await careerPassports.findOne({ _id: String(userId) }, { projection: { version: 1, createdAt: 1 } });
  const row: CareerPassportDoc = {
    _id: String(userId),
    ...input,
    version: (existing?.version ?? 0) + 1,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
  };
  await careerPassports.replaceOne({ _id: row._id }, row, { upsert: true });
  return row;
}

export async function listRecommendations(userId: string, includeDismissed = false) {
  const c = await collections();
  const recommendations = await c.jobRecommendations
    .find({ userId: String(userId), status: { $in: includeDismissed ? ["active", "saved", "dismissed"] : ["active", "saved"] } })
    .sort({ createdAt: -1 })
    .limit(200)
    .toArray();
  const jobs = await c.discoveredJobs.find({ _id: { $in: recommendations.map((row) => row.discoveredJobId) } }).toArray();
  const byId = new Map(jobs.map((job) => [job._id, job]));
  return recommendations.flatMap((recommendation) => {
    const job = byId.get(recommendation.discoveredJobId);
    return job ? [{ recommendation, job }] : [];
  });
}

export async function ownedRecommendation(userId: string, recommendationId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(recommendationId)) return null;
  const c = await collections();
  const recommendation = await c.jobRecommendations.findOne({ _id: recommendationId, userId: String(userId) });
  if (!recommendation) return null;
  const job = await c.discoveredJobs.findOne({ _id: recommendation.discoveredJobId });
  return job ? { recommendation, job } : null;
}

export async function dismissRecommendation(userId: string, recommendationId: string, reason: string) {
  return (await collections()).jobRecommendations.updateOne(
    { _id: String(recommendationId), userId: String(userId) },
    { $set: { status: "dismissed", dismissalReason: reason.slice(0, 100), updatedAt: new Date() } },
  );
}

/** Save a recommendation to the existing tracker exactly once. */
export async function saveRecommendationToTracker(userId: string, recommendationId: string) {
  const c = await collections();
  const row = await ownedRecommendation(userId, recommendationId);
  if (!row) return null;
  if (row.recommendation.trackerJobId) return row.recommendation.trackerJobId;
  const job = await createJob(userId, {
    url: row.job.canonicalUrl,
    postText: row.job.text,
    post: row.job.post,
    match: row.recommendation.match,
  });
  const claimed = await c.jobRecommendations.updateOne(
    { _id: recommendationId, userId: String(userId), trackerJobId: null },
    { $set: { trackerJobId: job.id, status: "saved", updatedAt: new Date() } },
  );
  if (claimed.modifiedCount) return job.id;
  await c.jobs.deleteOne({ _id: job.id, userId: String(userId) });
  return (await c.jobRecommendations.findOne({ _id: recommendationId, userId: String(userId) }, { projection: { trackerJobId: 1 } }))?.trackerJobId ?? null;
}

export async function subscribePush(userId: string, input: { endpoint: string; p256dh: string; auth: string; deviceLabel: string }) {
  if (!isPushServiceEndpoint(input.endpoint)) throw new Error("Unsupported push service");
  const c = await collections();
  const now = new Date();
  const endpointHash = createHash("sha256").update(input.endpoint).digest("hex");
  await c.pushSubscriptions.updateOne(
    { endpointHash },
    {
      $set: { userId: String(userId), endpoint: input.endpoint, p256dh: encryptPushSecret(input.p256dh), auth: encryptPushSecret(input.auth), deviceLabel: input.deviceLabel.slice(0, 80), updatedAt: now },
      $setOnInsert: { _id: randomUUID(), createdAt: now, lastSuccessAt: null },
    },
    { upsert: true },
  );
}

export async function unsubscribePush(userId: string, endpoint: string) {
  const endpointHash = createHash("sha256").update(endpoint).digest("hex");
  await (await collections()).pushSubscriptions.deleteOne({ userId: String(userId), endpointHash });
}

export async function listPushDevices(userId: string) {
  return (await collections()).pushSubscriptions.find({ userId: String(userId) }, { projection: { endpoint: 0, p256dh: 0, auth: 0 } }).sort({ updatedAt: -1 }).toArray();
}

export async function removePushDevice(userId: string, subscriptionId: string) {
  if (!/^[0-9a-f-]{36}$/i.test(subscriptionId)) return false;
  const result = await (await collections()).pushSubscriptions.deleteOne({ _id: subscriptionId, userId: String(userId) });
  return result.deletedCount === 1;
}

export async function getDiscoverySourceStatus() {
  const sources = await (await collections()).jobSources.find({ enabled: true }).sort({ company: 1 }).toArray();
  const successful = sources.map((source) => source.lastSuccessAt).filter((date): date is Date => date instanceof Date);
  return {
    configured: sources.length,
    healthy: sources.filter((source) => source.lastSuccessAt && source.failureCount === 0).length,
    failing: sources.filter((source) => source.failureCount > 0).length,
    lastSuccessAt: successful.length ? new Date(Math.max(...successful.map((date) => date.valueOf()))) : null,
  };
}
