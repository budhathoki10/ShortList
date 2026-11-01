import type { User } from "@/db/types";

/**
 * How much AI work each plan allows.
 *
 * Paid: per calendar month. The caps are a fair-use ceiling, not a selling point. Mock interviews are capped
 * lower than the rest because each one is a whole session of AI feedback (about nine calls), not one.
 * Free: CV imports reset monthly. Everything else is a one-time trial: the whole application for ONE job
 * (analysis, tailored CV, cover letter, interview practice, a mock interview), once per account. The free numbers are how
 * many runs that one job gets, so a re-run or two is possible without the trial becoming unlimited.
 */
export const LIMITS = {
  free: { tailor: 3, cover: 3, interview: 5, mock: 1, import: 5, docx: false },
  paid: { tailor: 200, cover: 200, interview: 200, mock: 30, import: 50, docx: true },
} as const;
/** `interview`: feedback on one practice answer. `mock`: starting a mock interview session. */
export type UsageKind = "tailor" | "cover" | "interview" | "mock" | "import";

/** The AI features that make up the free trial. A free account can use them on one job, once. */
export const TRIAL_KINDS = ["tailor", "cover", "interview", "mock"] as const satisfies readonly UsageKind[];
export type TrialKind = (typeof TRIAL_KINDS)[number];
export const isTrialKind = (kind: UsageKind): kind is TrialKind => (TRIAL_KINDS as readonly UsageKind[]).includes(kind);

/** A comparison cell: text, or included (true) / not included (false). */
export type PlanCell = string | boolean;

/** Free vs paid, row by row. The billing page and the pricing section both render this, so they can't drift apart. */
export const PLAN_FEATURES: { feature: string; free: PlanCell; paid: PlanCell }[] = [
  { feature: "Jobs with full AI help", free: "1 job, one time", paid: "Every job you apply to" },
  { feature: "Match score and skill gaps", free: true, paid: true },
  { feature: "Full job analysis", free: "On your trial job", paid: true },
  { feature: "CV rebuilt for the job", free: `${LIMITS.free.tailor} runs on your trial job`, paid: `${LIMITS.paid.tailor} a month` },
  { feature: "Cover letters", free: `${LIMITS.free.cover} drafts on your trial job`, paid: `${LIMITS.paid.cover} a month` },
  { feature: "Feedback on practice answers", free: `${LIMITS.free.interview} on your trial job`, paid: `${LIMITS.paid.interview} a month` },
  { feature: "Mock interviews", free: `${LIMITS.free.mock} on your trial job`, paid: `${LIMITS.paid.mock} a month` },
  { feature: "CV imports", free: `${LIMITS.free.import} a month`, paid: `${LIMITS.paid.import} a month` },
  { feature: "PDF download", free: true, paid: true },
  { feature: "Word (.docx) download", free: false, paid: true },
  { feature: "Application tracker and follow-up reminders", free: true, paid: true },
];

type Entitlement = Pick<User, "subscriptionAccessUntil">;

/**
 * Paid access comes only from a Freemius subscription. The end date is worked out from stored,
 * provider-confirmed data on every request (see src/lib/billing/access.ts), never from the browser.
 */
export function isPaid(user: Entitlement, now = new Date()): boolean {
  const until = user.subscriptionAccessUntil ?? null;
  return !!until && until > now;
}

export function limitsFor(user: Entitlement) {
  return isPaid(user) ? LIMITS.paid : LIMITS.free;
}

/** "2026-10" for usage counting; months are UTC. */
export function monthKey(now = new Date()): string {
  return now.toISOString().slice(0, 7);
}

export function today(now = new Date()): string {
  return now.toISOString().slice(0, 10);
}
