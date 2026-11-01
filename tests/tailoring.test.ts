import { readFileSync } from "node:fs";
import mammoth from "mammoth";
import { describe, expect, it } from "vitest";
import { heuristicProfile } from "@/lib/cv/heuristic";
import { wordDiff } from "@/lib/diff";
import { cvDocxBuffer, cvFileName } from "@/lib/export/docx";
import { heuristicJob } from "@/lib/jobs/heuristic";
import { highlight } from "@/lib/match/highlight";
import { scoreLabel, scoreMatch } from "@/lib/match/score";
import type { Change } from "@/lib/model/types";
import { isPaid, limitsFor, monthKey } from "@/lib/plans";
import { applyChanges } from "@/lib/tailor/apply";
import { unsupportedFacts } from "@/lib/tailor/fact-check";
import { followUpMessage } from "@/lib/tailor/follow-up";
import { proposeChanges } from "@/lib/tailor/tailor";
import { writeCoverLetter } from "@/lib/tailor/cover-letter";
import { answerFeedback, interviewQuestions } from "@/lib/tailor/interview";

const profile = heuristicProfile(readFileSync("tests/fixtures/cv.txt", "utf8"));
const post = heuristicJob(readFileSync("tests/fixtures/job.txt", "utf8"));
const brightdesk = profile.experience[0];

describe("match check", () => {
  const m = scoreMatch(profile, post);
  const hit = (k: string) => m.keywords.find((h) => h.keyword.toLowerCase() === k.toLowerCase());

  it("tells shown, listed and missing apart, with evidence", () => {
    expect(hit("Zendesk")).toMatchObject({ where: "shown", evidence: "Answered customer tickets in Zendesk, keeping first response under 2 hours" });
    expect(hit("Customer Success")?.where).toBe("listed");
    expect(hit("HubSpot")).toMatchObject({ where: "missing", evidence: null });
    expect(hit("Salesforce")?.where).toBe("missing");
  });

  it("judges a requirement with no named skill by the words it shares with your work", () => {
    const req = m.requirements.find((r) => r.text === "Experience reducing churn")!;
    expect(req).toMatchObject({ status: "shown", evidence: "Kept churn under 3% across my accounts by checking in before renewals" });
  });

  it("marks a requirement missing if any skill it names is missing", () => {
    const req = m.requirements.find((r) => r.text.includes("Zendesk and HubSpot"))!;
    expect(req.status).toBe("missing");
  });

  it("scores between 0 and 100, weighting must-haves", () => {
    expect(m.score).toBeGreaterThan(30);
    expect(m.score).toBeLessThan(90);
    const fixed = scoreMatch({ ...profile, skills: [...profile.skills, "HubSpot", "Salesforce", "Japanese"] }, post);
    expect(fixed.score).toBeGreaterThan(m.score);
    expect(scoreLabel(80)).toBe("Strong match");
    expect(scoreLabel(10)).toBe("Big gaps");
  });

  it("highlights the post by what the user has", () => {
    const parts = highlight("Use Zendesk and HubSpot daily", m.keywords);
    expect(parts.filter((p) => p.mark)).toEqual([
      { text: "Zendesk", mark: "shown" },
      { text: "HubSpot", mark: "missing" },
    ]);
  });
});

describe("no-invention check", () => {
  it("allows rewording that only uses facts from the profile", () => {
    expect(unsupportedFacts("Onboarded 40 new business accounts and handled their support in Zendesk, keeping churn under 3%", profile)).toEqual([]);
    expect(unsupportedFacts("Customer support specialist with four years of experience in onboarding and retention.", profile)).toEqual([]);
    expect(unsupportedFacts("Trained 5 new team members at Himal Telecom.", profile)).toEqual([]);
  });

  it.each([
    ["an employer", "Led onboarding at Google for key accounts", "Google"],
    ["a skill", "Managed renewals in Salesforce", "Salesforce"],
    ["a number", "Onboarded 120 new business accounts", "120"],
    ["a percentage", "Cut churn by 45%", "45"],
    ["a degree", "Holds an MBA in marketing", "MBA"],
    ["an acronym", "Ran QBR meetings with clients", "QBR"],
    ["a tool with symbols", "Automated reports with Node.js", "Node.js"],
  ])("blocks %s", (_, text, flagged) => {
    expect(unsupportedFacts(text, profile)).toContain(flagged);
  });

  it("treats a generic 'degree' as fine when the profile names one", () => {
    expect(unsupportedFacts("Business degree from Tribhuvan University", profile)).toEqual([]);
    expect(unsupportedFacts("Business degree", { ...profile, education: [] })).toContain("degree");
  });

  it("lets a cover letter name the employer and role from the job post", () => {
    const allowed = JSON.stringify(post);
    expect(unsupportedFacts("I'd love to join Northwind Software as Customer Success Lead.", profile, allowed)).toEqual([]);
    // "Software" appears in the CV ("software customers"); "Northwind" doesn't.
    expect(unsupportedFacts("I'd love to join Northwind Software as Customer Success Lead.", profile)).toEqual(expect.arrayContaining(["Northwind", "Lead"]));
  });
});

