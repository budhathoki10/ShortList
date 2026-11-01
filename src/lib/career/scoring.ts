import { contentWords } from "@/lib/text";
import type { CareerQuestion, MockTurn, PracticeReport } from "./types";

/**
 * The "Practice score": a number out of 100 for how a practice answer went. It is a coaching estimate for
 * practising, never a prediction of a hiring decision. With AI it comes from the AI's rubric; without AI it
 * is a transparent heuristic (see `heuristicPractice`). Both are validated here to whole numbers from 0 to 100.
 */

/** Total turns (main questions and follow-ups) a mock interview may use. */
export const MAX_MOCK_TURNS = 28;

/** Anything that is not a finite number becomes 0; the rest is rounded and kept within 0 to 100. */
export const clampScore = (n: unknown): number => (typeof n === "number" && Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0);
export const isValidScore = (n: unknown): n is number => typeof n === "number" && Number.isInteger(n) && n >= 0 && n <= 100;

const WEIGHTS = { correctness: 0.35, depth: 0.2, relevance: 0.2, communication: 0.15, confidence: 0.1 } as const;

/** AI rubric (1 to 5 per criterion) to a 0 to 100 practice score. A technical answer cannot score far above its correctness. */
export function aiPracticeScore(rubric: { criterion: string; score: number | null }[], knowledge: boolean): { score: number; communication: number } {
  let sum = 0;
  let weight = 0;
  for (const r of rubric) {
    const w = WEIGHTS[r.criterion as keyof typeof WEIGHTS];
    if (!w || r.score === null) continue;
    sum += Math.max(1, Math.min(5, r.score)) * w;
    weight += w;
  }
  const average = weight ? sum / weight : 0;
  const correctness = rubric.find((r) => r.criterion === "correctness")?.score;
  const bounded = knowledge && typeof correctness === "number" ? Math.min(average, correctness + 1) : average;
  const communication = rubric.find((r) => r.criterion === "communication")?.score;
  return { score: clampScore((bounded / 5) * 100), communication: clampScore(((communication ?? average) / 5) * 100) };
}

const CONNECTIVES = /\b(because|so that|therefore|first|second|then|next|finally|for example|for instance|however|but|trade-?off|instead|which means|as a result)\b/gi;
const stem = (w: string) => w.replace(/(ing|ed|es|s)$/, "");

