import type { Profile, SkillLevel } from "@/lib/model/types";
import { localId } from "@/lib/text";
import { isSkillLevel, parseSkillLabel, reconcileSkills, skillLabel, SKILL_LEVELS } from "./skill-levels";

/**
 * Adds a skill the candidate says they have, at the level they chose. Only their own input is used:
 * the skill joins the skills list (once, labelled when the level calls for it), and their sentence,
 * if any, is filed as a bullet in the right place:
 *  - work / project: the sentence is required. With a role picked it goes under that role; with none it
 *    goes on a project line, never under an employer.
 *  - coursework or practice / learning: the sentence is optional. If given it goes on a project line
 *    ("Practice"), never under an employer they didn't use the skill at.
 */
export function withSkillEvidence(
  profile: Profile,
  input: { skill: string; experienceId: string; sentence: string; level: string },
): { profile: Profile } | { error: string } {
  const skill = input.skill.replace(/\s+/g, " ").trim().slice(0, 60);
  const sentence = input.sentence.replace(/\s+/g, " ").trim().replace(/^[-•*]\s*/, "");
  if (!skill) return { error: "Choose a skill to add." };
  if (!isSkillLevel(input.level)) return { error: `Say how well you know ${skill}: ${SKILL_LEVELS.map((l) => l.label.toLowerCase()).join(", ")}.` };
  const level: SkillLevel = input.level;
  const strong = level === "work" || level === "project";
  const wantsRole = strong && !!input.experienceId;
  const role = wantsRole ? profile.experience.find((e) => e.id === input.experienceId) : null;
  if (wantsRole && !role) return { error: "That role is no longer in your CV. Reload the page and try again." };
  if (strong && sentence.length < 12) return { error: `Say briefly what you did with ${skill}, in your own words.` };
  if (sentence && sentence.length < 12) return { error: "Add a little more, or leave it blank." };
  if (sentence.length > 300) return { error: "Keep it to one sentence (under 300 characters)." };

  const lower = skill.toLowerCase();
  const existingIndex = profile.skills.findIndex((x) => x.replace(/\s*\((coursework|learning)\)\s*$/i, "").trim().toLowerCase() === lower);
  // Keep the spelling already on the CV ("C", not "c") when the skill is there.
  const name = existingIndex >= 0 ? parseSkillLabel(profile.skills[existingIndex]).name : skill;
  const label = skillLabel(name, level);
  const levels = { ...Object.fromEntries(Object.entries(profile.skillLevels ?? {}).filter(([k]) => k.toLowerCase() !== lower)), [name]: level };
  const skills = existingIndex >= 0 ? profile.skills.map((x, i) => (i === existingIndex ? label : x)) : [...profile.skills, label];
  const reconciled = reconcileSkills(skills, levels);

  let experience = profile.experience;
  let projects = profile.projects;
  if (sentence) {
    if (role) experience = experience.map((e) => (e.id === role.id ? { ...e, bullets: [...e.bullets, sentence] } : e));
    else {
      // Never under an employer: a project line the candidate can see and edit.
      const name = level === "learning" || level === "practice" ? "Practice and coursework" : "Projects";
      const home = projects.find((p) => p.name === name);
      projects = home ? projects.map((p) => (p === home ? { ...p, bullets: [...p.bullets, sentence] } : p)) : [...projects, { id: localId("p"), name, link: "", bullets: [sentence] }];
    }
  }
  return { profile: { ...profile, skills: reconciled.skills, skillLevels: reconciled.skillLevels, experience, projects } };
}
