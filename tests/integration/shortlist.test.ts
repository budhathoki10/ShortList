import { readFileSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { collections } from "@/db/mongo";
import { AiUnavailableError, structured } from "@/lib/ai";
import { heuristicProfile } from "@/lib/cv/heuristic";
import { addDays } from "@/lib/dates";
import { fetchJobPost } from "@/lib/jobs/fetch-post";
import { heuristicJob } from "@/lib/jobs/heuristic";
import { scoreMatch } from "@/lib/match/score";
import { LIMITS, monthKey, today } from "@/lib/plans";
import { deleteUser } from "@/lib/services/account";
import { paymentsForUser, recordPayment } from "@/lib/services/billing";
import { getInterview, getTailoredCv, saveCoverLetter, saveInterview, savePracticeAnswer, saveTailoredCv, setAllChangesAccepted, setChangeAccepted } from "@/lib/services/documents";
import { createJob, deleteJob, dueFollowUpCount, dueFollowUps, listJobs, ownedJob, progress, rescoreAll, setStatus } from "@/lib/services/jobs";
import { getProfile, saveProfile } from "@/lib/services/profile";
import { overLimit } from "@/lib/services/rate-limit";
import { sendFollowUpDigests } from "@/lib/services/reminders";
import { refundAllowance, spendAllowance, trialUsage, usageThisMonth } from "@/lib/services/usage";
import { findUserById } from "@/lib/services/users";
import { safeRedirectPath } from "@/lib/util";
import { consumeAuthToken, createAuthToken, revokeAuthTokens } from "@/lib/auth/tokens";
import { DAY, makeUser, resetDb } from "./helpers";

const OUTBOX = path.join(os.tmpdir(), `shortlist-integration-outbox-${process.pid}.jsonl`);
const emails = (): { to: string; subject: string; text: string }[] => {
  try {
    return readFileSync(OUTBOX, "utf8").trim().split("\n").filter(Boolean).map((l) => JSON.parse(l));
  } catch {
    return [];
  }
};

const profile = heuristicProfile(readFileSync("tests/fixtures/cv.txt", "utf8"));
const postText = readFileSync("tests/fixtures/job.txt", "utf8");
const post = heuristicJob(postText);

beforeEach(async () => {
  await resetDb();
  rmSync(OUTBOX, { force: true });
  process.env.EMAIL_DEV_OUTBOX = OUTBOX;
});
afterAll(() => rmSync(OUTBOX, { force: true }));

const newJob = (userId: string) => createJob(userId, { url: null, postText, post, match: null });

describe("usage allowance", () => {
  it("allows the free trial amount on one job, then stops, and a refund gives one back", async () => {
    const user = await makeUser({ emailVerifiedAt: new Date() });
    for (let i = 0; i < LIMITS.free.tailor; i++) expect((await spendAllowance(user, "tailor", { jobId: "job-a" })).ok).toBe(true);
    expect(await spendAllowance(user, "tailor", { jobId: "job-a" })).toEqual({ ok: false, reason: "limit" });
    expect((await trialUsage(user.id)).used.tailor).toBe(LIMITS.free.tailor);
    await refundAllowance(user, "tailor");
    expect((await spendAllowance(user, "tailor", { jobId: "job-a" })).ok).toBe(true);
    // Other kinds are counted separately.
    expect((await spendAllowance(user, "cover", { jobId: "job-a" })).ok).toBe(true);
    expect(await spendAllowance(user, "cover", { jobId: "job-b" })).toEqual({ ok: false, reason: "other-job" });
  });

  it("can't be overspent by requests arriving at the same time", async () => {
    const user = await makeUser({ emailVerifiedAt: new Date() });
    const results = await Promise.all(Array.from({ length: 10 }, () => spendAllowance(user, "tailor", { jobId: "job-a" })));
    expect(results.filter((result) => result.ok)).toHaveLength(LIMITS.free.tailor);
  });

  it("resets monthly features each month and gives paid accounts the paid ceiling", async () => {
    const user = await makeUser({ emailVerifiedAt: new Date() });
    const lastMonth = new Date(Date.now() - 40 * DAY);
    for (let i = 0; i < LIMITS.free.import; i++) expect((await spendAllowance(user, "import", { now: lastMonth })).ok).toBe(true);
    expect((await spendAllowance(user, "import")).ok).toBe(true);
    expect(monthKey(lastMonth)).not.toBe(monthKey());

    const paid = await makeUser({ subscriptionAccessUntil: new Date(Date.now() + 10 * DAY) });
    for (let i = 0; i < LIMITS.free.tailor + 2; i++) expect((await spendAllowance(paid, "tailor")).ok).toBe(true);
    expect((await usageThisMonth(paid.id)).tailor).toBe(LIMITS.free.tailor + 2);
  });

  it("needs a confirmed email before the free trial starts", async () => {
    const user = await makeUser();
    expect(await spendAllowance(user, "tailor", { jobId: "job-a" })).toEqual({ ok: false, reason: "unverified" });
    expect((await trialUsage(user.id)).jobId).toBeNull();
    // CV imports aren't part of the trial, so they still work.
    expect((await spendAllowance(user, "import")).ok).toBe(true);
  });

  it("gives an email address one free trial, even after the account is deleted and made again", async () => {
    const first = await makeUser({ email: "Asha.Gurung+jobs@gmail.com", emailVerifiedAt: new Date() });
    expect((await spendAllowance(first, "tailor", { jobId: "job-a" })).ok).toBe(true);
    await deleteUser(first.id);
    const again = await makeUser({ email: "ashagurung@googlemail.com", emailVerifiedAt: new Date() });
    expect(await spendAllowance(again, "tailor", { jobId: "job-b" })).toEqual({ ok: false, reason: "trial-used" });
    // A different person is unaffected.
    const other = await makeUser({ emailVerifiedAt: new Date() });
    expect((await spendAllowance(other, "tailor", { jobId: "job-c" })).ok).toBe(true);
  });
});

describe("payment records", () => {
  const base = { status: "completed", amountMinor: 900, currency: "USD" };

  it("records a payment once, however often or however many at once it is recorded", async () => {
    const user = await makeUser();
    const results = await Promise.all(Array.from({ length: 6 }, () => recordPayment({ ...base, userId: user.id, provider: "freemius", ref: "freemius:payment:1" })));
    expect(results.filter(Boolean)).toHaveLength(1);
    expect(await recordPayment({ ...base, userId: user.id, provider: "freemius", ref: "freemius:payment:1" })).toBe(false);
    expect(await paymentsForUser(user.id)).toHaveLength(1);
  });

  it("lists a person's payments newest first", async () => {
    const user = await makeUser();
    await recordPayment({ ...base, userId: user.id, provider: "freemius", ref: "freemius:payment:2", createdAt: new Date("2026-09-01") });
    await recordPayment({ ...base, userId: user.id, provider: "freemius", ref: "freemius:payment:3", createdAt: new Date("2026-10-01") });
    expect((await paymentsForUser(user.id)).map((p) => p.providerRef)).toEqual(["freemius:payment:3", "freemius:payment:2"]);
  });
});

describe("jobs", () => {
  it("preserves earlier practice and saves different answers atomically without crossing accounts", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const job = await newJob(owner.id);
    const q = (id: string) => ({ id, question: "Explain one example.", why: "Your contribution", answer: "", feedback: null });
    await saveInterview(owner.id, job.id, [q("old")]);
    const feedback = { score: null, method: "checklist" as const, strengths: [], improve: ["Name your own action."], rewrite: "[Your actual example.]" };
    expect(await savePracticeAnswer(other.id, job.id, "old", "Someone else", feedback)).toBe(false);
    expect(await savePracticeAnswer(owner.id, job.id, "old", "My earlier answer", feedback)).toBe(true);
    await saveInterview(owner.id, job.id, [q("one"), q("two")], { archive: true, questionVersion: 2 });
    await Promise.all([savePracticeAnswer(owner.id, job.id, "one", "First answer", feedback), savePracticeAnswer(owner.id, job.id, "two", "Second answer", feedback)]);
    const saved = await getInterview(owner.id, job.id);
    expect(saved?.questionVersion).toBe(2);
    expect(saved?.previousQuestions[0].answer).toBe("My earlier answer");
    expect(saved?.questions.map((row) => row.answer)).toEqual(["First answer", "Second answer"]);
    await (await collections()).interviews.updateOne({ _id: job.id }, { $set: { sourceNeedsReview: true } });
    expect(await savePracticeAnswer(owner.id, job.id, "one", "Stale answer", feedback)).toBe(false);
    expect((await getInterview(owner.id, job.id))?.questions[0].answer).toBe("First answer");
  });
  it("applying sets a follow-up a week out; an answer clears it", async () => {
    const user = await makeUser();
    const job = await newJob(user.id);
    await setStatus(user.id, job.id, "applied", "2026-10-20");
    let j = (await ownedJob(user.id, job.id))!;
    expect(j).toMatchObject({ status: "applied", appliedOn: "2026-10-20", followUpOn: "2026-10-27" });

    expect((await dueFollowUps(user.id, "2026-10-26")).length).toBe(0);
    expect((await dueFollowUps(user.id, "2026-10-27")).map((x) => x.id)).toEqual([job.id]);
    expect(await dueFollowUpCount(user.id, "2026-10-29")).toBe(1);

    await setStatus(user.id, job.id, "interview", "2026-10-28");
    j = (await ownedJob(user.id, job.id))!;
    expect(j).toMatchObject({ status: "interview", appliedOn: "2026-10-20", followUpOn: null });
  });

  it("counts progress", async () => {
    const user = await makeUser();
    const a = await newJob(user.id);
    const b = await newJob(user.id);
    const c = await newJob(user.id);
    await newJob(user.id);
    await setStatus(user.id, a.id, "applied", today());
    await setStatus(user.id, b.id, "applied", addDays(today(), -20));
    await setStatus(user.id, b.id, "rejected");
    await setStatus(user.id, c.id, "applied", today());
    await setStatus(user.id, c.id, "interview");
    expect(await progress(user.id)).toEqual({ saved: 4, applied: 3, appliedThisWeek: 2, responseRate: 67, interviews: 1, offers: 0, waiting: 1 });
  });

  it("re-scores every job when the profile changes", async () => {
    const user = await makeUser();
    const job = await createJob(user.id, { url: null, postText, post, match: scoreMatch(profile, post) });
    const before = job.match!.score;
    await rescoreAll(user.id, { ...profile, skills: [...profile.skills, "HubSpot", "Salesforce"] });
    expect((await ownedJob(user.id, job.id))!.match!.score).toBeGreaterThan(before);
  });

  it("clears a legacy match when the saved job has no usable requirements", async () => {
    const user = await makeUser();
    const sparse = { ...post, requirements: [], keywords: ["Full Stack", "Software Engineer"] };
    const job = await createJob(user.id, { url: null, postText: "Search results", post: sparse, match: { score: 0, keywords: [], requirements: [] } });
    await rescoreAll(user.id, profile);
    expect((await ownedJob(user.id, job.id))?.match).toBeNull();
  });

  it("keeps everyone's jobs and documents private", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const job = await newJob(owner.id);
    await saveTailoredCv(owner.id, job.id, { changes: [] });
    expect(await ownedJob(other.id, job.id)).toBeNull();
    expect(await getTailoredCv(other.id, job.id)).toBeNull();
    expect(await setStatus(other.id, job.id, "applied")).toBeNull();
    expect(await listJobs(other.id)).toHaveLength(0);
    expect(await ownedJob(owner.id, "not-a-uuid")).toBeNull();
  });

  it("deleting a job removes what was written for it, and only for its owner", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const job = await newJob(owner.id);
    await saveTailoredCv(owner.id, job.id, { changes: [] });
    await saveCoverLetter(owner.id, job.id, "letter");
    await saveInterview(owner.id, job.id, []);
    await deleteJob(other.id, job.id);
    expect(await ownedJob(owner.id, job.id)).not.toBeNull();
    await deleteJob(owner.id, job.id);
    const c = await collections();
    expect(await ownedJob(owner.id, job.id)).toBeNull();
    expect(await c.documents.countDocuments({ jobId: job.id })).toBe(0);
    expect(await c.interviews.countDocuments({ _id: job.id })).toBe(0);
  });
});

