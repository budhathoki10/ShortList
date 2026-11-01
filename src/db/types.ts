import type { InterviewQuestion, JobPost, Match, Profile, TailoredCv } from "@/lib/model/types";
import type { TemplateSpec } from "@/lib/templates/spec";
import type { CvStyle } from "@/lib/templates/style";

/**
 * Domain rows as the app sees them. MongoDB stores each one with the id under `_id`
 * (a UUID string, or a natural key where noted); see `fromDoc` in ./mongo.ts.
 */

export type User = {
  id: string;
  email: string;
  emailVerifiedAt: Date | null;
  passwordHash: string;
  name: string;
  createdAt: Date;
  /**
   * The account-wide switch for non-essential notifications (job-alert email, Web Push, follow-up reminder email).
   * Missing or false means on. Security email (verification, password reset) ignores it.
   */
  notificationsOff?: boolean;
  /**
   * When paid access from a Freemius subscription ends. Derived on every request from the subscriptions
   * collection (never stored on the user, never sent by the browser); see src/lib/billing/access.ts.
   */
  subscriptionAccessUntil?: Date | null;
};

export type Job = {
  id: string;
  userId: string;
  url: string | null;
  postText: string;
  post: JobPost;
  match: Match | null;
  /** saved | applied | interview | offer | rejected */
  status: string;
  /** Calendar days as YYYY-MM-DD, so they compare as plain strings. */
  appliedOn: string | null;
  followUpOn: string | null;
  notes: string | null;
  /** Which template this job's CV uses, and any fit-to-page tightening. Null or missing means the person's default. */
  cvStyle?: CvStyle | null;
  createdAt: Date;
  updatedAt: Date;
};

/** Documents written for one job. One tailored CV and one cover letter per job; edits replace them. */
export type Document = {
  id: string;
  userId: string;
  jobId: string;
  /** cv | cover_letter */
  kind: string;
  cv: TailoredCv | null;
  text: string | null;
  generationMethod?: "ai" | "basic";
  sourceNeedsReview?: boolean;
  createdAt: Date;
  updatedAt: Date;
};

export type Payment = {
  id: string;
  userId: string;
  provider: "freemius";
  /** The provider's own payment id (Freemius: `freemius:payment:<id>`); unique so redelivery is idempotent. */
  providerRef: string;
  status: string;
  amountMinor: number;
  currency: string;
  /** How many days of access this payment buys (30 or 90). */
  createdAt: Date;
  /** Freemius payments: which subscription, and whether this was the first charge or a renewal. */
  subscriptionId?: string | null;
  kind?: "initial" | "renewal" | null;
};

/** Stored shape: the domain row with `id` moved to `_id`. */
export type Stored<T extends { id: string }> = Omit<T, "id"> & { _id: string };

/** Where a subscription stands in this app. "suspended" and "past_due" are this app's own states (see access.ts), not Freemius states. */
export type SubscriptionStatus = "pending" | "active" | "past_due" | "cancelled" | "expired" | "suspended";
export type BillingInterval = "monthly" | "yearly";

/**
 * One Freemius license/subscription, as this app sees it. A row starts as "pending" when someone opens
 * checkout (no license yet, so no paid access), and becomes real only when verified Freemius data arrives.
 */
