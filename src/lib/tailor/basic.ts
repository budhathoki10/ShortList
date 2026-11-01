import { CV_SECTIONS, type Change, type CloseGap, type CvSection, type JobPost, type Match, type Profile } from "@/lib/model/types";
import { isAddableSkill } from "@/lib/match/skills";
import { canonical, localId, overlap } from "@/lib/text";
import { unsupportedCvFacts } from "./fact-check";
import { candidateSentences, entryRelevance, focusOf, groupSkills, groupOf, isStackLine, orderSkills, rankIndexes, relevance, skillRelevance, type Focus } from "./relevance";

/**
 * Job-specific tailoring in plain code, with no AI. Everything here picks, orders or reuses
 * the person's own words, so nothing can be invented. It is also what fills in whatever
 * ordering an AI answer leaves out.
 */

const make = (c: Record<string, unknown>): Change => ({ id: localId("c"), flags: [], accepted: true, ...c }) as unknown as Change;

const sameOrder = <T,>(a: T[], b: T[]) => a.length === b.length && a.every((v, i) => v === b[i]);

/** A summary built from the person's own sentences that matter most for this job. */
export function basicSummary(profile: Profile, focus: Focus): string {
  const all = candidateSentences(profile).map((s) => ({ ...s, r: relevance(s.text, focus) }));
  const pickedSummary = all.filter((s) => s.from === "summary").sort((a, b) => b.r - a.r)[0];
  const lead = pickedSummary ?? all.find((s) => s.from === "work");
  if (!lead) return "";
  const work = all.filter((s) => s.from === "work" && s.r > 0 && s.text !== lead.text).sort((a, b) => b.r - a.r);
  const chosen: string[] = [];
  for (const s of work) {
    if (chosen.length >= 2) break;
    if (chosen.some((c) => overlap(c, s.text) > 0.6)) continue;
    chosen.push(s.text);
  }
  if (!chosen.length && pickedSummary) return profile.summary.trim();
  const end = (t: string) => (/[.!?]$/.test(t) ? t : `${t}.`);
  return [lead.text, ...chosen].map(end).join(" ");
}

/** Developer ↔ Engineer, only when the CV already uses one of them and the job title uses the other. */
export function basicHeadline(profile: Profile, post: JobPost): string {
  const h = profile.headline.trim();
  if (!h) return "";
  const title = post.title.toLowerCase();
  if (/\bdeveloper\b/i.test(h) && /\bengineer\b/.test(title) && !/\bdeveloper\b/.test(title)) return h.replace(/\bdeveloper\b/i, (m) => (m[0] === "D" ? "Engineer" : "engineer"));
  if (/\bengineer\b/i.test(h) && /\bdeveloper\b/.test(title) && !/\bengineer\b/.test(title)) return h.replace(/\bengineer\b/i, (m) => (m[0] === "E" ? "Developer" : "developer"));
  return "";
}

/** Skills a post asks for that the CV doesn't show, most important first. */
export function gapSkills(match: Match, post: JobPost): string[] {
  const must = new Set(post.requirements.filter((r) => r.kind === "must").flatMap((r) => r.keywords.map(canonical)));
  return match.keywords
    .filter((k) => k.where === "missing" && isAddableSkill(k.keyword))
    .sort((a, b) => Number(must.has(canonical(b.keyword))) - Number(must.has(canonical(a.keyword))))
    .map((k) => k.keyword);
}

const SPOKEN = /^(english|nepali|hindi|arabic|japanese|korean|german|french|spanish|mandarin|chinese|portuguese|italian|russian)$/i;

/** Honest ways to earn a missing requirement. These are shown beside the CV, never written into it. */
export function basicCloseGaps(skills: string[]): CloseGap[] {
  return skills.slice(0, 3).map((skill) => {
    if (/certif|licen[sc]e|diploma|degree|first aid/i.test(skill)) return { skill, action: `Find the official route to ${skill} and plan it. It only counts once you hold it.`, describeAs: "Add it under Certifications once awarded, with the date." };
    if (SPOKEN.test(skill)) return { skill, action: `Take a recognised ${skill} test (a CEFR-style assessment is common) to find your real level.`, describeAs: `List it under Languages with the level you actually reached, for example “${skill} (B1)”.` };
    const programming = ["Languages", "Frontend", "Backend & data", "Tools & infrastructure"].includes(groupOf(skill) ?? "");
    return programming
      ? { skill, action: `Build one small, real project in ${skill}, or take a recognised ${skill} skills assessment.`, describeAs: `Once it's finished, add it as a project, for example “Built a small ${skill} tool that …”. List ${skill} as a skill only after that.` }
      : { skill, action: `Complete a recognised ${skill} course or assessment, then use it on one small real task, even a personal or volunteer one.`, describeAs: `Once done, describe the task plainly, for example “Set up … in ${skill}”. List ${skill} as a skill only after that.` };
  });
}