describe("applying changes", () => {
  const change = (c: Partial<Change> & Pick<Change, "kind">): Change => ({ id: "c", reason: "", flags: [], accepted: true, ...c }) as Change;

  it("does not restore outdated facts after the source profile has been corrected", () => {
    const corrected = { ...profile, summary: "Updated, accurate summary.", experience: profile.experience.map((e, i) => i ? e : { ...e, bullets: ["Corrected experience.", ...e.bullets.slice(1)] }) };
    const cv = applyChanges(corrected, [
      change({ kind: "summary", before: profile.summary, after: "Outdated summary." }),
      change({ kind: "bullet", experienceId: brightdesk.id, index: 0, before: brightdesk.bullets[0], after: "Outdated experience." }),
    ]);
    expect(cv.summary).toBe(corrected.summary);
    expect(cv.experience[0].bullets[0]).toBe("Corrected experience.");
  });

  it("uses accepted changes and ignores rejected or blocked ones", () => {
    const cv = applyChanges(profile, [
      change({ kind: "summary", before: profile.summary, after: "New summary." }),
      change({ id: "b", kind: "bullet", experienceId: brightdesk.id, index: 0, before: brightdesk.bullets[0], after: "Rejected.", accepted: false }),
      change({ id: "f", kind: "bullet", experienceId: brightdesk.id, index: 1, before: brightdesk.bullets[1], after: "Blocked.", flags: ["Google"] }),
    ]);
    expect(cv.summary).toBe("New summary.");
    expect(cv.experience[0].bullets[0]).toBe(brightdesk.bullets[0]);
    expect(cv.experience[0].bullets[1]).toBe(brightdesk.bullets[1]);
    expect(profile.summary).not.toBe("New summary."); // the profile itself is untouched
  });

  it("rewrites by original position, then reorders", () => {
    const cv = applyChanges(profile, [
      change({ kind: "bullet-order", experienceId: brightdesk.id, order: [2, 0, 1, 3] }),
      change({ id: "b", kind: "bullet", experienceId: brightdesk.id, index: 2, before: brightdesk.bullets[2], after: "Kept churn under 3%." }),
    ]);
    expect(cv.experience[0].bullets[0]).toBe("Kept churn under 3%.");
    expect(cv.experience[0].bullets[1]).toBe(brightdesk.bullets[0]);
  });

  it("can only reorder existing skills, never add one", () => {
    const cv = applyChanges(profile, [change({ kind: "skills-order", order: ["Onboarding", "HubSpot", "Zendesk"] })]);
    expect(cv.skills.slice(0, 2)).toEqual(["Onboarding", "Zendesk"]);
    expect(cv.skills).not.toContain("HubSpot");
    expect(cv.skills).toHaveLength(profile.skills.length);
  });

  it("ignores an order that isn't a real permutation", () => {
    const cv = applyChanges(profile, [change({ kind: "bullet-order", experienceId: brightdesk.id, order: [0, 0, 1, 2] })]);
    expect(cv.experience[0].bullets).toEqual(brightdesk.bullets);
  });
});

describe("without an AI key", () => {
  it("tailoring rebuilds around the job using only the person's own words", async () => {
    const { changes, method } = await proposeChanges(profile, post, scoreMatch(profile, post));
    expect(method).toBe("basic");
    expect(changes.every((c) => c.flags.length === 0)).toBe(true);
    const own = [profile.summary, ...profile.experience.flatMap((e) => e.bullets)].join(" ");
    for (const c of changes) if (c.kind === "summary") for (const sentence of c.after.split(/(?<=\.)\s+/)) expect(own).toContain(sentence.replace(/\.$/, ""));
    const cv = applyChanges(profile, changes);
    expect(cv.experience[0].bullets[0]).toMatch(/Zendesk/);
    expect(cv.skills[0]).toBe("Zendesk");
  });

  it("writes a plain cover letter with nothing unsupported", async () => {
    const { text, flags } = await writeCoverLetter(profile, post, scoreMatch(profile, post));
    expect(text).toContain("Customer Success Lead");
    expect(text).toContain("Northwind Software");
    expect(text.endsWith("Kind regards,\nAsha Gurung")).toBe(true);
    expect(flags).toEqual([]);
  });

  it("prepares interview questions, including the gaps", async () => {
    const qs = await interviewQuestions(profile, post, scoreMatch(profile, post));
    expect(qs.length).toBeGreaterThanOrEqual(6);
    expect(qs.some((q) => q.question.includes("HubSpot"))).toBe(true);
    expect(new Set(qs.map((q) => q.id)).size).toBe(qs.length);
  });

  it("gives honest feedback on an answer", async () => {
    const weak = await answerFeedback("Tell me about a problem", "We had a problem and we fixed it as a team and it was good in the end I think.", profile, post);
    expect(weak.score).toBeNull();
    expect(weak.improve.join(" ")).toMatch(/what you did yourself/i);
    const strong = await answerFeedback(
      "Tell me about a problem",
      "Our renewals were slipping, so I set up a check-in call with each account two weeks before renewal. I wrote a short agenda and tracked answers in the CRM. Over six months churn on my accounts fell under 3 percent, and the team adopted the same calls. ".repeat(2),
      profile,
      post,
    );
    expect(strong.score).toBeNull();
    expect(strong.method).toBe("checklist");
  });
});