describe("database injection", () => {
  it("treats operator-looking input as plain text that matches nothing", async () => {
    const owner = await makeUser();
    await newJob(owner.id);
    expect(await ownedJob(owner.id, '{"$ne": null}')).toBeNull();
    expect(await ownedJob({ $ne: "" } as never, "00000000-0000-0000-0000-000000000000")).toBeNull();
    expect(await findUserById({ $ne: "" } as never)).toBeNull();
    expect(await listJobs({ $ne: "" } as never)).toHaveLength(0);
  });
});

describe("rate limits", () => {
  it("lets the allowed number through, then blocks, counting parallel attempts exactly", async () => {
    const results = await Promise.all(Array.from({ length: 12 }, () => overLimit("test:parallel", 5, 60_000)));
    expect(results.filter((blocked) => !blocked)).toHaveLength(5);
    expect(await overLimit("test:parallel", 5, 60_000)).toBe(true);
    expect(await overLimit("test:other", 5, 60_000)).toBe(false);
  });

  it("starts a fresh count in the next window", async () => {
    const t = Date.UTC(2026, 9, 29, 12, 0, 0);
    for (let i = 0; i < 3; i++) await overLimit("test:window", 2, 60_000, t);
    expect(await overLimit("test:window", 2, 60_000, t)).toBe(true);
    expect(await overLimit("test:window", 2, 60_000, t + 61_000)).toBe(false);
  });
});

