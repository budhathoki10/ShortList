import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { collections } from "@/db/mongo";
import type { DiscoveredJobDoc, JobRecommendationDoc } from "@/db/types";
import { enqueueRecommendationNotifications, NotificationsOffError, sendDiscoveryDigests, sendImmediateDiscoveryNotifications, sendTestPush } from "@/lib/discovery/notifications";
import { getNotificationsOn, NOTIFICATIONS_OFF_REASON, setNotificationsOn } from "@/lib/services/notification-settings";
import { sendFollowUpDigests } from "@/lib/services/reminders";
import { createJob, setStatus } from "@/lib/services/jobs";
import { addDays } from "@/lib/dates";
import { today } from "@/lib/plans";
import { runJobDiscovery } from "@/lib/discovery/runner";
import { dismissRecommendation, removePushDevice, saveCareerPassport, saveRecommendationToTracker, subscribePush } from "@/lib/services/discovery";
import { deleteUser } from "@/lib/services/account";
import { listJobs } from "@/lib/services/jobs";
import { saveProfile } from "@/lib/services/profile";
import { makeUser, resetDb } from "./helpers";

const OUTBOX = path.join(os.tmpdir(), `shortlist-discovery-outbox-${process.pid}.jsonl`);
const now = new Date("2026-11-01T00:00:00Z");
const pushSend = vi.hoisted(() => vi.fn());
vi.mock("web-push", () => ({ default: { setVapidDetails: vi.fn(), sendNotification: pushSend } }));

beforeEach(async () => {
  await resetDb();
  rmSync(OUTBOX, { force: true });
  process.env.EMAIL_DEV_OUTBOX = OUTBOX;
  process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY = "public-test-key";
  process.env.VAPID_PRIVATE_KEY = "private-test-key";
  process.env.VAPID_SUBJECT = "mailto:test@example.com";
  pushSend.mockReset().mockResolvedValue({});
});
afterEach(() => vi.unstubAllGlobals());

async function fixture() {
  const user = await makeUser({ email: "radar@example.com", emailVerifiedAt: new Date() });
  const passport = await saveCareerPassport(user.id, { targetRoles: ["Frontend developer"], excludedRoles: [], locations: ["Remote"], workCountries: ["Nepal"], remoteModes: ["remote"], needsSponsorship: false, graduationDate: null, minimumSalary: null, employmentTypes: ["Full-time"], excludedCompanies: [], discoveryEnabled: true, emailFrequency: "immediate", pushFrequency: "off", alertStates: ["ready"], quietStart: "00:00", quietEnd: "00:00", timezone: "UTC" });
  const job: DiscoveredJobDoc = { _id: crypto.randomUUID(), sourceType: "greenhouse", sourceKey: "acme", externalId: "42", canonicalUrl: "https://example.com/jobs/42", company: "Acme", title: "Frontend Developer", location: "Remote", text: "Build React products.", post: { title: "Frontend Developer", company: "Acme", location: "Remote", salary: "", summary: "Build products", requirements: [{ text: "React", kind: "must", keywords: ["React"] }], keywords: ["React"] }, contentHash: "content", sourceUpdatedAt: now, firstSeenAt: now, lastSeenAt: now, closedAt: null, createdAt: now, updatedAt: now };
  const recommendation: JobRecommendationDoc = { _id: crypto.randomUUID(), userId: user.id, discoveredJobId: job._id, state: "ready", status: "active", evidenceScore: 90, preferenceScore: 95, match: { score: 90, keywords: [{ keyword: "React", where: "shown", evidence: "Built React products" }], requirements: [{ text: "React", kind: "must", status: "shown", evidence: "Built React products" }] }, eligibility: [], reasons: ["Strong role-title fit", "90% of weighted CV evidence is present", "No must-have evidence gaps found"], ruleVersion: 1, profileUpdatedAt: now, passportVersion: passport.version, jobContentHash: job.contentHash, notificationVersion: 1, trackerJobId: null, dismissalReason: null, createdAt: now, updatedAt: now };
  const c = await collections();
  await c.discoveredJobs.insertOne(job);
  await c.jobRecommendations.insertOne(recommendation);
  return { user, passport, job, recommendation };
}

