import { createHash } from "node:crypto";
import { declaredSkills, LEVEL_PHRASE, parseSkillLabel } from "@/lib/cv/skill-levels";
import type { SkillLevel } from "@/lib/model/types";
import { containsTerm } from "@/lib/text";
import { techFor, TECH_BANK, type TechEntry } from "./tech-bank";
import type { CareerContext, CareerQuestion } from "./types";

/** Whether the role is a technical one, so practice should be about half technical questions. */
export const isTechnicalRole = (post: CareerContext["post"]) => /developer|engineer|programmer|software|devops|data|python|javascript|backend|frontend|full-?stack/i.test(`${post.title} ${post.keywords.join(" ")}`);

const idOf = (kind: string, question: string) => createHash("sha256").update(`${kind}:${question}`).digest("hex").slice(0, 20);

/** The technology named literally in the text ("Node.js" does not count as "JavaScript"). */
const mentions = (text: string, name: string) => (name.length === 1 ? containsTerm(text, name) : new RegExp(`(^|[^a-z0-9+#])${name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?![a-z0-9+#])`, "i").test(text));

type Entry = { entry: TechEntry; origin: "declared" | "job" | "cv"; level?: SkillLevel; label: string };

/** Which technologies to ask about, in priority order: the candidate's own declarations, then the job's stack, then the rest of the CV. */
function stack(context: CareerContext): { entries: Entry[]; others: { skill: string; level: SkillLevel }[] } {
  const { profile, post } = context;
  const entries = new Map<string, Entry>();
  const others: { skill: string; level: SkillLevel }[] = [];
  for (const d of declaredSkills(profile)) {
    const entry = techFor(d.skill);
    if (entry) entries.set(entry.id, { entry, origin: "declared", level: d.level, label: d.label });
    else others.push({ skill: d.skill, level: d.level });
  }
  const jobTerms = [...post.requirements.filter((r) => r.kind === "must").flatMap((r) => r.keywords), ...post.keywords, ...post.requirements.filter((r) => r.kind !== "must").flatMap((r) => r.keywords)];
  for (const term of jobTerms) {
    const entry = techFor(term);
    if (entry && !entries.has(entry.id)) entries.set(entry.id, { entry, origin: "job", label: entry.name });
  }
  const cvText = [...profile.projects.flatMap((p) => p.bullets), ...profile.experience.flatMap((e) => e.bullets)].join("\n");
  for (const entry of TECH_BANK) {
    if (entries.has(entry.id)) continue;
    const listed = profile.skills.some((s) => techFor(parseSkillLabel(s).name)?.id === entry.id);
    if (listed || mentions(cvText, entry.name)) entries.set(entry.id, { entry, origin: "cv", label: entry.name });
  }
  return { entries: [...entries.values()], others };
}

/**
 * Technical questions for the job's stack, the candidate's declared skills (at the depth of the level they chose)
 * and their own CV stack, plus the follow-ups an interviewer asks after seeing a skill on a CV.
 * Questions for a technology are ordered so that asking them in turn goes from the right starting point to deeper.
 */