/** Where evidence is stronger decides whether projects or experience lead. */
function sectionsFor(profile: Profile, focus: Focus): CvSection[] {
  const exp = profile.experience.reduce((n, e) => n + entryRelevance(e.bullets, `${e.title} ${e.company}`, focus), 0);
  const proj = profile.projects.reduce((n, p) => n + entryRelevance(p.bullets, p.name, focus), 0);
  const projectsFirst = profile.projects.length > 0 && (profile.experience.length === 0 || proj > exp * 1.25 || (profile.experience.length < 2 && proj >= exp));
  const lead: CvSection[] = projectsFirst ? ["projects", "experience"] : ["experience", "projects"];
  return ["summary", "skills", ...lead, "education", "certifications", "languages"];
}

/** Everything that can be done without a model. */
export function basicChanges(profile: Profile, post: JobPost, match: Match): { changes: Change[]; closeGaps: CloseGap[] } {
  const focus = focusOf(post);
  const changes: Change[] = [];

  const summary = basicSummary(profile, focus);
  if (summary && summary !== profile.summary.trim()) {
    const flags = unsupportedCvFacts(summary, profile);
    changes.push(make({ kind: "summary", before: profile.summary, after: summary, reason: "Opens with your own experience that matters most for this role", flags, accepted: flags.length === 0 }));
  }
  const headline = basicHeadline(profile, post);
  if (headline && headline !== profile.headline) {
    const flags = unsupportedCvFacts(headline, profile, { allowRoleNouns: true });
    changes.push(make({ kind: "headline", before: profile.headline, after: headline, reason: `Matches the “${post.title}” title; the role is the same work`, flags, accepted: flags.length === 0 }));
  }

  const sections = sectionsFor(profile, focus);
  const current = profile.sectionOrder?.length === CV_SECTIONS.length ? profile.sectionOrder : [...CV_SECTIONS];
  if (!sameOrder(sections, current)) changes.push(make({ kind: "section-order", order: sections, reason: sections.indexOf("projects") < sections.indexOf("experience") ? "Your projects are the stronger evidence for this job, so they come first" : "Your work history is the stronger evidence for this job" }));

  for (const e of profile.experience) {
    const order = rankIndexes(e.bullets, focus);
    if (!sameOrder(order, e.bullets.map((_, i) => i))) changes.push(make({ kind: "bullet-order", experienceId: e.id, order, reason: "Puts the work this job asks for first" }));
  }
  const projectIds = [...profile.projects].map((p, i) => ({ id: p.id, i, r: entryRelevance(p.bullets, p.name, focus) })).sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.id);
  if (!sameOrder(projectIds, profile.projects.map((p) => p.id))) changes.push(make({ kind: "projects-order", order: projectIds, reason: "Leads with the projects most relevant to this job" }));
  // Reordering roles breaks the date order readers expect, so it is offered but off by default.
  const expIds = profile.experience.map((e, i) => ({ id: e.id, i, r: entryRelevance(e.bullets, `${e.title} ${e.company}`, focus) })).sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.id);
  if (profile.experience.length > 1 && !sameOrder(expIds, profile.experience.map((e) => e.id))) changes.push(make({ kind: "experience-order", order: expIds, accepted: false, optional: true, reason: "Puts the most relevant role first. Off by default: it breaks date order" }));

  const groups = groupSkills(profile.skills, focus);
  if (groups) changes.push(make({ kind: "skills-groups", groups, reason: "Groups your skills and leads with what this job asks for" }));
  else {
    const order = orderSkills(profile.skills, focus);
    if (!sameOrder(order, profile.skills)) changes.push(make({ kind: "skills-order", order, reason: "Leads with the skills in the job post" }));
  }

  // The focused version: shorter, by leaving out what this job doesn't care about. Off by default.
  const unrelated = profile.skills.filter((s) => skillRelevance(s, focus) === 0);
  if (focus.terms.length >= 3 && profile.skills.length >= 8 && profile.skills.length - unrelated.length >= 3 && unrelated.length) changes.push(make({ kind: "skills-trim", drop: unrelated.slice(0, profile.skills.length - 6), accepted: false, optional: true, reason: "Leaves out skills this job doesn't mention, for a more focused CV" }));
  for (const e of profile.experience) {
    if (e.bullets.length < 5) continue;
    const scored = e.bullets.map((b, i) => ({ b, i, r: isStackLine(b) ? 99 : relevance(b, focus) })).filter((x) => x.r === 0);
    for (const x of scored.slice(0, e.bullets.length - 4)) changes.push(make({ kind: "bullet-drop", experienceId: e.id, index: x.i, before: x.b, accepted: false, optional: true, reason: "Doesn't bear on this job; leaving it out shortens the CV" }));
  }

  return { changes, closeGaps: basicCloseGaps(gapSkills(match, post)) };
}
