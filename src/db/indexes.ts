import type { Db } from "mongodb";

/**
 * Indexes the app relies on. Safe to run on every start: creating an index that already
 * exists is a no-op. The unique ones are load-bearing (one account per email, one payment per
 * provider reference, one tailored CV and one cover letter per job); the rest keep the
 * per-user lists fast and let MongoDB expire old sessions and tokens by itself.
 */
export async function ensureIndexes(db: Db) {
  await Promise.all([
    db.collection("users").createIndexes([
      { key: { email: 1 }, unique: true },
      // One account per Google identity. Partial, so old accounts that haven't signed in with Google yet (no googleId) don't collide.
      { key: { googleId: 1 }, unique: true, partialFilterExpression: { googleId: { $type: "string" } } },
    ]),
    db.collection("sessions").createIndexes([{ key: { userId: 1 } }, { key: { expiresAt: 1 }, expireAfterSeconds: 0 }]),
    db.collection("payments").createIndexes([{ key: { providerRef: 1 }, unique: true }, { key: { userId: 1 } }]),
    db.collection("jobs").createIndexes([{ key: { userId: 1, updatedAt: -1 } }, { key: { status: 1, followUpOn: 1 } }]),
    db.collection("documents").createIndexes([{ key: { jobId: 1, kind: 1 }, unique: true }, { key: { userId: 1 } }]),
    db.collection("interviews").createIndex({ userId: 1 }),
    db.collection("usage").createIndex({ userId: 1 }),
    db.collection("subscriptions").createIndexes([
      // One row per Freemius license: this is what stops a redelivered or concurrent event from creating a second subscription.
      { key: { freemiusLicenseId: 1 }, unique: true, partialFilterExpression: { freemiusLicenseId: { $type: "string" } } },
      { key: { freemiusSubscriptionId: 1 }, partialFilterExpression: { freemiusSubscriptionId: { $type: "string" } } },
      // At most one checkout in progress per account, so two quick clicks can't open two.
      { key: { userId: 1 }, unique: true, name: "one_pending_checkout_per_user", partialFilterExpression: { status: "pending", userId: { $type: "string" } } },
      { key: { userId: 1, status: 1 } },
      { key: { buyerEmail: 1 } },
    ]),
    db.collection("webhook_events").createIndexes([{ key: { status: 1, receivedAt: -1 } }, { key: { licenseId: 1 } }]),
    db.collection("rate_limits").createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 }),
    db.collection("cv_templates").createIndex({ userId: 1, updatedAt: -1 }),
    db.collection("cv_imports").createIndexes([{ key: { userId: 1 } }, { key: { expiresAt: 1 }, expireAfterSeconds: 0 }]),
    db.collection("career_plans").createIndex({ userId: 1 }),
    db.collection("mock_sessions").createIndexes([{ key: { userId: 1, jobId: 1, createdAt: -1 } }, { key: { userId: 1, jobId: 1 }, unique: true, partialFilterExpression: { status: "active" }, name: "one_active_mock_per_job" }]),
    db.collection("discovered_jobs").createIndexes([
      { key: { sourceType: 1, sourceKey: 1, externalId: 1 }, unique: true },
      { key: { closedAt: 1, lastSeenAt: -1 } },
    ]),
    db.collection("job_recommendations").createIndexes([
      { key: { userId: 1, discoveredJobId: 1 }, unique: true },
      { key: { userId: 1, status: 1, createdAt: -1 } },
      // Closing a posting closes its recommendations across every user.
      { key: { discoveredJobId: 1, status: 1 } },
    ]),
    db.collection("push_subscriptions").createIndexes([
      { key: { endpointHash: 1 }, unique: true },
      { key: { userId: 1, updatedAt: -1 } },
    ]),
    db.collection("notification_deliveries").createIndexes([
      { key: { state: 1, frequency: 1, nextAttemptAt: 1 } },
      { key: { userId: 1, createdAt: -1 } },
      { key: { recommendationId: 1, state: 1 } },
    ]),
    db.collection("discovery_runs").createIndex({ startedAt: -1 }),
    db.collection("job_sources").createIndexes([{ key: { type: 1, key: 1 }, unique: true }, { key: { enabled: 1, nextAttemptAt: 1 } }]),
  ]);
}
