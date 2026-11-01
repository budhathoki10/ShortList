import type { JobPost, Profile } from "@/lib/model/types";
import { BUILTIN_TEMPLATES, type BuiltinTemplate, type Category } from "./builtin";
import type { ColourFamily } from "./builtin/palettes";
import { atsReport, type AtsLevel } from "./checks";
import { hasSidebar } from "./spec";

export const DEFAULT_TEMPLATE_ID = "sl-001";

const byId = new Map(BUILTIN_TEMPLATES.map((t) => [t.id, t]));

export const isBuiltinId = (id: string) => /^sl-\d{3}$/.test(id);
export const getBuiltin = (id: string): BuiltinTemplate | undefined => byId.get(id);
export const visibleBuiltins = () => BUILTIN_TEMPLATES.filter((t) => !t.hidden);

export type TemplateFilters = {
  q?: string;
  category?: Category | "";
  ats?: AtsLevel | "";
  columns?: "1" | "2" | "";
  photo?: "yes" | "no" | "";
  colour?: ColourFamily | "";
};

export function filterTemplates(list: BuiltinTemplate[], f: TemplateFilters): BuiltinTemplate[] {
  const q = f.q?.trim().toLowerCase();
  return list.filter((t) => {
    if (q && !`${t.name} ${t.family} ${t.colour} ${t.categories.join(" ")}`.toLowerCase().includes(q)) return false;
    if (f.category && !t.categories.includes(f.category)) return false;
    if (f.ats && atsReport(t.spec).level !== f.ats) return false;
    if (f.columns && (hasSidebar(t.spec.layout) ? "2" : "1") !== f.columns) return false;
    if (f.photo && (t.spec.photo !== "off" ? "yes" : "no") !== f.photo) return false;
    if (f.colour && t.colour !== f.colour) return false;
    return true;
  });
}

const FIELD_HINTS: [Category, RegExp][] = [
  ["tech", /\b(developer|engineer|software|data|devops|it support|programmer|analyst|qa|tester|cloud|security|frontend|backend|full[- ]?stack)\b/i],
  ["healthcare", /\b(nurse|nursing|doctor|physician|care(r|giver)?|clinic(al)?|pharmac\w*|health|medical|midwife|therap\w*|dental)\b/i],
  ["hospitality", /\b(chef|cook|waiter|waitress|server|barista|hotel|housekeep\w*|front desk|receptionist|retail|cashier|store|shop|restaurant|hospitality|sales associate)\b/i],
  ["trades", /\b(electrician|plumber|driver|technician|mechanic|warehouse|construction|welder|operator|carpenter|logistics|forklift|maintenance|fitter)\b/i],
  ["academic", /\b(lecturer|researcher|professor|phd|postdoc|teacher|teaching|tutor|academic|scientist)\b/i],
  ["executive", /\b(director|head of|vice president|vp|chief|ceo|cfo|coo|cto|general manager|managing)\b/i],
  ["creative", /\b(designer|artist|writer|copywriter|marketing|content|photographer|illustrator|brand|social media|video)\b/i],
];

const PHOTO_EXPECTED = /\b(uae|dubai|abu dhabi|qatar|doha|saudi|riyadh|kuwait|bahrain|oman|nepal|kathmandu|india|pakistan|bangladesh|malaysia|philippines|germany|austria|switzerland)\b/i;
const PHOTO_DISCOURAGED = /\b(usa|united states|canada|uk|united kingdom|england|ireland|australia|new zealand|london|new york|toronto|sydney)\b/i;

/**
 * Picks templates that suit the person and, when given, the job: their field from the headline
 * and job title, a photo where photos are expected, ATS-safe ones where photos are frowned on, and
 * a simple one for a first job. Spreads picks across layouts so they don't all look alike.
 */
export function recommendTemplates(profile: Profile, job?: Pick<JobPost, "title" | "location"> | null, count = 6): BuiltinTemplate[] {
  const text = `${profile.headline} ${job?.title ?? ""}`;
  const where = `${profile.location} ${job?.location ?? ""}`;
  const fields = new Set(FIELD_HINTS.filter(([, re]) => re.test(text)).map(([c]) => c));
  if (profile.experience.length === 0) fields.add("first-job");
  const photoWanted = PHOTO_EXPECTED.test(where) && !PHOTO_DISCOURAGED.test(where);
  const photoAvoided = PHOTO_DISCOURAGED.test(where);

  const scored = visibleBuiltins().map((t, index) => {
    let score = 0;
    for (const c of t.categories) if (fields.has(c)) score += 3;
    const level = atsReport(t.spec).level;
    if (level === "safe") score += photoAvoided ? 2 : 1;
    if (t.spec.photo !== "off") score += photoWanted ? 3 : photoAvoided ? -4 : -1;
    if (t.categories.includes("professional")) score += 0.5;
    return { t, score, index };
  });
  scored.sort((a, b) => b.score - a.score || a.index - b.index);

  const picks: BuiltinTemplate[] = [];
  const families = new Set<string>();
  for (const { t } of scored) {
    if (families.has(t.family)) continue;
    picks.push(t);
    families.add(t.family);
    if (picks.length === count) break;
  }
  return picks;
}
