import "server-only";
import { createHash } from "node:crypto";
import { collections, isDuplicateKey } from "@/db/mongo";
import type { User } from "@/db/types";
import { ownedJob } from "@/lib/services/jobs";
import { isPaid, isTrialKind, limitsFor, monthKey, TRIAL_KINDS, type TrialKind, type UsageKind } from "@/lib/plans";

type Allowed = Pick<User, "id" | "subscriptionAccessUntil" | "email" | "emailVerifiedAt">;

/** Free accounts spend trial features from a one-time "trial" bucket; everything else is counted per month. */
const TRIAL = "trial";
const bucketFor = (user: Allowed, kind: UsageKind, now: Date) => (!isPaid(user, now) && isTrialKind(kind) ? TRIAL : monthKey(now));
const usageId = (userId: string, bucket: string, kind: UsageKind) => `${userId}:${bucket}:${kind}`;
const trialClaimId = (userId: string) => `${userId}:${TRIAL}:job`;

/**
 * One row per email address that has ever started a free trial, so deleting an account and signing up again
 * doesn't hand out a second one. It holds a one-way hash of the normalised address, never the address, and its
 * `userId` is this constant rather than the account's, so account deletion (which removes the account's rows) leaves it.
 */
const LEDGER_OWNER = "trial-ledger";
export function trialEmailKey(email: string): string {
  const [rawLocal = "", rawDomain = ""] = email.trim().toLowerCase().split("@");
  const domain = rawDomain === "googlemail.com" ? "gmail.com" : rawDomain;
  let local = rawLocal.split("+")[0];
  if (domain === "gmail.com") local = local.replace(/\./g, "");
  return `trial-email:${createHash("sha256").update(`shortlist-trial:v1\0${local}@${domain}`).digest("hex")}`;
}

/**
 * Why a use was refused: the limit is reached; or, on the free plan, the trial already belongs to a different job,
 * the email isn't confirmed yet, or this email address already used its trial on an earlier account.
 */
export type Denial = "limit" | "other-job" | "unverified" | "trial-used";
export type Spend = { ok: true } | { ok: false; reason: Denial };

async function upsertOnce(_id: string, fields: { userId: string; month: string; kind: string; count: number; jobId: string }) {
  const { usage } = await collections();
  try {
    await usage.updateOne({ _id }, { $setOnInsert: fields }, { upsert: true });
  } catch (err) {
    if (!isDuplicateKey(err)) throw err;
  }
  return usage.findOne({ _id });
}

/**
 * Tie the free trial to `jobId` if it isn't tied to a job yet. The email ledger is claimed first, so a second
 * account with the same address gets nothing. Both are single upserts, so concurrent first uses can't both win.
 */
async function claimTrialJob(user: Allowed, jobId: string): Promise<"ok" | "other-job" | "trial-used"> {
  const existing = await (await collections()).usage.findOne({ _id: trialClaimId(user.id) });
  if (existing) return existing.jobId === jobId ? "ok" : "other-job";
  // The ledger row's `jobId` holds the account that claimed the trial for this address.
  const ledger = await upsertOnce(trialEmailKey(user.email), { userId: LEDGER_OWNER, month: TRIAL, kind: "email", count: 0, jobId: user.id });
  if (ledger?.jobId !== user.id) return "trial-used";
  const claim = await upsertOnce(trialClaimId(user.id), { userId: user.id, month: TRIAL, kind: "job", count: 0, jobId });
  return claim?.jobId === jobId ? "ok" : "other-job";
}

/** Count one use against a limit. A single conditional upsert, so two requests at once can't both squeeze past the last use. */
async function count(_id: string, limit: number, fields: { userId: string; month: string; kind: UsageKind }): Promise<boolean> {
  const { usage } = await collections();
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      const doc = await usage.findOneAndUpdate({ _id, count: { $lt: limit } }, { $inc: { count: 1 }, $setOnInsert: fields }, { upsert: true, returnDocument: "after" });
      return !!doc && doc.count <= limit;
    } catch (err) {
      if (!isDuplicateKey(err)) throw err;
      // Either the row is already at the limit, or two first uses raced to create it. Look and decide.
      const current = await usage.findOne({ _id });
      if (current && current.count >= limit) return false;
    }
  }
  return false;
}

/**
 * Spend one use of `kind`. On the free plan the trial features also need the job they're for: the first
 * one claims the trial for that job, and every other job is refused until the account upgrades.
 */
export async function spendAllowance(user: Allowed, kind: UsageKind, opts: { jobId?: string; now?: Date } = {}): Promise<Spend> {
  const now = opts.now ?? new Date();
  const bucket = bucketFor(user, kind, now);
  if (bucket === TRIAL) {
    if (!opts.jobId) return { ok: false, reason: "limit" };
    if (!user.emailVerifiedAt) return { ok: false, reason: "unverified" };
    const claim = await claimTrialJob(user, opts.jobId);
    if (claim !== "ok") return { ok: false, reason: claim };
  }
  const ok = await count(usageId(user.id, bucket, kind), limitsFor(user)[kind], { userId: user.id, month: bucket, kind });
  return ok ? { ok: true } : { ok: false, reason: "limit" };
}