export function technicalQuestions(context: CareerContext): CareerQuestion[] {
  const out: CareerQuestion[] = [];
  const seen = new Set<string>();
  const add = (q: Omit<CareerQuestion, "id" | "kind"> & { kind?: CareerQuestion["kind"] }) => {
    const kind = q.kind ?? "technical";
    const id = idOf(kind, q.question);
    if (seen.has(id)) return;
    seen.add(id);
    out.push({ ...q, id, kind });
  };
  const { entries, others } = stack(context);

  for (const { entry, origin, level, label } of entries) {
    const modest = level === "learning" || level === "practice";
    const source = origin === "declared" ? `Self-declared skill: ${label}` : origin === "job" ? `Job stack: ${entry.name}` : `CV stack: ${entry.name}`;
    const base = { assesses: "", source, tech: entry.name, origin, ...(level ? { level } : {}), coverage: [entry.name] };
    const ask = (list: [string, string[]][], difficulty: 1 | 2 | 3, kind: CareerQuestion["kind"] = "technical") => list.map(([question, expected]) => ({ ...base, kind, question, expected, difficulty, assesses: modest ? `${entry.name} fundamentals, at the level you declared (${label}).` : origin === "job" ? `Working knowledge of ${entry.name}, which the role uses.` : `Practical understanding of ${entry.name}, as shown on your CV.` }));
    let list: ReturnType<typeof ask>;
    if (origin === "declared" && level) {
      const honest: [string, string[]] = modest
        ? [`Your CV shows ${label}. How would you describe your current level in ${entry.name} honestly, and what have you actually written or worked through?`, ["An honest level, matching what the CV says", "One concrete thing you wrote or studied", "What you are learning next"]]
        : [`Walk me through where you used ${entry.name}: what did you build, and what was your own part?`, ["The problem and the setting", "Your specific contribution", "How you checked it worked"]];
      list = modest
        ? [...ask([honest], 1), ...ask(entry.fundamentals, 1).map((q, i) => ({ ...q, difficulty: (i < 2 ? 1 : 2) as 1 | 2 })), ...ask(entry.followUps.slice(0, 2), 2)]
        : [...ask([honest], 2), ...ask(entry.applied, 2), ...ask(entry.followUps, 3)];
    } else if (origin === "job") {
      list = [...ask(entry.fundamentals.slice(0, 2), 1), ...ask(entry.applied.slice(0, 1), 2), ...ask(entry.fundamentals.slice(2), 2), ...ask(entry.applied.slice(1), 2), ...ask(entry.followUps, 3)];
    } else {
      list = [...ask(entry.applied.slice(0, 1), 2), ...ask(entry.followUps.slice(0, 1), 3), ...ask(entry.fundamentals.slice(0, 1), 1), ...ask(entry.applied.slice(1), 2), ...ask(entry.followUps.slice(1), 3)];
    }
    for (const q of list) add(q);
  }

  // Declared skills the bank doesn't cover still get a question at their level.
  for (const { skill, level } of others) {
    const modest = level === "learning" || level === "practice";
    add({ question: modest ? `You are ${LEVEL_PHRASE[level]} ${skill}. Explain its core idea in your own words, and one small thing you have tried with it.` : `Describe a decision you made while using ${skill}, and the trade-off behind it.`, assesses: modest ? `${skill} fundamentals, at the level you declared.` : `Applied understanding of ${skill}.`, expected: modest ? ["The core idea, in plain words", "One concrete thing you tried", "What you still need to learn"] : ["The situation", "The options and the trade-off", "How you checked the result"], source: `Self-declared skill: ${skill}`, difficulty: modest ? 1 : 2, tech: skill, origin: "declared", level, coverage: [skill] });
  }

  // Questions about the candidate's own projects and the technology they used there.
  for (const project of context.profile.projects) {
    const text = project.bullets.join("\n");
    const used = entries.find((e) => mentions(text, e.entry.name) && e.origin !== "job");
    if (used) add({ kind: "project", question: `In ${project.name}, you used ${used.entry.name}. Why did you choose it, what was hardest, and what would you change now?`, assesses: `A real project decision involving ${used.entry.name}.`, expected: ["The reason for the choice", "A specific difficulty and how you dealt with it", "One thing you would do differently"], source: `CV project: ${project.name}`, difficulty: 2, tech: used.entry.name, origin: "cv", coverage: [used.entry.name] });
  }
  return out;
}

/**
 * Picks `count` technical questions, one technology at a time in priority order (declared skills, the job's stack,
 * then the CV), going deeper into each as rounds pass. `attempt` shifts the starting question for variety.
 */
export function pickTechnical(bank: CareerQuestion[], count: number, attempt = 0): CareerQuestion[] {
  const byTech = new Map<string, CareerQuestion[]>();
  for (const q of bank.filter((q) => q.tech && q.kind === "technical")) byTech.set(q.tech!, [...(byTech.get(q.tech!) ?? []), q]);
  const queues = [...byTech.values()];
  const picked: CareerQuestion[] = [];
  for (let round = 0; picked.length < count && queues.some((q) => round < q.length); round++) {
    for (const q of queues) {
      if (picked.length >= count) break;
      // The first round always opens at the start of the list; later attempts begin slightly deeper.
      const item = q[(round + (round === 0 ? 0 : attempt)) % q.length];
      if (item && !picked.includes(item)) picked.push(item);
    }
  }
  return picked;
}