describe("redirects after login", () => {
  it("only follows paths on this site", () => {
    expect(safeRedirectPath("/app/jobs", "/app")).toBe("/app/jobs");
    for (const bad of ["//evil.com", "/\\evil.com", "https://evil.com", "javascript:alert(1)", "/app\nSet-Cookie: x", "", undefined, 5, `/${"a".repeat(600)}`]) {
      expect(safeRedirectPath(bad, "/app")).toBe("/app");
    }
  });
});

describe("AI via OpenRouter", () => {
  const last = async () => (await (await fetch(`${process.env.FIXTURE_BASE}/openrouter/_last`)).json()) as { headers: Record<string, string>; body: { model: string; messages: unknown; response_format: unknown; provider: unknown } };
  const answer = z.object({ answer: z.string() });

  it("asks for a JSON-schema answer from providers that support it, and returns only what validates", async () => {
    // The fake wraps its reply in a code fence, as some models do.
    expect(await structured({ task: "read", system: "sys", prompt: "hello", schema: answer })).toEqual({ answer: "ok" });
    const sent = await last();
    expect(sent.body.model).toBe("openrouter/free");
    expect(sent.body.messages).toEqual([
      { role: "system", content: "sys" },
      { role: "user", content: "hello" },
    ]);
    expect(sent.body.response_format).toMatchObject({ type: "json_schema", json_schema: { strict: true, schema: { type: "object", additionalProperties: false } } });
    expect(sent.body.provider).toEqual({ require_parameters: true, data_collection: "deny" });
    expect(sent.headers.title).toBe("Shortlist");
    await structured({ task: "write", system: "s", prompt: "p", schema: answer });
    expect((await last()).body.model).toBe("openrouter/free");
  });

  it("raises AiUnavailableError for refusals, cut-off answers and answers of the wrong shape", async () => {
    await expect(structured({ task: "read", system: "s", prompt: "p", schema: z.object({ refused: z.string() }) })).rejects.toThrow(AiUnavailableError);
    await expect(structured({ task: "read", system: "s", prompt: "p", schema: z.object({ truncated: z.string() }) })).rejects.toThrow(AiUnavailableError);
    await expect(structured({ task: "read", system: "s", prompt: "p", schema: z.object({ something: z.string() }) })).rejects.toThrow(AiUnavailableError);
  });

  it("keeps the CV out of error messages", async () => {
    const key = process.env.OPENROUTER_API_KEY;
    process.env.OPENROUTER_API_KEY = "wrong-key";
    try {
      const failure = structured({ task: "read", system: "s", prompt: "SECRET CV TEXT", schema: answer });
      await expect(failure).rejects.toThrow(/(?:OpenRouter request failed|No model answered).*401/);
      await expect(failure).rejects.not.toThrow(/SECRET CV TEXT/);
    } finally {
      process.env.OPENROUTER_API_KEY = key;
    }
  });
});

