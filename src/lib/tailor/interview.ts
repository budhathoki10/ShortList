import "server-only";
import type { AnswerFeedback, InterviewQuestion, JobPost, Match, Profile } from "@/lib/model/types";
import { localId } from "@/lib/text";
import { assessRequirement, evidenceFit, sourceRequirements } from "@/lib/career/evidence";
import { interviewBank, technicalCount, technicalSelection } from "@/lib/career/questions";
import { isTechnicalRole } from "@/lib/career/tech-questions";
import { promptForQuestion, questionCoaching } from "@/lib/career/coaching";
import { evaluateMockAnswer } from "@/lib/career/mock";
import type { ApplicationPlan, CareerQuestion } from "@/lib/career/types";

export function answerGuide(question: string, profile: Profile, prompt?: CareerQuestion) {
  return questionCoaching(prompt ?? promptForQuestion(question), profile);
}

/** Focused questions and source-backed guides are available without spending AI credits. */
export async function interviewQuestions(profile: Profile, post: JobPost, match: Match, postText = "", savedPlan?: ApplicationPlan): Promise<InterviewQuestion[]> {
  const text = postText || post.requirements.map((r) => r.text).join("\n");
  const requirements = sourceRequirements(text, post).map((r) => assessRequirement(r, profile));
  // Parsed requirements remain useful when the original description has no section headings.
  for (const r of post.requirements) if (!requirements.some((row) => row.text === r.text)) requirements.push(assessRequirement({ text: r.text, quote: r.text, category: "skill", priority: r.kind === "nice" ? "preferred" : "must", skills: r.keywords }, profile));
  for (const hit of match.keywords.filter((k) => k.where === "missing")) if (!requirements.some((r) => r.skills.includes(hit.keyword))) requirements.push(assessRequirement({ text: `Knowledge of ${hit.keyword}`, quote: `Job keyword: ${hit.keyword}`, category: "skill", priority: "must", skills: [hit.keyword] }, profile));
  const plan: ApplicationPlan = savedPlan ?? { version: 1, fingerprint: "", method: "local", createdAt: new Date().toISOString(), requirements, fit: evidenceFit(requirements), expectations: [], company: { sources: [], facts: [], warning: null }, roadmap: [], applicationAnswers: [] };
  const bank = interviewBank({ profile, post, postText: text }, plan);
  const chosen: CareerQuestion[] = [];
  const pick = (kind: CareerQuestion["kind"], count: number) => chosen.push(...bank.filter((q) => q.kind === kind).sort((a, b) => Number(!!b.referenceId) - Number(!!a.referenceId)).slice(0, count));
  pick("introduction", 1); chosen.push(...technicalSelection(bank, technicalCount(bank, isTechnicalRole(post)))); pick("project", 2); pick("behavioural", 1); pick("scenario", 1); pick("gap", 2); pick("closing", 1);
  return chosen.map((prompt) => ({ id: localId("q"), question: prompt.question, why: prompt.assesses, prompt, answer: "", feedback: null }));
}

/** Practice and mock interviews share the same correctness checks and truthful rewrite rules. */
export async function answerFeedback(question: string, answer: string, profile: Profile, post: JobPost, prompt?: CareerQuestion, postText = ""): Promise<AnswerFeedback> {
  const review = await evaluateMockAnswer(prompt ?? promptForQuestion(question), answer, { profile, post, postText: postText || JSON.stringify(post) }, []);
  return { score: review.score, practiceScore: review.practiceScore, scoreMethod: review.scoreMethod, method: review.method, strengths: review.strengths, improve: review.improvements, rewrite: review.improvedAnswer, rubric: review.rubric.map((r) => ({ label: r.criterion, score: r.score, note: r.note })), corrections: review.corrections, modelAnswer: review.modelAnswer, sources: review.sources };
}
