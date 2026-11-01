import type { Metadata } from "next";
import Link from "next/link";
import { dismissRadarMatch, prepareRadarMatch } from "@/app/actions/discovery";
import { CareerPassportForm, type PassportFormValue } from "@/components/discovery/career-passport-form";
import { RadarPoller } from "@/components/discovery/radar-poller";
import { SubmitButton } from "@/components/submit-button";
import { Badge, ButtonLink, EmptyState, Notice, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { formatDay } from "@/lib/dates";
import { SOURCES } from "@/lib/discovery/sources";
import { getCareerPassport, getDiscoverySourceStatus, listRecommendations } from "@/lib/services/discovery";
import { getProfile } from "@/lib/services/profile";
import { notificationsOn } from "@/lib/services/notification-settings";
import { passportFromCv } from "@/lib/discovery/passport-from-cv";
import type { DiscoveredJobDoc, JobRecommendationDoc, RecommendationState } from "@/db/types";

export const metadata: Metadata = { title: "Job Radar" };

const STATE: Record<RecommendationState, { label: string; tone: "good" | "warn" | "bad" | "neutral"; description: string }> = {
  ready: { label: "Ready to apply", tone: "good", description: "No known blocker and strong CV evidence." },
  stretch: { label: "Strong stretch", tone: "warn", description: "Worth reviewing, with a small number of evidence gaps." },
  verify: { label: "Verify first", tone: "warn", description: "An eligibility or requirement detail needs your confirmation." },
  blocked: { label: "Blocked", tone: "bad", description: "A source-backed condition conflicts with your Career Passport." },
};

const dismissReasons = ["not interested", "wrong role", "wrong location", "work authorization or citizenship", "salary", "too senior or too junior", "employer preference", "duplicate", "closed or inaccurate"];

function workArrangement(job: DiscoveredJobDoc) {
  const text = `${job.location} ${job.post.summary}`.toLowerCase();
  if (/\bhybrid\b/.test(text)) return "Hybrid";
  if (/\bremote\b|work from home/.test(text)) return "Remote";
  if (/\bon[- ]site\b|\bonsite\b|in[- ]office/.test(text)) return "On-site";
  return null;
}

function RecommendationCard({ recommendation, job }: { recommendation: JobRecommendationDoc; job: DiscoveredJobDoc }) {
  const state = STATE[recommendation.state];
  const arrangement = workArrangement(job);
  return (
    <article className="rounded-md border border-border bg-surface p-4 sm:p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2"><Badge tone={state.tone}>{state.label}</Badge><span className="text-xs text-muted">{SOURCES[job.sourceType]?.label ?? job.sourceType} · checked {formatDay(job.lastSeenAt)}</span></div>
          <h3 className="text-base font-semibold leading-snug"><Link href={`/app/radar/${recommendation._id}`} className="hover:text-accent hover:underline">{job.title}</Link></h3>
          <p className="mt-1 text-sm text-muted">{job.company}{job.location ? ` · ${job.location}` : " · Location not stated"}{arrangement && !job.location.toLowerCase().includes(arrangement.toLowerCase()) ? ` · ${arrangement}` : ""}</p>
        </div>
        <div className="flex shrink-0 gap-5 text-right">
          <div><p className="font-mono text-xl font-medium tabular-nums">{recommendation.evidenceScore}%</p><p className="text-xs text-muted">CV evidence</p></div>
          <div><p className="font-mono text-xl font-medium tabular-nums">{recommendation.preferenceScore}%</p><p className="text-xs text-muted">preferences</p></div>
        </div>
      </div>
      <p className="mt-4 text-sm text-foreground">{recommendation.reasons[0]}</p>
      {recommendation.eligibility[0] && <p className={`mt-2 text-[13px] ${recommendation.eligibility[0].severity === "blocker" ? "text-danger" : "text-warning"}`}>{recommendation.eligibility[0].message}</p>}
      {job.post.salary && <p className="mt-2 text-[13px] text-muted">Salary: {job.post.salary}</p>}
      {recommendation.match.keywords.some((keyword) => keyword.where === "shown") && <div className="mt-3"><p className="text-xs font-medium uppercase tracking-wide text-muted">Strongest CV evidence</p><ul className="mt-1 space-y-1 text-[13px] text-muted">{recommendation.match.keywords.filter((keyword) => keyword.where === "shown" && keyword.evidence).slice(0, 3).map((keyword) => <li key={keyword.keyword}><span className="font-medium text-foreground">{keyword.keyword}:</span> {keyword.evidence}</li>)}</ul></div>}
      <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
        {recommendation.trackerJobId ? <ButtonLink href={`/app/jobs/${recommendation.trackerJobId}`} size="sm">Open application</ButtonLink> : recommendation.state !== "blocked" ? <form action={prepareRadarMatch}><input type="hidden" name="recommendationId" value={recommendation._id} /><SubmitButton size="sm" pendingLabel="Saving…">Save and prepare</SubmitButton></form> : null}
        <ButtonLink href={`/app/radar/${recommendation._id}`} variant="secondary" size="sm">Review evidence</ButtonLink>
        <a href={job.canonicalUrl} target="_blank" rel="noopener" className="inline-flex h-8 items-center rounded px-3 text-sm font-medium text-muted hover:bg-surface-hover hover:text-foreground">View source</a>
        <form action={dismissRadarMatch} className="ml-auto flex min-w-0 flex-wrap items-center gap-2">
          <input type="hidden" name="recommendationId" value={recommendation._id} />
          <label className="sr-only" htmlFor={`dismiss-${recommendation._id}`}>Dismiss reason</label>
          <select id={`dismiss-${recommendation._id}`} name="reason" defaultValue="not interested" className="h-8 max-w-44 rounded border border-border bg-surface px-2 text-xs text-muted max-sm:h-11">
            {dismissReasons.map((reason) => <option key={reason} value={reason}>{reason}</option>)}
          </select>
          <SubmitButton variant="ghost" size="sm" pendingLabel="Dismissing…">Dismiss</SubmitButton>
        </form>
      </div>
    </article>
  );
}

export default async function RadarPage() {
  const user = await requireUser();
  const [passport, rows, profile, sourceStatus] = await Promise.all([getCareerPassport(user.id), listRecommendations(user.id, true), getProfile(user.id), getDiscoverySourceStatus()]);
  // A first passport starts from what the CV states; a saved one keeps the person's choices and offers "Fill from my CV".
  const fromCv = passportFromCv(profile);
  const defaultValue: PassportFormValue = passport ?? {
    targetRoles: fromCv.targetRoles, excludedRoles: [], locations: fromCv.locations, workCountries: [], remoteModes: ["remote", "hybrid", "onsite"], needsSponsorship: false, graduationDate: fromCv.graduationDate, minimumSalary: null, employmentTypes: fromCv.employmentTypes, excludedCompanies: [], discoveryEnabled: true, emailFrequency: "off", pushFrequency: "off", alertStates: ["ready"], quietStart: "22:00", quietEnd: "08:00", timezone: "",
  };
  const groups = (["ready", "stretch", "verify", "blocked"] as const).map((state) => ({ state, rows: rows.filter((row) => row.recommendation.state === state && ["active", "saved"].includes(row.recommendation.status)) }));
  const visibleCount = rows.filter((row) => ["active", "saved"].includes(row.recommendation.status) && row.recommendation.state !== "blocked").length;
  const blockedRows = groups.find((group) => group.state === "blocked")?.rows ?? [];
  const dismissedRows = rows.filter((row) => row.recommendation.status === "dismissed");
  const discoveryDelayed = sourceStatus.configured > 0 && sourceStatus.failing === sourceStatus.configured;

  return (
    <div className="space-y-10">
      <RadarPoller />
      <PageHeader eyebrow="Discovery agent" title="Job Radar" description="Fresh employer-posted roles, screened against your eligibility, preferences and CV evidence before they reach you." actions={<span className={`inline-flex items-center gap-2 text-sm ${discoveryDelayed ? "text-warning" : passport?.discoveryEnabled ? "text-success" : "text-muted"}`}><span className={`size-2 rounded-full ${discoveryDelayed ? "bg-warning" : passport?.discoveryEnabled ? "bg-success" : "bg-faint"}`} />{discoveryDelayed ? "Source checks delayed" : passport?.discoveryEnabled ? "Agent running" : "Agent paused"}</span>} />

      <div className={`rounded-md border px-4 py-3 text-sm ${sourceStatus.failing ? "border-warning/30 bg-warning-soft" : "border-border bg-surface"}`}>
        {sourceStatus.configured === 0 ? <p className="text-muted">No employer feeds are configured yet. Add the launch allowlist before enabling the scheduled worker.</p> : <p><span className="font-medium">{sourceStatus.healthy} of {sourceStatus.configured} employer feeds healthy.</span>{discoveryDelayed ? <span className="text-muted"> Search is delayed while the feeds wait for their next retry.</span> : sourceStatus.lastSuccessAt ? <span className="text-muted"> Last successful check {formatDay(sourceStatus.lastSuccessAt)}.</span> : <span className="text-muted"> Waiting for the first successful check.</span>}</p>}
      </div>

      {!notificationsOn(user) && <Notice tone="warning" title="Notifications are off for your account" action={{ href: "/app/settings#notifications", label: "Turn them on in Settings" }}>The agent keeps finding matches and lists them here, but no email or push alert is sent. Your alert choices in the Career Passport take effect once notifications are back on.</Notice>}

      {!passport && <div className="rounded-md border border-accent/30 bg-tint p-5"><h2 className="font-semibold">Tell the agent what is realistic for you</h2><p className="mt-1 max-w-2xl text-sm text-muted">Your CV shows your experience. The Career Passport records the roles, locations and work constraints the agent must respect. Save it before the next discovery run.</p><div className="mt-4 grid gap-2 sm:grid-cols-3">{(["ready", "verify", "blocked"] as const).map((state) => <div key={state} className="rounded border border-border bg-surface/70 p-3"><Badge tone={STATE[state].tone}>{STATE[state].label}</Badge><p className="mt-2 text-xs text-muted">{STATE[state].description}</p></div>)}</div></div>}

      {visibleCount === 0 ? <EmptyState title={passport ? "No qualified matches yet" : "Set up your Career Passport first"}>{passport ? "The agent will add source-backed roles here after the next configured discovery run. It will not fill the page with loose keyword matches." : "Once saved, the agent can compare new postings with facts that are not safe to infer from your CV."}</EmptyState> : (
        <div className="space-y-10">
          {groups.filter((group) => group.state !== "blocked" && group.rows.length).map((group) => <section key={group.state} aria-labelledby={`group-${group.state}`}><div className="mb-3 flex items-end justify-between gap-3"><div><h2 id={`group-${group.state}`} className="text-base font-semibold">{STATE[group.state].label}</h2><p className="mt-0.5 text-[13px] text-muted">{STATE[group.state].description}</p></div><span className="font-mono text-xs text-muted tabular-nums">{group.rows.length}</span></div><div className="space-y-3">{group.rows.map((row) => <RecommendationCard key={row.recommendation._id} {...row} />)}</div></section>)}
        </div>
      )}

      {blockedRows.length > 0 && <details className="group rounded-md border border-border bg-surface"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium marker:hidden sm:px-6"><span>Blocked matches <span className="ml-1 font-mono text-xs text-muted">{blockedRows.length}</span></span><span aria-hidden="true" className="text-muted transition-transform group-open:rotate-45">+</span></summary><div className="space-y-3 border-t border-border p-4 sm:p-5">{blockedRows.map((row) => <RecommendationCard key={row.recommendation._id} {...row} />)}</div></details>}

      {dismissedRows.length > 0 && <details className="group rounded-md border border-border bg-surface"><summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium marker:hidden sm:px-6"><span>Dismissed <span className="ml-1 font-mono text-xs text-muted">{dismissedRows.length}</span></span><span aria-hidden="true" className="text-muted transition-transform group-open:rotate-45">+</span></summary><ul className="divide-y divide-border border-t border-border">{dismissedRows.map(({ recommendation, job }) => <li key={recommendation._id} className="flex flex-wrap items-center gap-3 px-5 py-3 text-sm"><div className="min-w-0 flex-1"><Link href={`/app/radar/${recommendation._id}`} className="font-medium hover:underline">{job.title}</Link><p className="truncate text-xs text-muted">{job.company} · {recommendation.dismissalReason || "Dismissed"}</p></div><a href={job.canonicalUrl} target="_blank" rel="noopener" className="text-xs font-medium text-muted hover:text-foreground">View source</a></li>)}</ul></details>}

      <details id="alert-settings" className="group scroll-mt-20 rounded-md border border-border bg-surface" open={!passport}>
        <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-medium marker:hidden sm:px-6"><span>Career Passport and alert settings</span><span aria-hidden="true" className="text-muted transition-transform group-open:rotate-45">+</span></summary>
        <div className="border-t border-border px-5 py-6 sm:px-6"><CareerPassportForm value={defaultValue} fromCv={fromCv} /></div>
      </details>
    </div>
  );
}
