import type { CareerPassportDoc } from "@/db/types";
import type { Profile } from "@/lib/model/types";

/**
 * What the Career Passport can take from a CV: job titles, where the person lives, the kind of roles they've held,
 * and the work arrangement they've already chosen. Work authorization and citizenship are never inferred (PRD 7.1):
 * the CV's country is offered as a one-click suggestion the person confirms, not filled in.
 */
export type PassportFromCv = {
  targetRoles: string[];
  locations: string[];
  employmentTypes: string[];
  remoteModes: Array<"remote" | "hybrid" | "onsite">;
  /** The country the CV places the person in, for the "Countries where you can work" suggestion. */
  country: string | null;
};

/** Words that make a phrase a job title. "AI Enthusiast" or "Problem solver" don't name a role. */
const ROLE =
  /\b(developer|engineer|programmer|designer|architect|manager|analyst|scientist|specialist|consultant|administrator|admin|lead|officer|coordinator|associate|assistant|intern|trainee|accountant|nurse|doctor|teacher|tutor|lecturer|writer|editor|marketer|marketing|representative|executive|technician|researcher|tester|qa|support|agent|director|head|strategist|recruiter|cashier|clerk|operator|supervisor|chef|cook|driver|electrician|plumber|mechanic|pharmacist|therapist|counsellor|counselor|advisor|adviser|auditor|banker|economist|lawyer|paralegal|photographer|animator|illustrator|copywriter|translator|receptionist|secretary|planner|producer|owner|founder|freelancer)s?\b/i;

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

export function passportFromCv(profile: Profile | null, now = new Date()): PassportFromCv {
  const empty: PassportFromCv = { targetRoles: [], locations: [], employmentTypes: [], remoteModes: ["remote", "hybrid", "onsite"], country: null };
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

  // Still studying: an education entry that ends this year or later.
  const studying = profile.education.some((item) => Number((item.end ?? "").match(/\b((?:19|20)\d{2})\b/)?.[1] ?? 0) >= now.getUTCFullYear());

  // Students and people whose roles were all internships are offered internships too.
  const titles = profile.experience.map((e) => e.title.toLowerCase());
  const onlyInterned = titles.length > 0 && titles.every((t) => /\b(intern|trainee)\b/.test(t));
  const employmentTypes = studying || onlyInterned ? ["Full-time", "Internship"] : ["Full-time"];

  // Remote / hybrid / on-site is only narrowed when the CV's own location line says so ("Remote").
  const remoteOnly = /^remote\b/i.test(home);
  return { targetRoles, locations, employmentTypes, remoteModes: remoteOnly ? ["remote"] : ["remote", "hybrid", "onsite"], country: countryOf(home) };
}

/** The fields a Career Passport is saved from (everything but its id, version and dates). */
export type PassportFields = Omit<CareerPassportDoc, "_id" | "version" | "createdAt" | "updatedAt">;

/**
 * The passport to store after a CV is saved, or null when nothing would change. A passport nobody has saved by hand
 * follows the CV; one the person saved keeps their choices and only has its empty fields filled. Nothing is
 * created when the CV names no role.
 */
export function mergePassport(existing: CareerPassportDoc | null, derived: PassportFromCv): PassportFields | null {
  if (!derived.targetRoles.length) return null;
  const keep = existing?.userSet !== false;
  const pick = <T,>(saved: T[] | undefined, fromCv: T[]) => (keep && saved?.length ? saved : fromCv);
  const next: PassportFields = {
    targetRoles: pick(existing?.targetRoles, derived.targetRoles),
    excludedRoles: existing?.excludedRoles ?? [],
    locations: pick(existing?.locations, derived.locations),
    workCountries: existing?.workCountries ?? [],
    remoteModes: pick(existing?.remoteModes, derived.remoteModes),
    employmentTypes: pick(existing?.employmentTypes, derived.employmentTypes),
    // Everything is on until the person says otherwise.
    discoveryEnabled: existing?.discoveryEnabled ?? true,
    alertStates: existing?.alertStates ?? ["ready"],
    quietStart: existing?.quietStart ?? "22:00",
    quietEnd: existing?.quietEnd ?? "08:00",
    // Unknown until the person opens the form, which fills in the browser's zone; no zone means no quiet hours.
    timezone: existing?.timezone ?? "",
    userSet: existing ? keep : false,
  };
  const same = existing && (Object.keys(next) as Array<keyof PassportFields>).every((key) => JSON.stringify(existing[key] ?? null) === JSON.stringify(next[key] ?? null));
  return same ? null : next;
}
