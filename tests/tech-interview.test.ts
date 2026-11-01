import { afterEach, describe, expect, it, vi } from "vitest";
import { withSkillEvidence } from "@/lib/cv/skill-evidence";
import { buildApplicationPlan } from "@/lib/career/plan";
import { interviewBank, mockCurriculum } from "@/lib/career/questions";
import { TECH_BANK, techFor } from "@/lib/career/tech-bank";
import { isTechnicalRole, technicalQuestions } from "@/lib/career/tech-questions";
import { EMPTY_PROFILE, type JobPost, type Profile, type SkillLevel } from "@/lib/model/types";
import { interviewQuestions } from "@/lib/tailor/interview";
import { scoreMatch } from "@/lib/match/score";

afterEach(() => vi.unstubAllEnvs());

const dev: Profile = {
  ...EMPTY_PROFILE,
  name: "Sam Rivera",
  headline: "Full-stack Software Developer",
  experience: [{ id: "e1", title: "Software Developer", company: "Pixelworks", location: "", start: "2022", end: "Present", bullets: ["Built React dashboards used by 300 customers", "Wrote REST APIs in Node.js backed by PostgreSQL"] }],
  skills: ["JavaScript", "TypeScript", "React", "Node.js", "Git"],
  projects: [{ id: "p1", name: "Log parser", link: "", bullets: ["Wrote a Node.js tool that streams 2GB log files"] }],
};
const cJob: JobPost = {
  title: "Systems Software Engineer", company: "Lowlevel Ltd", location: "", salary: "", summary: "",
  requirements: [{ text: "Strong C programming", kind: "must", keywords: ["C"] }, { text: "Docker experience", kind: "nice", keywords: ["Docker"] }],
  keywords: ["C", "Docker", "Git"],
};
const withC = (level: SkillLevel): Profile => {
  const r = withSkillEvidence(dev, { skill: "C", experienceId: "", sentence: level === "work" || level === "project" ? "Wrote a small shell in C for a systems project" : "", level });
  if ("error" in r) throw new Error(r.error);
  return r.profile;
};
const ctx = (profile: Profile, post = cJob) => ({ profile, post, postText: `Job title: ${post.title}\n${post.requirements.map((r) => r.text).join("\n")}` });
const bankFor = async (profile: Profile) => {
  vi.stubEnv("OPENROUTER_API_KEY", "");
  const context = ctx(profile);
  return { context, bank: interviewBank(context, await buildApplicationPlan(context, { sources: [], facts: [], warning: null })) };
};

describe("curated technology bank", () => {
  it("covers the common languages and tools, each with fundamentals, applied questions and CV follow-ups", () => {
    for (const name of ["C", "C++", "Java", "Python", "JavaScript", "TypeScript", "React", "Node.js", "SQL", "Git", "Docker"]) {
      const t = techFor(name)!;
      expect(t, name).toBeDefined();
      expect(t.fundamentals.length, name).toBeGreaterThan(0);
      expect(t.applied.length, name).toBeGreaterThan(0);
      expect(t.followUps.length, name).toBeGreaterThan(0);
      for (const [q, expected] of [...t.fundamentals, ...t.applied, ...t.followUps]) { expect(q.endsWith("?") || q.endsWith(".")).toBe(true); expect(expected.length).toBeGreaterThanOrEqual(2); }
    }
    expect(TECH_BANK.length).toBeGreaterThanOrEqual(11);
  });
  it("never mixes up look-alike names", () => {
    expect(techFor("Java")!.name).toBe("Java");
    expect(techFor("JavaScript")!.name).toBe("JavaScript");
    expect(techFor("C")!.name).toBe("C");
    expect(techFor("C++")!.name).toBe("C++");
    expect(techFor("C (learning)")!.name).toBe("C");
    expect(techFor("Excel")).toBeUndefined();
  });
});

