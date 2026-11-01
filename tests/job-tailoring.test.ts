import { readFileSync } from "node:fs";
import { afterEach, describe, expect, it, vi } from "vitest";
import { heuristicProfile } from "@/lib/cv/heuristic";
import { heuristicJob } from "@/lib/jobs/heuristic";
import { scoreMatch } from "@/lib/match/score";
import { EMPTY_PROFILE, type Change, type JobPost, type Profile } from "@/lib/model/types";
import { containsTerm } from "@/lib/text";
import { applyChanges } from "@/lib/tailor/apply";
import { basicChanges } from "@/lib/tailor/basic";
import { unsupportedCvFacts, unsupportedFacts } from "@/lib/tailor/fact-check";
import { proposeChanges } from "@/lib/tailor/tailor";

const dev: Profile = {
  ...EMPTY_PROFILE,
  name: "Sam Rivera",
  headline: "Full-stack Software Developer",
  summary: "Full-stack developer with three years building web applications in JavaScript and Node.js. Enjoys tracking down hard bugs.",
  experience: [
    {
      id: "e1", title: "Software Developer", company: "Pixelworks", location: "Austin", start: "Jan 2022", end: "Present",
      bullets: [
        "Built React dashboards used by 300 customers",
        "Wrote REST APIs in Node.js and Express backed by PostgreSQL",
        "Organised the weekly team lunch",
        "Debugged memory leaks in a Node.js data processing service, cutting RAM use by 40%",
        "Set up Linux servers and Docker deployments",
      ],
    },
    { id: "e2", title: "Junior Developer", company: "Webmill", location: "Austin", start: "Jun 2020", end: "Dec 2021", bullets: ["Built landing pages in HTML and CSS", "Fixed browser bugs in JavaScript"] },
  ],
  education: [{ id: "d1", school: "State University", degree: "BSc Computer Science", start: "2016", end: "2020", details: [] }],
  skills: ["JavaScript", "TypeScript", "React", "Node.js", "Express", "PostgreSQL", "Docker", "Linux", "Git", "HTML", "CSS"],
  projects: [
    { id: "p1", name: "Portfolio site", link: "", bullets: ["Built a Next.js portfolio with React and Tailwind"] },
    { id: "p2", name: "Log parser", link: "", bullets: ["Wrote a Node.js tool that streams 2GB log files with constant memory on Linux"] },
  ],
};

const cJob: JobPost = {
  title: "Systems Engineer", company: "Lowlevel Ltd", location: "", salary: "", summary: "",
  requirements: [
    { text: "Strong C programming", kind: "must", keywords: ["C"] },
    { text: "Linux systems and debugging", kind: "must", keywords: ["Linux"] },
    { text: "Memory management and performance tuning", kind: "must", keywords: [] },
    { text: "Docker experience", kind: "nice", keywords: ["Docker"] },
  ],
  keywords: ["C", "Linux", "Docker", "Git"],
};
const jsJob: JobPost = {
  title: "Frontend Developer", company: "Webshop", location: "", salary: "", summary: "",
  requirements: [
    { text: "Experience with JavaScript and React", kind: "must", keywords: ["JavaScript", "React"] },
    { text: "Solid HTML and CSS", kind: "must", keywords: ["HTML", "CSS"] },
    { text: "Consuming REST APIs", kind: "nice", keywords: ["REST"] },
  ],
  keywords: ["JavaScript", "React", "TypeScript", "CSS"],
};

const all = (cs: Change[]) => cs.map((c) => ({ ...c, accepted: c.flags.length === 0 }));
const build = (post: JobPost, profile = dev) => applyChanges(profile, all(basicChanges(profile, post, scoreMatch(profile, post)).changes));
const numbers = (s: string) => new Set(s.match(/\d[\d,.]*/g) ?? []);
const text = (p: Profile) => JSON.stringify([p.headline, p.summary, p.experience, p.projects, p.skills, p.skillGroups]);

