import "server-only";
import { createHash } from "node:crypto";
import webpush from "web-push";
import { collections } from "@/db/mongo";
import type { CareerPassportDoc, NotificationDeliveryDoc } from "@/db/types";
import { noticeMessage, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/util";
import { NOTIFICATIONS_OFF_REASON, notificationsOn } from "@/lib/services/notification-settings";
import { decryptPushSecret } from "./push-crypto";

function webPushConfigured() {
  return !!(process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY && process.env.VAPID_SUBJECT);
}

function configureWebPush() {
  if (!webPushConfigured()) throw new Error("Web Push is not configured");
  webpush.setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
}

export async function enqueueRecommendationNotifications(passport: CareerPassportDoc, recommendationId: string, notificationVersion: number) {
  const c = await collections();
  // The account-wide switch in Settings is the only control: off sends nothing, on sends the email (to a confirmed
  // address) and the push alert (to saved devices).
  const owner = await c.users.findOne({ _id: passport._id }, { projection: { notificationsOff: 1, emailVerifiedAt: 1 } });
  if (!owner || !notificationsOn(owner)) return;
  const now = new Date();
  const channels = (["email", "push"] as const).map((channel) => ({ channel, frequency: "immediate" as const }));

  for (const item of channels) {
    if (item.channel === "email" && !owner.emailVerifiedAt) continue;
    if (item.channel === "push" && (await c.pushSubscriptions.countDocuments({ userId: passport._id }, { limit: 1 })) === 0) continue;
    const delivery: NotificationDeliveryDoc = {
      _id: `${recommendationId}:${item.channel}:${notificationVersion}`,
      userId: passport._id,
      recommendationId,
      channel: item.channel,
      frequency: item.frequency,
      state: "pending",
      attempts: 0,
      nextAttemptAt: now,
      lockedUntil: null,
      providerMessageId: null,
      failureReason: null,
      createdAt: now,
      sentAt: null,
    };
    await c.notificationDeliveries.updateOne({ _id: delivery._id }, { $setOnInsert: delivery }, { upsert: true });
  }
}

function inQuietHours(passport: CareerPassportDoc, date = new Date()) {
  try {
    const hour = new Intl.DateTimeFormat("en-GB", { timeZone: passport.timezone, hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).format(date);
    const current = Number(hour.replace(":", ""));
    const start = Number(passport.quietStart.replace(":", ""));
    const end = Number(passport.quietEnd.replace(":", ""));
    if (![current, start, end].every(Number.isFinite) || start === end) return false;
    return start < end ? current >= start && current < end : current >= start || current < end;
  } catch {
    return false;
  }
}

function stateLabel(state: string) {
  return state === "ready" ? "Ready to apply" : state === "stretch" ? "Strong stretch" : state === "verify" ? "Verify first" : "Blocked";
}

async function recommendationContext(delivery: NotificationDeliveryDoc) {
  const c = await collections();
  const [recommendation, user, passport] = await Promise.all([
    c.jobRecommendations.findOne({ _id: delivery.recommendationId, userId: delivery.userId }),
    c.users.findOne({ _id: delivery.userId }, { projection: { email: 1, name: 1, emailVerifiedAt: 1, notificationsOff: 1 } }),
    c.careerPassports.findOne({ _id: delivery.userId }),
  ]);
  if (!recommendation || !user || !passport || recommendation.status === "dismissed" || recommendation.status === "closed") return null;
  const job = await c.discoveredJobs.findOne({ _id: recommendation.discoveredJobId, closedAt: null });
  return job ? { recommendation, user, passport, job } : null;
}

async function sendPushToUser(userId: string, payload: { title: string; body: string; url: string; tag: string; version: number }) {
  configureWebPush();
  const c = await collections();
  const subscriptions = await c.pushSubscriptions.find({ userId }).toArray();
  if (!subscriptions.length) throw new Error("No active push subscription");
  let successes = 0;
  for (const subscription of subscriptions) {
    try {
      await webpush.sendNotification(
        { endpoint: subscription.endpoint, keys: { p256dh: decryptPushSecret(subscription.p256dh), auth: decryptPushSecret(subscription.auth) } },
        JSON.stringify(payload),
        { TTL: 3_600, urgency: "normal" },
      );
      successes += 1;
      await c.pushSubscriptions.updateOne({ _id: subscription._id, userId }, { $set: { lastSuccessAt: new Date(), updatedAt: new Date() } });
    } catch (error) {
      const statusCode = typeof error === "object" && error !== null && "statusCode" in error ? Number((error as { statusCode: unknown }).statusCode) : 0;
      if (statusCode === 404 || statusCode === 410) await c.pushSubscriptions.deleteOne({ _id: subscription._id, userId });
      else if (subscriptions.length === 1) throw error;
    }
  }
  if (!successes) throw new Error("No push device accepted the notification");
  return successes;
}

const INACTIVE = "Recommendation no longer active";
const UNCONFIRMED = "Email address not confirmed";

async function sendOne(delivery: NotificationDeliveryDoc): Promise<{ providerMessageId: string | null; skipped: string | null }> {
  const context = await recommendationContext(delivery);
  if (!context) return { providerMessageId: null, skipped: INACTIVE };
  if (!notificationsOn(context.user)) return { providerMessageId: null, skipped: NOTIFICATIONS_OFF_REASON };
  // Job-alert email only goes to an address its owner has confirmed; otherwise anyone could sign up with someone else's.
  if (delivery.channel === "email" && !context.user.emailVerifiedAt) return { providerMessageId: null, skipped: UNCONFIRMED };
  const { job, recommendation, user } = context;
  const url = appUrl(`/app/radar/${recommendation._id}`);
  const label = stateLabel(recommendation.state);
  const warning = recommendation.eligibility[0]?.message;
  if (delivery.channel === "email") {
    const message = noticeMessage(
      user.email,
      `${label}: ${job.title} at ${job.company}`,
      `${job.title} at ${job.company}`,
      [`${label} · ${job.location || "Location not stated"}`, recommendation.reasons[0], warning ?? "No eligibility warning was found in the posting."],
      { label: "Review this match", url },
    );
    const result = await sendEmail({ ...message, idempotencyKey: `discovery:${delivery._id}`, headers: { "List-Unsubscribe": `<${appUrl("/app/radar")}>` } });
    return { providerMessageId: result.id, skipped: null };
  }
  await sendPushToUser(user._id, { title: `${label}: ${job.title}`, body: `${job.company}${job.location ? ` · ${job.location}` : ""}`, url: `/app/radar/${recommendation._id}`, tag: `job-match-${recommendation._id}`, version: recommendation.notificationVersion });
  return { providerMessageId: null, skipped: null };
}

async function defer(delivery: NotificationDeliveryDoc, reason: string, minutes: number, frequency?: "daily") {
  await (await collections()).notificationDeliveries.updateOne(
    { _id: delivery._id, state: "sending" },
    { $set: { state: "pending", failureReason: reason, nextAttemptAt: new Date(Date.now() + minutes * 60_000), lockedUntil: null, ...(frequency ? { frequency } : {}) } },
  );
}

export async function sendImmediateDiscoveryNotifications() {
  const c = await collections();
  await c.notificationDeliveries.updateMany(
    { state: "sending", lockedUntil: { $lt: new Date() } },
    { $set: { state: "pending", failureReason: "Recovered an expired delivery claim", lockedUntil: null, nextAttemptAt: new Date() } },
  );
  const due = await c.notificationDeliveries.find({ state: "pending", frequency: "immediate", nextAttemptAt: { $lte: new Date() } }).sort({ createdAt: 1 }).limit(200).toArray();
  let sent = 0;
  for (const delivery of due) {
    const claimed = await c.notificationDeliveries.updateOne(
      { _id: delivery._id, state: "pending", nextAttemptAt: { $lte: new Date() } },
      { $set: { state: "sending", lockedUntil: new Date(Date.now() + 2 * 60_000) }, $inc: { attempts: 1 } },
    );
    if (!claimed.modifiedCount) continue;
    const passport = await c.careerPassports.findOne({ _id: delivery.userId });
    if (passport && inQuietHours(passport)) {
      await defer(delivery, "Quiet hours", 15);
      continue;
    }
    if (delivery.channel === "email") {
      const recent = await c.notificationDeliveries.countDocuments({ userId: delivery.userId, channel: "email", state: "sent", sentAt: { $gte: new Date(Date.now() - 60 * 60_000) } });
      if (recent >= 3) {
        await defer(delivery, "Hourly email limit; moved to digest", 15, "daily");
        continue;
      }
    }
    try {
      const result = await sendOne(delivery);
      await c.notificationDeliveries.updateOne({ _id: delivery._id, state: "sending" }, { $set: { state: "sent", sentAt: new Date(), providerMessageId: result.providerMessageId, failureReason: result.skipped, lockedUntil: null } });
      sent += result.skipped ? 0 : 1;
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 200) : "Delivery failed";
      const terminal = delivery.attempts + 1 >= 5;
      await c.notificationDeliveries.updateOne(
        { _id: delivery._id, state: "sending" },
        { $set: { state: terminal ? "failed" : "pending", failureReason: reason, lockedUntil: null, nextAttemptAt: new Date(Date.now() + Math.min(60, 2 ** (delivery.attempts + 1)) * 60_000) } },
      );
    }
  }
  return sent;
}

export async function sendDiscoveryDigests() {
  const c = await collections();
  const pending = await c.notificationDeliveries.find({ state: "pending", frequency: "daily", nextAttemptAt: { $lte: new Date() } }).sort({ createdAt: 1 }).limit(1_000).toArray();
  const groups = new Map<string, NotificationDeliveryDoc[]>();
  for (const row of pending) groups.set(`${row.userId}:${row.channel}`, [...(groups.get(`${row.userId}:${row.channel}`) ?? []), row]);
  let sent = 0;
  for (const rows of groups.values()) {
    const first = rows[0];
    const passport = await c.careerPassports.findOne({ _id: first.userId });
    if (passport && inQuietHours(passport)) {
      await c.notificationDeliveries.updateMany({ _id: { $in: rows.map((row) => row._id) }, state: "pending" }, { $set: { nextAttemptAt: new Date(Date.now() + 15 * 60_000), failureReason: "Quiet hours" } });
      continue;
    }
    const ids = rows.map((row) => row._id);
    const claimed = await c.notificationDeliveries.updateMany({ _id: { $in: ids }, state: "pending" }, { $set: { state: "sending", lockedUntil: new Date(Date.now() + 2 * 60_000) }, $inc: { attempts: 1 } });
    if (!claimed.modifiedCount) continue;
    const contexts = (await Promise.all(rows.map(recommendationContext)))
      .filter((value): value is NonNullable<typeof value> => !!value && notificationsOn(value.user) && (first.channel !== "email" || !!value.user.emailVerifiedAt))
      .slice(0, 20);
    try {
      if (contexts.length) {
        if (first.channel === "email") {
          const user = contexts[0].user;
          const lines = contexts.map(({ job, recommendation }) => `${stateLabel(recommendation.state)} · ${job.title} at ${job.company}${job.location ? ` · ${job.location}` : ""}`);
          const digestKey = createHash("sha256").update(ids.slice().sort().join("\n")).digest("hex");
          const result = await sendEmail({ ...noticeMessage(user.email, `${contexts.length} new Shortlist Job Radar matches`, "Your new job matches", lines, { label: "Open Job Radar", url: appUrl("/app/radar") }), idempotencyKey: `discovery-digest:${digestKey}` });
          await c.notificationDeliveries.updateMany({ _id: { $in: ids }, state: "sending" }, { $set: { providerMessageId: result.id } });
        } else {
          await sendPushToUser(first.userId, { title: `${contexts.length} new job matches`, body: "Open Job Radar to review your latest shortlist.", url: "/app/radar", tag: "job-match-digest", version: Math.max(...contexts.map(({ recommendation }) => recommendation.notificationVersion)) });
        }
        sent += 1;
      }
      await c.notificationDeliveries.updateMany({ _id: { $in: ids }, state: "sending" }, { $set: { state: "sent", sentAt: new Date(), lockedUntil: null, failureReason: contexts.length ? null : "Recommendations no longer active" } });
    } catch (error) {
      const reason = error instanceof Error ? error.message.slice(0, 200) : "Digest delivery failed";
      await c.notificationDeliveries.updateMany({ _id: { $in: ids }, state: "sending", attempts: { $gte: 5 } }, { $set: { state: "failed", lockedUntil: null, failureReason: reason } });
      await c.notificationDeliveries.updateMany({ _id: { $in: ids }, state: "sending", attempts: { $lt: 5 } }, { $set: { state: "pending", lockedUntil: null, failureReason: reason, nextAttemptAt: new Date(Date.now() + 60 * 60_000) } });
    }
  }
  return { groups: groups.size, sent };
}

/** Thrown when the account-wide switch is off, so callers can explain it instead of reporting a device failure. */
export class NotificationsOffError extends Error {
  constructor() {
    super(NOTIFICATIONS_OFF_REASON);
    this.name = "NotificationsOffError";
  }
}

export async function sendTestPush(userId: string) {
  const user = await (await collections()).users.findOne({ _id: String(userId) }, { projection: { notificationsOff: 1 } });
  if (!user || !notificationsOn(user)) throw new NotificationsOffError();
  await sendPushToUser(userId, { title: "Shortlist Job Radar alerts are on", body: "Your next qualified job match can reach this device.", url: "/app/radar", tag: "shortlist-test", version: 1 });
}

export const pushConfigured = webPushConfigured;