describe("exports and small helpers", () => {
  it("writes a Word CV that reads back as text", async () => {
    const buf = await cvDocxBuffer(profile);
    expect(buf.subarray(0, 2).toString()).toBe("PK");
    const { value } = await mammoth.extractRawText({ buffer: buf });
    expect(value).toContain("Asha Gurung");
    expect(value).toMatch(/experience/i); // capitals are formatting in the Word file, not typed text
    expect(value).toContain("Onboarded 40 new business accounts through video calls and written guides");
    expect(cvFileName(profile, "Customer Success Lead", "docx")).toBe("asha-gurung-cv-customer-success-lead.docx");
  });

  it("diffs by word", () => {
    expect(wordDiff("Answered customer tickets", "Answered business tickets fast")).toEqual([
      { text: "Answered ", type: "same" },
      { text: "customer", type: "removed" },
      { text: "business", type: "added" },
      { text: " tickets", type: "same" },
      { text: " fast", type: "added" },
    ]);
  });

  it("drafts a polite follow-up", () => {
    const m = followUpMessage({ name: "Asha", title: "Customer Success Lead", company: "Northwind", appliedOn: "2026-10-20" });
    expect(m.subject).toBe("Following up: Customer Success Lead application");
    expect(m.body).toContain("I applied for Customer Success Lead at Northwind on 20 Oct 2026");
  });

  it("knows who is on a paid plan and what each plan allows", () => {
    const now = new Date("2026-10-29T10:00:00Z");
    expect(isPaid({ subscriptionAccessUntil: new Date("2026-11-01") }, now)).toBe(true);
    expect(isPaid({ subscriptionAccessUntil: new Date("2026-10-01") }, now)).toBe(false);
    expect(isPaid({ subscriptionAccessUntil: null }, now)).toBe(false);
    expect(limitsFor({ subscriptionAccessUntil: null }).docx).toBe(false);
    expect(monthKey(now)).toBe("2026-10");
  });
});

describe("fallback cover letter wording and gap list", () => {
  const sample = "Requirements\n- 3+ years in customer support or customer success\n- Experience with Zendesk and HubSpot\n- Strong written communication in English\n- Comfortable running onboarding calls with business customers\nNice to have\n- Salesforce experience\n- Experience reducing churn";
  const noisy = { ...heuristicJob(sample), keywords: ["3+ years", "years", "onboarding calls", "business customers", "Zendesk", "HubSpot", "Salesforce", "reducing churn"] };

  it("never treats 'years' or other filler as a skill the candidate worked with", async () => {
    const post2 = { ...noisy, title: "Customer Success Lead", company: "Northwind" };
    post2.requirements = [{ text: "3+ years in customer support or customer success", kind: "must", keywords: ["years", "3+ years"] }, ...post2.requirements];
    const letter = await writeCoverLetter(profile, post2, scoreMatch(profile, post2));
    expect(letter.text).not.toMatch(/\byears\b.*\bwhich\b|with years|and years/i);
    expect(letter.text).not.toContain("I've already worked with");
    expect(letter.text).toMatch(/Zendesk, which is what this role calls for/);
    expect(letter.flags).toEqual([]);
  });

  it("offers only concrete addable skills as gaps", async () => {
    const { cleanPost } = await import("@/lib/jobs/extract");
    const { isAddableSkill } = await import("@/lib/match/skills");
    const cleaned = cleanPost(noisy);
    const gaps = scoreMatch(profile, cleaned).keywords.filter((k) => k.where === "missing" && isAddableSkill(k.keyword)).map((k) => k.keyword);
    expect(gaps.sort()).toEqual(["HubSpot", "Salesforce"]);
    // Even without cleaning, the match and gap filter ignore the noise.
    const raw = scoreMatch(profile, noisy).keywords.filter((k) => k.where === "missing" && isAddableSkill(k.keyword)).map((k) => k.keyword);
    expect(raw.sort()).toEqual(["HubSpot", "Salesforce"]);
    expect(scoreMatch(profile, heuristicJob(sample)).keywords.filter((k) => k.where === "missing" && isAddableSkill(k.keyword)).map((k) => k.keyword).sort()).toEqual(["HubSpot", "Salesforce"]);
  });
});
