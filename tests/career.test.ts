import { afterEach, describe, expect, it, vi } from "vitest";
import { EMPTY_PROFILE, CV_SECTIONS, type Change } from "@/lib/model/types";
import { heuristicJob } from "@/lib/jobs/heuristic";
import { assessRequirement, careerFingerprint, evidenceFit, sourceRequirements } from "@/lib/career/evidence";
import { buildApplicationPlan } from "@/lib/career/plan";
import { gapRoadmap } from "@/lib/career/roadmap";
import { adaptQuestion, interviewBank, mockCurriculum } from "@/lib/career/questions";
import { evaluateMockAnswer, mockReport, nextDifficulty } from "@/lib/career/mock";
import { unsupportedExperienceClaims, unsupportedFacts } from "@/lib/tailor/fact-check";
import { applyChanges } from "@/lib/tailor/apply";
import { answerFeedback } from "@/lib/tailor/interview";

const profile = { ...EMPTY_PROFILE, name: "Alex Example", skills: ["JavaScript", "SQL"], projects: [{ id: "p1", name: "Application tracker", link: "https://tracker.example.com", bullets: ["Built a JavaScript tracker and tested invalid input.", "Tech Stack: SQL"] }, { id: "p2", name: "Second project", link: "", bullets: ["Documented a small experiment."] }] };
const postText = "Job title: Python Developer\nCompany: Example Company\nRequirements\n- Python programming is required.\n- At least 3 years of Python experience.\n- Bachelor degree in computer science.\n- Experience with JavaScript and Django.\nPreferred\n- Docker knowledge is preferred.\nResponsibilities\n- Build REST APIs and investigate failures.\nBenefits\n- Paid training and a friendly team.";
const context = { profile, postText, post: heuristicJob(postText) };
const company = { sources: [], facts: [], warning: "No company sources." };
const mocked = (data: unknown) => { vi.stubEnv("OPENROUTER_API_KEY", "test-key"); vi.stubGlobal("fetch", vi.fn(async () => Response.json({ choices: [{ finish_reason: "stop", message: { content: JSON.stringify(data) } }] }))); };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

describe("evidence-led application plans", () => {
  it("maps required, preferred, qualification, tenure and responsibility lines without scoring benefits", () => {
    const rows = sourceRequirements(postText, context.post);
    expect(rows).toHaveLength(6);
    expect(rows.find((r) => r.text.includes("Bachelor"))?.category).toBe("qualification");
    expect(rows.find((r) => r.text.includes("3 years"))?.category).toBe("experience");
    expect(rows.find((r) => r.text.includes("Docker"))?.priority).toBe("preferred");
    expect(rows.find((r) => r.text.includes("REST"))?.category).toBe("responsibility");
    expect(rows.some((r) => r.text.includes("Paid training"))).toBe(false);
  });
  it("does not turn a technology list, a negative statement or a project title into practical evidence", () => {
    const row = { text: "Python programming required", quote: "Python programming required", priority: "must" as const, category: "skill" as const, skills: ["Python"] };
    expect(assessRequirement(row, profile).status).toBe("missing");
    expect(assessRequirement(row, { ...profile, skills: ["Python"] }).status).toBe("listed");
    expect(assessRequirement(row, { ...profile, projects: [{ id: "p", name: "Python project", link: "", bullets: ["Tech Stack: Python", "Built a tracker."] }] }).status).toBe("listed");
    expect(assessRequirement(row, { ...profile, projects: [{ id: "p", name: "Tracker", link: "", bullets: ["I have never used Python."] }] }).status).toBe("missing");
    expect(assessRequirement(row, { ...profile, projects: [{ id: "p", name: "Tracker", link: "", bullets: ["Built and tested a Python tracker."] }] }).status).toBe("shown");
  });
  it("never treats a named skill as proof of required tenure", () => {
    const row = sourceRequirements(postText, context.post).find((r) => r.text.includes("3 years"))!;
    const result = assessRequirement(row, { ...profile, skills: ["Python"] });
    expect(result.status).toBe("unclear");
    expect(result.explanation).toContain("Duration");
    expect(evidenceFit([result]).score).toBe(0);
  });
  it("prioritises the actual missing skill in a mixed requirement and never changes candidate facts", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const before = JSON.stringify(profile);
    const plan = await buildApplicationPlan(context, company);
    const mixed = plan.requirements.find((r) => r.text.includes("JavaScript and Django"))!;
    expect(mixed.unprovenSkills).toContain("Django");
    expect(gapRoadmap([mixed])[0].skill).toBe("Django");
    expect(plan.roadmap[0].resources[0].url).toBe("https://docs.python.org/3/tutorial/");
    expect(plan.fit.score).toBeLessThan(100);
    expect(plan.fit.explanation).toContain("not a hiring probability");
    expect(JSON.stringify(profile)).toBe(before);
    expect(careerFingerprint({ ...context, profile: { ...profile, summary: "A change" } })).not.toBe(plan.fingerprint);
  });
  it("rejects invented source quotations and overlapping AI rows that would inflate coverage", async () => {
    mocked({ requirements: [{ quote: "The candidate has ten years of Python expertise.", skills: ["Python"], category: "skill", priority: "must" }, { quote: "Python programming is required.", skills: ["Python"], category: "skill", priority: "must" }], expectations: [{ quote: "This source text does not exist", text: "Guaranteed interview", inferred: false }], learning: [] });
    const plan = await buildApplicationPlan(context, company);
    expect(plan.requirements).toHaveLength(6);
    expect(plan.requirements.some((r) => /ten years/.test(r.text))).toBe(false);
    expect(plan.expectations).toHaveLength(0);
  });
  it("uses role-appropriate practice for communication and keeps tenure verification separate from Python tutorials", () => {
    const text = "Requirements\n- Python programming is required.\n- 3 years of Python experience.\n- Strong written communication.\nResponsibilities\n- Build reliable APIs for customer-facing products.";
    const rows = sourceRequirements(text, heuristicJob(text)).map((r) => assessRequirement(r, profile));
    const roadmap = gapRoadmap(rows);
    expect(roadmap.some((t) => t.skill.startsWith("Verify:") && t.skill.includes("3 years"))).toBe(true);
    const communication = roadmap.find((t) => t.skill === "Communication")!;
    expect(communication.exercise).toContain("one-page explanation");
    expect(communication.steps.join()).not.toContain("official documentation");
    expect(communication.acceptance.join()).not.toContain("runnable code");
    expect(roadmap.find((t) => t.skill.includes("APIs"))?.exercise).not.toContain("eligibility");
  });
});