describe("job-specific tailoring (no AI)", () => {
  it("builds different CVs from the same profile for a C job and a JavaScript job", () => {
    const c = build(cJob);
    const js = build(jsJob);
    expect(text(c)).not.toBe(text(js));
    expect(c.skills.slice(0, 2)).toContain("Linux");
    expect(js.skills.slice(0, 6)).toEqual(expect.arrayContaining(["JavaScript", "React", "CSS"]));
    expect(js.skillGroups![0].skills[0]).toBe("JavaScript");
    expect(c.experience[0].bullets[0]).toMatch(/Linux|memory leaks/);
    expect(js.experience[0].bullets[0]).toMatch(/React|REST/);
    expect(c.summary).not.toBe(js.summary);
    expect(c.summary).toMatch(/memory|Linux/i);
    expect(js.summary).toMatch(/React/);
    // The C job leads with the log parser (memory, Linux); the JS job with the React portfolio.
    expect(c.projects[0].id).toBe("p2");
    expect(js.projects[0].id).toBe("p1");
    // Same employers either way; only presentation moved.
    expect(js.skillGroups?.map((g) => g.label)).toContain("Languages");
  });

  it("builds a summary only from the candidate's own sentences", () => {
    const owned = [dev.summary, ...dev.experience.flatMap((e) => e.bullets), ...dev.projects.flatMap((p) => p.bullets)].join(" ");
    for (const sentence of build(cJob).summary.split(/(?<=\.)\s+/)) expect(owned).toContain(sentence.replace(/\.$/, ""));
  });

  it("never claims a missing skill: C is not a skill, in a group, the headline or the summary", () => {
    const gaps = basicChanges(dev, cJob, scoreMatch(dev, cJob));
    const everything = applyChanges(dev, gaps.changes.map((c) => ({ ...c, accepted: true })));
    expect(everything.skills).not.toContain("C");
    expect(everything.skillGroups?.flatMap((g) => g.skills) ?? []).not.toContain("C");
    expect(containsTerm(everything.summary, "C")).toBe(false);
    expect(containsTerm(everything.headline, "C")).toBe(false);
    expect(/specialist|expert/i.test(everything.summary + everything.headline)).toBe(false);
    // …and it points the person at an honest way to earn it, outside the CV.
    expect(gaps.closeGaps.map((g) => g.skill)).toContain("C");
    expect(gaps.closeGaps[0].action).toMatch(/project|assessment/i);
    expect(text(everything)).not.toContain(gaps.closeGaps[0].action);
  });

  it("keeps every employer, title, date and number as in the source", () => {
    for (const post of [cJob, jsJob]) {
      const cv = applyChanges(dev, basicChanges(dev, post, scoreMatch(dev, post)).changes.map((c) => ({ ...c, accepted: true })));
      for (const e of dev.experience) {
        const out = cv.experience.find((x) => x.id === e.id)!;
        expect([out.title, out.company, out.start, out.end]).toEqual([e.title, e.company, e.start, e.end]);
      }
      const original = numbers(text(dev));
      for (const n of numbers(text(cv))) expect(original.has(n)).toBe(true);
      expect(cv.name).toBe(dev.name);
      expect(cv.education).toEqual(dev.education);
      // Nothing dropped or added silently when everything is on: same bullets, same projects.
      expect(cv.experience.flatMap((e) => e.bullets).length).toBeGreaterThanOrEqual(dev.experience.flatMap((e) => e.bullets).length - 1);
      expect(cv.projects.map((p) => p.id).sort()).toEqual(["p1", "p2"]);
      expect([...cv.skills].sort().filter((s) => !dev.skills.includes(s))).toEqual([]);
    }
  });

  it("offers trims and role reordering as optional, off by default", () => {
    const changes = basicChanges(dev, cJob, scoreMatch(dev, cJob)).changes;
    for (const c of changes.filter((x) => x.optional)) expect(c.accepted).toBe(false);
    const withoutOptional = applyChanges(dev, changes);
    expect(withoutOptional.experience.map((e) => e.id)).toEqual(["e1", "e2"]);
  });

  it("swaps Developer for Engineer in the headline when the job title says so", () => {
    const eng = { ...jsJob, title: "Software Engineer" };
    const cv = build(eng);
    expect(cv.headline).toBe("Full-stack Software Engineer");
    expect(build(cJob).headline).toBe("Full-stack Software Engineer");
    expect(build(jsJob).headline).toBe(dev.headline);
  });

  it("works for the Customer Success sample too", () => {
    const cv = heuristicProfile(readFileSync("tests/fixtures/cv.txt", "utf8"));
    const post = heuristicJob(readFileSync("tests/fixtures/job.txt", "utf8"));
    const out = build(post, cv);
    expect(out.summary).toMatch(/churn|Zendesk|onboard/i);
    expect(out.experience[0].bullets[0]).toMatch(/Zendesk|Onboarded|churn/);
    const gaps = basicChanges(cv, post, scoreMatch(cv, post)).closeGaps.map((g) => g.skill);
    expect(gaps).toEqual(expect.arrayContaining(["HubSpot"]));
    expect(unsupportedFacts(out.summary, cv)).toEqual([]);
  });
});

describe("the fact check on rewritten CV text", () => {
  it("blocks C, one-letter languages, invented skills and unearned standing", () => {
    expect(unsupportedCvFacts("C specialist with deep systems experience", dev)).toEqual(expect.arrayContaining(["C", "specialist"]));
    expect(unsupportedCvFacts("Developer fluent in C and Node.js", dev)).toContain("C");
    expect(unsupportedCvFacts("Senior Rust expert", dev).length).toBeGreaterThan(1);
    expect(unsupportedCvFacts("Led a team of 12 engineers", dev)).toContain("12");
    expect(unsupportedCvFacts("Debugged memory leaks in a Node.js data processing service, cutting RAM use by 40%", dev)).toEqual([]);
    // A headline may say Engineer for Developer, but not add a tool or seniority.
    expect(unsupportedCvFacts("Full-stack Software Engineer", dev, { allowRoleNouns: true })).toEqual([]);
    expect(unsupportedCvFacts("Senior Software Engineer", dev, { allowRoleNouns: true })).toContain("Senior");
    expect(unsupportedCvFacts("C Engineer", dev, { allowRoleNouns: true })).toContain("C");
  });
});

