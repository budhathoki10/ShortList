import type { Profile } from "@/lib/model/types";
import { splitSentences } from "@/lib/text";

export type CvContent = "focused" | "full";

/** Select verbatim source highlights for a readable CV. The saved profile is never changed. */
export function presentCv(profile: Profile, content: CvContent = "full"): Profile {
  if (content === "full") return structuredClone(profile);
  const result = structuredClone(profile);
  result.summary = splitSentences(profile.summary).slice(0, 2).join(" ");
  result.projects = profile.projects.map((project) => {
    const stack = project.bullets.find((s) => /^Tech Stack:/i.test(s));
    const sentences = project.bullets.filter((s) => !/^Tech Stack:/i.test(s)).flatMap(splitSentences).filter(Boolean);
    const score = (s: string) => {
      const useful = s.match(/\b(built|designed|developed|implemented|validat\w*|signature|queue|worker|background|retri\w*|spam|rank\w*|duplicate\w*|prevent\w*|approve\w*|webhook\w*|testing|deploy\w*)\b/gi) ?? [];
      return useful.length + (/\bI (?:wrote|built|designed)/i.test(s) ? 3 : 0) + (/\d/.test(s) ? 1 : 0);
    };
    const selected = new Set<number>();
    if (sentences.length) selected.add(0);
    sentences.map((text, index) => ({ text, index, score: score(text) })).filter((s) => s.index > 0 && s.text.length > 40)
      .sort((a, b) => b.score - a.score || a.index - b.index).slice(0, 2).forEach((s) => selected.add(s.index));
    const bullets = sentences.filter((_, index) => selected.has(index));
    if (stack) bullets.unshift(stack.replace(/^Tech Stack:\s*/i, "Technologies: ").split(/,\s*/).slice(0, 6).join(", "));
    return { ...project, bullets };
  });
  result.education = result.education.map((e) => ({ ...e, details: e.details.slice(0, 1) }));
  return result;
}

/** Skills as printable lines: one per group ("Languages: JavaScript, Python") when the CV has grouped skills, otherwise null. */
export function skillGroupLines(cv: Profile): { label: string; items: string }[] | null {
  const groups = cv.skillGroups?.filter((g) => g.skills.length > 0);
  return groups && groups.length > 1 ? groups.map((g) => ({ label: g.label, items: g.skills.join(", ") })) : null;
}
