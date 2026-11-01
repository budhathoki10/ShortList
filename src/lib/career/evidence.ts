import { createHash } from "node:crypto";
import { profileHash } from "@/lib/cv/original";
import type { JobPost, Profile } from "@/lib/model/types";
import { canonical, containsTerm, overlap } from "@/lib/text";
import { SKILL_TERMS } from "@/lib/jobs/skills-dictionary";
import type { ApplicationPlan, AssessedRequirement, CareerContext, RequirementCategory } from "./types";

export const normaliseEvidence = (text: string) => text.toLowerCase().replace(/[‘’]/g, "'").replace(/\s+/g, " ").trim();
export const exactEvidence = (quote: string, source: string) => quote.trim().length >= 8 && normaliseEvidence(source).includes(normaliseEvidence(quote));
export function careerFingerprint({ profile, postText, post }: CareerContext) {
  return createHash("sha256").update(`${profileHash(profile)}\n${postText}\n${JSON.stringify(post)}`).digest("hex");
}
const categoryOf = (text: string): RequirementCategory => /\b(degree|bachelor|master|diploma|licen[sc]e|certifi|qualification)/i.test(text) ? "qualification" : /\b(years?|months?)\b.*\b(experience|working)|\bexperience\b.*\b(years?|months?)/i.test(text) ? "experience" : "skill";

/** Read the whole description, retaining the employer's words instead of silently discarding responsibilities. */
export function sourceRequirements(postText: string, post: JobPost) {
  const rows: { text: string; quote: string; category: RequirementCategory; priority: "must" | "preferred"; skills: string[] }[] = [];
  let section: "must" | "preferred" | "responsibility" | "other" = "other";
  for (const raw of postText.split(/\n/)) {
    const text = raw.replace(/^\s*(?:[-•*▪●◦–]|\d+[.)])\s*/, "").trim();
    const heading = text.replace(/[:#*]/g, "").trim();
    if (!/^\s*(?:[-•*▪●◦–]|\d+[.)])\s+/.test(raw) && heading.length < 80) {
      if (/^(preferred|nice.to.have|bonus|desirable|optional)/i.test(heading)) { section = "preferred"; continue; }
      if (/^(requirements?|qualifications?|essential|minimum|what.*need|what.*looking for|skills|about you|who you are)/i.test(heading)) { section = "must"; continue; }
      if (/^(responsibilities|what.*do|your impact|the role|duties)/i.test(heading)) { section = "responsibility"; continue; }
      if (/^(benefits|perks|compensation|about us|about the company|how to apply|what we offer)/i.test(heading)) { section = "other"; continue; }
    }
    if (text.length < 12 || text.length > 2000 || section === "other") continue;
    rows.push({ text, quote: text, category: section === "responsibility" ? "responsibility" : categoryOf(text), priority: section === "preferred" || /\b(preferred|bonus|nice.to.have|optional)\b/i.test(text) ? "preferred" : "must", skills: SKILL_TERMS.filter((skill) => containsTerm(text, skill)) });
  }
  for (const r of post.requirements) {
    // AI paraphrases aren't treated as direct quotations. Find the actual supporting source line.
    const line = postText.split(/\n/).map((l) => l.replace(/^\s*[-•*]\s*/, "").trim()).find((l) => normaliseEvidence(l) === normaliseEvidence(r.text));
    if (line && !rows.some((x) => normaliseEvidence(x.text) === normaliseEvidence(line))) rows.push({ text: line, quote: line, category: categoryOf(line), priority: r.kind === "nice" ? "preferred" : "must", skills: r.keywords.filter((s) => containsTerm(line, s)) });
  }
  if (!rows.length) for (const text of postText.split(/\n+|(?<=[.!?])\s+/).map((s) => s.trim())) {
    if (text.length < 20 || text.length > 2000 || !/\b(must|required|preferred|proficien\w*|experience with|years of|you will|you.ll|responsible for)\b/i.test(text)) continue;
    rows.push({ text, quote: text, category: /\b(you will|you.ll|responsible for)\b/i.test(text) ? "responsibility" : categoryOf(text), priority: /\b(preferred|bonus|optional|nice.to.have)\b/i.test(text) ? "preferred" : "must", skills: SKILL_TERMS.filter((s) => containsTerm(text, s)) });
  }
  return [...new Map(rows.map((row) => [normaliseEvidence(row.quote), row])).values()].slice(0, 100);
}

