"use client";

import { ActionToast } from "@/components/toast";
import { useActionState, useState, type ReactNode } from "react";
import { prepareApplicationPlan, saveLearningTask } from "@/app/actions/career";
import type { LearningProgress } from "@/lib/career/types";
import { Button, inputClass } from "../ui";

/**
 * Builds (or refreshes) the full analysis. On its own it's a compact card; `bare` drops the card
 * for use inside a panel that already has a title.
 */
export function PlanBuilder({ jobId, exists, companyUrl = "", bare = false }: { jobId: string; exists: boolean; companyUrl?: string; bare?: boolean }) {
  const [state, action, pending] = useActionState(prepareApplicationPlan, undefined);
  return (
    <form action={action} className={bare ? "space-y-3" : "space-y-3 rounded-lg border border-border bg-surface px-5 py-4"}>
      <input type="hidden" name="jobId" value={jobId} />
      {!bare && (
        <div>
          <h2 className="text-sm font-semibold">{exists ? "Refresh the full analysis" : "Full analysis"}</h2>
          <p className="mt-0.5 text-[13px] text-muted">Every requirement checked against your CV, a plan for the gaps and draft application answers. Uses one tailoring.</p>
        </div>
      )}
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1 space-y-1">
          <label htmlFor={`company-website-${jobId}`} className="text-[13px] font-medium">
            Company website <span className="font-normal text-muted">(optional)</span>
          </label>
          <input
            id={`company-website-${jobId}`}
            name="companyUrl"
            type="url"
            defaultValue={companyUrl}
            placeholder="https://company.example"
            maxLength={2000}
            className={inputClass}
            title="We read its homepage and up to two linked company pages. Without it, company details stay unverified."
          />
        </div>
        <Button type="submit" loading={pending} className="shrink-0">
          {pending ? "Analysing…" : exists ? "Refresh analysis" : "Build full analysis"}
        </Button>
      </div>
      <ActionToast state={state} />
    </form>
  );
}

/** The analysis footer: what made it, plus a small "Refresh" link that opens the builder in place. */
export function RefreshAnalysis({ jobId, companyUrl, note, children }: { jobId: string; companyUrl?: string; note: string; children?: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-3">
      <p className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span>{note}</span>
        {children}
        <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)} className="rounded text-accent hover:underline focus-visible:outline-2 focus-visible:outline-accent/40 max-sm:min-h-11">
          {open ? "Cancel refresh" : "Refresh"}
        </button>
      </p>
      {open && (
        <div className="rounded-lg border border-border bg-surface px-4 py-3">
          <PlanBuilder jobId={jobId} exists companyUrl={companyUrl} bare />
        </div>
      )}
    </div>
  );
}

export function LearningTaskForm({ jobId, taskId, progress }: { jobId: string; taskId: string; progress?: LearningProgress[string] }) {
  const [state, action, pending] = useActionState(saveLearningTask, undefined);
  return <form action={action} className="space-y-3 border-t border-border pt-4">
    <input type="hidden" name="jobId" value={jobId} /><input type="hidden" name="taskId" value={taskId} />
    <div className="space-y-1.5"><label htmlFor={`url-${taskId}`} className="text-sm font-medium">Work sample or evidence URL</label><input id={`url-${taskId}`} name="evidenceUrl" type="url" defaultValue={progress?.evidenceUrl ?? ""} className={inputClass} placeholder="https://example.com/my-work-sample" maxLength={2000} /></div>
    <div className="space-y-1.5"><label htmlFor={`notes-${taskId}`} className="text-sm font-medium">What you completed and checked</label><textarea id={`notes-${taskId}`} name="notes" rows={3} maxLength={2000} defaultValue={progress?.notes ?? ""} className={inputClass} placeholder="Describe your actual work, the checks you ran, and what you still need help with." /></div>
    <label className="flex min-h-11 items-center gap-2 text-sm"><input type="checkbox" name="completed" defaultChecked={progress?.completed} className="size-4 accent-accent" /> I completed these practice checks</label>
    <Button type="submit" variant="secondary" size="sm" loading={pending}>{pending ? "Saving…" : "Save learning progress"}</Button>
    <ActionToast state={state} />
  </form>;
}
