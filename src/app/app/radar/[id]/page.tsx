import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { dismissRadarMatch, prepareRadarMatch } from "@/app/actions/discovery";
import { SubmitButton } from "@/components/submit-button";
import { Badge, ButtonLink, PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { formatDay } from "@/lib/dates";
import { SOURCES } from "@/lib/discovery/sources";
import { ownedRecommendation } from "@/lib/services/discovery";

export const metadata: Metadata = { title: "Job match" };

export default async function RadarMatchPage({ params }: PageProps<"/app/radar/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const row = await ownedRecommendation(user.id, id);
  if (!row) notFound();
  const { recommendation, job } = row;
  const label = recommendation.state === "ready" ? "Ready to apply" : recommendation.state === "stretch" ? "Strong stretch" : recommendation.state === "verify" ? "Verify first" : "Blocked";
  const tone = recommendation.state === "ready" ? "good" : recommendation.state === "blocked" ? "bad" : "warn";

  return (
    <div className="space-y-8">
      <PageHeader eyebrow={<span className="flex items-center gap-2"><Badge tone={tone}>{label}</Badge><span>Found {formatDay(recommendation.createdAt)}</span></span>} title={job.title} description={`${job.company}${job.location ? ` · ${job.location}` : " · Location not stated"}`} actions={<div className="flex gap-2">{recommendation.trackerJobId ? <ButtonLink href={`/app/jobs/${recommendation.trackerJobId}`}>Open application</ButtonLink> : recommendation.state !== "blocked" ? <form action={prepareRadarMatch}><input type="hidden" name="recommendationId" value={recommendation._id} /><SubmitButton pendingLabel="Saving…">Save and prepare</SubmitButton></form> : null}<a href={job.canonicalUrl} target="_blank" rel="noopener" className="inline-flex h-9 items-center rounded border border-strong-border bg-surface px-3.5 text-sm font-medium hover:bg-surface-hover">{SOURCES[job.sourceType]?.kind === "feed" ? `View on ${SOURCES[job.sourceType].label}` : "Employer source"}</a></div>} />

      <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="rounded-md border border-border bg-surface p-4"><p className="font-mono text-3xl font-medium tabular-nums">{recommendation.evidenceScore}%</p><p className="mt-1 text-xs text-muted">Weighted CV evidence</p></div>
        <div className="rounded-md border border-border bg-surface p-4"><p className="font-mono text-3xl font-medium tabular-nums">{recommendation.preferenceScore}%</p><p className="mt-1 text-xs text-muted">Career Passport fit</p></div>
        <div className="rounded-md border border-border bg-surface p-4"><p className="font-mono text-3xl font-medium tabular-nums">{recommendation.match.requirements.filter((item) => item.status === "shown").length}</p><p className="mt-1 text-xs text-muted">Requirements demonstrated</p></div>
        <div className="rounded-md border border-border bg-surface p-4"><p className="font-mono text-3xl font-medium tabular-nums">{recommendation.match.requirements.filter((item) => item.status === "missing").length}</p><p className="mt-1 text-xs text-muted">Evidence gaps</p></div>
      </section>

      {recommendation.eligibility.length > 0 && <section aria-labelledby="eligibility-heading"><h2 id="eligibility-heading" className="mb-3 text-base font-semibold">Eligibility checks</h2><div className="space-y-2">{recommendation.eligibility.map((finding, index) => <div key={`${finding.code}-${index}`} className={`rounded-md border p-4 ${finding.severity === "blocker" ? "border-danger/30 bg-danger-soft" : "border-warning/30 bg-warning-soft"}`}><p className="text-sm font-medium">{finding.message}</p><blockquote className="mt-2 border-l-2 border-current pl-3 text-[13px] text-muted">{finding.evidence}</blockquote></div>)}</div></section>}

      <section aria-labelledby="requirements-heading"><div className="mb-3"><h2 id="requirements-heading" className="text-base font-semibold">Requirement evidence</h2><p className="mt-1 text-[13px] text-muted">Each row separates what your CV demonstrates, merely lists, or does not show.</p></div><div className="overflow-hidden rounded-md border border-border bg-surface"><ul className="divide-y divide-border">{recommendation.match.requirements.map((requirement, index) => <li key={index} className="grid gap-2 p-4 sm:grid-cols-[minmax(0,1fr)_9rem]"><div><p className="text-sm">{requirement.text}</p>{requirement.evidence && <p className="mt-1 text-[13px] text-muted">From your CV: {requirement.evidence}</p>}</div><div className="sm:text-right"><Badge tone={requirement.status === "shown" ? "good" : requirement.status === "listed" ? "warn" : "bad"}>{requirement.status === "shown" ? "Demonstrated" : requirement.status === "listed" ? "Listed only" : "Missing"}</Badge>{requirement.kind === "nice" && <p className="mt-1 text-[11px] text-muted">Nice to have</p>}</div></li>)}</ul></div></section>

      <section className="rounded-md border border-border bg-surface p-5 text-sm"><h2 className="font-semibold">Why this appeared</h2><ul className="mt-3 list-disc space-y-1.5 pl-5 text-muted">{recommendation.reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul><p className="mt-4 border-t border-border pt-4 text-xs text-muted">Rule version {recommendation.ruleVersion} · {SOURCES[job.sourceType]?.label ?? job.sourceType} source checked {formatDay(job.lastSeenAt)} · this is an evidence guide, not a hiring probability.</p>{recommendation.status !== "dismissed" && <form action={dismissRadarMatch} className="mt-4"><input type="hidden" name="recommendationId" value={recommendation._id} /><input type="hidden" name="reason" value="closed or inaccurate" /><SubmitButton variant="ghost" size="sm" pendingLabel="Reporting…">Report closed or inaccurate</SubmitButton></form>}</section>
    </div>
  );
}