describe("documents", () => {
  it("preserves old drafts but marks them for review when the profile is replaced", async () => {
    const user = await makeUser();
    await saveProfile(user.id, profile, "Original source text");
    const job = await newJob(user.id);
    await saveTailoredCv(user.id, job.id, { changes: [] });
    await saveInterview(user.id, job.id, [{ id: "q", question: "Why this role?", why: "Motivation", answer: "My draft answer", feedback: null }]);
    await saveProfile(user.id, { ...profile, headline: "Corrected headline" }, "Corrected source text");
    expect((await getTailoredCv(user.id, job.id))?.sourceNeedsReview).toBe(true);
    expect((await getInterview(user.id, job.id))?.sourceNeedsReview).toBe(true);
    expect((await getInterview(user.id, job.id))?.questions[0].answer).toBe("My draft answer");
    const stored = await (await collections()).profiles.findOne({ _id: user.id });
    expect(stored?.previousData?.headline).toBe(profile.headline);
    expect(stored?.sourceText).toBe("Corrected source text");
    await saveTailoredCv(user.id, job.id, { changes: [] });
    expect((await getTailoredCv(user.id, job.id))?.sourceNeedsReview).toBe(false);
  });
  it("keeps one tailored CV, cover letter and interview per job, updated in place", async () => {
    const user = await makeUser();
    const job = await newJob(user.id);
    await saveTailoredCv(user.id, job.id, { changes: [] });
    await saveTailoredCv(user.id, job.id, { changes: [{ id: "c", kind: "summary", before: "", after: "x", reason: "", flags: [], accepted: true }] });
    await saveCoverLetter(user.id, job.id, "one");
    await saveCoverLetter(user.id, job.id, "two");
    const docs = await (await collections()).documents.find({ jobId: job.id }).toArray();
    expect(docs).toHaveLength(2);
    expect((await getTailoredCv(user.id, job.id))!.cv!.changes).toHaveLength(1);

    await saveInterview(user.id, job.id, [{ id: "q1", question: "Why?", why: "", answer: "", feedback: null }]);
    await saveInterview(user.id, job.id, [{ id: "q1", question: "Why?", why: "", answer: "Because", feedback: null }]);
    expect((await getInterview(user.id, job.id))!.questions[0].answer).toBe("Because");
  });
});