describe("technical interview questions", () => {
  it("asks the C questions an interviewer asks after seeing C on a CV", async () => {
    const { bank } = await bankFor(withC("project"));
    const c = bank.filter((q) => q.tech === "C").map((q) => q.question).join("\n");
    for (const word of [/pointer/i, /malloc/i, /undefined behaviour/i, /compil/i, /free|leak/i]) expect(c).toMatch(word);
  });

  it("matches depth to the declared level: fundamentals for learning and practice, applied for project and work", async () => {
    const learning = (await bankFor(withC("learning"))).bank.filter((q) => q.tech === "C" && q.origin === "declared");
    const project = (await bankFor(withC("project"))).bank.filter((q) => q.tech === "C" && q.origin === "declared");
    expect(learning[0].question).toMatch(/current level in C honestly/);
    expect(learning[0].difficulty).toBe(1);
    expect(Math.max(...learning.map((q) => q.difficulty))).toBeLessThanOrEqual(2);
    expect(learning.every((q) => q.level === "learning")).toBe(true);
    expect(project[0].question).toMatch(/where you used C/);
    expect(Math.max(...project.map((q) => q.difficulty))).toBe(3);
    // A learner is not asked the design-level questions up front.
    expect(learning.some((q) => /Design a small function/.test(q.question))).toBe(false);
    expect(project.some((q) => /Design a small function/.test(q.question))).toBe(true);
  });

  it("covers the job's stack even when it is not on the CV, and the candidate's own CV stack and projects", async () => {
    const { bank } = await bankFor(dev);
    const techs = new Set(bank.map((q) => q.tech).filter(Boolean));
    for (const t of ["C", "Docker", "Git", "React", "Node.js", "JavaScript", "TypeScript"]) expect(techs.has(t), t).toBe(true);
    expect(bank.find((q) => q.tech === "C")!.origin).toBe("job");
    expect(bank.find((q) => q.tech === "React")!.origin).toBe("cv");
    expect(bank.some((q) => q.kind === "project" && /Log parser/.test(q.question) && /Node\.js/.test(q.question))).toBe(true);
  });

  it("puts the candidate's declared skill first, then the job's stack, then the CV", async () => {
    const { context, bank } = await bankFor(withC("learning"));
    const order = [...new Set(technicalQuestions(context).filter((q) => q.kind === "technical").map((q) => q.origin))];
    expect(order).toEqual(["declared", "job", "cv"]);
    expect(bank.length).toBeGreaterThan(0);
  });

  it("makes about half of a technical role's mock interview technical, and keeps the behavioural and role questions", async () => {
    const { context, bank } = await bankFor(withC("learning"));
    expect(isTechnicalRole(context.post)).toBe(true);
    const queue = mockCurriculum(bank);
    const technical = queue.filter((q) => q.kind === "technical");
    expect(technical.length).toBeGreaterThanOrEqual(5);
    expect(technical.length / queue.length).toBeGreaterThanOrEqual(0.35);
    expect(technical.length / queue.length).toBeLessThanOrEqual(0.6);
    expect(queue[0].kind).toBe("introduction");
    expect(queue.at(-1)!.kind).toBe("closing");
    for (const kind of ["behavioural", "scenario", "gap"] as const) expect(queue.some((q) => q.kind === kind), kind).toBe(true);
    expect(technical[0].tech).toBe("C");
    expect(technical.some((q) => q.tech === "Docker")).toBe(true);
    // Another attempt still covers the same stack but may open on different questions.
    expect(new Set(mockCurriculum(bank, 1).filter((q) => q.kind === "technical").map((q) => q.tech)).has("C")).toBe(true);
  });

  it("has the same mix in question practice, with no AI", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const profile = withC("learning");
    const questions = await interviewQuestions(profile, cJob, scoreMatch(profile, cJob), ctx(profile).postText);
    const technical = questions.filter((q) => q.prompt?.kind === "technical");
    expect(technical.length).toBeGreaterThanOrEqual(5);
    expect(technical[0].prompt!.tech).toBe("C");
    expect(questions.some((q) => q.prompt?.kind === "behavioural")).toBe(true);
    expect(questions.some((q) => q.prompt?.kind === "introduction")).toBe(true);
  });

  it("asks a non-technical role mostly role questions", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const post: JobPost = { title: "Customer Support Lead", company: "Helpful", location: "", salary: "", summary: "", requirements: [{ text: "Zendesk experience", kind: "must", keywords: ["Zendesk"] }], keywords: ["Zendesk"] };
    const profile: Profile = { ...EMPTY_PROFILE, name: "A B", skills: ["Zendesk"], experience: [{ id: "e", title: "Agent", company: "X", location: "", start: "", end: "", bullets: ["Answered tickets in Zendesk"] }] };
    const context = ctx(profile, post);
    expect(isTechnicalRole(post)).toBe(false);
    const queue = mockCurriculum(interviewBank(context, await buildApplicationPlan(context, { sources: [], facts: [], warning: null })));
    expect(queue.filter((q) => q.kind === "technical").length).toBeLessThanOrEqual(2);
  });
});