/** Give back a use when the work it paid for failed. */
export async function refundAllowance(user: Allowed, kind: UsageKind, now = new Date()) {
  const { usage } = await collections();
  await usage.updateOne({ _id: usageId(user.id, bucketFor(user, kind, now), kind), count: { $gt: 0 } }, { $inc: { count: -1 } });
}

export async function usageThisMonth(userId: string, now = new Date()): Promise<Record<UsageKind, number>> {
  const { usage } = await collections();
  const rows = await usage.find({ userId: String(userId), month: monthKey(now) }).toArray();
  const out: Record<UsageKind, number> = { tailor: 0, cover: 0, interview: 0, mock: 0, import: 0 };
  for (const r of rows) if (r.kind in out) out[r.kind as UsageKind] = r.count;
  return out;
}

/** The free trial: which job it's on (null until the first AI action) and how much of it is used. */
export async function trialUsage(userId: string): Promise<{ jobId: string | null; used: Record<TrialKind, number> }> {
  const { usage } = await collections();
  const rows = await usage.find({ userId: String(userId), month: TRIAL }).toArray();
  const used = Object.fromEntries(TRIAL_KINDS.map((k) => [k, 0])) as Record<TrialKind, number>;
  let jobId: string | null = null;
  for (const r of rows) {
    if (r._id === trialClaimId(userId)) jobId = r.jobId ?? null;
    else if (isTrialKind(r.kind as UsageKind)) used[r.kind as TrialKind] = r.count;
  }
  return { jobId, used };
}

/** What one account can still do, in the shape the screens show it. */
export type PlanUsage =
  | { plan: "paid"; used: Record<TrialKind, number>; limits: Record<TrialKind, number> }
  | {
      plan: "free";
      trialJob: { id: string; title: string; company: string } | null;
      /** True once the trial is spent or in use: on a job, on a job since deleted, or by an earlier account with this email. */
      trialClaimed: boolean;
      verified: boolean;
      used: Record<TrialKind, number>;
      limits: Record<TrialKind, number>;
    };

export async function planUsage(user: Allowed, now = new Date()): Promise<PlanUsage> {
  const limits = limitsFor(user);
  const pick = (r: Record<TrialKind, number>) => Object.fromEntries(TRIAL_KINDS.map((k) => [k, r[k]])) as Record<TrialKind, number>;
  if (isPaid(user, now)) return { plan: "paid", used: pick(await usageThisMonth(user.id, now)), limits: pick(limits) };
  const trial = await trialUsage(user.id);
  const job = trial.jobId ? await ownedJob(user.id, trial.jobId) : null;
  // An earlier account with this email already had the trial when the ledger names a different account.
  const ledger = trial.jobId ? null : await (await collections()).usage.findOne({ _id: trialEmailKey(user.email) });
  return {
    plan: "free",
    // A claimed trial whose job was deleted is still spent: `trialClaimed` stays true with no job to show.
    trialJob: job ? { id: job.id, title: job.post.title || "Untitled role", company: job.post.company } : null,
    trialClaimed: !!trial.jobId || (!!ledger && ledger.jobId !== user.id),
    verified: !!user.emailVerifiedAt,
    used: trial.used,
    limits: pick(limits),
  };
}

/** What a free account can do on one particular job: start the trial here, keep using it, or nothing until it upgrades. */
export type TrialState = "paid" | "unverified" | "unclaimed" | "this-job" | "other-job";
export function trialStateFor(usage: PlanUsage, jobId: string): TrialState {
  if (usage.plan === "paid") return "paid";
  if (!usage.trialClaimed) return usage.verified ? "unclaimed" : "unverified";
  return usage.trialJob?.id === jobId ? "this-job" : "other-job";
}

const FEATURE: Record<UsageKind, string> = { tailor: "tailoring", cover: "cover letter", interview: "answer feedback", mock: "mock interview", import: "CV import" };

/**
 * What to tell someone who was refused, and whether to point them at the plans. Says what ran out and what
 * still works, in the same words everywhere.
 */
export function denialMessage(user: Allowed, kind: UsageKind, reason: Denial): { error: string; upgrade?: true; verify?: true } {
  if (kind === "import") return { error: "You’ve reached this month’s CV import limit. You can still edit your saved profile below." };
  if (isPaid(user)) return { error: `You’ve used this month’s ${FEATURE[kind]} allowance. Everything you’ve already made stays available.` };
  if (reason === "unverified") return { error: `Confirm your email to start your free trial. We sent a link to ${user.email}; you can send a new one from Settings.`, verify: true };
  if (reason === "trial-used") return { error: "This email address has already used its free trial. Upgrade to tailor CVs, write cover letters and practise interviews for every job.", upgrade: true };
  if (reason === "other-job") return { error: "Your free trial is already in use on another job. Upgrade to tailor CVs, write cover letters and practise interviews for every job.", upgrade: true };
  return { error: `You’ve used the free trial’s ${FEATURE[kind]} for this job. Upgrade to keep going; everything you’ve made stays available.`, upgrade: true };
}