const notEvidence = (text: string, term: string) => new RegExp(`(?:no|not|never|without|learning|plan to learn|want to learn)\\b[^.!?;]{0,55}${term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}`, "i").test(text);
export function assessRequirement(row: ReturnType<typeof sourceRequirements>[number], profile: Profile): AssessedRequirement {
  const stack = /^(?:Tech Stack|Technologies|Skills)\s*:/i;
  const proofRows = [
    ...profile.projects.flatMap((p) => p.bullets.filter((b) => !stack.test(b)).map((text) => ({ text, evidence: `${p.name}: ${text}` }))),
    ...profile.experience.flatMap((e) => e.bullets.filter((b) => !stack.test(b)).map((text) => ({ text, evidence: `${e.title} at ${e.company}: ${text}` }))),
  ];
  const proof = proofRows.map((p) => p.evidence);
  const listed = [profile.headline, ...profile.skills, ...profile.certifications, ...profile.education.map((e) => `${e.degree} ${e.school}`), ...profile.projects.flatMap((p) => p.bullets.filter((b) => stack.test(b)).map((b) => `${p.name}: ${b}`))];
  const terms = [...new Map(row.skills.filter((s) => containsTerm(row.quote, s)).map((s) => [canonical(s), s])).values()];
  const hits = terms.map((term) => ({ term, proof: proofRows.find((s) => containsTerm(s.text, term) && !notEvidence(s.text, term))?.evidence, listed: listed.find((s) => containsTerm(s, term) && !notEvidence(s, term)) }));
  let status: AssessedRequirement["status"] = "unclear";
  let evidence: string[] = [];
  let explanation = "This requirement needs a manual evidence check; word overlap alone does not prove it.";
  if (hits.length) {
    evidence = [...new Set(hits.flatMap((h) => h.proof ?? h.listed ?? []))];
    status = hits.some((h) => !h.proof && !h.listed) ? "missing" : hits.every((h) => h.proof) ? "shown" : "listed";
    explanation = status === "shown" ? "Your project or work descriptions provide evidence for the named skills." : status === "listed" ? "Named in your CV, but practical use is not demonstrated for every skill." : `Not evidenced in the CV: ${hits.filter((h) => !h.proof && !h.listed).map((h) => h.term).join(", ")}.`;
  } else {
    const pool = row.category === "qualification" ? profile.education.map((e) => `${e.degree} ${e.school}`).concat(profile.certifications) : proof;
    const exact = pool.find((s) => normaliseEvidence(s).includes(normaliseEvidence(row.text)));
    if (exact) { status = "shown"; evidence = [exact]; explanation = "The source CV explicitly states this requirement."; }
    else {
      // Same bar as the instant check on the job page (half the requirement's words, allowing for inflection
      // and everyday synonyms), so the two never disagree: "Experience reducing churn" vs "Kept churn under 3%".
      const close = pool.map((s) => ({ s, o: overlap(row.text, s) })).filter((x) => x.o >= 0.5).sort((a, b) => b.o - a.o);
      evidence = close.slice(0, 2).map((x) => x.s);
      if (close.length && row.category !== "qualification") { status = "shown"; explanation = "Your CV describes this work in its own words."; }
    }
  }
  if (/\b\d+\s*\+?\s*(years?|months?)\b|\b(right to work|work authori[sz]ation|visa|citizenship|clearance)\b/i.test(row.text) && status !== "missing") {
    status = "unclear"; explanation = "Duration or eligibility needs explicit verification. Listing a skill does not prove tenure or legal eligibility.";
  }
  if (row.category === "qualification" && !evidence.some((e) => profile.education.some((q) => e.includes(q.degree) && !!q.degree) || profile.certifications.includes(e))) {
    status = "unclear"; explanation = "Verify the actual qualification, completion status and equivalence; skill keywords do not prove a degree or licence.";
  }
  return { ...row, id: createHash("sha256").update(normaliseEvidence(row.quote)).digest("hex").slice(0, 16), skills: terms, unprovenSkills: hits.filter((h) => !h.proof && !h.listed).concat(hits.filter((h) => !h.proof && !!h.listed)).map((h) => h.term), status, evidence: evidence.slice(0, 3), explanation };
}

export function evidenceFit(requirements: AssessedRequirement[]): ApplicationPlan["fit"] {
  const weight = (r: AssessedRequirement) => r.priority === "must" ? 3 : 1;
  const score = Math.round(100 * requirements.reduce((n, r) => n + weight(r) * (r.status === "shown" ? 1 : r.status === "listed" ? 0.45 : 0), 0) / (requirements.reduce((n, r) => n + weight(r), 0) || 1));
  const counts = { shown: 0, listed: 0, missing: 0, unclear: 0 };
  for (const r of requirements) counts[r.status]++;
  const essentialGaps = requirements.filter((r) => r.priority === "must" && (r.status === "missing" || r.status === "unclear")).length;
  return { score, ...counts, priority: score >= 70 && !essentialGaps ? "apply" : score >= 40 ? "prepare" : "stretch", explanation: "CV evidence coverage, not a hiring probability: must-haves weigh 3, preferences 1; demonstrated evidence earns full credit, a listed skill 45%, and missing or unverified evidence 0%. Inferred expectations are excluded. A high score does not override eligibility or qualification gaps." };
}