describe("AI proposal handling", () => {
  afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });
  const mocked = (data: unknown) => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(data) } }] })));
  };
  const proposal = (over: Record<string, unknown>) => ({
    headline: { after: "", reason: "" }, summary: { after: "", reason: "" }, bullets: [], bulletOrders: [], skillGroups: [], ...over,
  });

  it("blocks injected invented claims and leaves them out of the CV", async () => {
    mocked(proposal({
      headline: { after: "C Systems Engineer", reason: "fits" },
      summary: { after: "Senior C specialist with 12 years of embedded experience at Google.", reason: "fits" },
      bullets: [
        { experienceId: "e1", index: 0, after: "Built C modules used by 5000 customers", reason: "x" },
        { experienceId: "e1", index: 3, after: "Debugged memory leaks in a Node.js data processing service, cutting RAM use by 40%", reason: "unchanged wording is ignored" },
        { experienceId: "e1", index: 4, after: "Provisioned Linux servers and Docker deployments", reason: "wording only" },
      ],
      skillGroups: [{ label: "C & Linux", skills: ["Linux", "C", "Docker", "Git", "JavaScript", "Node.js"] }, { label: "Languages", skills: ["JavaScript", "C"] }],
    }));
    const match = scoreMatch(dev, cJob);
    const { changes, method } = await proposeChanges(dev, cJob, match);
    expect(method).toBe("ai");
    const blocked = changes.filter((c) => c.flags.length > 0);
    expect(blocked.map((c) => c.kind).sort()).toEqual(["bullet", "headline", "summary"]);
    expect(blocked.every((c) => !c.accepted)).toBe(true);
    // The fact check blocks them, and an accepted blocked change is still ignored.
    const cv = applyChanges(dev, changes.map((c) => ({ ...c, accepted: true })));
    expect(cv.headline).toBe(dev.headline);
    expect(cv.experience[0].bullets.join(" ")).not.toMatch(/C modules|5000/);
    expect(cv.skills).not.toContain("C");
    expect((cv.skillGroups ?? []).flatMap((g) => g.skills)).not.toContain("C");
    expect((cv.skillGroups ?? []).map((g) => g.label)).not.toContain("C & Linux");
    expect(containsTerm(cv.summary, "C")).toBe(false);
    expect(cv.summary).not.toMatch(/Senior|12 years|Google/);
    // The harmless wording change went through; the plain-code summary replaced the blocked one.
    expect(cv.experience[0].bullets).toContain("Provisioned Linux servers and Docker deployments");
    expect(cv.summary.length).toBeGreaterThan(0);
  });

  it("only accepts close-the-gap advice for skills that really are missing", async () => {
    mocked(proposal({ closeGaps: [{ skill: "C", action: "Write a small C program that parses a file, then take a C assessment.", describeAs: "Built a small C parser." }, { skill: "Linux", action: "Learn Linux", describeAs: "x" }, { skill: "Rust", action: "Learn Rust", describeAs: "x" }] }));
    const { closeGaps } = await proposeChanges(dev, cJob, scoreMatch(dev, cJob));
    expect(closeGaps.map((g) => g.skill)).toEqual(["C"]);
    expect(closeGaps[0].action).toContain("small C program");
  });

  it("uses a good AI rewrite and still fills in ordering the model skipped", async () => {
    mocked(proposal({
      summary: { after: "Full-stack developer who debugs Node.js services on Linux and keeps memory use low across data processing work.", reason: "leads with systems work" },
      headline: { after: "Full-stack Software Engineer", reason: "role family" },
    }));
    const { changes } = await proposeChanges(dev, cJob, scoreMatch(dev, cJob));
    expect(changes.filter((c) => c.flags.length)).toEqual([]);
    const kinds = changes.map((c) => c.kind);
    expect(kinds).toEqual(expect.arrayContaining(["summary", "headline", "bullet-order", "projects-order", "skills-groups"]));
    const cv = applyChanges(dev, changes.filter((c) => !c.optional));
    expect(cv.headline).toBe("Full-stack Software Engineer");
    expect(cv.summary).toMatch(/Linux/);
  });

  it("falls back to the plain-code rebuild when the model fails", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "test-key");
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.stubGlobal("fetch", vi.fn(async () => new Response("{}", { status: 429 })));
    const { changes, method } = await proposeChanges(dev, cJob, scoreMatch(dev, cJob));
    expect(method).toBe("basic");
    expect(changes.some((c) => c.kind === "summary")).toBe(true);
  });
});

describe("close-the-gap advice", () => {
  it("fits the kind of requirement", async () => {
    const { basicCloseGaps } = await import("@/lib/tailor/basic");
    const [c, hub, jp, cert] = basicCloseGaps(["C", "HubSpot", "Japanese", "AWS Certified"]).concat(basicCloseGaps(["AWS Certified"]));
    expect(c.action).toMatch(/small, real project in C/);
    expect(hub.action).toMatch(/course or assessment/);
    expect(jp.action).toMatch(/test/);
    expect(cert.action).toMatch(/official route/);
  });
});