describe("suggested changes", () => {
  const change = (id: string, flags: string[], accepted: boolean) => ({ id, kind: "summary" as const, before: "", after: id, reason: "", flags, accepted });
  const accepted = async (userId: string, jobId: string) => (await getTailoredCv(userId, jobId))!.cv!.changes.map((c) => c.accepted);

  it("toggles one suggestion at a time without overwriting the others, and never switches on a blocked one", async () => {
    const user = await makeUser();
    const job = await newJob(user.id);
    await saveTailoredCv(user.id, job.id, { changes: [change("a", [], true), change("b", ["Salesforce"], false), change("c", [], true)] });

    // Two quick toggles in flight at once both land.
    await Promise.all([setChangeAccepted(user.id, job.id, "a", false), setChangeAccepted(user.id, job.id, "c", false)]);
    expect(await accepted(user.id, job.id)).toEqual([false, false, false]);

    await setChangeAccepted(user.id, job.id, "b", true);
    expect(await accepted(user.id, job.id)).toEqual([false, false, false]);

    await setAllChangesAccepted(user.id, job.id, true);
    expect(await accepted(user.id, job.id)).toEqual([true, false, true]);
  });

  it("only changes the owner's document", async () => {
    const owner = await makeUser();
    const other = await makeUser();
    const job = await newJob(owner.id);
    await saveTailoredCv(owner.id, job.id, { changes: [change("a", [], true)] });
    await setChangeAccepted(other.id, job.id, "a", false);
    await setAllChangesAccepted(other.id, job.id, false);
    expect(await accepted(owner.id, job.id)).toEqual([true]);
  });
});

