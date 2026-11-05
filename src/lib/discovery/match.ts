import type { CareerPassportDoc, DiscoveredJobDoc, EligibilityFinding, JobRecommendationDoc, RecommendationState } from "@/db/types";
import { eligibilityFindings } from "./eligibility";
import { scoreMatch } from "@/lib/match/score";
import type { Profile } from "@/lib/model/types";
import { canonical, overlap } from "@/lib/text";

/** 3: remote-feed postings limited to a region the Career Passport doesn't cover are marked "Verify first". */
export const DISCOVERY_RULE_VERSION = 3;

const words = (value: string) => canonical(value).split(" ").filter((word) => word.length > 2);

/** Titles that name the same job: "Backend Engineer" is a "Backend Developer". */
const SAME_WORD: Record<string, string> = { engineer: "developer", programmer: "developer", dev: "developer", swe: "developer", engineers: "developer", developers: "developer" };
/** Words nearly every title has. Sharing only these says nothing about the role, so they never carry a match alone. */
const GENERIC_WORDS = new Set(["developer", "manager", "officer", "specialist", "associate", "assistant", "executive", "lead", "senior", "junior", "staff", "principal"]);
const roleWords = (value: string) => words(value).map((word) => SAME_WORD[word] ?? word);

export function roleCompatibility(title: string, targets: string[]): number {
  if (!targets.length) return 0;
  return Math.max(...targets.map((target) => {
    const titleWords = new Set(roleWords(title));
    const targetWords = roleWords(target);
    const exact = canonical(title).includes(canonical(target)) || canonical(target).includes(canonical(title));
    if (exact) return 100;
    const matched = targetWords.filter((word) => titleWords.has(word));
    // "Backend Developer" must match on "backend": "Android Developer" shares only the generic word.
    if (targetWords.some((word) => !GENERIC_WORDS.has(word)) && matched.every((word) => GENERIC_WORDS.has(word))) return 0;
    return Math.round((matched.length / Math.max(1, targetWords.length)) * 100);
  }));
}

function preferenceScore(job: DiscoveredJobDoc, passport: CareerPassportDoc, roleScore: number) {
  let score = roleScore * 0.8;
  const locationText = canonical(job.location);
  if (!passport.locations.length || passport.locations.some((place) => locationText.includes(canonical(place)))) score += 20;
  return Math.min(100, Math.round(score));
}

function explicitWorkMode(job: DiscoveredJobDoc): CareerPassportDoc["remoteModes"][number] | null {
  const value = canonical(`${job.location} ${job.title} ${job.post.summary}`);
  if (/\bhybrid\b/.test(value)) return "hybrid";
  if (/\bremote\b|\bwork from home\b/.test(value)) return "remote";
  if (/\bon[- ]site\b|\bonsite\b|\bin[- ]office\b/.test(value)) return "onsite";
  return null;
}

function explicitEmploymentType(job: DiscoveredJobDoc) {
  const value = canonical(`${job.title} ${job.text.slice(0, 2_000)}`);
  if (/\bintern(ship)?\b/.test(value)) return "internship";
  if (/\bpart[- ]time\b/.test(value)) return "part-time";
  if (/\bcontract(or)?\b|\btemporary\b/.test(value)) return "contract";
  if (/\bfull[- ]time\b/.test(value)) return "full-time";
  return null;
}

const ANYWHERE = /\b(worldwide|anywhere|global|international|any location|all countries)\b/i;

/** How job posts spell the same place, so "USA" on your passport also matches "United States" or "US only". */
const PLACE_ALIASES: string[][] = [
  ["usa", "us", "u.s.", "united states", "america", "north america"],
  ["uk", "united kingdom", "britain", "england"],
  ["eu", "europe", "emea", "european union"],
  ["apac", "asia", "asia pacific"],
  ["uae", "united arab emirates", "dubai", "mena", "middle east"],
  ["canada", "north america"],
  ["australia", "anz", "apac"],
];

