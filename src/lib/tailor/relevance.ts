import type { JobPost, Profile, SkillGroup } from "@/lib/model/types";
import { isSkillKeyword } from "@/lib/match/skills";
import { canonical, containsTerm, overlap } from "@/lib/text";

/**
 * How relevant a line of the CV is to one job. Pure and deterministic: the plain-code
 * tailoring uses it directly, and it fills in the ordering the AI leaves out.
 */

export type Focus = { terms: { term: string; weight: number }[]; requirements: { text: string; weight: number }[]; title: string };

export function focusOf(post: JobPost): Focus {
  const weights = new Map<string, { term: string; weight: number }>();
  const add = (term: string, weight: number) => {
    const key = canonical(term);
    if (!key || !isSkillKeyword(term)) return;
    const cur = weights.get(key);
    if (!cur || cur.weight < weight) weights.set(key, { term: cur?.term ?? term.trim(), weight });
  };
  for (const r of post.requirements) for (const k of r.keywords) add(k, r.kind === "must" ? 3 : 1.5);
  for (const k of post.keywords) add(k, 1);
  return { terms: [...weights.values()], requirements: post.requirements.map((r) => ({ text: r.text, weight: r.kind === "must" ? 2 : 1 })), title: post.title };
}

export function relevance(line: string, focus: Focus): number {
  if (!line.trim()) return 0;
  let score = 0;
  for (const t of focus.terms) if (containsTerm(line, t.term)) score += t.weight;
  for (const r of focus.requirements) {
    const o = overlap(r.text, line);
    if (o >= 0.4) score += r.weight * o;
  }
  if (focus.title) score += overlap(focus.title, line);
  return score;
}

/** Indexes of `items` from most to least relevant; ties keep their original order. */
export function rankIndexes(items: string[], focus: Focus): number[] {
  return items.map((text, i) => ({ i, r: relevance(text, focus) })).sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.i);
}

const STACK = /^(?:Tech Stack|Technologies|Skills)\s*:/i;
export const isStackLine = (s: string) => STACK.test(s);

export function entryRelevance(texts: string[], title: string, focus: Focus): number {
  const scores = texts.filter((t) => !isStackLine(t)).map((t) => relevance(t, focus)).sort((a, b) => b - a);
  return scores.slice(0, 3).reduce((n, v) => n + v, 0) + relevance(title, focus);
}

const GROUPS: [string, string[]][] = [
  ["Languages", ["JavaScript", "TypeScript", "Python", "Java", "C#", "C++", "C", "Go", "Rust", "PHP", "Ruby", "Swift", "Kotlin", "SQL", "HTML", "CSS", "R"]],
  ["Frontend", ["React", "Next.js", "Vue", "Angular", "Svelte", "Tailwind", "React Native", "Flutter", "Android", "iOS", "Figma", "Sketch"]],
  ["Backend & data", ["Node.js", "Express", "Django", "Flask", "FastAPI", "Spring", ".NET", "Laravel", "Rails", "GraphQL", "REST", "PostgreSQL", "MySQL", "MongoDB", "Redis", "Elasticsearch", "Kafka", "Snowflake", "BigQuery", "Spark", "Airflow", "ETL"]],
  ["Tools & infrastructure", ["Docker", "Kubernetes", "Terraform", "AWS", "Azure", "Google Cloud", "Linux", "Git", "CI/CD", "Jest", "Playwright", "Cypress"]],
  ["Tools", ["Zendesk", "HubSpot", "Salesforce", "CRM", "Excel", "Jira", "Google Workspace", "Microsoft Office", "Mailchimp", "WordPress", "Shopify", "Tableau", "Power BI", "Looker", "QuickBooks", "Xero", "Tally", "SAP", "Canva", "Google Analytics", "Google Ads"]],
];
const GROUP_OF = new Map(GROUPS.flatMap(([label, skills]) => skills.map((s) => [canonical(s), label] as const)));

/** Which heading a known skill belongs under ("Languages", "Tools"…), or null if it is not in the list. */
export const groupOf = (skill: string): string | null => GROUP_OF.get(canonical(skill)) ?? null;

export function skillRelevance(skill: string, focus: Focus): number {
  return focus.terms.reduce((n, t) => n + (containsTerm(skill, t.term) || canonical(skill) === canonical(t.term) ? t.weight : 0), 0);
}

/** The skills most relevant first, as before: only the person's own skills, no additions. */
export function orderSkills(skills: string[], focus: Focus): string[] {
  return skills.map((s, i) => ({ s, i, r: skillRelevance(s, focus) })).sort((a, b) => b.r - a.r || a.i - b.i).map((x) => x.s);
}

/**
 * Groups the person's own skills under plain headings when the list is mixed enough to
 * benefit. Returns null for a short or unfamiliar list, which is better left as one line.
 */
export function groupSkills(skills: string[], focus: Focus): SkillGroup[] | null {
  if (skills.length < 5) return null;
  const buckets = new Map<string, string[]>();
  let unknown = 0;
  for (const s of orderSkills(skills, focus)) {
    const label = GROUP_OF.get(canonical(s)) ?? "Other";
    if (label === "Other") unknown++;
    buckets.set(label, [...(buckets.get(label) ?? []), s]);
  }
  if (unknown > skills.length / 2 || buckets.size < 2) return null;
  const groups = [...buckets].map(([label, list]) => ({ label, skills: list, top: Math.max(...list.map((s) => skillRelevance(s, focus))) }));
  const order = (l: string) => [...GROUPS.map(([g]) => g), "Other"].indexOf(l);
  groups.sort((a, b) => b.top - a.top || order(a.label) - order(b.label));
  return groups.map(({ label, skills: list }) => ({ label, skills: list }));
}

/** A profile's text blocks that can honestly stand in a summary: its own sentences, with where each came from. */
export function candidateSentences(profile: Profile): { text: string; from: "summary" | "work" }[] {
  const out: { text: string; from: "summary" | "work" }[] = [];
  const seen = new Set<string>();
  const push = (text: string, from: "summary" | "work") => {
    const t = text.trim();
    if (t.length < 20 || seen.has(t.toLowerCase())) return;
    seen.add(t.toLowerCase());
    out.push({ text: t, from });
  };
  for (const s of splitForSummary(profile.summary)) push(s, "summary");
  for (const e of profile.experience) for (const b of e.bullets) if (!isStackLine(b)) push(b, "work");
  for (const p of profile.projects) for (const b of p.bullets) if (!isStackLine(b)) push(b, "work");
  return out;
}

function splitForSummary(text: string): string[] {
  return text.split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/).map((s) => s.trim()).filter(Boolean);
}
