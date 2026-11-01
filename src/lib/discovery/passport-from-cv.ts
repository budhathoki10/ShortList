import type { Profile } from "@/lib/model/types";

/**
 * What the Career Passport can take from a CV. Only facts the CV states: job titles, where the person lives,
 * the kind of roles they've held, and a graduation month the CV gives. Work authorization, citizenship, salary
 * and willingness to relocate are never inferred (PRD 7.1): the CV's country is offered as a one-click suggestion
 * the person confirms, not filled in.
 */
export type PassportFromCv = {
  targetRoles: string[];
  locations: string[];
  employmentTypes: string[];
  /** "2026-05" when the CV gives a month for a degree still in progress; null otherwise. */
  graduationDate: string | null;
  /** "2026" when the CV gives only a year, so the form can say so rather than guess a month. */
  graduationYear: string | null;
  /** The country the CV places the person in, for the "Countries where you can work" suggestion. */
  country: string | null;
};

/** Words that make a phrase a job title. "AI Enthusiast" or "Problem solver" don't name a role. */
const ROLE =
  /\b(developer|engineer|programmer|designer|architect|manager|analyst|scientist|specialist|consultant|administrator|admin|lead|officer|coordinator|associate|assistant|intern|trainee|accountant|nurse|doctor|teacher|tutor|lecturer|writer|editor|marketer|marketing|representative|executive|technician|researcher|tester|qa|support|agent|director|head|strategist|recruiter|cashier|clerk|operator|supervisor|chef|cook|driver|electrician|plumber|mechanic|pharmacist|therapist|counsellor|counselor|advisor|adviser|auditor|banker|economist|lawyer|paralegal|photographer|animator|illustrator|copywriter|translator|receptionist|secretary|planner|producer|owner|founder|freelancer)s?\b/i;

const MONTHS = ["jan", "feb", "mar", "apr", "may", "jun", "jul", "aug", "sep", "oct", "nov", "dec"];

function clean(title: string) {
  return title.replace(/\s+/g, " ").replace(/^[\s,;|·-]+|[\s,;|·-]+$/g, "").trim();
}

/** "Software Developer | AI Enthusiast" -> ["Software Developer"]. Splits on the usual headline separators. */
function rolesIn(text: string): string[] {
  return text
    .split(/\s*(?:[|·•,/]|\s-\s|\s–\s)\s*/)
    .map(clean)
    .filter((part) => part.length >= 3 && part.length <= 60 && ROLE.test(part));
}

/** "Kathmandu, Nepal" -> "Nepal". A single word that isn't a city we can't tell apart is left alone. */
function countryOf(location: string): string | null {
  const parts = location.split(",").map(clean).filter(Boolean);
  if (parts.length < 2) return null;
  const last = parts[parts.length - 1];
  return /^[A-Za-z][A-Za-z .'-]{1,40}$/.test(last) && !/\d/.test(last) ? last : null;
}

/** "May 2026", "2026-05", "05/2026" -> "2026-05". Only when a month is actually written. */
function monthOf(value: string): string | null {
  const iso = value.match(/\b((?:19|20)\d{2})[-/.](0?[1-9]|1[0-2])\b/);
  if (iso) return `${iso[1]}-${iso[2].padStart(2, "0")}`;
  const us = value.match(/\b(0?[1-9]|1[0-2])[-/.]((?:19|20)\d{2})\b/);
  if (us) return `${us[2]}-${us[1].padStart(2, "0")}`;
  const named = value.toLowerCase().match(/\b(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\.?\s+((?:19|20)\d{2})\b/);
  if (named) return `${named[2]}-${String(MONTHS.indexOf(named[1]) + 1).padStart(2, "0")}`;
  return null;
}

export function passportFromCv(profile: Profile | null, now = new Date()): PassportFromCv {
  const empty: PassportFromCv = { targetRoles: [], locations: [], employmentTypes: [], graduationDate: null, graduationYear: null, country: null };
  if (!profile) return empty;

  // Latest roles first, then the headline. Case-insensitive de-duplication keeps the first spelling.
  const seen = new Set<string>();
  const targetRoles = [...profile.experience.flatMap((e) => rolesIn(e.title)), ...rolesIn(profile.headline)]
    .filter((role) => {
      const key = role.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 5);
  // A title the role words don't recognise is still better than an empty field.
  if (!targetRoles.length && profile.experience[0]?.title) targetRoles.push(clean(profile.experience[0].title).slice(0, 60));

  const home = clean(profile.location) || clean(profile.experience[0]?.location ?? "");
  const locations = home ? [home] : [];

  // A degree still in progress: an end date in the future, or written as "present" / "expected".
  const thisMonth = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}`;
  let graduationDate: string | null = null;
  let graduationYear: string | null = null;
  for (const item of profile.education) {
    const end = `${item.end ?? ""} ${(item.details ?? []).join(" ")}`;
    const month = monthOf(item.end ?? "");
    const year = (item.end ?? "").match(/\b((?:19|20)\d{2})\b/)?.[1] ?? null;
    if (month && month >= thisMonth) graduationDate = month;
    else if (!month && year && Number(year) >= now.getUTCFullYear()) graduationYear = year;
    else if (/\b(expected|present|current|ongoing|pursuing)\b/i.test(end) && year && Number(year) >= now.getUTCFullYear()) graduationYear = year;
  }
  if (graduationDate) graduationYear = null;

  // Students and people whose roles were all internships are offered internships too.
  const titles = profile.experience.map((e) => e.title.toLowerCase());
  const onlyInterned = titles.length > 0 && titles.every((t) => /\b(intern|trainee)\b/.test(t));
  const employmentTypes = graduationDate || graduationYear || onlyInterned ? ["Full-time", "Internship"] : ["Full-time"];

  return { targetRoles, locations, employmentTypes, graduationDate, graduationYear, country: countryOf(home) };
}
