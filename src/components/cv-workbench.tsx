"use client";

import Link from "next/link";
import { useEffect, useState, useTransition } from "react";
import { toggleAllChanges, toggleChange } from "@/app/actions/tailor";
import { wordDiff } from "@/lib/diff";
import type { Change, Profile } from "@/lib/model/types";
import { applyChanges } from "@/lib/tailor/apply";
import { presentCv, type CvContent } from "@/lib/cv/presentation";
import type { TemplateSpec } from "@/lib/templates/spec";
import { JobCvLook, type LookOption } from "./studio/job-cv-look";
import { OriginalPdfPreview } from "./cv/original-pdf-preview";
import { useToast } from "./toast";
import { Badge, Button, buttonClass, Eyebrow } from "./ui";

function where(c: Change, profile: Profile) {
  if (c.kind === "summary") return "Summary";
  if (c.kind === "headline") return "Headline";
  if (c.kind === "skills-order" || c.kind === "skills-groups") return "Skills";
  if (c.kind === "skills-trim") return "Skills left out";
  if (c.kind === "experience-order") return "Role order";
  if (c.kind === "section-order") return "Section order";
  if (c.kind === "projects-order") return "Project order";
  if (c.kind === "project-bullet") return profile.projects.find((p) => p.id === c.projectId)?.name ?? "Project";
  const e = "experienceId" in c ? profile.experience.find((x) => x.id === c.experienceId) : undefined;
  return e ? `${e.title}${e.company ? `, ${e.company}` : ""}` : "Experience";
}

/** Added words are green when the change is fine and red when the fact check blocked it. */
function Diff({ before, after, blocked }: { before: string; after: string; blocked: boolean }) {
  return (
    <p className="text-sm leading-relaxed">
      {wordDiff(before, after).map((p, i) =>
        p.type === "same" ? (
          <span key={i}>{p.text}</span>
        ) : p.type === "added" ? (
          <ins key={i} className={blocked ? "rounded-[2px] bg-danger/15 px-0.5 font-medium text-danger no-underline" : "hl-shown no-underline"}>
            {p.text}
          </ins>
        ) : (
          <del key={i} className="text-faint">
            {p.text}
          </del>
        ),
      )}
    </p>
  );
}

function ChangeCard({ c, profile, onToggle }: { c: Change; profile: Profile; onToggle: (accept: boolean) => void }) {
  const blocked = c.flags.length > 0;
  const exp = "experienceId" in c ? profile.experience.find((e) => e.id === c.experienceId) : undefined;
  return (
    <li className={`rounded-md border p-4 transition-colors duration-150 ${blocked ? "border-danger/30 bg-danger-soft" : c.accepted ? "border-strong-border bg-surface" : "border-border bg-background"}`}>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 truncate text-[13px] font-medium" title={where(c, profile)}>
          {where(c, profile)}
        </p>
        {blocked ? <Badge tone="bad">Blocked</Badge> : c.accepted ? <Badge tone="good">Using</Badge> : <Badge>Not using</Badge>}
      </div>
      <p className="mt-1 text-[13px] text-muted">{c.reason}</p>
      <div className="mt-3">
        {(c.kind === "summary" || c.kind === "headline" || c.kind === "bullet" || c.kind === "project-bullet") && <Diff before={c.before} after={c.after} blocked={blocked} />}
        {c.kind === "section-order" && <p className="text-sm capitalize">{c.order.join(" → ")}</p>}
        {c.kind === "projects-order" && <ol className="list-decimal space-y-1 pl-5 text-sm">{c.order.map((id) => <li key={id}>{profile.projects.find((p) => p.id === id)?.name}</li>)}</ol>}
        {c.kind === "bullet-order" && exp && (
          <ol className="list-decimal space-y-1 pl-5 text-sm">
            {c.order.map((i) => (
              <li key={i} className="truncate" title={exp.bullets[i]}>
                {exp.bullets[i]}
              </li>
            ))}
          </ol>
        )}
        {c.kind === "bullet-drop" && <p className="text-sm text-faint line-through decoration-faint/60">{c.before}</p>}
        {c.kind === "experience-order" && <ol className="list-decimal space-y-1 pl-5 text-sm">{c.order.map((id) => { const e = profile.experience.find((x) => x.id === id); return <li key={id}>{[e?.title, e?.company].filter(Boolean).join(", ")}</li>; })}</ol>}
        {c.kind === "skills-trim" && <p className="text-sm text-muted">{c.drop.join(", ")}</p>}
        {c.kind === "skills-groups" && (
          <dl className="space-y-1 text-sm">
            {c.groups.map((g) => (
              <div key={g.label} className="flex gap-2">
                <dt className="shrink-0 font-medium">{g.label}</dt>
                <dd className="min-w-0 text-muted">{g.skills.join(", ")}</dd>
              </div>
            ))}
          </dl>
        )}
        {c.kind === "skills-order" && (
          <p className="text-sm">
            {c.order.slice(0, 12).join(", ")}
            {c.order.length > 12 ? "…" : ""}
          </p>
        )}
      </div>
      {blocked ? (
        <p className="mt-3 text-[13px] text-danger">
          This adds something that isn’t in your CV: <strong>{c.flags.join(", ")}</strong>. If it’s true,{" "}
          <Link href="/app/profile" className="underline underline-offset-4">
            add it to your profile
          </Link>{" "}
          and tailor again.
        </p>
      ) : (
        <button
          type="button"
          onClick={() => onToggle(!c.accepted)}
          className="mt-3 inline-flex h-8 items-center rounded px-2 text-[13px] font-medium text-accent transition-colors duration-150 hover:bg-accent-soft max-sm:h-10"
        >
          {c.accepted ? "Don't use this" : c.optional ? "Use this (optional)" : "Use this"}
        </button>
      )}
    </li>
  );
}

