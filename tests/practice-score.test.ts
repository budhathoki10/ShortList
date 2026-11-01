import { afterEach, describe, expect, it, vi } from "vitest";
import { evaluateMockAnswer, mockReport } from "@/lib/career/mock";
import { aiPracticeScore, clampScore, coverageOf, heuristicPractice, isValidScore, practiceReport } from "@/lib/career/scoring";
import type { CareerQuestion, MockFeedback, MockTurn } from "@/lib/career/types";
import { EMPTY_PROFILE } from "@/lib/model/types";

afterEach(() => vi.unstubAllEnvs());

const question: CareerQuestion = {
  id: "q", kind: "technical", tech: "C", origin: "declared", difficulty: 1, source: "x", assesses: "x",
  question: "What is a pointer in C, and what is the difference between a pointer to an int and an int?",
  expected: ["A pointer holds a memory address", "Dereferencing with *, taking an address with &", "The pointer's type tells the compiler how to read what it points to"],
};
const good = "A pointer in C holds a memory address, so a pointer to an int is not the int itself. For example, int x = 5; int *p = &x; stores the address of x in p, and *p dereferences it to read 5. The type of the pointer tells the compiler how to read the bytes it points to, which is why an int pointer and a char pointer behave differently. I wrote a small linked list with it, and passing a pointer lets a function change the caller's data.";

describe("score bounds", () => {
  it("keeps every score a whole number from 0 to 100", () => {
    expect(clampScore(72.6)).toBe(73);
    expect(clampScore(-5)).toBe(0);
    expect(clampScore(250)).toBe(100);
    expect(clampScore(NaN)).toBe(0);
    expect(clampScore("90" as unknown)).toBe(0);
    expect(isValidScore(100)).toBe(true);
    expect(isValidScore(101)).toBe(false);
    expect(isValidScore(50.5)).toBe(false);
  });
  it("turns an AI rubric into a bounded score, and stops a technical answer outscoring its correctness", () => {
    const rubric = (s: number, correctness = s) => ["correctness", "depth", "communication", "confidence", "relevance"].map((criterion) => ({ criterion, score: criterion === "correctness" ? correctness : s }));
    expect(aiPracticeScore(rubric(5), true).score).toBe(100);
    expect(aiPracticeScore(rubric(1), true).score).toBe(20);
    expect(aiPracticeScore(rubric(4, 1), true).score).toBe(40);
    expect(aiPracticeScore(rubric(4, 1), false).score).toBeGreaterThan(40);
    expect(aiPracticeScore(rubric(99), true).score).toBeLessThanOrEqual(100);
    expect(aiPracticeScore([], false).score).toBe(0);
    for (const s of [aiPracticeScore(rubric(3), true), aiPracticeScore(rubric(2, 5), true)]) expect(isValidScore(s.score) && isValidScore(s.communication)).toBe(true);
  });
});

describe("plain-code estimate", () => {
  it("is bounded, capped at 90 and zero for an empty answer", () => {
    expect(heuristicPractice(question, "").score).toBe(0);
    expect(heuristicPractice(question, "no").score).toBe(0);
    const best = heuristicPractice(question, good);
    expect(isValidScore(best.score)).toBe(true);
    expect(best.score).toBeLessThanOrEqual(90);
  });
  it("rewards covering the key points, structure and concrete detail, and orders answers sensibly", () => {
    const strong = heuristicPractice(question, good).score;
    const vague = heuristicPractice(question, "It is a thing in the language that you use for stuff sometimes, I think.").score;
    const short = heuristicPractice(question, "A pointer holds an address.").score;
    const offTopic = heuristicPractice(question, "I enjoy working with teams and I am a quick learner who likes to communicate openly with everyone around me every day.").score;
    expect(strong).toBeGreaterThan(short);
    expect(short).toBeGreaterThan(vague);
    expect(strong).toBeGreaterThan(offTopic + 25);
    expect(strong).toBeGreaterThanOrEqual(65);
    expect(vague).toBeLessThan(25);
  });
  it("shows its working", () => {
    const { parts, score } = heuristicPractice(question, good);
    expect(parts.coverage + parts.relevance + parts.length + parts.structure + parts.detail).toBeGreaterThan(0);
    expect(parts.coverage).toBeLessThanOrEqual(40);
    expect(Math.abs(parts.coverage + parts.relevance + parts.length + parts.structure + parts.detail - score)).toBeLessThanOrEqual(3);
    expect(coverageOf(question.expected, good).covered).toHaveLength(3);
    expect(coverageOf(question.expected, "I like cats").missed).toHaveLength(3);
  });
  it("takes points off for a known mistake", () => {
    expect(heuristicPractice(question, good, ["A pointer is not an int"]).score).toBe(heuristicPractice(question, good).score - 10);
  });
});