describe("truthful tailoring and feedback", () => {
  it("blocks a missing skill even at sentence start or in lowercase; job requirements cannot justify personal claims", () => {
    expect(unsupportedFacts("Python development specialist", profile)).toContain("Python");
    expect(unsupportedFacts("built python services", profile)).toContain("Python");
    expect(unsupportedExperienceClaims("I have used Python professionally.", profile)).toContain("Python");
    expect(unsupportedExperienceClaims("I have not used Python professionally and would learn it.", profile)).toEqual([]);
  });
  it("does not allow the question or job description to supply experience for a personal rewrite", async () => {
    mocked({ rubric: ["correctness", "depth", "communication", "confidence", "relevance"].map((criterion) => ({ criterion, score: 3, note: "Explain your actual level." })), strengths: [], improvements: ["Explain your current level."], corrections: [], modelAnswer: "[Explain your actual level.]", improvedAnswer: "I have used Python professionally.", followUp: "What have you actually tried so far?" });
    const feedback = await answerFeedback("Have you used Python?", "I have only used JavaScript.", profile, context.post);
    expect(feedback.method).toBe("ai");
    expect(feedback.rewrite).not.toContain("used Python professionally");
    expect(feedback.improve.join()).toContain("unsupported");
  });
  it("rewrites and reorders real projects and sections without mutating the source or restoring stale text", () => {
    const base = { reason: "Relevant evidence", flags: [], accepted: true };
    const changes: Change[] = [
      { ...base, id: "c1", kind: "project-bullet", projectId: "p1", index: 0, before: profile.projects[0].bullets[0], after: "Tested invalid input in a JavaScript tracker." },
      { ...base, id: "c2", kind: "projects-order", order: ["p2", "p1"] },
      { ...base, id: "c3", kind: "section-order", order: ["projects", ...CV_SECTIONS.filter((s) => s !== "projects")] },
    ];
    const cv = applyChanges(profile, changes);
    expect(cv.projects[0].id).toBe("p2");
    expect(cv.projects[1].bullets[0]).toBe("Tested invalid input in a JavaScript tracker.");
    expect(cv.sectionOrder?.[0]).toBe("projects");
    expect(profile.projects[0].bullets[0]).toContain("Built");
    expect(applyChanges({ ...profile, projects: [{ ...profile.projects[0], bullets: ["Updated source."] }] }, changes).projects[0].bullets[0]).toBe("Updated source.");
  });
});

