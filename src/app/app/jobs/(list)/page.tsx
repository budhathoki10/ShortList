import type { Metadata } from "next";
import Link from "next/link";
import { AddJobForm } from "@/components/add-job-form";
import { JobsSearch, JobsStatusFilter } from "@/components/jobs-search";
import { Badge, EmptyState, PageHeader } from "@/components/ui";
import { JobMatchBadge } from "@/components/job-match-badge";
import { requireUser } from "@/lib/auth/session";
import { formatDay } from "@/lib/dates";
import { isStatus, listJobs, STATUS_LABELS, STATUSES, type Status } from "@/lib/services/jobs";

export const metadata: Metadata = { title: "Jobs" };

export default async function JobsPage({ searchParams }: PageProps<"/app/jobs">) {
  const user = await requireUser();
  const { q: rawQuery, status: rawStatus, view } = await searchParams;
  const board = view === "board";
  const q = (typeof rawQuery === "string" ? rawQuery : "").trim().slice(0, 100);
  const only: Status | null = typeof rawStatus === "string" && isStatus(rawStatus) ? rawStatus : null;

  const all = await listJobs(user.id);
  const needle = q.toLowerCase();
  const matches = all.filter((j) => !needle || `${j.post.title} ${j.post.company}`.toLowerCase().includes(needle));
  const shown = only ? matches.filter((j) => j.status === only) : matches;
  const countOf = (s: Status) => matches.filter((j) => j.status === s).length;

  const card = (j: (typeof all)[number]) => (
    <li key={j.id}>
      <Link
        href={`/app/jobs/${j.id}`}
        className="block rounded-md border border-border bg-surface p-3 transition-colors duration-150 hover:border-strong-border hover:bg-surface-hover"
      >
        <p className="text-sm font-semibold leading-relaxed" title={j.post.title}>
          {j.post.title || "Untitled job"}
        </p>
        <p className="truncate text-[13px] text-muted" title={j.post.company}>
          {j.post.company || "Company not stated"}
        </p>
        <div className="mt-2 flex items-center justify-between gap-2 text-xs text-muted">
          <JobMatchBadge post={j.post} match={j.match} />
          {j.appliedOn && <span className="tabular-nums">Applied {formatDay(j.appliedOn)}</span>}
        </div>
      </Link>
    </li>
  );

  return (
    <div className="space-y-6">
      <PageHeader title="Jobs" description={all.length ? `${all.length} saved` : "Add a job to see how well your CV fits it."} />

      <section aria-label="Add a job" className="rounded-lg border border-border bg-surface p-4">
        <AddJobForm />
      </section>

      {all.length === 0 ? (
        <EmptyState title="No jobs yet">Paste a link or a job description above.</EmptyState>
      ) : (
        <section aria-label="Your jobs" className="space-y-3">
          {/* One toolbar: search, status and view. */}
          <div className="flex flex-wrap items-center gap-2">
            <JobsSearch />
            <JobsStatusFilter
              value={only ?? ""}
              options={[{ value: "", label: "All stages", count: matches.length }, ...STATUSES.map((s) => ({ value: s, label: STATUS_LABELS[s], count: countOf(s) }))]}
            />
            <nav aria-label="Job view" className="ml-auto inline-flex rounded-md border border-border bg-surface p-0.5">
              {[false, true].map((showBoard) => {
                const params = new URLSearchParams();
                if (q) params.set("q", q);
                if (only) params.set("status", only);
                if (showBoard) params.set("view", "board");
                return <Link key={String(showBoard)} href={params.size ? `/app/jobs?${params}` : "/app/jobs"} aria-current={board === showBoard ? "true" : undefined} className={`inline-flex items-center rounded px-3 py-1.5 text-xs font-medium max-sm:h-11 max-sm:text-[13px] ${board === showBoard ? "bg-sunken text-foreground" : "text-muted hover:text-foreground"}`}>{showBoard ? "Board" : "List"}</Link>;
              })}
            </nav>
          </div>

          {shown.length === 0 ? (
            <EmptyState
              title={q ? `No jobs match “${q}”` : `Nothing under ${only ? STATUS_LABELS[only] : "this filter"}`}
              action={
                <Link href="/app/jobs" className="text-sm font-medium text-accent hover:underline">
                  Clear filters
                </Link>
              }
            >
              Try another word or status.
            </EmptyState>
          ) : !board ? (
            <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
              {shown.map((j) => <li key={j.id}>
                <Link href={`/app/jobs/${j.id}`} className="group flex flex-wrap items-center gap-x-4 gap-y-2 px-4 py-3 transition-colors hover:bg-surface-hover sm:flex-nowrap">
                  <span className="grid size-8 shrink-0 place-items-center rounded-md border border-border bg-background text-[13px] font-semibold text-muted" aria-hidden="true">{(j.post.company || j.post.title || "J").slice(0, 1).toUpperCase()}</span>
                  <span className="min-w-0 flex-1 basis-[60%] sm:basis-auto"><span className="block text-sm font-semibold leading-relaxed group-hover:text-accent">{j.post.title || "Untitled job"}</span><span className="mt-0.5 block text-xs text-muted">{[j.post.company || "Company not stated", j.post.location].filter(Boolean).join(" · ")}</span></span>
                  <span className="flex flex-wrap items-center gap-3"><JobMatchBadge post={j.post} match={j.match} /><Badge>{isStatus(j.status) ? STATUS_LABELS[j.status] : j.status}</Badge></span>
                  <span className="hidden text-faint sm:block" aria-hidden="true">↗</span>
                </Link>
              </li>)}
            </ul>
          ) : only ? (
            <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">{shown.map(card)}</ul>
          ) : (
            <div className="grid gap-x-4 gap-y-6 md:grid-cols-2 xl:grid-cols-5">
              {STATUSES.map((s) => {
                const col = shown.filter((j) => j.status === s);
                return (
                  <section key={s} aria-labelledby={`col-${s}`} className="min-w-0">
                    <h2 id={`col-${s}`} className="mb-2 flex items-baseline justify-between text-[13px] font-medium">
                      {STATUS_LABELS[s]}
                      <span className="font-mono text-muted tabular-nums">{col.length}</span>
                    </h2>
                    {col.length ? <ul className="space-y-2">{col.map(card)}</ul> : <p className="rounded-md border border-dashed border-border px-3 py-3 text-xs text-faint">None</p>}
                  </section>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
}