describe("report", () => {
  const turn = (id: string, kind: CareerQuestion["kind"], score: number, comm = 70, method: "ai" | "estimate" = "estimate", note = "Add an example."): MockTurn => ({
    id, answer: "a", followUpDepth: 0, question: { ...question, id, kind, question: `Question ${id}?` },
    feedback: { method: method === "ai" ? "ai" : "checklist", score: null, practiceScore: score, communicationScore: comm, scoreMethod: method, rubric: [], strengths: [], improvements: [note], corrections: [], modelAnswer: "", improvedAnswer: "", followUp: "x" } as MockFeedback,
  });
  it("gives one overall number, area scores, and the weakest answers to revisit", () => {
    const r = practiceReport([turn("a", "introduction", 80), turn("b", "technical", 40), turn("c", "technical", 50), turn("d", "scenario", 60), turn("e", "behavioural", 90), turn("f", "closing", 30)]);
    expect(r.score).toBe(58);
    expect(r.method).toBe("estimate");
    expect(Object.fromEntries(r.areas.map((a) => [a.key, a.score]))).toEqual({ technical: 45, problem: 60, communication: 70, role: 67 });
    expect(r.improve.map((i) => i.turnId)).toEqual(["f", "b", "c"]);
    expect(r.improve[0]).toMatchObject({ score: 30, question: "Question f?" });
    expect(r.improve.every((i) => i.note.length > 0)).toBe(true);
  });
  it("labels mixed and AI sessions, skips unscored answers, and handles an empty session", () => {
    expect(practiceReport([turn("a", "technical", 80, 70, "ai"), turn("b", "technical", 60, 70, "ai")]).method).toBe("ai");
    expect(practiceReport([turn("a", "technical", 80, 70, "ai"), turn("b", "technical", 60)]).method).toBe("mixed");
    const old = { ...turn("o", "technical", 10), feedback: { ...turn("o", "technical", 10).feedback!, practiceScore: undefined } };
    expect(practiceReport([old]).score).toBeNull();
    expect(practiceReport([]).score).toBeNull();
    expect(practiceReport([turn("a", "technical", 95)]).improve).toEqual([]);
  });
  it("is saved in the mock report the session stores", () => {
    const report = mockReport([turn("a", "technical", 64), turn("b", "closing", 70)]);
    expect(report.practice?.score).toBe(67);
    expect(JSON.parse(JSON.stringify(report)).practice.areas.length).toBeGreaterThan(0);
  });
});

describe("answers scored without AI", () => {
  it("attaches an estimate to checklist feedback", async () => {
    vi.stubEnv("OPENROUTER_API_KEY", "");
    const profile = { ...EMPTY_PROFILE, name: "A B", skills: ["C (learning)"] };
    const fb = await evaluateMockAnswer(question, good, { profile, post: { title: "Dev", company: "", location: "", salary: "", summary: "", requirements: [], keywords: [] }, postText: "" }, []);
    expect(fb.method).toBe("checklist");
    expect(fb.scoreMethod).toBe("estimate");
    expect(isValidScore(fb.practiceScore)).toBe(true);
    expect(fb.practiceScore).toBeGreaterThan(50);
    expect(fb.score).toBeNull();
  });
});