describe("Job Radar services", () => {
  it("discovers a source job, matches it once, stores it, and sends the immediate email", async () => {
    const user = await makeUser({ email: "agent@example.com", emailVerifiedAt: new Date() });
    await saveProfile(user.id, { name: "Asha", headline: "Frontend developer", email: user.email, phone: "", location: "Kathmandu", links: [], summary: "Frontend developer", experience: [{ id: "e", title: "Frontend developer", company: "Brightdesk", location: "Kathmandu", start: "2024", end: "Present", bullets: ["Built accessible React and TypeScript interfaces for customer support teams."] }], education: [], skills: ["React", "TypeScript"], projects: [], certifications: [], languages: ["English"] });
    await saveCareerPassport(user.id, { targetRoles: ["Frontend developer"], excludedRoles: [], locations: ["Remote"], workCountries: ["Nepal"], remoteModes: ["remote"], needsSponsorship: false, graduationDate: null, minimumSalary: null, employmentTypes: ["Full-time"], excludedCompanies: [], discoveryEnabled: true, emailFrequency: "immediate", pushFrequency: "off", alertStates: ["ready", "stretch", "verify"], quietStart: "00:00", quietEnd: "00:00", timezone: "UTC" });
    let feed = { jobs: [{ id: 91, title: "Frontend Developer", updated_at: "2026-11-01T00:00:00Z", absolute_url: "https://jobs.example/91", location: { name: "Remote" }, content: "&lt;h2&gt;Requirements&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;React and TypeScript experience building customer-facing products&lt;/li&gt;&lt;li&gt;Strong written communication with product teams&lt;/li&gt;&lt;/ul&gt;" }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(feed), { status: 200, headers: { "content-type": "application/json" } })));
    const oldSources = process.env.JOB_SOURCE_BOARDS;
    const oldKey = process.env.OPENROUTER_API_KEY;
    process.env.JOB_SOURCE_BOARDS = "greenhouse:acme=Acme";
    process.env.OPENROUTER_API_KEY = "";
    try {
      const first = await runJobDiscovery();
      expect(first).toMatchObject({ sources: 1, found: 1, changed: 1, recommendations: 1, delivered: 1, failures: [] });
      const c = await collections();
      expect(await c.discoveredJobs.countDocuments()).toBe(1);
      expect(await c.jobRecommendations.countDocuments({ userId: user.id })).toBe(1);
      expect(await c.jobSources.findOne({ type: "greenhouse", key: "acme" })).toMatchObject({ enabled: true, company: "Acme", failureCount: 0, lastSuccessAt: expect.any(Date) });
      expect(readFileSync(OUTBOX, "utf8")).toContain("Frontend Developer at Acme");
      expect(await runJobDiscovery()).toMatchObject({ found: 1, changed: 0, recommendations: 0, delivered: 0 });
      expect(await c.notificationDeliveries.countDocuments()).toBe(1);
      feed = { jobs: [] };
      expect(await runJobDiscovery()).toMatchObject({ found: 0, changed: 0, recommendations: 0, delivered: 0 });
      expect(await c.discoveredJobs.findOne()).toMatchObject({ closedAt: expect.any(Date) });
      expect(await c.jobRecommendations.findOne({ userId: user.id })).toMatchObject({ status: "closed" });
    } finally {
      if (oldSources === undefined) delete process.env.JOB_SOURCE_BOARDS;
      else process.env.JOB_SOURCE_BOARDS = oldSources;
      if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = oldKey;
    }
  });

  it("reads a remote feed for wanted roles only, and keeps a partial feed's older jobs open until they go stale", async () => {
    const user = await makeUser({ email: "feeds@example.com", emailVerifiedAt: new Date() });
    await saveProfile(user.id, { name: "Asha", headline: "Frontend developer", email: user.email, phone: "", location: "Kathmandu", links: [], summary: "Frontend developer", experience: [{ id: "e", title: "Frontend developer", company: "Brightdesk", location: "Kathmandu", start: "2024", end: "Present", bullets: ["Built accessible React and TypeScript interfaces for customer support teams."] }], education: [], skills: ["React", "TypeScript"], projects: [], certifications: [], languages: ["English"] });
    await saveCareerPassport(user.id, { targetRoles: ["Frontend developer"], excludedRoles: [], locations: ["Remote"], workCountries: ["Nepal"], remoteModes: ["remote"], needsSponsorship: false, graduationDate: null, minimumSalary: null, employmentTypes: ["Full-time"], excludedCompanies: [], discoveryEnabled: true, emailFrequency: "off", pushFrequency: "off", alertStates: ["ready"], quietStart: "00:00", quietEnd: "00:00", timezone: "UTC" });
    const body = "<p>Requirements</p><ul><li>React and TypeScript</li><li>Accessible interfaces for customers</li><li>Clear written English for a remote team</li></ul>";
    let feed: unknown = { jobs: [
      { id: 501, url: "https://jobicy.com/jobs/501", jobTitle: "Frontend Developer", companyName: "Acme", jobGeo: "Anywhere", jobType: ["Full-Time"], jobDescription: body, pubDate: "2026-10-31T10:00:00+00:00" },
      { id: 502, url: "https://jobicy.com/jobs/502", jobTitle: "Senior Accountant", companyName: "Ledger Co", jobGeo: "Anywhere", jobType: ["Full-Time"], jobDescription: body, pubDate: "2026-10-31T10:00:00+00:00" },
    ] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(feed), { status: 200, headers: { "content-type": "application/json" } })));
    const env = { boards: process.env.JOB_SOURCE_BOARDS, feeds: process.env.JOB_SOURCE_FEEDS, key: process.env.OPENROUTER_API_KEY };
    process.env.JOB_SOURCE_BOARDS = "";
    process.env.JOB_SOURCE_FEEDS = "jobicy";
    process.env.OPENROUTER_API_KEY = "";
    const c = await collections();
    // Feeds have a polite interval between fetches; the test moves time along instead of waiting an hour.
    const due = () => c.jobSources.updateOne({ _id: "jobicy:jobicy" }, { $set: { nextAttemptAt: null } });
    try {
      expect(await runJobDiscovery()).toMatchObject({ sources: 1, found: 2, changed: 1, recommendations: 1, failures: [] });
      // Nobody is looking for an accountant, so that posting was never stored or sent to the AI.
      expect(await c.discoveredJobs.find().toArray()).toMatchObject([{ sourceType: "jobicy", title: "Frontend Developer", company: "Acme", location: "Remote (Anywhere)" }]);
      expect((await c.jobSources.findOne({ _id: "jobicy:jobicy" }))?.nextAttemptAt?.valueOf()).toBeGreaterThan(Date.now());

      // The newest-100 feed no longer lists it: that alone doesn't mean it closed.
      feed = { jobs: [] };
      await due();
      await runJobDiscovery();
      expect(await c.discoveredJobs.findOne({ externalId: "501" })).toMatchObject({ closedAt: null });

      // Unseen for weeks: now it's treated as closed, and so is its recommendation.
      await c.discoveredJobs.updateOne({ externalId: "501" }, { $set: { lastSeenAt: new Date(Date.now() - 30 * 24 * 60 * 60_000) } });
      await due();
      await runJobDiscovery();
      expect(await c.discoveredJobs.findOne({ externalId: "501" })).toMatchObject({ closedAt: expect.any(Date) });
      expect(await c.jobRecommendations.findOne({ userId: user.id })).toMatchObject({ status: "closed" });
    } finally {
      for (const [name, value] of [["JOB_SOURCE_BOARDS", env.boards], ["JOB_SOURCE_FEEDS", env.feeds], ["OPENROUTER_API_KEY", env.key]] as const) {
        if (value === undefined) delete process.env[name];
        else process.env[name] = value;
      }
    }
  });

  it("versions Career Passport updates", async () => {
    const { user, passport } = await fixture();
    const updated = await saveCareerPassport(user.id, { ...passport, targetRoles: ["Full-stack developer"] });
    expect(updated.version).toBe(2);
    expect(updated.createdAt).toEqual(passport.createdAt);
  });

  it("backs off an unhealthy source instead of delaying every scheduled run", async () => {
    const oldSources = process.env.JOB_SOURCE_BOARDS;
    process.env.JOB_SOURCE_BOARDS = "greenhouse:unhealthy=Unhealthy Co";
    const fetchMock = vi.fn(async () => new Response("unavailable", { status: 503 }));
    vi.stubGlobal("fetch", fetchMock);
    try {
      expect(await runJobDiscovery()).toMatchObject({ attemptedSources: 1, skippedSources: 0, failures: [expect.stringContaining("HTTP 503")] });
      expect(await runJobDiscovery()).toMatchObject({ attemptedSources: 0, skippedSources: 1, failures: [] });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(await (await collections()).jobSources.findOne({ key: "unhealthy" })).toMatchObject({ failureCount: 1, nextAttemptAt: expect.any(Date) });
    } finally {
      if (oldSources === undefined) delete process.env.JOB_SOURCE_BOARDS;
      else process.env.JOB_SOURCE_BOARDS = oldSources;
    }
  });

  it("allows only one overlapping discovery run to fetch sources", async () => {
    const oldSources = process.env.JOB_SOURCE_BOARDS;
    process.env.JOB_SOURCE_BOARDS = "greenhouse:concurrent=Concurrent Co";
    let release!: () => void;
    const gate = new Promise<void>((resolve) => { release = resolve; });
    const fetchMock = vi.fn(async () => {
      await gate;
      return new Response(JSON.stringify({ jobs: [] }), { status: 200, headers: { "content-type": "application/json" } });
    });
    vi.stubGlobal("fetch", fetchMock);
    try {
      const first = runJobDiscovery();
      await vi.waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(1));
      expect(await runJobDiscovery()).toMatchObject({ skipped: "A discovery run is already active" });
      release();
      await expect(first).resolves.toMatchObject({ attemptedSources: 1, failures: [] });
      expect(fetchMock).toHaveBeenCalledTimes(1);
    } finally {
      release?.();
      if (oldSources === undefined) delete process.env.JOB_SOURCE_BOARDS;
      else process.env.JOB_SOURCE_BOARDS = oldSources;
    }
  });

  it("never alerts again about a dismissed match, even when the employer edits the posting", async () => {
    const user = await makeUser({ email: "dismissed@example.com", emailVerifiedAt: new Date() });
    await saveProfile(user.id, { name: "Asha", headline: "Frontend developer", email: user.email, phone: "", location: "Kathmandu", links: [], summary: "Frontend developer", experience: [{ id: "e", title: "Frontend developer", company: "Brightdesk", location: "Kathmandu", start: "2024", end: "Present", bullets: ["Built accessible React and TypeScript interfaces for customer support teams."] }], education: [], skills: ["React", "TypeScript"], projects: [], certifications: [], languages: ["English"] });
    await saveCareerPassport(user.id, { targetRoles: ["Frontend developer"], excludedRoles: [], locations: ["Remote"], workCountries: ["Nepal"], remoteModes: ["remote"], needsSponsorship: false, graduationDate: null, minimumSalary: null, employmentTypes: ["Full-time"], excludedCompanies: [], discoveryEnabled: true, emailFrequency: "immediate", pushFrequency: "off", alertStates: ["ready", "stretch", "verify"], quietStart: "00:00", quietEnd: "00:00", timezone: "UTC" });
    const content = (extra: string) => `&lt;h2&gt;Requirements&lt;/h2&gt;&lt;ul&gt;&lt;li&gt;React and TypeScript experience building customer-facing products&lt;/li&gt;&lt;li&gt;Strong written communication with product teams${extra}&lt;/li&gt;&lt;/ul&gt;`;
    let feed = { jobs: [{ id: 92, title: "Frontend Developer", updated_at: "2026-11-01T00:00:00Z", absolute_url: "https://jobs.example/92", location: { name: "Remote" }, content: content("") }] };
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(feed), { status: 200, headers: { "content-type": "application/json" } })));
    const oldSources = process.env.JOB_SOURCE_BOARDS;
    const oldKey = process.env.OPENROUTER_API_KEY;
    process.env.JOB_SOURCE_BOARDS = "greenhouse:acme=Acme";
    process.env.OPENROUTER_API_KEY = "";
    try {
      await runJobDiscovery();
      const c = await collections();
      expect(await c.notificationDeliveries.countDocuments({ userId: user.id })).toBe(1);
      const recommendation = await c.jobRecommendations.findOne({ userId: user.id });
      await dismissRecommendation(user.id, recommendation!._id, "not interested");
      feed = { jobs: [{ ...feed.jobs[0], updated_at: "2026-11-02T00:00:00Z", content: content(" and design systems") }] };
      await c.jobSources.updateMany({}, { $set: { nextAttemptAt: null } });
      expect(await runJobDiscovery()).toMatchObject({ changed: 1 });
      expect(await c.notificationDeliveries.countDocuments({ userId: user.id })).toBe(1);
      expect(await c.jobRecommendations.findOne({ userId: user.id })).toMatchObject({ status: "dismissed" });
    } finally {
      if (oldSources === undefined) delete process.env.JOB_SOURCE_BOARDS;
      else process.env.JOB_SOURCE_BOARDS = oldSources;
      if (oldKey === undefined) delete process.env.OPENROUTER_API_KEY;
      else process.env.OPENROUTER_API_KEY = oldKey;
    }
  });

  it("saves one tracker job even when two requests race", async () => {
    const { user, recommendation } = await fixture();
    const ids = await Promise.all([saveRecommendationToTracker(user.id, recommendation._id), saveRecommendationToTracker(user.id, recommendation._id)]);
    expect(new Set(ids).size).toBe(1);
    expect(await listJobs(user.id)).toHaveLength(1);
  });

  it("queues each email once and delivers from the stored recommendation", async () => {
    const { passport, recommendation } = await fixture();
    await enqueueRecommendationNotifications(passport, recommendation._id, 1);
    await enqueueRecommendationNotifications(passport, recommendation._id, 1);
    const c = await collections();
    expect(await c.notificationDeliveries.countDocuments()).toBe(1);
    await c.notificationDeliveries.updateOne({ recommendationId: recommendation._id }, { $set: { state: "sending", lockedUntil: new Date(Date.now() - 1_000) } });
    const delivered = await Promise.all([sendImmediateDiscoveryNotifications(), sendImmediateDiscoveryNotifications()]);
    expect(delivered.reduce((sum, value) => sum + value, 0)).toBe(1);
    expect(readFileSync(OUTBOX, "utf8")).toContain("Ready to apply: Frontend Developer at Acme");
    expect(await sendImmediateDiscoveryNotifications()).toBe(0);
  });

  it("holds job-alert email back until the address is confirmed", async () => {
    const { user, passport, recommendation } = await fixture();
    const c = await collections();
    await c.users.updateOne({ _id: user.id }, { $set: { emailVerifiedAt: null } });
    await enqueueRecommendationNotifications(passport, recommendation._id, 1);
    expect(await sendImmediateDiscoveryNotifications()).toBe(0);
    expect(await c.notificationDeliveries.findOne({ recommendationId: recommendation._id })).toMatchObject({ state: "sent", failureReason: "Email address not confirmed" });
  });

  it("moves a fourth immediate email in one hour into the daily digest", async () => {
    const { user, passport, recommendation } = await fixture();
    const c = await collections();
    const recent = new Date();
    await c.notificationDeliveries.insertMany([1, 2, 3].map((index) => ({ _id: `already-sent-${index}`, userId: user.id, recommendationId: `previous-${index}`, channel: "email" as const, frequency: "immediate" as const, state: "sent" as const, attempts: 1, nextAttemptAt: recent, lockedUntil: null, providerMessageId: null, failureReason: null, createdAt: recent, sentAt: recent })));
    await enqueueRecommendationNotifications(passport, recommendation._id, 1);
    expect(await sendImmediateDiscoveryNotifications()).toBe(0);
    expect(await c.notificationDeliveries.findOne({ recommendationId: recommendation._id })).toMatchObject({ state: "pending", frequency: "daily", failureReason: "Hourly email limit; moved to digest" });
  });

  it("sends one push across devices, removes a permanently invalid endpoint, and never duplicates the delivery", async () => {
    const { user, passport, recommendation } = await fixture();
    const pushPassport = { ...passport, emailFrequency: "off" as const, pushFrequency: "immediate" as const };
    await (await collections()).careerPassports.replaceOne({ _id: user.id }, pushPassport);
    await subscribePush(user.id, { endpoint: "https://fcm.googleapis.com/fcm/send/good", p256dh: "a".repeat(50), auth: "b".repeat(20), deviceLabel: "Good" });
    await subscribePush(user.id, { endpoint: "https://fcm.googleapis.com/fcm/send/bad", p256dh: "c".repeat(50), auth: "d".repeat(20), deviceLabel: "Expired" });
    const stored = await (await collections()).pushSubscriptions.findOne({ userId: user.id, deviceLabel: "Good" });
    expect(stored?.p256dh).toMatch(/^v1:/);
    expect(stored?.p256dh).not.toContain("a".repeat(20));
    pushSend.mockImplementation(async (subscription: { endpoint: string }) => {
      if (subscription.endpoint.endsWith("/bad")) throw Object.assign(new Error("Gone"), { statusCode: 410 });
      return {};
    });
    await enqueueRecommendationNotifications(pushPassport, recommendation._id, 1);
    await enqueueRecommendationNotifications(pushPassport, recommendation._id, 1);
    expect(await sendImmediateDiscoveryNotifications()).toBe(1);
    expect(pushSend).toHaveBeenCalledTimes(2);
    const payload = JSON.parse(String(pushSend.mock.calls[0][1])) as Record<string, unknown>;
    expect(payload).toMatchObject({ title: "Ready to apply: Frontend Developer", body: "Acme · Remote", url: `/app/radar/${recommendation._id}`, version: 1 });
    expect(JSON.stringify(payload)).not.toContain("Built React products");
    const c = await collections();
    expect(await c.pushSubscriptions.countDocuments({ userId: user.id })).toBe(1);
    expect((await c.pushSubscriptions.findOne({ userId: user.id }))?.deviceLabel).toBe("Good");
    expect(await sendImmediateDiscoveryNotifications()).toBe(0);
  });

  it("holds immediate alerts during quiet hours", async () => {
    const { passport, recommendation } = await fixture();
    const hour = new Date().getUTCHours();
    const time = (value: number) => `${String((value + 24) % 24).padStart(2, "0")}:00`;
    const quietPassport = { ...passport, quietStart: time(hour - 1), quietEnd: time(hour + 1) };
    await (await collections()).careerPassports.replaceOne({ _id: passport._id }, quietPassport);
    await enqueueRecommendationNotifications(quietPassport, recommendation._id, 1);
    expect(await sendImmediateDiscoveryNotifications()).toBe(0);
    expect(await (await collections()).notificationDeliveries.findOne({ recommendationId: recommendation._id })).toMatchObject({ state: "pending", failureReason: "Quiet hours" });
  });

  it("combines daily recommendations into one digest", async () => {
    const { user, passport, job, recommendation } = await fixture();
    const dailyPassport = { ...passport, emailFrequency: "daily" as const };
    await (await collections()).careerPassports.replaceOne({ _id: user.id }, dailyPassport);
    const secondJob = { ...job, _id: crypto.randomUUID(), externalId: "43", title: "UI Engineer" };
    const secondRecommendation = { ...recommendation, _id: crypto.randomUUID(), discoveredJobId: secondJob._id, createdAt: new Date(now.valueOf() + 1_000) };
    const c = await collections();
    await c.discoveredJobs.insertOne(secondJob);
    await c.jobRecommendations.insertOne(secondRecommendation);
    await enqueueRecommendationNotifications(dailyPassport, recommendation._id, 1);
    await enqueueRecommendationNotifications(dailyPassport, secondRecommendation._id, 1);
    expect(await sendDiscoveryDigests()).toEqual({ groups: 1, sent: 1 });
    expect(readFileSync(OUTBOX, "utf8").trim().split("\n")).toHaveLength(1);
    expect(await c.notificationDeliveries.countDocuments({ state: "sent" })).toBe(2);
  });

  it("stores one push endpoint and moves it to the current account", async () => {
    const { user } = await fixture();
    const other = await makeUser();
    const subscription = { endpoint: "https://fcm.googleapis.com/fcm/send/endpoint", p256dh: "a".repeat(50), auth: "b".repeat(20), deviceLabel: "Browser" };
    await subscribePush(user.id, subscription);
    await subscribePush(other.id, { ...subscription, deviceLabel: "Other browser" });
    const rows = await (await collections()).pushSubscriptions.find({}).toArray();
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ userId: other.id, deviceLabel: "Other browser" });
    expect(await removePushDevice(user.id, rows[0]._id)).toBe(false);
    expect(await removePushDevice(other.id, rows[0]._id)).toBe(true);
    expect(await (await collections()).pushSubscriptions.countDocuments()).toBe(0);
  });

  it("removes private discovery and notification data when the account is deleted", async () => {
    const { user, passport, recommendation } = await fixture();
    await enqueueRecommendationNotifications(passport, recommendation._id, 1);
    await subscribePush(user.id, { endpoint: "https://fcm.googleapis.com/fcm/send/delete-me", p256dh: "a".repeat(50), auth: "b".repeat(20), deviceLabel: "Browser" });
    await deleteUser(user.id);
    const c = await collections();
    expect(await c.careerPassports.countDocuments({ _id: user.id })).toBe(0);
    expect(await c.jobRecommendations.countDocuments({ userId: user.id })).toBe(0);
    expect(await c.notificationDeliveries.countDocuments({ userId: user.id })).toBe(0);
    expect(await c.pushSubscriptions.countDocuments({ userId: user.id })).toBe(0);
  });
});