export type Subscription = {
  id: string;
  /** Null until the purchase can be tied to an account (for example a webhook that beat the buyer's sign-up). */
  userId: string | null;
  /** Lowercased email on the Freemius purchase; also what checkout is locked to, so it ties a purchase to an account. */
  buyerEmail: string | null;
  status: SubscriptionStatus;
  interval: BillingInterval | null;
  freemiusLicenseId: string | null;
  freemiusSubscriptionId: string | null;
  freemiusUserId: string | null;
  freemiusProductId: string | null;
  freemiusPlanId: string | null;
  freemiusPricingId: string | null;
  environment: "sandbox" | "production";
  currency: string | null;
  /** The recurring amount per cycle in minor units (cents), as reported by Freemius. */
  amountMinor: number | null;
  startedAt: Date | null;
  currentPeriodStart: Date | null;
  /** The end of what has been paid for (the license expiration). Access never outlasts this except for the failed-renewal grace period. */
  paidThrough: Date | null;
  nextPaymentAt: Date | null;
  failedPayments: number;
  /** Provider-side suspension: the last renewal attempt failed, or the seller cancelled the license. */
  suspended: boolean;
  /** We asked Freemius to cancel (not yet confirmed). */
  cancelRequestedAt: Date | null;
  /** Freemius confirmed the cancellation. Renewals stop; access still runs to paidThrough. */
  cancelledAt: Date | null;
  /** The newest `updated` stamp already applied from the license / subscription, so a late, older event can't overwrite newer data. */
  licenseUpdatedAt: Date | null;
  subscriptionUpdatedAt: Date | null;
  /** Bumped on every write; updates compare it, so concurrent writers never silently overwrite each other. */
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type WebhookEventStatus = "processing" | "processed" | "ignored" | "failed";

/** One row per webhook event ever received. The unique `_id` is what makes redelivery harmless. */
export type WebhookEventRecord = {
  /** `freemius:<event id>` */
  _id: string;
  provider: "freemius";
  eventId: string;
  type: string;
  status: WebhookEventStatus;
  attempts: number;
  /** A processing claim lapses at this time, so a crashed worker can't block an event forever. */
  lockedUntil: Date | null;
  licenseId: string | null;
  /** Why it was ignored, or a short non-sensitive reason it failed. Never a payload or a secret. */
  note: string | null;
  eventCreatedAt: Date | null;
  receivedAt: Date;
  processedAt: Date | null;
};

export type UserDoc = Stored<User>;
export type JobDoc = Stored<Job>;
export type DocumentDoc = Stored<Document>;
export type PaymentDoc = Stored<Payment>;
export type SubscriptionDoc = Stored<Subscription>;

/** `_id` is the SHA-256 of the cookie token; the raw token never touches the database. */
export type SessionDoc = { _id: string; userId: string; expiresAt: Date };

/** One-time tokens sent by email (password reset, email verification). `_id` is the token's SHA-256. */
export type AuthTokenDoc = {
  _id: string;
  userId: string;
  purpose: string;
  expiresAt: Date;
  usedAt: Date | null;
  createdAt: Date;
};

/** The user's CV as structured data. `_id` is the user id. Every tailored version is built from this and nothing else. */
export type OriginalCvFile = { name: string; type: string; bytes: Uint8Array; sha256: string; profileHash: string };
export type CvImportDoc = { _id: string; userId: string; profile: Profile; sourceText: string; method: "ai" | "basic"; original: OriginalCvFile | null; expiresAt: Date };
export type ProfileDoc = { _id: string; data: Profile; updatedAt: Date; /** A built-in id ("sl-001") or one of their own cv_templates ids. Missing means the default. */ defaultTemplateId?: string | null; readerVersion?: number; sourceText?: string; previousData?: Profile; original?: OriginalCvFile };

/** Practice questions for one job. `_id` is the job id. */
export type InterviewDoc = { _id: string; userId: string; questions: InterviewQuestion[]; updatedAt: Date; sourceNeedsReview?: boolean; questionVersion?: number; previousQuestions?: InterviewQuestion[] };

/** AI actions per user per calendar month (UTC), for plan limits. `_id` is `userId:month:kind`. */
/** `month` is "2026-10" for monthly counts, or "trial" for the free trial's one-time counts. The trial's job claim row also carries `jobId`. */
export type UsageDoc = { _id: string; userId: string; month: string; kind: string; count: number; jobId?: string };

/** Fixed-window counters for brute-force protection. `_id` is `key:window`. */
export type RateLimitDoc = { _id: string; count: number; expiresAt: Date };

/** A template someone made themselves. Private to its owner. `spec` is validated on the way in and again on the way out. */
export type CvTemplateDoc = { _id: string; userId: string; name: string; basedOn: string | null; spec: TemplateSpec; createdAt: Date; updatedAt: Date };

/** A profile photo, re-encoded to WebP without metadata. `_id` is the user's id, so there is at most one. Served only to its owner. */
export type PhotoDoc = { _id: string; image: Uint8Array; updatedAt: Date };

export type AlertFrequency = "immediate" | "daily" | "off";
export type RecommendationState = "ready" | "stretch" | "verify" | "blocked";
export type RecommendationStatus = "active" | "dismissed" | "saved" | "closed";

/** Search facts the CV cannot answer safely. `_id` is the user id. */
export type CareerPassportDoc = {
  _id: string;
  targetRoles: string[];
  excludedRoles: string[];
  locations: string[];
  workCountries: string[];
  remoteModes: Array<"remote" | "hybrid" | "onsite">;
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
  version: number;
  createdAt: Date;
  updatedAt: Date;
};

export type EligibilityFinding = {
  code: "sponsorship" | "citizenship" | "location" | "experience" | "degree" | "clearance" | "graduation";
  severity: "blocker" | "verify";
  message: string;
  evidence: string;
};

/** Company careers boards (one employer each) and public remote-job feeds (many employers, read in one call). */
export type JobSourceType =
  | "greenhouse"
  | "lever"
  | "ashby"
  | "workable"
  | "smartrecruiters"
  | "recruitee"
  | "remotive"
  | "jobicy"
  | "himalayas"
  | "remoteok"
  | "arbeitnow";

export type DiscoveredJobDoc = {
  _id: string;
  sourceType: JobSourceType;
  sourceKey: string;
  externalId: string;
  canonicalUrl: string;
  company: string;
  title: string;
  location: string;
  text: string;
  post: JobPost;
  contentHash: string;
  sourceUpdatedAt: Date | null;
  /** When the source says the posting expires (feeds that give it). Used to close postings a partial feed no longer lists. */
  expiresAt?: Date | null;
  firstSeenAt: Date;
  lastSeenAt: Date;
  closedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type JobSourceDoc = {
  _id: string;
  type: JobSourceType;
  key: string;
  company: string;
  enabled: boolean;
  failureCount: number;
  lastRunAt: Date | null;
  lastSuccessAt: Date | null;
  nextAttemptAt: Date | null;
  lastFailureReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type JobRecommendationDoc = {
  _id: string;
  userId: string;
  discoveredJobId: string;
  state: RecommendationState;
  status: RecommendationStatus;
  evidenceScore: number;
  preferenceScore: number;
  match: Match;
  eligibility: EligibilityFinding[];
  reasons: string[];
  ruleVersion: number;
  profileUpdatedAt: Date;
  passportVersion: number;
  jobContentHash: string;
  notificationVersion: number;
  trackerJobId: string | null;
  dismissalReason: string | null;
  createdAt: Date;
  updatedAt: Date;
};

export type PushSubscriptionDoc = {
  _id: string;
  userId: string;
  endpointHash: string;
  endpoint: string;
  p256dh: string;
  auth: string;
  deviceLabel: string;
  createdAt: Date;
  updatedAt: Date;
  lastSuccessAt: Date | null;
};

export type NotificationDeliveryDoc = {
  /** `recommendationId:channel:notificationVersion`. */
  _id: string;
  userId: string;
  recommendationId: string;
  channel: "email" | "push";
  frequency: Exclude<AlertFrequency, "off">;
  state: "pending" | "sending" | "sent" | "failed";
  attempts: number;
  nextAttemptAt: Date;
  lockedUntil: Date | null;
  providerMessageId: string | null;
  failureReason: string | null;
  createdAt: Date;
  sentAt: Date | null;
};

export type DiscoveryRunDoc = {
  _id: string;
  source: string;
  status: "running" | "complete" | "failed";
  found: number;
  changed: number;
  recommendations: number;
  failureReason: string | null;
  startedAt: Date;
  completedAt: Date | null;
};