describe("realistic interview practice", () => {
  it("covers all skills and projects, role gaps, practical assessments and closing questions", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const plan = await buildApplicationPlan(context, company);
    const bank = interviewBank(context, plan);
    for (const skill of profile.skills) expect(bank.some((q) => q.coverage?.includes(skill))).toBe(true);
    for (const project of profile.projects) expect(bank.some((q) => q.kind === "project" && q.source.includes(project.name))).toBe(true);
    expect(bank.some((q) => q.kind === "coding")).toBe(true);
    expect(bank.some((q) => q.kind === "gap" && q.question.includes("Python"))).toBe(true);
    const queue = mockCurriculum(bank);
    expect(queue[0].kind).toBe("introduction");
    expect(queue.at(-1)?.kind).toBe("closing");
    expect(queue.length).toBeLessThanOrEqual(9);
  });
  it("provides an unscored checklist when AI is unavailable instead of inventing technical grades", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const plan = await buildApplicationPlan(context, company);
    const q = interviewBank(context, plan).find((q) => q.kind === "technical")!;
    const feedback = await evaluateMockAnswer(q, "I built a JavaScript tracker.", context, []);
    expect(feedback.method).toBe("checklist");
    expect(feedback.score).toBeNull();
    expect(feedback.rubric.every((r) => r.score === null)).toBe(true);
    expect(feedback.rubric.map((r) => r.note).join()).toContain("not been executed");
    expect(mockReport([{ id: "t", question: q, answer: "A starting point", feedback, followUpDepth: 0 }]).overall).toBeNull();
  });
  it("adapts actual question wording, not just a difficulty badge", () => {
    const q = { id: "q", kind: "technical" as const, question: "Explain a queue.", assesses: "Concept", expected: [], source: "JD", difficulty: 2 as const };
    expect(adaptQuestion(q, 3).question).toContain("compare two approaches");
    expect(adaptQuestion(q, 1).question).toContain("one small example");
    expect(nextDifficulty(2, { score: 4.5 } as never)).toBe(3);
    expect(nextDifficulty(2, { score: null } as never)).toBe(2);
  });
  it("validates all rubric criteria and prevents AI personal rewrites from borrowing missing job skills", async () => {
    mocked({ rubric: ["correctness", "depth", "communication", "confidence", "relevance"].map((criterion) => ({ criterion, score: 4, note: "A detail from the answer." })), strengths: ["Clear example"], improvements: ["Add a trade-off"], corrections: [], modelAnswer: "[Use your actual example.]", improvedAnswer: "I have used Python professionally.", followUp: "How would you test your approach?" });
    const question = { id: "q", kind: "behavioural" as const, question: "Describe your work.", assesses: "Contribution", expected: [], source: "CV", difficulty: 2 as const };
    const feedback = await evaluateMockAnswer(question, "I built a JavaScript tracker.", context, []);
    expect(feedback.method).toBe("ai");
    expect(feedback.score).toBe(4);
    expect(feedback.improvedAnswer).not.toContain("Python");
    expect(feedback.improvements.join()).toContain("unsupported");
  });
});

describe("both fit checks agree", () => {
  it("full analysis recognises 'Kept churn under 3%' as evidence for 'Experience reducing churn'", async () => {
    const { readFileSync } = await import("node:fs");
    const { heuristicProfile } = await import("@/lib/cv/heuristic");
    const { scoreMatch } = await import("@/lib/match/score");
    const cv = heuristicProfile(readFileSync("tests/fixtures/cv.txt", "utf8"));
    const text = readFileSync("tests/fixtures/job.txt", "utf8");
    const post = heuristicJob(text);
    const instant = scoreMatch(cv, post).requirements.find((r) => /reducing churn/i.test(r.text))!;
    const row = sourceRequirements(text, post).find((r) => /reducing churn/i.test(r.text))!;
    const full = assessRequirement(row, cv);
    expect(instant.status).toBe("shown");
    expect(full.status).toBe("shown");
    expect(full.evidence.join(" ")).toContain("Kept churn under 3%");
  });

  it("does not over-reach: an unrelated requirement stays unverified", () => {
    const row = sourceRequirements("Requirements\n- Experience negotiating enterprise contracts", heuristicJob(""))[0];
    expect(assessRequirement(row, profile).status).not.toBe("shown");
  });
});
