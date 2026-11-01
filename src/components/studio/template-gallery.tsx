"use client";

import { ActionToast } from "@/components/toast";
import Link from "next/link";
import { useActionState, useEffect, useMemo, useState } from "react";
import { setDefaultTemplateAction, setJobTemplateAction } from "@/app/actions/templates";
import { CvSheet } from "@/components/cv/cv-sheet";
import { StudioIcon as Icon } from "@/components/icons";
import type { Profile } from "@/lib/model/types";
import { CATEGORIES, CATEGORY_IDS, type BuiltinTemplate, type Category } from "@/lib/templates/builtin";
import { COLOURS, COLOUR_IDS, type ColourFamily } from "@/lib/templates/builtin/palettes";
import { atsReport, type AtsLevel } from "@/lib/templates/checks";
import { filterTemplates, recommendTemplates, visibleBuiltins, type TemplateFilters } from "@/lib/templates/registry";
import { AtsBadge, TemplateThumb } from "./template-bits";

type Mode =
  | { kind: "public" }
  | { kind: "app"; defaultId: string | null; jobs: { id: string; title: string; company: string }[] };

const EMPTY: TemplateFilters = { q: "", category: "", ats: "", columns: "", photo: "", colour: "" };

function Chip({ on, onClick, children }: { on: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onClick}
      className={`h-8 whitespace-nowrap rounded-full border px-3 text-[13px] transition-colors max-sm:h-11 ${
        on ? "border-accent bg-accent text-on-accent" : "border-border bg-surface text-foreground hover:border-strong-border"
      }`}
    >
      {children}
    </button>
  );
}

function Card({ t, onOpen, isDefault }: { t: BuiltinTemplate; onOpen: () => void; isDefault?: boolean }) {
  const ats = atsReport(t.spec).level;
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="group block w-full text-left focus-visible:outline-none"
        aria-haspopup="dialog"
      >
        <div className="relative overflow-hidden rounded-lg border border-border bg-paper shadow-1 transition group-hover:-translate-y-0.5 group-hover:shadow-2 group-focus-visible:ring-2 group-focus-visible:ring-accent">
          <TemplateThumb id={t.id} name={t.name} decorative />
          {isDefault && <span aria-hidden="true" className="absolute left-2 top-2 rounded-full bg-accent px-2 py-0.5 text-[11px] font-medium text-on-accent after:content-['Your_default']" />}
          <span aria-hidden="true" className="absolute inset-x-0 bottom-0 flex translate-y-full items-center justify-center gap-1.5 bg-accent/90 py-2 text-[13px] font-medium text-on-accent transition after:content-['Preview_with_your_CV'] group-hover:translate-y-0 group-focus-visible:translate-y-0">
            <Icon name="eye" size={15} />
          </span>
        </div>
        <div className="mt-2 flex items-start justify-between gap-2">
          <div className="min-w-0 space-y-1">
            <p className="truncate text-sm font-medium">{t.name}</p>
            <AtsBadge level={ats} />
            <p className="truncate text-[12px] text-muted">{t.categories.map((c) => CATEGORIES[c]).join(" · ")}</p>
          </div>
        </div>
      </button>
    </li>
  );
}

function AppActions({ t, mode }: { t: BuiltinTemplate; mode: Extract<Mode, { kind: "app" }> }) {
  const [defState, setDefault, defPending] = useActionState(setDefaultTemplateAction, undefined);
  const [jobState, setForJob, jobPending] = useActionState(setJobTemplateAction, undefined);
  return (
    <div className="space-y-3">
      <div className="flex flex-wrap gap-2">
        <form action={setDefault}>
          <input type="hidden" name="id" value={t.id} />
          <button
            type="submit"
            disabled={defPending || mode.defaultId === t.id}
            className="inline-flex h-10 items-center gap-1.5 rounded-lg bg-accent px-4 text-sm font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60"
          >
            <Icon name="check" size={16} /> {mode.defaultId === t.id ? "Your default" : "Use as my default"}
          </button>
        </form>
        <Link href={`/app/studio/edit/${t.id}`} className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-strong-border bg-surface px-4 text-sm font-medium hover:border-strong-border">
          <Icon name="sparkle" size={16} /> Customise
        </Link>
        <a href={`/app/print/profile?template=${t.id}`} target="_blank" rel="noopener" className="inline-flex h-10 items-center gap-1.5 rounded-lg border border-strong-border bg-surface px-4 text-sm font-medium hover:bg-surface-hover">
          <Icon name="download" size={16} /> Download PDF
        </a>
      </div>
      <ActionToast state={defState} />
      {mode.jobs.length > 0 && (
        <form action={setForJob} className="flex flex-wrap items-center gap-2">
          <input type="hidden" name="templateId" value={t.id} />
          <label className="sr-only" htmlFor={`job-${t.id}`}>
            Use for a job
          </label>
          <select id={`job-${t.id}`} name="jobId" className="h-10 min-w-0 flex-1 rounded-lg border border-strong-border bg-surface px-3 text-sm">
            {mode.jobs.map((j) => (
              <option key={j.id} value={j.id}>
                {j.title}
                {j.company ? `, ${j.company}` : ""}
              </option>
            ))}
          </select>
          <button type="submit" disabled={jobPending} className="h-10 rounded-lg border border-strong-border px-3 text-sm font-medium hover:border-strong-border disabled:opacity-60">
            Use for this job
          </button>
          <div className="w-full">
            <ActionToast state={jobState} />
          </div>
        </form>
      )}
    </div>
  );
}

