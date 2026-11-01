import { createHash } from "node:crypto";
import { canonical } from "@/lib/text";
import { referenceForText } from "./references";
import { techFor } from "./tech-bank";
import { pickTechnical, technicalQuestions } from "./tech-questions";
import type { ApplicationPlan, CareerContext, CareerQuestion, QuestionKind } from "./types";

export const INTERVIEW_QUESTION_VERSION = 2;

/** One situation or concept per question. Related skills share a prompt instead of repeating it. */
export function interviewBank(context: CareerContext, plan: ApplicationPlan): CareerQuestion[] {
  const { profile, post } = context;
  const bank: CareerQuestion[] = [];
  const add = (kind: QuestionKind, question: string, assesses: string, expected: string[], source: string, difficulty: 1 | 2 | 3 = 2, referenceId?: string, coverage?: string[]) => {
    bank.push({ id: createHash("sha256").update(`${kind}:${question}`).digest("hex").slice(0, 20), kind, question, assesses, expected, source, difficulty, ...(referenceId ? { referenceId } : {}), ...(coverage ? { coverage } : {}) });
  };
  add("introduction", `Give a brief introduction focused on why your background fits the ${post.title || "target"} role.`, "A clear introduction supported by one relevant example.", ["Your current area of work or study", "One relevant project or responsibility", "Why that experience connects to this role"], "CV and job description", 1);
  const skills = [...new Map([...post.keywords, ...profile.skills].map((skill) => [canonical(skill), skill])).values()];
  const groups = new Map<string, { reference: NonNullable<ReturnType<typeof referenceForText>>; skills: string[] }>();
  for (const skill of skills) {
    const reference = referenceForText(skill);
    if (reference) { const group = groups.get(reference.id) ?? { reference, skills: [] }; group.skills.push(skill); groups.set(reference.id, group); continue; }
    // Technologies in the curated bank get their own, deeper questions below.
    if (techFor(skill)) continue;
    const people = /communication|teamwork|leadership|collaborat|customer|stakeholder|negotiat|english|language|onboarding/i.test(skill);
    add(people ? "behavioural" : "technical", people ? `Describe one real situation where ${skill} helped you complete a task with someone else.` : `What is one practical problem ${skill} helps solve? Use a small example you can explain.`, people ? "A concrete example of your contribution, not a general claim." : `A practical understanding of ${skill}; say clearly what is new to you.`, people ? ["The specific situation", "Your own action", "What changed or what you learned"] : ["The problem", "How the tool or method addresses it", "A limitation or check"], `${profile.skills.includes(skill) ? "CV" : "Job"} skill: ${skill}`, 2, undefined, [skill]);
  }
  bank.push(...technicalQuestions(context));
  for (const { reference, skills: covered } of groups.values()) add("technical", reference.question, `Explain ${reference.topic.toLowerCase()} with a concrete example.`, reference.checks, `CV/job skills: ${covered.join(", ")}`, 2, reference.id, covered);
  for (const project of profile.projects) {
    const text = project.bullets.join(" ");
    if (/queue|bullmq|background worker/i.test(text)) { const reference = referenceForText("queue")!; add("project", `In ${project.name}, what should happen if a worker crashes after doing the work but before recording completion?`, "Reason about retries without claiming an implementation you did not build.", reference.checks, `CV project: ${project.name}`, 2, reference.id); }
    else if (/hmac|signature/i.test(text)) { const reference = referenceForText("webhook")!; add("project", `How did you check incoming webhook signatures in ${project.name}?`, "Explain the security check described in your CV.", reference.checks, `CV project: ${project.name}`, 2, reference.id); }
    else if (/scor(?:ing|e)|rank|spam/i.test(text)) add("project", `Which signals does ${project.name} use to distinguish useful results from spam?`, "Explain one design decision from your actual project.", ["The inputs your implementation actually uses", "Why those signals matter", "A case where the scoring could be wrong"], `CV project: ${project.name}`);
    else add("project", `What did you personally implement in ${project.name}?`, "Make your contribution clear using the work in your CV.", ["The problem", "Your specific implementation", "How you checked it"], `CV project: ${project.name}`);
    add("scenario", `After a release, ${project.name} produces incorrect results. What would you investigate first?`, "A concrete first diagnostic step before guessing at a fix.", ["Clarify the failure", "Choose evidence to inspect", "Explain why that check comes first"], `CV project: ${project.name}`, 2);
  }
  for (const exp of profile.experience) add("behavioural", `Describe one change you made after receiving feedback in your ${exp.title} role${exp.company ? ` at ${exp.company}` : ""}.`, "A specific example of receiving and using feedback.", ["What the feedback concerned", "What you changed personally", "How you checked the change"], `CV experience: ${exp.title}`);
  for (const r of plan.requirements.filter((r) => r.status === "missing" || r.status === "unclear")) add("gap", `The role asks for “${r.text}”. What can you demonstrate today, and what still needs development or clarification?`, "An accurate current level with a realistic next step.", ["What you have actually done", "What the CV does not establish", "A specific practice or verification step"], r.quote, 1);
  add("gap", "Is there a transition in your CV timeline that you want to clarify? You can say there is no gap, and you do not need to share private circumstances.", "Clarify dates without assuming a gap or inventing activity.", ["Accurate dates", "Relevant activity only if it happened"], "CV dates; no gap is assumed", 1);
  add("behavioural", "Tell me about one mistake you made in a task or project and what you changed afterwards.", "Accountability and a concrete learning point.", ["A real mistake", "Your action", "What you learned or changed"], "Behavioural interview");
  add("scenario", `You receive an urgent task involving an unfamiliar tool at ${post.company || "the team"}. What is your first step?`, "Clarify the task and unknowns before promising a result.", ["Clarify the expected result", "Identify what you need to learn", "Explain when you would ask for help"], "Role scenario");
  for (const fact of plan.company.facts.slice(0, 3)) add("company", `The company says “${fact.quote}”. What would you ask the interviewer to understand that statement better?`, "Use a cited company statement to ask a thoughtful question.", ["Reference the statement", "Ask one concrete question without assuming it is independently verified"], plan.company.sources.find((s) => s.id === fact.sourceId)?.url ?? "Company website");
  if (/developer|engineer|programmer|software|data|python|javascript/i.test(`${post.title} ${post.keywords.join(" ")}`)) add("coding", "Write a function that keeps the last record for each id.\nExample input: [{id: 'a', status: 'saved'}, {id: 'a', status: 'applied'}]\nExpected result: [{id: 'a', status: 'applied'}]\nState your assumptions for missing ids and explain your approach.", "One practical coding problem. Code is reviewed, not executed.", ["One final record per id", "Last occurrence wins", "Explicit handling of missing ids", "An empty-input and a duplicate-id test"], "Practice assessment; not an actual company test", 2);
  add("closing", `What would you ask ${post.company || "the interviewer"} about success in your first three months?`, "Ask a role-specific question about the work.", ["A concrete success criterion", "A question you genuinely want answered"], "Closing questions", 1);
  return bank;
}