describe("reading job links", () => {
  const base = process.env.FIXTURE_BASE;

  it("reads the structured job posting a page embeds", async () => {
    const res = await fetchJobPost(`${base}/jobs/northwind.html`);
    expect(res.ok).toBe(true);
    if (!res.ok) return;
    expect(res.text).toMatch(/^Customer Success Lead\nCompany: Northwind Software/);
    expect(res.text).toContain("• Experience with Zendesk and HubSpot");
    expect(res.text).not.toContain("Careers");
    const read = heuristicJob(res.text);
    expect(read).toMatchObject({ title: "Customer Success Lead", company: "Northwind Software" });
    expect(read.requirements.filter((r) => r.kind === "nice")).toHaveLength(2);
  });

  it("explains when a page can't be read", async () => {
    expect(await fetchJobPost(`${base}/jobs/login-wall`)).toEqual({ ok: false, reason: "blocked" });
    expect(await fetchJobPost(`${base}/jobs/empty`)).toEqual({ ok: false, reason: "too_short" });
    expect(await fetchJobPost(`${base}/jobs/nothing.html`)).toEqual({ ok: false, reason: "unreachable" });
    expect(await fetchJobPost("ftp://example.com/job")).toEqual({ ok: false, reason: "blocked" });
  });
});

describe("accounts", () => {
  it("deleting an account removes every row that belongs to it", async () => {
    const user = await makeUser();
    await saveProfile(user.id, profile);
    const job = await newJob(user.id);
    await saveTailoredCv(user.id, job.id, { changes: [] });
    await saveCoverLetter(user.id, job.id, "letter");
    await saveInterview(user.id, job.id, []);
    await spendAllowance(user, "tailor", { jobId: job.id });
    await recordPayment({ userId: user.id, provider: "freemius", ref: "freemius:payment:77", status: "completed", amountMinor: 1500, currency: "USD" });

    await deleteUser(user.id);
    const c = await collections();
    expect(await c.users.countDocuments({ _id: user.id })).toBe(0);
    expect(await c.profiles.countDocuments({ _id: user.id })).toBe(0);
    expect(await c.interviews.countDocuments({ _id: job.id })).toBe(0);
    for (const coll of [c.jobs, c.documents, c.usage, c.payments, c.sessions, c.authTokens]) {
      expect(await coll.countDocuments({ userId: user.id })).toBe(0);
    }
    expect(await getProfile(user.id)).toBeNull();
  });
});

describe("follow-up reminders", () => {
  it("emails each person once, listing their due applications", async () => {
    const asha = await makeUser({ email: "asha@example.com", emailVerifiedAt: new Date() });
    const ram = await makeUser({ email: "ram@example.com", emailVerifiedAt: new Date() });
    const due1 = await newJob(asha.id);
    const due2 = await createJob(asha.id, { url: null, postText, post: { ...post, title: "Support Manager", company: "Acme" }, match: null });
    const notYet = await newJob(ram.id);
    await setStatus(asha.id, due1.id, "applied", addDays(today(), -8));
    await setStatus(asha.id, due2.id, "applied", addDays(today(), -7));
    await setStatus(ram.id, notYet.id, "applied", addDays(today(), -2));

    expect(await sendFollowUpDigests()).toEqual({ people: 1, sent: 1 });
    const [mail] = emails();
    expect(mail.to).toBe("asha@example.com");
    expect(mail.subject).toBe("2 applications to follow up on");
    expect(mail.text).toContain("• Customer Success Lead at Northwind Software");
    expect(mail.text).toContain("• Support Manager at Acme");
  });
});

describe("password reset links", () => {
  it("revokes every other unused reset link once one is used", async () => {
    const user = await makeUser();
    const first = await createAuthToken(user.id, "reset_password");
    const second = await createAuthToken(user.id, "reset_password");
    const verify = await createAuthToken(user.id, "verify_email");
    expect(await consumeAuthToken(second, "reset_password")).toBe(user.id);
    await revokeAuthTokens(user.id, "reset_password");
    expect(await consumeAuthToken(first, "reset_password")).toBeNull();
    // Other purposes are untouched.
    expect(await consumeAuthToken(verify, "verify_email")).toBe(user.id);
  });
});