function Preview({ t, cv, photoUrl, mode, onClose }: { t: BuiltinTemplate; cv: Profile; photoUrl: string | null; mode: Mode; onClose: () => void }) {
  const report = atsReport(t.spec);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex justify-end" role="dialog" aria-modal="true" aria-label={`${t.name} preview`}>
      <button type="button" aria-label="Close preview" className="absolute inset-0 bg-black/40" onClick={onClose} />
      <div className="relative flex h-full w-full max-w-[1000px] flex-col bg-background shadow-3 md:flex-row">
        <div className="order-2 min-h-0 flex-1 overflow-y-auto p-4 md:order-1 md:p-8">
          <CvSheet spec={t.spec} cv={cv} photoUrl={photoUrl} />
        </div>
        <aside className="order-1 w-full shrink-0 space-y-5 border-b border-border bg-surface p-5 md:order-2 md:w-80 md:border-b-0 md:border-l md:overflow-y-auto">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-[13px] text-muted">{t.id.replace("sl-", "No. ")}</p>
              <h2 className="text-xl font-semibold tracking-tight">{t.name}</h2>
            </div>
            <button type="button" onClick={onClose} className="rounded-lg p-2 text-muted hover:bg-sunken hover:text-foreground" aria-label="Close preview" autoFocus>
              <Icon name="close" />
            </button>
          </div>
          <p className="text-sm text-muted">{t.description}</p>
          <div className="space-y-2">
            <AtsBadge level={report.level} />
            {report.reasons.map((r) => (
              <p key={r} className="text-[13px] text-muted">
                {r}
              </p>
            ))}
            {report.level !== "safe" && mode.kind === "app" && (
              <Link href={`/app/studio/edit/${t.id}?twin=1`} className="inline-block text-[13px] font-medium underline underline-offset-4">
                Same look, ATS-safe
              </Link>
            )}
          </div>
          {mode.kind === "app" ? (
            <AppActions t={t} mode={mode} />
          ) : (
            <Link href="/signup" className="flex h-11 items-center justify-center rounded-lg bg-accent text-sm font-medium text-on-accent hover:bg-accent-hover">
              Use this template, free
            </Link>
          )}
          <p className="text-[12px] text-muted">
            {mode.kind === "app" ? "This is your own CV in this template." : "Shown with a sample CV. Sign up to see yours."}
          </p>
        </aside>
      </div>
    </div>
  );
}

