import type { Profile } from "@/lib/model/types";
import { SKILL_TERMS } from "@/lib/jobs/skills-dictionary";
import { containsTerm } from "@/lib/text";

/**
 * The fact check: every number, name, tool, acronym or qualification in rewritten text must
 * already appear in the user's profile. Rewording is fine; new facts are not.
 */

/** Everything the profile says, as one lowercase string. */
export function profileCorpus(p: Profile): string {
  return [
    p.name,
    p.headline,
    p.location,
    p.summary,
    ...p.links,
    ...p.experience.flatMap((e) => [e.title, e.company, e.location, e.start, e.end, ...e.bullets]),
    ...p.education.flatMap((e) => [e.school, e.degree, e.start, e.end, ...e.details]),
    ...p.projects.flatMap((x) => [x.name, x.link, ...x.bullets]),
    ...p.skills,
    ...p.certifications,
    ...p.languages,
  ]
    .join("\n")
    .toLowerCase();
}

const QUALIFICATIONS =
  /\b(bachelor'?s?|master'?s?|ph\.?d|doctorate|mba|bba|bbs|bca|bim|bit|bsc|bsw|b\.?ed|bpharm|mbbs|bds|llb|llm|msc|mbs|mca|m\.?ed|ma|ba|b\.?tech|m\.?tech|b\.?e|degree|diploma|certified|certification|certificate|licensed|chartered|cpa|acca|cfa|pmp)\b/gi;

/** Capitalised words that are ordinary English at the start of a clause, or common in CVs. */
const ORDINARY = new Set(
  "i a an the and or but in on at to for with of by as from my our we led built created designed developed improved increased reduced managed delivered launched ran wrote owned shipped drove grew cut helped worked supported handled trained mentored coordinated organised organized planned analysed analyzed implemented maintained introduced automated streamlined resolved collaborated partnered prepared presented negotiated achieved over under more than".split(
    " ",
  ),
);

const GENERIC = /^(degree|diploma|certified|certification|certificate|licensed)$/i;

const MONTHS = /^(jan|feb|mar|apr|may|jun|jul|aug|sep|sept|oct|nov|dec)[a-z]*$/i;

function numbersIn(s: string): string[] {
  return (s.match(/\d[\d,.]*\d|\d/g) ?? []).map((n) => n.replace(/,/g, "").replace(/\.0+$/, "").replace(/\.$/, ""));
}

/**
 * Words that carry facts: anything with a digit or a symbol like + # . /, all-caps
 * acronyms, and capitalised words that aren't starting a sentence (names of employers,
 * products, places and tools).
 */
