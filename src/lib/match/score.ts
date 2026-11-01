import type { JobPost, KeywordHit, Match, Profile } from "@/lib/model/types";
import { canonical, containsTerm, overlap } from "@/lib/text";
import { isSkillKeyword } from "./skills";

/** Places in a profile that count as evidence: things you did, not just things you list. */
export function evidenceLines(p: Profile): string[] {
  return [
    p.summary,
    ...p.experience.flatMap((e) => [`${e.title} at ${e.company}`, ...e.bullets]),
    ...p.projects.flatMap((x) => [x.name, ...x.bullets]),
    ...p.education.flatMap((e) => e.details),
  ].filter(Boolean);
}

/** Places that only name a skill. */
export function listedLines(p: Profile): string[] {
  return [p.headline, ...p.skills, ...p.certifications, ...p.languages, ...p.education.map((e) => `${e.degree} ${e.school}`)].filter(Boolean);
}

function locate(keyword: string, shown: string[], listed: string[]): KeywordHit {
  const line = shown.find((l) => containsTerm(l, keyword));
  if (line) return { keyword, where: "shown", evidence: line };
  const item = listed.find((l) => containsTerm(l, keyword));
  if (item) return { keyword, where: "listed", evidence: item };
  return { keyword, where: "missing", evidence: null };
}

const CREDIT = { shown: 1, listed: 0.6, missing: 0 } as const;

/**
 * How well a profile covers a job post. Keywords named in must-have requirements count
 * double. A skill only listed (not shown in any role or project) counts for a bit over half,
 * because recruiters and screening software both look for it in context.
 */
export function scoreMatch(profile: Profile, post: JobPost): Match {
  const shown = evidenceLines(profile);
  const listed = listedLines(profile);

  const weights = new Map<string, { keyword: string; weight: number }>();
  const add = (k: string, w: number) => {
    const key = canonical(k);
    if (!key) return;
    const cur = weights.get(key);
    if (!cur || cur.weight < w) weights.set(key, { keyword: cur?.keyword ?? k.trim(), weight: w });
  };
  // Durations, activities and audiences ("3+ years", "onboarding calls") are not skills to match.
  for (const r of post.requirements) for (const k of r.keywords.filter(isSkillKeyword)) add(k, r.kind === "must" ? 2 : 1);
  for (const k of post.keywords.filter(isSkillKeyword)) add(k, 1);

  const keywords = [...weights.values()].map(({ keyword }) => locate(keyword, shown, listed));
  let total = 0;
  let earned = 0;
  for (const hit of keywords) {
    const w = weights.get(canonical(hit.keyword))!.weight;
    total += w;
    earned += w * CREDIT[hit.where];
  }

  const requirements = post.requirements.map((r) => {
    const named = r.keywords.filter(isSkillKeyword);
    if (named.length > 0) {
      const hits = named.map((k) => keywords.find((h) => canonical(h.keyword) === canonical(k)) ?? locate(k, shown, listed));
      const status = hits.some((h) => h.where === "missing") ? "missing" : hits.some((h) => h.where === "listed") ? "listed" : "shown";
      return { text: r.text, kind: r.kind, status, evidence: hits.find((h) => h.evidence)?.evidence ?? null } as const;
    }
    // Requirements with no named skill ("experience reducing churn"): judge by shared words.
    // Proof from a role or project counts as shown; a match only in the skills list counts as listed.
    const best = (lines: string[]) => lines.map((l) => ({ l, o: overlap(r.text, l) })).sort((a, b) => b.o - a.o)[0];
    const inWork = best(shown);
    if (inWork && inWork.o >= 0.5) return { text: r.text, kind: r.kind, status: "shown", evidence: inWork.l } as const;
    const inList = best(listed);
    if (inList && inList.o >= 0.5) return { text: r.text, kind: r.kind, status: "listed", evidence: inList.l } as const;
    return { text: r.text, kind: r.kind, status: "missing", evidence: null } as const;
  });

  return { score: total ? Math.round((earned / total) * 100) : 0, keywords, requirements };
}

export function scoreLabel(score: number): string {
  if (score >= 75) return "Strong match";
  if (score >= 50) return "Worth applying, with a tailored CV";
  if (score >= 30) return "A stretch";
  return "Big gaps";
}