describe("the account-wide notifications switch", () => {
  const outbox = () => { try { return readFileSync(OUTBOX, "utf8"); } catch { return ""; } };

  it("is on by default and persists when turned off and on", async () => {
    const { user } = await fixture();
    expect(await getNotificationsOn(user.id)).toBe(true);
    await setNotificationsOn(user.id, false);
    expect(await getNotificationsOn(user.id)).toBe(false);
    expect((await (await collections()).users.findOne({ _id: user.id }))?.notificationsOff).toBe(true);
    await setNotificationsOn(user.id, true);
    expect(await getNotificationsOn(user.id)).toBe(true);
  });

  it("queues nothing new while off, even when the Career Passport asks for email and push", async () => {
    const { user, passport, recommendation } = await fixture();
    await subscribePush(user.id, { endpoint: "https://fcm.googleapis.com/fcm/send/off", p256dh: "a".repeat(50), auth: "b".repeat(20), deviceLabel: "Browser" });
    await setNotificationsOn(user.id, false);
    await enqueueRecommendationNotifications({ ...passport, pushFrequency: "immediate" }, recommendation._id, 1);
    expect(await (await collections()).notificationDeliveries.countDocuments({ userId: user.id })).toBe(0);
  });

  it("closes alerts already waiting when turned off, so turning back on releases no backlog", async () => {
    const { user, passport, recommendation } = await fixture();
    await enqueueRecommendationNotifications(passport, recommendation._id, 1);
    await setNotificationsOn(user.id, false);
    await setNotificationsOn(user.id, true);
    expect(await sendImmediateDiscoveryNotifications()).toBe(0);
    expect(outbox()).toBe("");
    expect(await (await collections()).notificationDeliveries.findOne({ recommendationId: recommendation._id })).toMatchObject({ state: "sent", sentAt: null, failureReason: NOTIFICATIONS_OFF_REASON });
  });

  it("skips a delivery claimed after the switch went off, for immediate alerts and digests", async () => {
    const { user, passport, recommendation } = await fixture();
    await enqueueRecommendationNotifications(passport, recommendation._id, 1);
    await enqueueRecommendationNotifications({ ...passport, emailFrequency: "daily" }, recommendation._id, 2);
    // Turned off directly, as a second server would see it mid-run, without closing the queue.
    await (await collections()).users.updateOne({ _id: user.id }, { $set: { notificationsOff: true } });
    expect(await sendImmediateDiscoveryNotifications()).toBe(0);
    expect(await sendDiscoveryDigests()).toEqual({ groups: 1, sent: 0 });
    expect(outbox()).toBe("");
    expect(await (await collections()).notificationDeliveries.findOne({ _id: `${recommendation._id}:email:1` })).toMatchObject({ state: "sent", failureReason: NOTIFICATIONS_OFF_REASON });
  });

  it("delivers again once turned back on", async () => {
    const { user, passport, recommendation } = await fixture();
    await setNotificationsOn(user.id, false);
    await setNotificationsOn(user.id, true);
    await enqueueRecommendationNotifications(passport, recommendation._id, 1);
    expect(await sendImmediateDiscoveryNotifications()).toBe(1);
    expect(outbox()).toContain("Frontend Developer at Acme");
  });

  it("refuses a test push while off", async () => {
    const { user } = await fixture();
    await subscribePush(user.id, { endpoint: "https://fcm.googleapis.com/fcm/send/test", p256dh: "a".repeat(50), auth: "b".repeat(20), deviceLabel: "Browser" });
    await setNotificationsOn(user.id, false);
    await expect(sendTestPush(user.id)).rejects.toBeInstanceOf(NotificationsOffError);
    expect(pushSend).not.toHaveBeenCalled();
    await setNotificationsOn(user.id, true);
    await sendTestPush(user.id);
    expect(pushSend).toHaveBeenCalledTimes(1);
  });

  it("stops follow-up reminder emails while off, and sends them only to confirmed addresses", async () => {
    const on = await makeUser({ email: "on@example.com", emailVerifiedAt: new Date() });
    const off = await makeUser({ email: "off@example.com", emailVerifiedAt: new Date() });
    const unconfirmed = await makeUser({ email: "unconfirmed@example.com" });
    const post = { title: "Support Lead", company: "Acme", location: "", salary: "", summary: "", requirements: [], keywords: [] };
    for (const person of [on, off, unconfirmed]) {
      const job = await createJob(person.id, { url: null, postText: "Support Lead at Acme", post, match: null });
      await setStatus(person.id, job.id, "applied", addDays(today(), -8));
    }
    await setNotificationsOn(off.id, false);
    expect(await sendFollowUpDigests()).toEqual({ people: 1, sent: 1 });
    const mail = outbox();
    expect(mail).toContain("on@example.com");
    expect(mail).not.toContain("off@example.com");
    expect(mail).not.toContain("unconfirmed@example.com");
  });
});
