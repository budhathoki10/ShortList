import { afterEach, expect, it, vi } from "vitest";
import { EMPTY_PROFILE } from "@/lib/model/types";
import { heuristicJob } from "@/lib/jobs/heuristic";
import { answerFeedback, answerGuide, interviewQuestions } from "@/lib/tailor/interview";
import { evaluateMockAnswer } from "@/lib/career/mock";
import { interviewReference, referenceCorrections } from "@/lib/career/references";
import { interviewBank } from "@/lib/career/questions";
import { buildApplicationPlan } from "@/lib/career/plan";
import { scoreMatch } from "@/lib/match/score";

const profile = { ...EMPTY_PROFILE, skills: ["JavaScript", "Node.js"], projects: [{ id: "p", name: "Tracker", link: "", bullets: ["Built a JavaScript tracker."] }] };
const postText = "Job title: Python Developer\nRequirements\n- Python programming is required.\n- JavaScript and Node.js experience.";
const context = { profile, postText, post: heuristicJob(postText) };
const question = { id: "q", kind: "technical" as const, question: interviewReference("python-dictionary")!.question, referenceId: "python-dictionary", assesses: "Dictionary lookup", expected: [], source: "Job skill", difficulty: 2 as const };
afterEach(() => { vi.unstubAllEnvs(); vi.unstubAllGlobals(); });

it("corrects a known technical error with a complete sourced example without inventing an offline grade", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  const feedback = await evaluateMockAnswer(question, "A missing key with square brackets returns None.", context, []);
  expect(feedback.score).toBeNull();
  expect(feedback.corrections[0]).toContain("raises KeyError");
  expect(feedback.improvedAnswer).toContain("record.get('status', 'saved')");
  expect(feedback.sources?.[0].url).toContain("docs.python.org");
  expect(feedback.improvedAnswer).not.toMatch(/I (?:built|used)/);
  expect(referenceCorrections("python-dictionary", "A present key with square brackets returns None when its value is None.")).toEqual([]);
  expect(referenceCorrections("python-dictionary", "A missing key does not return None with square brackets.")).toEqual([]);
});

it("keeps a correct new technical concept while blocking fabricated personal experience", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "test-key");
  const response = { rubric: ["correctness", "depth", "communication", "confidence", "relevance"].map((criterion) => ({ criterion, score: 5, note: "A clear explanation." })), strengths: ["You name the lookup method."], improvements: ["Distinguish a missing key from a present None value."], corrections: [], modelAnswer: "Square brackets raise KeyError for a missing dictionary key.", improvedAnswer: "Square brackets raise KeyError; record.get('status', 'saved') supplies a default.", followUp: "What happens if the key is present with value None?" };
  const fetcher = vi.fn(async () => Response.json({ type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(response) }] }));
  vi.stubGlobal("fetch", fetcher);
  const feedback = await evaluateMockAnswer(question, "A missing key with square brackets returns None.", context, []);
  expect(feedback.method).toBe("ai");
  expect(feedback.improvedAnswer).toContain("KeyError");
  expect(feedback.score).toBeLessThanOrEqual(3);
  expect(feedback.rubric.find((r) => r.criterion === "correctness")?.score).toBe(2);
  response.improvedAnswer = "I used Python professionally to build services.";
  const dishonest = await evaluateMockAnswer(question, "I only know JavaScript.", context, []);
  expect(dishonest.improvedAnswer).not.toContain("used Python professionally");
  expect(dishonest.improvements.join()).toContain("unsupported");
});

it("groups related skill prompts and distinguishes missing skills from claimed experience", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  const plan = await buildApplicationPlan(context, { sources: [], facts: [], warning: null });
  const bank = interviewBank(context, plan);
  const asyncPrompts = bank.filter((q) => q.referenceId === "javascript-promises");
  expect(asyncPrompts).toHaveLength(1);
  expect(asyncPrompts[0].coverage).toEqual(expect.arrayContaining(["JavaScript", "Node.js"]));
  expect(bank.some((q) => q.kind === "gap" && q.question.includes("Python") && q.question.includes("demonstrate today"))).toBe(true);
  expect(bank.some((q) => /time you used.*Python/.test(q.question))).toBe(false);
  const practice = await interviewQuestions(profile, context.post, scoreMatch(profile, context.post), postText);
  expect(practice.find((q) => q.prompt?.kind === "technical")?.prompt?.referenceId).toBeDefined();
});

it("coaches the user's short collaboration answer without unrelated technical advice or fabricated outcomes", async () => {
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  const prompt = "How did you collaborate with a frontend developer and use their feedback?";
  const feedback = await answerFeedback(prompt, "I can collaborate with frontend integrating API, handle data.", profile, context.post);
  expect(feedback.score).toBeNull();
  expect(feedback.improve.join()).toContain("API endpoint");
  expect(feedback.rewrite).toContain("After their feedback, I changed [the specific change]");
  expect(feedback.rewrite).toContain("[Describe the actual result");
  expect(feedback.rewrite).not.toContain("Tracker");
  expect(answerGuide(prompt, profile).category).toBe("Behavioural");
  // A generic API design question must not receive the unrelated HTTP validation example.
  expect(answerGuide("How did you design your API?", profile).reference).toBeUndefined();
});