const expandPlace = (place: string) => [place, ...PLACE_ALIASES.filter((group) => group.includes(place)).flat()];
const mentions = (region: string, place: string) => (place.length > 3 ? region.includes(place) : new RegExp(`(^|[^a-z])${place.replace(/\./g, "\\.")}([^a-z]|$)`).test(region));

/**
 * Remote feeds write their region limit into the location ("Remote (USA only)"). A remote role open only to a region
 * the person hasn't listed as a place they can work or want to work is not "Ready to apply" for them: it needs checking.
 */
export function remoteRegionFinding(job: Pick<DiscoveredJobDoc, "location">, passport: Pick<CareerPassportDoc, "workCountries" | "locations">): EligibilityFinding | null {
  const region = job.location.match(/^Remote \((.+)\)$/)?.[1];
  if (!region || ANYWHERE.test(region)) return null;
  const places = [...passport.workCountries, ...passport.locations].flatMap((place) => place.toLowerCase().split(",")).map((part) => part.trim()).filter((part) => part.length > 1).flatMap(expandPlace);
  if (!places.length) return null;
  const lower = region.toLowerCase();
  if (places.some((place) => mentions(lower, place))) return null;
  return { code: "location", severity: "verify", message: `This remote role is limited to ${region}. Check you're allowed to work from there before applying.`, evidence: job.location };
}

function stateFor(evidenceScore: number, findings: EligibilityFinding[], missingMust: number): RecommendationState {
  if (findings.some((finding) => finding.severity === "blocker")) return "blocked";
  if (findings.some((finding) => finding.severity === "verify")) return "verify";
  if (evidenceScore >= 65 && missingMust <= 1) return "ready";
  return "stretch";
}

export function evaluateJob(profile: Profile, profileUpdatedAt: Date, passport: CareerPassportDoc, job: DiscoveredJobDoc): Omit<JobRecommendationDoc, "_id" | "userId" | "discoveredJobId" | "status" | "trackerJobId" | "dismissalReason" | "createdAt" | "updatedAt"> | null {
  const roleScore = roleCompatibility(job.title, passport.targetRoles);
  if (roleScore < 45) return null;
  if (passport.excludedRoles.some((role) => overlap(job.title, role) >= 0.5)) return null;
  const workMode = explicitWorkMode(job);
  if (workMode && !passport.remoteModes.includes(workMode)) return null;
  const employmentType = explicitEmploymentType(job);
  if (employmentType && passport.employmentTypes.length && !passport.employmentTypes.some((type) => canonical(type) === canonical(employmentType))) return null;

  const match = scoreMatch(profile, job.post);
  const eligibility = eligibilityFindings(job.text, profile, passport);
  const region = remoteRegionFinding(job, passport);
  if (region) eligibility.push(region);
  const missingMust = match.requirements.filter((requirement) => requirement.kind === "must" && requirement.status === "missing").length;
  const preference = preferenceScore(job, passport, roleScore);
  const state = stateFor(match.score, eligibility, missingMust);
  const reasons = [
    `${roleScore}% role-title fit with ${passport.targetRoles.find((role) => roleCompatibility(job.title, [role]) === roleScore) ?? "your target role"}`,
    `${match.score}% of weighted CV evidence is present`,
    missingMust ? `${missingMust} must-have requirement${missingMust === 1 ? "" : "s"} need evidence` : "No must-have evidence gaps found",
    ...(workMode ? [`${workMode[0].toUpperCase()}${workMode.slice(1)} arrangement matches your Career Passport`] : []),
    ...(employmentType ? [`${employmentType} employment type matches your Career Passport`] : []),
  ];

  return {
    state,
    evidenceScore: match.score,
    preferenceScore: preference,
    match,
    eligibility,
    reasons,
    ruleVersion: DISCOVERY_RULE_VERSION,
    profileUpdatedAt,
    passportVersion: passport.version,
    jobContentHash: job.contentHash,
    notificationVersion: 1,
  };
}
