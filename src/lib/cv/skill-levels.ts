import type { Profile, SkillLevel } from "@/lib/model/types";

/**
 * Self-declared skills. The candidate says how well they know a skill the job asks for; that choice
 * is stored as `skillLevels` and shown on the CV exactly as chosen. Nothing in the system ever raises
 * a level, and nothing here invents a skill: it only formats, reads back and reconciles the person's own choice.
 */
export const SKILL_LEVELS: { value: SkillLevel; label: string; hint: string }[] = [
  { value: "work", label: "Used it at work", hint: "In a paid or professional role" },
  { value: "project", label: "Used it in a project", hint: "Something you built yourself or with others" },
  { value: "practice", label: "Coursework or practice", hint: "From a course, exercises or study" },
  { value: "learning", label: "Learning now", hint: "Early days, building it up" },
];

export const isSkillLevel = (v: unknown): v is SkillLevel => v === "work" || v === "project" || v === "practice" || v === "learning";

/** Levels that must carry a label on the CV, because they are not working or project experience. */
export const isModestLevel = (l: SkillLevel | undefined) => l === "practice" || l === "learning";

const SUFFIX: Record<SkillLevel, string> = { work: "", project: "", practice: " (coursework)", learning: " (learning)" };

/** The skill as the CV shows it: "C", "C (coursework)" or "C (learning)". */
export const skillLabel = (name: string, level: SkillLevel | undefined) => `${name}${level ? SUFFIX[level] : ""}`;

const LABELLED = /^(.*\S)\s*\((coursework|learning)\)\s*$/i;

/** Reads "C (learning)" back into its name and level. Plain names have no level. */
export function parseSkillLabel(entry: string): { name: string; level?: SkillLevel } {
  const m = LABELLED.exec(entry.trim());
  if (!m) return { name: entry.trim() };
  return { name: m[1].trim(), level: m[2].toLowerCase() === "learning" ? "learning" : "practice" };
}

const key = (s: string) => s.trim().toLowerCase();

/**
 * Makes the skills list and the stored levels agree. A level in the record decides the label; a label
 * typed into the list with no record is read as that level. A level whose skill was removed is dropped.
 */
export function reconcileSkills(skills: string[], levels: Record<string, SkillLevel> = {}): { skills: string[]; skillLevels: Record<string, SkillLevel> } {
  const known = new Map(Object.entries(levels).filter(([, v]) => isSkillLevel(v)).map(([k, v]) => [key(k), v] as const));
  const out: string[] = [];
  const seen = new Set<string>();
  const skillLevels: Record<string, SkillLevel> = {};
  for (const entry of skills) {
    const parsed = parseSkillLabel(entry);
    if (!parsed.name) continue;
    const k = key(parsed.name);
    if (seen.has(k)) continue;
    seen.add(k);
    // The record wins. Where only the typed label exists, the label is the level. Never promote.
    const level = known.get(k) ?? parsed.level;
    if (level) skillLevels[parsed.name] = level;
    out.push(skillLabel(parsed.name, level));
  }
  return { skills: out, skillLevels };
}

/** Every skill the candidate has declared, with its level. */
export function declaredSkills(profile: Pick<Profile, "skills" | "skillLevels">): { skill: string; level: SkillLevel; label: string }[] {
  const levels = profile.skillLevels ?? {};
  return Object.entries(levels)
    .filter(([name, level]) => isSkillLevel(level) && profile.skills.some((s) => key(parseSkillLabel(s).name) === key(name)))
    .map(([skill, level]) => ({ skill, level, label: skillLabel(skill, level) }));
}

/** Level the candidate declared for a skill name (any case), if any. */
export function levelOf(profile: Pick<Profile, "skills" | "skillLevels">, skill: string): SkillLevel | undefined {
  return declaredSkills(profile).find((d) => key(d.skill) === key(parseSkillLabel(skill).name))?.level;
}

export const LEVEL_PHRASE: Record<SkillLevel, string> = { work: "uses at work", project: "has used in projects", practice: "is building through coursework", learning: "is learning" };