/**
 * The suggestions beside the CV they produce. A toggle changes the list and the preview on the
 * same frame; the save happens in the background and is rolled back (with a message) if it fails.
 */
export function CvWorkbench({
  jobId,
  profile,
  initial,
  docx,
  original,
  look,
  action,
}: {
  jobId: string;
  profile: Profile;
  initial: Change[];
  docx: boolean;
  original: { name: string; type: string; matchesProfile: boolean } | null;
  /** The job's CV template, the person's photo and the looks they can try. */
  look: { photoUrl: string | null; current: { id: string; name: string }; spec: TemplateSpec; fitted: boolean; fitKey: string; options: LookOption[] };
  /** The "Suggest again" control, rendered on the server. */
  action: React.ReactNode;
}) {
  const [changes, setChanges] = useState(initial);
  const [content, setContent] = useState<CvContent>("full");
  const hasOriginalPdf = original?.type === "application/pdf";
  const [layout, setLayout] = useState<"original" | "redesigned">(hasOriginalPdf ? "original" : "redesigned");
  // When the server sends a different set (a fresh round of suggestions), start from it.
  // Adjusting state while rendering, keyed on what the server last sent.
  const signature = initial.map((c) => `${c.id}:${c.accepted}`).join();
  const [seen, setSeen] = useState(signature);
  if (signature !== seen) {
    setSeen(signature);
    setChanges(initial);
  }
  const [saving, startTransition] = useTransition();
  const toast = useToast();

  // The save happens in the background, so leaving mid-save would lose the change: ask first.
  useEffect(() => {
    if (!saving) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [saving]);
  const cv = presentCv(applyChanges(profile, changes), content);
  const usable = changes.filter((c) => c.flags.length === 0);
  const using = usable.filter((c) => c.accepted).length;
  // "Use all" skips the optional trims and reorders that change what the CV says or its date order.
  const everyDefault = usable.filter((c) => !c.optional);

  const save = (apply: (cs: Change[]) => Change[], run: (fd: FormData) => Promise<void>, fields: Record<string, string>) => {
    const before = changes;
    setChanges(apply(before));
    startTransition(async () => {
      const data = new FormData();
      data.set("jobId", jobId);
      for (const [k, v] of Object.entries(fields)) data.set(k, v);
      try {
        await run(data);
      } catch {
        setChanges(before);
        toast.show({ tone: "error", message: "Couldn’t save that change. It’s been put back." });
      }
    });
  };

  const toggle = (id: string, accept: boolean) =>
    save((cs) => cs.map((c) => (c.id === id && c.flags.length === 0 ? { ...c, accepted: accept } : c)), toggleChange, { changeId: id, accept: accept ? "1" : "0" });
  const setAll = (accept: boolean) => save((cs) => cs.map((c) => (c.flags.length === 0 && (!accept || !c.optional) ? { ...c, accepted: accept } : c)), toggleAllChanges, { accept: accept ? "1" : "0" });

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,26rem)_minmax(0,1fr)]">
      <section className="space-y-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-base font-semibold">Suggested changes</h2>
          <p className="text-[13px] text-muted tabular-nums" aria-live="polite">
            Using {using} of {changes.length}
          </p>
        </div>
        {usable.length > 1 && (
          <div className="flex gap-1">
            <Button type="button" variant="ghost" size="sm" onClick={() => setAll(true)} disabled={everyDefault.every((c) => c.accepted)}>
              Use all
            </Button>
            <Button type="button" variant="ghost" size="sm" onClick={() => setAll(false)} disabled={using === 0}>
              Use none
            </Button>
          </div>
        )}
        {changes.length === 0 ? (
          <p className="text-sm text-muted">No supported changes were identified. Review your CV against the job requirements before applying.</p>
        ) : (
          <ol className="space-y-3">
            {changes.map((c) => (
              <ChangeCard key={c.id} c={c} profile={profile} onToggle={(accept) => toggle(c.id, accept)} />
            ))}
          </ol>
        )}
        <div className="border-t border-border pt-4">{action}</div>
      </section>

      <section className="min-w-0 space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <Eyebrow>Your CV for this job</Eyebrow>
          <div className="flex flex-wrap items-center gap-2">
            <a href={`/app/download/cv/${jobId}?format=pdf&layout=${layout}&content=${content}`} className={buttonClass("primary", "sm")}>
              Download PDF
            </a>
            <Link href={`/app/print/cv/${jobId}?layout=${layout}&content=${content}`} target="_blank" className={buttonClass("ghost", "sm")}>Print preview</Link>
            {layout === "redesigned" && docx && (
              <a href={`/app/download/cv/${jobId}?layout=redesigned&content=${content}`} className={buttonClass("secondary", "sm")}>
                Download Word
              </a>
            )}
          </div>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div role="group" aria-label="CV format" className="flex gap-0.5 rounded-lg border border-border bg-surface p-0.5">
            <button type="button" disabled={!hasOriginalPdf} aria-pressed={layout === "original"} onClick={() => setLayout("original")} title={hasOriginalPdf ? "Your uploaded PDF, exactly as it is" : "Upload your original PDF on Your CV to use it here"} className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 disabled:opacity-50 ${layout === "original" ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}>
              Original PDF
            </button>
            <button type="button" aria-pressed={layout === "redesigned"} onClick={() => setLayout("redesigned")} title="Your CV with the changes you accepted, in the look below" className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 disabled:opacity-50 ${layout === "redesigned" ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}>
              Tailored version
            </button>
          </div>
          {layout === "redesigned" && (
            <div role="group" aria-label="CV content length" className="flex gap-0.5 rounded-lg border border-border bg-surface p-0.5">
              {(["focused", "full"] as const).map((mode) => (
                <button key={mode} type="button" aria-pressed={content === mode} onClick={() => setContent(mode)} title={mode === "focused" ? "Shorter: key project highlights and a short summary" : "Everything saved in your CV"} className={`rounded-md px-3 py-1.5 text-[13px] font-medium transition-colors duration-150 disabled:opacity-50 ${content === mode ? "bg-accent-soft text-accent" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}>
                  {mode === "focused" ? "Focused" : "Full"}
                </button>
              ))}
            </div>
          )}
        </div>
        {layout === "original" ? (
          <div className="space-y-3 rounded-lg border border-border bg-surface p-4">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="min-w-0 truncate text-sm font-medium" title={original?.name}>{original?.name ?? "Your uploaded PDF"}</p>
              <Link href="/app/download/original?inline=1" target="_blank" className={buttonClass("secondary", "sm")}>Open</Link>
            </div>
            {original && !original.matchesProfile && <p className="text-xs text-warning">You edited your CV after this upload; those edits aren&apos;t in this PDF.</p>}
            <OriginalPdfPreview />
          </div>
        ) : (<>
        <JobCvLook
          key={`${look.current.id}-${look.fitKey}`}
          jobId={jobId}
          cv={cv}
          photoUrl={look.photoUrl}
          current={look.current}
          spec={look.spec}
          fitted={look.fitted}
          options={look.options}
        />
        </>)}
      </section>
    </div>
  );
}