/** Browse, filter and preview the 100 templates. Used in the app (with your CV) and publicly. */
export function TemplateGallery({ cv, photoUrl, mode, initialCategory }: { cv: Profile; photoUrl: string | null; mode: Mode; initialCategory?: Category }) {
  const [f, setF] = useState<TemplateFilters>({ ...EMPTY, category: initialCategory ?? "" });
  const [open, setOpen] = useState<BuiltinTemplate | null>(null);
  const all = useMemo(() => visibleBuiltins(), []);
  const list = useMemo(() => filterTemplates(all, f), [all, f]);
  const recommended = useMemo(() => (mode.kind === "app" ? recommendTemplates(cv, null, 4) : []), [cv, mode.kind]);
  const filtering = Object.values(f).some(Boolean);
  const set = <K extends keyof TemplateFilters>(k: K, v: TemplateFilters[K]) => setF((cur) => ({ ...cur, [k]: cur[k] === v ? "" : v }));
  const defaultId = mode.kind === "app" ? mode.defaultId : null;

  return (
    <div className="grid gap-8 lg:grid-cols-[200px_1fr]">
      <nav aria-label="Template categories" className="hidden lg:block">
        <ul className="sticky top-20 space-y-0.5 text-sm">
          <li>
            <button
              type="button"
              onClick={() => setF((cur) => ({ ...cur, category: "" }))}
              className={`flex w-full justify-between rounded-lg px-3 py-1.5 text-left ${!f.category ? "bg-surface font-medium shadow-1" : "text-muted hover:text-foreground"}`}
            >
              All templates <span className="text-[12px] tabular-nums text-muted">{all.length}</span>
            </button>
          </li>
          {CATEGORY_IDS.map((c) => (
            <li key={c}>
              <button
                type="button"
                aria-pressed={f.category === c}
                onClick={() => set("category", c)}
                className={`flex w-full justify-between gap-2 rounded-lg px-3 py-1.5 text-left ${
                  f.category === c ? "bg-surface font-medium shadow-1" : "text-muted hover:text-foreground"
                }`}
              >
                {CATEGORIES[c]} <span className="text-[12px] tabular-nums text-muted">{all.filter((t) => t.categories.includes(c)).length}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      <div className="min-w-0 space-y-6">
        <div className="space-y-3">
          <div className="relative">
            <Icon name="search" size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={f.q}
              onChange={(e) => setF((cur) => ({ ...cur, q: e.target.value }))}
              placeholder="Search templates: name, colour, field"
              aria-label="Search templates"
              className="h-11 w-full rounded-lg border border-border bg-surface pl-9 pr-3 text-sm outline-none focus:border-accent focus-visible:outline-2 focus-visible:outline-offset-0 focus-visible:outline-accent/30 max-sm:text-base"
            />
          </div>
          <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 lg:hidden">
            {CATEGORY_IDS.map((c) => (
              <Chip key={c} on={f.category === c} onClick={() => set("category", c)}>
                {CATEGORIES[c]}
              </Chip>
            ))}
          </div>
          <div className="-mx-4 flex flex-wrap items-center gap-2 px-4">
            {(["safe", "mostly", "caution"] as AtsLevel[]).map((l) => (
              <Chip key={l} on={f.ats === l} onClick={() => set("ats", l)}>
                {l === "safe" ? "ATS-safe" : l === "mostly" ? "Mostly safe" : "Two columns"}
              </Chip>
            ))}
            <Chip on={f.photo === "yes"} onClick={() => set("photo", "yes")}>
              With photo
            </Chip>
            <Chip on={f.photo === "no"} onClick={() => set("photo", "no")}>
              No photo
            </Chip>
            <span className="mx-1 h-5 w-px bg-border" aria-hidden />
            {COLOUR_IDS.map((c) => (
              <button
                key={c}
                type="button"
                aria-pressed={f.colour === c}
                aria-label={COLOURS[c].label}
                title={COLOURS[c].label}
                onClick={() => set("colour", c as ColourFamily)}
                className={`relative size-7 rounded-full border-2 transition after:absolute after:-inset-2 after:content-[''] motion-reduce:transition-none ${f.colour === c ? "border-foreground scale-110" : "border-surface ring-1 ring-border"}`}
                style={{ background: COLOURS[c].accent }}
              />
            ))}
            {filtering && (
              <button type="button" onClick={() => setF(EMPTY)} className="ml-1 text-[13px] text-muted underline underline-offset-4 hover:text-foreground max-sm:min-h-11">
                Clear
              </button>
            )}
          </div>
        </div>

        {!filtering && recommended.length > 0 && (
          <section aria-labelledby="rec">
            <h2 id="rec" className="mb-3 flex items-center gap-2 text-sm font-medium">
              <Icon name="sparkle" size={16} /> Picked for you
              <span className="font-normal text-muted">from your headline and location</span>
            </h2>
            <ul className="grid grid-cols-2 gap-4 sm:grid-cols-3 xl:grid-cols-4">
              {recommended.map((t) => (
                <Card key={t.id} t={t} onOpen={() => setOpen(t)} isDefault={t.id === defaultId} />
              ))}
            </ul>
          </section>
        )}

        <section aria-labelledby="all">
          <h2 id="all" className="mb-3 text-sm font-medium" aria-live="polite">
            {filtering ? `${list.length} ${list.length === 1 ? "template" : "templates"}` : `All ${list.length} templates`}
          </h2>
          {list.length === 0 ? (
            <p className="rounded-lg border border-dashed border-strong-border p-10 text-center text-sm text-muted">
              No templates match all of those. Try removing a filter.
            </p>
          ) : (
            <ul className="grid grid-cols-2 gap-x-4 gap-y-6 sm:grid-cols-3 xl:grid-cols-4">
              {list.map((t) => (
                <Card key={t.id} t={t} onOpen={() => setOpen(t)} isDefault={t.id === defaultId} />
              ))}
            </ul>
          )}
        </section>
      </div>

      {open && <Preview t={open} cv={cv} photoUrl={photoUrl} mode={mode} onClose={() => setOpen(null)} />}
    </div>
  );
}