/** How many technical questions to ask: about half of the session for a technical role, a couple otherwise. */
export const technicalCount = (bank: CareerQuestion[], technicalRole: boolean) => (technicalRole ? 6 : 2);

/**
 * Picks `count` technical questions for practice and mock interviews: technology questions first
 * (the candidate's declared skills, then the job's stack, then the CV), then the source-backed concept questions.
 */
export function technicalSelection(bank: CareerQuestion[], count: number, attempt = 0): CareerQuestion[] {
  // One slot stays with a source-backed concept question when the bank has one, placed after the first technology question.
  const concepts = bank.filter((q) => q.kind === "technical" && !q.tech).sort((a, b) => Number(!!b.referenceId) - Number(!!a.referenceId));
  const reserved = count >= 3 ? concepts.slice(0, 1) : [];
  const tech = pickTechnical(bank, count - reserved.length, attempt);
  const picked = [...tech.slice(0, 1), ...reserved, ...tech.slice(1)];
  return [...picked, ...concepts.filter((q) => !picked.includes(q))].slice(0, count);
}

export function mockCurriculum(bank: CareerQuestion[], attempt = 0, technicalRole = bank.filter((q) => q.tech).length >= 3) {
  const one = (kind: QuestionKind) => { const options = bank.filter((q) => q.kind === kind).sort((a, b) => Number(!!b.referenceId) - Number(!!a.referenceId)); return options.length ? [options[attempt % options.length]] : []; };
  const technical = technicalSelection(bank, technicalCount(bank, technicalRole), attempt);
  // Behavioural and role questions stay; technical ones are woven through so the session alternates.
  const others = [...one("introduction"), ...one("project"), ...one("coding"), ...one("scenario"), ...one("behavioural"), ...one("gap"), ...one("company"), ...one("closing")];
  const opening = others.slice(0, 1);
  const middle = others.slice(1, -1);
  const closing = others.slice(-1);
  const woven: CareerQuestion[] = [];
  for (let i = 0; i < Math.max(middle.length, technical.length); i++) {
    if (technical[i]) woven.push(technical[i]);
    if (middle[i]) woven.push(middle[i]);
  }
  return [...opening, ...woven, ...closing];
}

export function adaptQuestion(question: CareerQuestion, difficulty: 1 | 2 | 3): CareerQuestion {
  if (!["technical", "project", "coding", "scenario"].includes(question.kind) || difficulty === question.difficulty) return { ...question, difficulty };
  return { ...question, difficulty, question: `${question.question}\n\n${difficulty === 1 ? "Use one small example." : difficulty === 3 ? "Go deeper: compare two approaches for this case." : "Explain one practical check."}` };
}
