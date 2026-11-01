import "server-only";
import { MongoClient, type Db } from "mongodb";
import { ensureIndexes } from "./indexes";
import type { CareerPlanDoc, MockSessionDoc } from "@/lib/career/types";
import type { CareerPassportDoc, CvImportDoc, CvTemplateDoc, DiscoveredJobDoc, DiscoveryRunDoc, DocumentDoc, InterviewDoc, JobDoc, JobRecommendationDoc, JobSourceDoc, NotificationDeliveryDoc, PaymentDoc, PhotoDoc, ProfileDoc, PushSubscriptionDoc, RateLimitDoc, SessionDoc, Stored, SubscriptionDoc, UsageDoc, UserDoc, WebhookEventRecord } from "./types";

type Cache = { client?: MongoClient; ready?: Promise<Db> };
// One connection pool per server process, reused across hot reloads in development.
const cache = ((globalThis as unknown as { __shortlistMongo?: Cache }).__shortlistMongo ??= {});

function connect(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new Error("MONGODB_URI is not set");
  cache.ready ??= (async () => {
    const client = new MongoClient(uri, { maxPoolSize: 10, serverSelectionTimeoutMS: 8_000, ignoreUndefined: true });
    await client.connect();
    const db = client.db(process.env.MONGODB_DB || "shortlist");
    await ensureIndexes(db);
    cache.client = client;
    return db;
  })().catch((err) => {
    // Let the next request try again instead of caching the failure.
    cache.ready = undefined;
    throw err;
  });
  return cache.ready;
}

/** Typed collections. Every query in the app goes through here. */
export async function collections() {
  const db = await connect();
  return {
    users: db.collection<UserDoc>("users"),
    sessions: db.collection<SessionDoc>("sessions"),
    payments: db.collection<PaymentDoc>("payments"),
    profiles: db.collection<ProfileDoc>("profiles"),
    cvImports: db.collection<CvImportDoc>("cv_imports"),
    careerPlans: db.collection<CareerPlanDoc>("career_plans"),
    mockSessions: db.collection<MockSessionDoc>("mock_sessions"),
    jobs: db.collection<JobDoc>("jobs"),
    documents: db.collection<DocumentDoc>("documents"),
    interviews: db.collection<InterviewDoc>("interviews"),
    usage: db.collection<UsageDoc>("usage"),
    subscriptions: db.collection<SubscriptionDoc>("subscriptions"),
    webhookEvents: db.collection<WebhookEventRecord>("webhook_events"),
    rateLimits: db.collection<RateLimitDoc>("rate_limits"),
    cvTemplates: db.collection<CvTemplateDoc>("cv_templates"),
    photos: db.collection<PhotoDoc>("profile_photos"),
    careerPassports: db.collection<CareerPassportDoc>("career_passports"),
    discoveredJobs: db.collection<DiscoveredJobDoc>("discovered_jobs"),
    jobRecommendations: db.collection<JobRecommendationDoc>("job_recommendations"),
    pushSubscriptions: db.collection<PushSubscriptionDoc>("push_subscriptions"),
    notificationDeliveries: db.collection<NotificationDeliveryDoc>("notification_deliveries"),
    discoveryRuns: db.collection<DiscoveryRunDoc>("discovery_runs"),
    jobSources: db.collection<JobSourceDoc>("job_sources"),
  };
}

/** Stored document -> domain row (`_id` becomes `id`). */
export function fromDoc<T extends { id: string }>(doc: Stored<T>): T {
  const { _id, ...rest } = doc;
  return { id: _id, ...rest } as unknown as T;
}

/** True when a write failed because a unique index already has that value. */
export function isDuplicateKey(err: unknown): boolean {
  return typeof err === "object" && err !== null && (err as { code?: number }).code === 11000;
}

/** Close the pool. Tests call this; the server never needs to. */
export async function closeDb() {
  await cache.client?.close();
  cache.client = undefined;
  cache.ready = undefined;
}
