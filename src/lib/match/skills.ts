import { SKILL_TERMS } from "@/lib/jobs/skills-dictionary";
import { canonical } from "@/lib/text";

/**
 * Which "keywords" are real, nameable skills. Job posts (and models reading them) also hand
 * back durations, activities and audiences: "3+ years", "onboarding calls", "business
 * customers". Those are neither addable to a CV nor worth counting in a match.
 */

const DICTIONARY = new Map<string, string>(SKILL_TERMS.map((t) => [canonical(t), t]));

/** Soft skills are real keywords for matching, but not something to "add" with one sentence. */
const SOFT = new Set(["communication", "teamwork", "leadership", "problem solving", "time management", "attention to detail", "written communication", "verbal communication", "collaboration", "adaptability", "creativity", "organisation", "organization"]);

/** Words that mark a phrase as an activity, an audience, a duration or filler rather than a skill. */
const GENERIC_WORDS = new Set(
  `years year months month yrs experience experienced knowledge understanding ability skills skill background track record proven strong good great excellent solid
  calls call meetings meeting customers customer clients client users user business businesses stakeholders stakeholder people team teams colleagues candidates companies company
  accounts account partners partner environment environments responsibility responsibilities duties tasks task work working role roles job position positions
  reducing reduce reduced running run managing handling helping supporting building driving owning delivering working collaborating communicating
  fast-paced fast paced detail-oriented self-starter motivated passionate hardworking independent comfortable familiar familiarity willingness willing eager
  degree level senior junior mid entry hours hour day days week weeks remote hybrid onsite office full-time part-time contract salary benefits`.split(/\s+/),
);

const QUALIFICATION = /\b(certified|certification|certificate|licen[sc]e|licen[sc]ed|diploma|degree|bachelor'?s?|master'?s?|ph\.?d|mba|cpa|acca|cfa|pmp|aws certified|first aid)\b/i;

/** A term the dictionary or a tool-like spelling vouches for: C++, Node.js, HubSpot, GraphQL, AWS. */
function toolLike(term: string): boolean {
  if (/[+#]/.test(term) || /[a-z]\.[a-z]/i.test(term) || /^\.[a-z]/i.test(term)) return true;
  if (/^[A-Z][A-Z0-9]{1,6}$/.test(term)) return true;
  if (/^[a-z]+[A-Z][A-Za-z]*$/.test(term) || /^[A-Z][a-z]+[A-Z][A-Za-z]*$/.test(term)) return true; // camelCase, HubSpot
  return false;
}

/** True for concrete, nameable skills, tools, technologies, certifications and languages. */
export function isSkillKeyword(raw: string): boolean {
  const term = raw.trim();
  if (!term || term.length > 40) return false;
  if (DICTIONARY.has(canonical(term))) return true;
  if (/^\d|^\W*\d+\s*\+?\s*(years?|yrs?|months?)\b/i.test(term)) return false;
  const words = term.split(/\s+/);
  if (QUALIFICATION.test(term) && words.length <= 5) return true;
  // A lone capitalised word is probably a product name (Intercom, Freshdesk) unless it is an everyday abstract noun.
  if (words.length === 1) return toolLike(term) || (/^[A-Z][a-z]{3,}$/.test(term) && !GENERIC_WORDS.has(term.toLowerCase()) && !/(ing|tion|sion|ity|ness|ment|ship|ence|ance|ous|ful|ive|al)$/i.test(term));
  // A phrase is a skill when it is built from dictionary skills ("Google Analytics") and nothing generic.
  if (words.some((w) => GENERIC_WORDS.has(w.toLowerCase()))) return false;
  return words.every((w) => DICTIONARY.has(canonical(w)) || toolLike(w)) || DICTIONARY.has(canonical(words.slice(0, 2).join(" ")));
}

/** A keyword the candidate could genuinely add to a CV: a skill, but not a soft skill. */
export function isAddableSkill(raw: string): boolean {
  return isSkillKeyword(raw) && !SOFT.has(canonical(raw));
}