function factWords(s: string): string[] {
  const out: string[] = [];
  for (const sentence of s.split(/(?<=[.!?:;])\s+|\n+/)) {
    const words = sentence.match(/[A-Za-z0-9][A-Za-z0-9+#.&/'’-]*[A-Za-z0-9+#]|[A-Za-z0-9]/g) ?? [];
    words.forEach((raw, i) => {
      const w = raw.replace(/['’]s$/i, "");
      if (/^\d/.test(w)) return; // numbers are checked separately
      const lower = w.toLowerCase();
      if (ORDINARY.has(lower) || MONTHS.test(w) || /^i['’](m|d|ve|ll)$/i.test(w)) return;
      const technical = /[+#]|[a-z]\.[a-z]|\//i.test(w);
      const acronym = /^[A-Z0-9]{2,}$/.test(w);
      const properNoun = i > 0 && /^[A-Z]/.test(w);
      const camel = /[a-z][A-Z]/.test(w);
      if (technical || acronym || properNoun || camel) out.push(w);
    });
  }
  return out;
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function inCorpus(word: string, corpus: string): boolean {
  return new RegExp(`(^|[^a-z0-9+#])${escape(word.toLowerCase())}(?![a-z0-9+#])`).test(corpus);
}

/** Facts in `text` that the profile (plus any `extra` allowed text, like the job post for a cover letter) doesn't support. */
export function unsupportedFacts(text: string, profile: Profile, extra = ""): string[] {
  const corpus = `${profileCorpus(profile)}\n${extra.toLowerCase()}`;
  const corpusNumbers = new Set(numbersIn(corpus));
  const flags = new Set<string>();
  // Skills at the start of a sentence or written in lowercase are still factual claims.
  for (const skill of SKILL_TERMS) if (containsTerm(text, skill)) {
    const evidence = corpus.split(/\n|(?<=[.!?])\s+/).some((line) => containsTerm(line, skill) && !/\b(no|not|never|haven.t|learning|plan to learn|want to learn)\b/i.test(line));
    if (!evidence) flags.add(skill);
  }
  for (const n of numbersIn(text)) if (!corpusNumbers.has(n)) flags.add(n);
  for (const w of factWords(text)) if (!inCorpus(w, corpus)) flags.add(w);
  const hasAnyQualification =
    profile.education.length > 0 || profile.certifications.length > 0 || new RegExp(QUALIFICATIONS.source, "i").test(corpus);
  for (const q of text.match(QUALIFICATIONS) ?? []) {
    // "degree" or "certified" is fine if the profile names any qualification; "MBA" needs an MBA.
    if (GENERIC.test(q) ? hasAnyQualification : inCorpus(q.replace(/'s$/, ""), corpus)) continue;
    flags.add(q);
  }
  return [...flags];
}

/** Employer requirements can support company context, never the applicant's claimed experience. */
export function unsupportedExperienceClaims(text: string, profile: Profile, candidateAnswer = ""): string[] {
  const flags = new Set<string>();
  for (const clause of text.split(/(?<=[.!?])\s+|\n|\bbut\b|\bhowever\b/i)) {
    if (!/\b(I|we|my|our)\b/i.test(clause) || !/\b(used|use|built|work|worked|experience|experienced|proficient|expertise|skilled|led|implemented|developed|managed|bring|have|hold|earned|achieved)\b/i.test(clause)) continue;
    if (/\b(have not|haven.t|never|not yet|no experience|learning|want to learn|would learn|eager to learn)\b/i.test(clause)) continue;
    for (const fact of unsupportedFacts(clause, profile, candidateAnswer)) flags.add(fact);
  }
  return [...flags];
}

/** Words that claim standing or depth. They must already be in the CV's own words: a JavaScript developer is never made a "specialist" or "expert" in anything new. */
const STRONG_CLAIMS = /\b(expert\w*|specialist\w*|specialis(?:e|ed|es|ing)|specializ(?:e|ed|es|ing)|proficien(?:t|cy)|fluent|fluency|mastery|masterful|advanced|seasoned|veteran|senior|principal|architect\w*|director|head of|chief|certified)\b/gi;

/** Role-family nouns a headline may swap between (Developer ↔ Engineer). They carry no tool, employer or seniority. */
const ROLE_NOUNS = new Set("engineer developer programmer associate analyst designer consultant representative agent coordinator administrator officer executive technician assistant".split(" "));

const stemOf = (w: string) => w.toLowerCase().replace(/(ing|ed|es|s)$/, "");

/** One-letter languages are easy to slip past a tool check: "C specialist", "R and Python". */
function unsupportedLetterLanguages(text: string, corpus: string): string[] {
  const out: string[] = [];
  for (const lang of ["C", "R"]) {
    if (!new RegExp(`(^|[^A-Za-z0-9+#])${lang}(?![A-Za-z0-9+#&]|\\.[a-z])`).test(text)) continue;
    if (!new RegExp(`(^|[^a-z0-9+#])${lang.toLowerCase()}(?![a-z0-9+#&]|\\.[a-z])`).test(corpus)) out.push(lang);
  }
  return out;
}

/** Strong claim words that the profile never uses. */
export function unsupportedStrongClaims(text: string, profile: Profile): string[] {
  const corpus = profileCorpus(profile);
  const corpusStems = new Set((corpus.match(/[a-z]+/g) ?? []).map(stemOf));
  const flags = new Set<string>();
  for (const m of text.match(STRONG_CLAIMS) ?? []) {
    const word = m.toLowerCase();
    if (!corpusStems.has(stemOf(word.split(" ")[0])) && !corpus.includes(word)) flags.add(m);
  }
  return [...flags];
}

/**
 * The check for anything written onto the CV (summary, headline, bullets, skill labels): the
 * ordinary fact check, plus one-letter languages and strong claims like "specialist" or "senior".
 * `allowRoleNouns` lets a headline say Engineer where the CV says Developer.
 */
export function unsupportedCvFacts(text: string, profile: Profile, opts: { allowRoleNouns?: boolean } = {}): string[] {
  const corpus = profileCorpus(profile);
  const flags = new Set<string>([...unsupportedFacts(text, profile), ...unsupportedLetterLanguages(text, corpus), ...unsupportedStrongClaims(text, profile)]);
  if (opts.allowRoleNouns) for (const f of [...flags]) if (ROLE_NOUNS.has(f.toLowerCase())) flags.delete(f);
  return [...flags];
}
