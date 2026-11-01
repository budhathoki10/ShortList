"use client";

import { ActionToast, useToast } from "@/components/toast";
import Link from "next/link";
import { useActionState, useRef, useState } from "react";
import { setJobTemplateAction } from "@/app/actions/templates";
import { CvMini } from "@/components/cv/cv-mini";
import { CvSheet, measureFit } from "@/components/cv/cv-sheet";
import { StudioIcon as Icon } from "@/components/icons";
import type { Profile } from "@/lib/model/types";
import { atsReport } from "@/lib/templates/checks";
import type { TemplateSpec } from "@/lib/templates/spec";
import { AtsBadge } from "./template-bits";

export type LookOption = { id: string; name: string; spec: TemplateSpec };

/**
 * The look of one job's CV: the live page in its template, a "try-on" strip of recommended looks,
 * and fit to 1 or 2 pages. Choices are saved on the job, so the PDF and Word file follow them.
 */
export function JobCvLook({
  jobId,
  cv,
  photoUrl,
  current,
  spec,
  fitted,
  options,
}: {
  jobId: string;
  cv: Profile;
  photoUrl: string | null;
  current: { id: string; name: string };
  spec: TemplateSpec;
  fitted: boolean;
  options: LookOption[];
}) {
  const [state, action, pending] = useActionState(setJobTemplateAction, undefined);
  const [pages, setPages] = useState(1);
  const toast = useToast();
  const [showAll, setShowAll] = useState(false);
  const article = useRef<HTMLElement | null>(null);
  const form = useRef<HTMLFormElement>(null);
  const fitInput = useRef<HTMLInputElement>(null);
  const templateInput = useRef<HTMLInputElement>(null);

  const submit = (templateId: string, fit: object | null) => {
    if (!form.current || !fitInput.current || !templateInput.current) return;
    templateInput.current.value = templateId;
    fitInput.current.value = fit ? JSON.stringify(fit) : "";
    form.current.requestSubmit();
  };

  const fit = (target: number) => {
    const base = options.find((o) => o.id === current.id)?.spec;
    if (!article.current || !base) return;
    const step = measureFit(article.current, base, target);
    if (!step) {
      toast.show({ tone: "error", key: "fit", message: `This won't fit on ${target} ${target === 1 ? "page" : "pages"}`, description: "Not at a readable size. Turn off a few changes or shorten your CV." });
      return;
    }
    submit(current.id, step);
  };

  const strip = options.filter((o) => o.id !== current.id).slice(0, showAll ? options.length : 3);

  return (
    <div className="space-y-4">
      <form ref={form} action={action} className="hidden">
        <input type="hidden" name="jobId" value={jobId} />
        <input ref={templateInput} type="hidden" name="templateId" />
        <input ref={fitInput} type="hidden" name="fit" />
      </form>

      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-border bg-surface px-3 py-2">
        <span className="text-[13px] text-muted">Look:</span>
        <span className="text-sm font-medium">{current.name}</span>
        <AtsBadge level={atsReport(spec).level} />
        <span className="ml-auto text-[12px] tabular-nums text-muted">
          {pages} {pages === 1 ? "page" : "pages"}
          {fitted ? " · fitted" : ""}
        </span>
        <div className="flex w-full flex-wrap gap-2 sm:w-auto">
          <button type="button" disabled={pending} onClick={() => fit(1)} className="h-8 rounded-md border border-border px-2.5 text-[12px] hover:border-strong-border disabled:opacity-50">
            Fit to 1 page
          </button>
          <button type="button" disabled={pending} onClick={() => fit(2)} className="h-8 rounded-md border border-border px-2.5 text-[12px] hover:border-strong-border disabled:opacity-50">
            Fit to 2 pages
          </button>
          {fitted && (
            <button type="button" disabled={pending} onClick={() => submit(current.id, null)} className="h-8 rounded-md px-2 text-[12px] text-muted underline underline-offset-4">
              Undo fit
            </button>
          )}
        </div>
      </div>
      <ActionToast state={state} only="error" />

      <div className="rounded-xl bg-sunken p-3 sm:p-5">
        <CvSheet spec={spec} cv={cv} photoUrl={photoUrl} onPages={setPages} articleRef={article} />
      </div>

      <section aria-labelledby={`try-${jobId}`} className="space-y-3">
        <div className="flex items-baseline justify-between gap-2">
          <h3 id={`try-${jobId}`} className="flex items-center gap-1.5 text-sm font-medium">
            <Icon name="sparkle" size={15} /> Try another look
          </h3>
          <Link href="/app/studio/templates" className="text-[12px] text-muted underline underline-offset-4 hover:text-foreground">
            All 100 templates
          </Link>
        </div>
        <ul className="grid grid-cols-3 gap-3">
          {strip.map((o) => (
            <li key={o.id}>
              <button
                type="button"
                disabled={pending}
                onClick={() => submit(o.id, null)}
                className="group block w-full text-left disabled:opacity-60"
                aria-label={`Use the ${o.name} look for this job`}
              >
                <div className="overflow-hidden rounded-md ring-1 ring-border transition group-hover:-translate-y-0.5 group-hover:ring-strong-border">
                  <CvMini spec={o.spec} cv={cv} photoUrl={photoUrl} />
                </div>
                <p className="mt-1.5 truncate text-[12px] font-medium">{o.name}</p>
                <p className="text-xs text-muted group-hover:text-foreground">Use this look</p>
              </button>
            </li>
          ))}
        </ul>
        {options.length > 4 && (
          <button type="button" onClick={() => setShowAll((s) => !s)} className="text-[12px] text-muted underline underline-offset-4 hover:text-foreground">
            {showAll ? "Show fewer" : "Show your templates too"}
          </button>
        )}
      </section>
    </div>
  );
}
