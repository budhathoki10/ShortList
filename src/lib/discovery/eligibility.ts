import type { CareerPassportDoc, EligibilityFinding } from "@/db/types";
import type { Profile } from "@/lib/model/types";

const sentences = (text: string) =>
  text
    .split(/\n+|(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter((line) => line.length >= 8 && line.length <= 500);

const excerpt = (lines: string[], pattern: RegExp) => lines.find((line) => pattern.test(line)) ?? "";

function yearsOfExperience(profile: Profile): number {
  const ranges = profile.experience.flatMap((item) => {
    const start = item.start.match(/\b(19|20)\d{2}\b/)?.[0];
    const end = item.end.match(/\b(19|20)\d{2}\b/)?.[0];
    if (!start) return [];
    return [[Number(start), end ? Number(end) : new Date().getFullYear()] as const];
  });
  if (!ranges.length) return 0;
  const years = new Set<number>();
  for (const [start, end] of ranges) for (let year = start; year <= Math.min(end, new Date().getFullYear()); year += 1) years.add(year);
  return Math.max(0, years.size - 1);
}

export function eligibilityFindings(text: string, profile: Profile, passport: CareerPassportDoc): EligibilityFinding[] {
  const lines = sentences(text);
  const findings: EligibilityFinding[] = [];
  const add = (finding: EligibilityFinding) => {
    if (!findings.some((item) => item.code === finding.code && item.evidence === finding.evidence)) findings.push(finding);
  };

  const noSponsorship = excerpt(lines, /\b(no|not|without)\s+(?:current or future\s+)?(?:visa\s+)?sponsorship\b|\b(?:cannot|unable to|won't|will not)\s+sponsor\b/i);
  if (passport.needsSponsorship && noSponsorship) add({ code: "sponsorship", severity: "blocker", message: "The employer says sponsorship is unavailable.", evidence: noSponsorship });

  const citizenship = excerpt(lines, /\b(?:must be|only)\s+(?:a\s+)?(?:u\.?s\.?|uk|canadian|australian)?\s*citizen\b|\bcitizenship (?:is )?required\b/i);
  if (citizenship) add({ code: "citizenship", severity: "verify", message: "This role states a citizenship requirement that Shortlist Job Radar cannot confirm from your CV.", evidence: citizenship });

  const clearance = excerpt(lines, /\b(?:active|current|required|obtain)\s+(?:security\s+)?clearance\b|\bsecurity clearance (?:is )?required\b/i);
  if (clearance) add({ code: "clearance", severity: "verify", message: "Confirm that you meet the stated security-clearance condition.", evidence: clearance });

  const requiredYearsLine = excerpt(lines, /\b(?:minimum of\s+)?(\d{1,2})\+?\s+years?\s+(?:of\s+)?(?:professional\s+|relevant\s+)?experience\b/i);
  const requiredYears = Number(requiredYearsLine.match(/\b(\d{1,2})\+?\s+years?\b/i)?.[1] ?? 0);
  if (requiredYears > yearsOfExperience(profile) + 1) {
    add({ code: "experience", severity: "verify", message: `The posting asks for ${requiredYears}+ years; your CV does not clearly show that duration.`, evidence: requiredYearsLine });
  }

  const degree = excerpt(lines, /\b(?:bachelor'?s?|master'?s?|ph\.?d\.?|university)\s+(?:degree\s+)?(?:is\s+)?required\b|\brequires?\s+(?:a\s+)?(?:bachelor'?s?|master'?s?|ph\.?d\.?)\b/i);
  if (degree && profile.education.length === 0) add({ code: "degree", severity: "verify", message: "The posting requires a degree, but the CV has no education entry to verify it.", evidence: degree });

  const graduation = excerpt(lines, /\bgraduat(?:e|es|ed|ing|ion)\b[^.;]{0,120}\b(?:19|20)\d{2}\b|\b(?:19|20)\d{2}\b[^.;]{0,120}\bgraduat(?:e|es|ed|ing|ion)\b/i);
  if (graduation && passport.graduationDate) {
    const expectedYear = Number(passport.graduationDate.slice(0, 4));
    const years = [...graduation.matchAll(/\b(?:19|20)\d{2}\b/g)].map((match) => Number(match[0]));
    if (years.length && (expectedYear < Math.min(...years) || expectedYear > Math.max(...years))) {
      add({ code: "graduation", severity: "blocker", message: "Your expected graduation date is outside the posting's stated graduation window.", evidence: graduation });
    }
  }

  const countryRestriction = excerpt(lines, /\bmust (?:be|reside|live|work) (?:in|within|from)\s+[^.;]{2,80}|\bremote (?:within|in|from)\s+[^.;]{2,80}/i);
  if (countryRestriction && passport.locations.length + passport.workCountries.length > 0) {
    const stated = [...passport.locations, ...passport.workCountries].some((place) => countryRestriction.toLowerCase().includes(place.toLowerCase()));
    if (!stated) add({ code: "location", severity: "verify", message: "The role has a location restriction that does not clearly match your Career Passport.", evidence: countryRestriction });
  }

  return findings;
}