/** Share of the expected points an answer touches: a point counts when at least half of its key words appear. */
export function coverageOf(expected: string[], answer: string): { covered: string[]; missed: string[] } {
  const words = new Set((answer.toLowerCase().match(/[a-z0-9+#.]+/g) ?? []).map(stem));
  const hay = answer.toLowerCase();
  const covered: string[] = [];
  const missed: string[] = [];
  for (const point of expected) {
    const keys = [...new Set(contentWords(point))].slice(0, 8);
    const hits = keys.filter((k) => words.has(stem(k)) || hay.includes(k)).length;
    (keys.length === 0 || hits / keys.length >= 0.5 ? covered : missed).push(point);
  }
  return { covered, missed };
}

/**
 * Plain-code estimate, 0 to 100, with no AI. Five visible parts:
 *  coverage of the question's expected key points (40), relevance to the question (15), enough said (15),
 *  structure (15) and concrete detail: examples, numbers, code, things done (15).
 * Known mistakes found by the reference check each cost points. It cannot judge whether an answer is correct,
 * so it is capped at 90 and always labelled an estimate.
 */
export function heuristicPractice(question: Pick<CareerQuestion, "question" | "expected">, answer: string, corrections: string[] = []): { score: number; communication: number; parts: { coverage: number; relevance: number; length: number; structure: number; detail: number } } {
  const text = answer.trim();
  const words = text ? text.split(/\s+/).length : 0;
  if (words < 3) return { score: 0, communication: 0, parts: { coverage: 0, relevance: 0, length: 0, structure: 0, detail: 0 } };
  const { covered } = coverageOf(question.expected, text);
  const coverage = question.expected.length ? covered.length / question.expected.length : 0.5;
  const qWords = [...new Set(contentWords(question.question))];
  const lower = text.toLowerCase();
  const relevance = qWords.length ? Math.min(1, qWords.filter((w) => lower.includes(w)).length / Math.max(3, qWords.length * 0.5)) : 0.5;
  const length = words >= 70 ? (words > 500 ? 0.8 : 1) : words / 70;
  const sentences = text.split(/(?<=[.!?])\s+|\n+/).filter((s) => s.trim().length > 3).length;
  const connectives = new Set((text.match(CONNECTIVES) ?? []).map((c) => c.toLowerCase())).size;
  const structure = Math.min(1, (sentences >= 3 ? 0.4 : sentences === 2 ? 0.2 : 0) + (/\n|^\s*(?:[-*\d]+[.)]?)\s/m.test(text) ? 0.2 : 0) + Math.min(connectives, 3) * 0.14);
  const signals = (text.match(/\d+/g)?.length ? 1 : 0) + (/[(){}\[\];=<>]|`/.test(text) ? 1 : 0) + (/\bI\s+(built|wrote|used|tested|fixed|implemented|designed|checked|learned|learnt|tried|read|worked|made|debugged|ran)\b/i.test(text) ? 1 : 0) + (/\b(for example|for instance|e\.g\.|such as)\b/i.test(text) ? 1 : 0) + (/\b[A-Z][a-z]+[A-Z]\w*|\b[a-z]+_[a-z]+\b|\b\w+\(\)/.test(text) ? 1 : 0);
  const detail = Math.min(1, signals / 3);
  const raw = coverage * 40 + relevance * 15 + length * 15 + structure * 15 + detail * 15 - Math.min(corrections.length, 2) * 10;
  return {
    score: clampScore(Math.min(90, raw)),
    communication: clampScore((structure * 0.5 + length * 0.3 + relevance * 0.2) * 100),
    parts: { coverage: Math.round(coverage * 40), relevance: Math.round(relevance * 15), length: Math.round(length * 15), structure: Math.round(structure * 15), detail: Math.round(detail * 15) },
  };
}

const AREAS = [
  { key: "technical", label: "Technical knowledge" },
  { key: "problem", label: "Problem solving" },
  { key: "communication", label: "Communication" },
  { key: "role", label: "Role fit" },
] as const;

/** Which area(s) a question's score counts towards. Communication counts for every answer. */
function areasOf(q: CareerQuestion): ("technical" | "problem" | "role")[] {
  switch (q.kind) {
    case "technical": return ["technical"];
    case "coding": return ["technical", "problem"];
    case "scenario": return ["problem"];
    case "project": return q.tech || q.referenceId ? ["technical"] : ["role"];
    default: return ["role"];
  }
}

const mean = (xs: number[]) => (xs.length ? Math.round(xs.reduce((n, x) => n + x, 0) / xs.length) : null);

/**
 * The end-of-session Practice score: overall out of 100, a short breakdown by area, and the two or three
 * answers most worth improving (each with the question to go back to). Turns scored before this feature existed are skipped.
 */
export function practiceReport(turns: MockTurn[]): PracticeReport {
  const scored = turns.filter((t) => t.feedback && isValidScore(t.feedback.practiceScore));
  if (!scored.length) return { score: null, method: "estimate", areas: [], improve: [], answered: 0 };
  const areas = AREAS.flatMap(({ key, label }) => {
    const values = key === "communication"
      ? scored.map((t) => t.feedback!.communicationScore).filter(isValidScore)
      : scored.filter((t) => areasOf(t.question).includes(key)).map((t) => t.feedback!.practiceScore!);
    const score = mean(values);
    return score === null ? [] : [{ key, label, score }];
  });
  const ai = scored.filter((t) => t.feedback!.scoreMethod === "ai").length;
  const improve = [...scored].sort((a, b) => a.feedback!.practiceScore! - b.feedback!.practiceScore!).filter((t) => t.feedback!.practiceScore! < 85).slice(0, 3).map((t) => {
    const f = t.feedback!;
    const area = AREAS.find((a) => a.key === (areasOf(t.question)[0] ?? "role"))!.label;
    return { turnId: t.id, area, question: t.question.question.split("\n")[0].slice(0, 160), note: (f.corrections[0] ?? f.improvements[0] ?? "Practise this answer again with a concrete example.").slice(0, 240), score: f.practiceScore! };
  });
  return { score: mean(scored.map((t) => t.feedback!.practiceScore!)), method: ai === scored.length ? "ai" : ai === 0 ? "estimate" : "mixed", areas, improve, answered: scored.length };
}
