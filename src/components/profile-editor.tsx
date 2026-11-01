"use client";

import { ActionToast } from "@/components/toast";
import { useActionState, useEffect, useId, useState } from "react";
import { updateProfile } from "@/app/actions/profile";
import type { Education, Experience, Profile, Project } from "@/lib/model/types";
import { webUrl, linkLabel } from "@/lib/cv/links";
import { inputClass, Kbd } from "./ui";
import { FormSubmit } from "./form-submit";
import { keepInputOnSubmit } from "./use-keep-input";

let next = 0;
const newId = (p: string) => `${p}new${Date.now().toString(36)}${(next++).toString(36)}`;
const lines = (s: string) => s.split("\n");
const join = (xs: string[]) => xs.join("\n");

function Text({ label, value, onChange, placeholder, wide }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string; wide?: boolean }) {
  const id = useId();
  return (
    <div className={`space-y-1 ${wide ? "sm:col-span-2" : ""}`}>
      <label htmlFor={id} className="t-label block">
        {label}
      </label>
      <input id={id} value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder} className={inputClass} />
    </div>
  );
}

/** The hint is linked with aria-describedby, so screen readers announce just the label as the field's name. */
function Area({ label, value, onChange, rows = 4, hint, placeholder }: { label: string; value: string; onChange: (v: string) => void; rows?: number; hint?: string; placeholder?: string }) {
  const id = useId();
  return (
    <div className="space-y-1 sm:col-span-2">
      <label htmlFor={id} className="t-label block">
        {label}
      </label>
      <textarea
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        rows={rows}
        placeholder={placeholder}
        aria-describedby={hint ? `${id}-hint` : undefined}
        className={`${inputClass} leading-relaxed`}
      />
      {hint && (
        <p id={`${id}-hint`} className="text-xs text-muted">
          {hint}
        </p>
      )}
    </div>
  );
}

function Section({ title, children, action, active }: { title: string; children: React.ReactNode; action?: React.ReactNode; active: string }) {
  return (
    <section hidden={active !== title} id={`profile-${title.toLowerCase()}`} aria-label={title} className="space-y-5 rounded-xl border border-border bg-surface p-5 sm:p-6">
      <div className="flex items-baseline justify-between gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action}
      </div>
      {children}
    </section>
  );
}

const small =
  "inline-flex h-8 items-center rounded px-2 text-[13px] text-muted transition-colors duration-150 hover:bg-surface-hover hover:text-foreground disabled:pointer-events-none disabled:opacity-40 max-sm:h-11";

/** Every section of the profile, editable. One bullet per line keeps it fast to fix. */
export function ProfileEditor({ initial }: { initial: Profile }) {
  const [state, action, pending] = useActionState(updateProfile, undefined);
  const [p, setP] = useState(initial);
  const [active, setActive] = useState("Personal details");
  const [baseline, setBaseline] = useState(() => JSON.stringify(initial));
  const dirty = JSON.stringify(p) !== baseline;
  const serverVersion = JSON.stringify(initial);
  const [seenServerVersion, setSeenServerVersion] = useState(serverVersion);
  // A background repair or import can update the saved profile while this editor is
  // mounted. Adopt it once the current form is clean, rather than retaining stale rows.
  if (serverVersion !== seenServerVersion && !dirty && !pending) {
    setSeenServerVersion(serverVersion);
    setP(initial);
    setBaseline(serverVersion);
  }

  // A save the server confirmed becomes the new "clean" state. (Adjusting state while rendering, keyed on the server's answer.)
  const [seen, setSeen] = useState(state);
  if (state !== seen) {
    setSeen(state);
    if (state?.success) setBaseline(JSON.stringify(p));
  }

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const set = <K extends keyof Profile>(key: K, value: Profile[K]) => setP((cur) => ({ ...cur, [key]: value }));
  const setItem = <K extends "experience" | "education" | "projects">(key: K, id: string, patch: Partial<Profile[K][number]>) =>
    setP((cur) => ({ ...cur, [key]: (cur[key] as { id: string }[]).map((x) => (x.id === id ? { ...x, ...patch } : x)) }));
  const remove = (key: "experience" | "education" | "projects", id: string) =>
    setP((cur) => ({ ...cur, [key]: (cur[key] as { id: string }[]).filter((x) => x.id !== id) }));
  const move = (id: string, dir: -1 | 1) =>
    setP((cur) => {
      const xs = [...cur.experience];
      const i = xs.findIndex((x) => x.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= xs.length) return cur;
      [xs[i], xs[j]] = [xs[j], xs[i]];
      return { ...cur, experience: xs };
    });

  return (
    <form
      method="post"
      onSubmit={keepInputOnSubmit(action)}
      onKeyDown={(e) => {
        if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "s") {
          e.preventDefault();
          e.currentTarget.requestSubmit();
        }
      }}
      className="grid gap-5 lg:grid-cols-[11rem_minmax(0,1fr)] lg:items-start"
    >
      <input type="hidden" name="profile" value={JSON.stringify(p)} />
      <nav aria-label="CV sections" className="flex flex-wrap gap-1 rounded-xl border border-border bg-surface p-2 lg:sticky lg:top-6 lg:flex-col">
        {[{ title: "Personal details", count: null }, { title: "Experience", count: p.experience.length }, { title: "Education", count: p.education.length }, { title: "Skills", count: p.skills.length }, { title: "Projects", count: p.projects.length }].map(({ title, count }) => (
          <button key={title} type="button" aria-current={active === title ? "true" : undefined} onClick={() => setActive(title)} className={`flex min-h-11 shrink-0 items-center justify-between gap-3 rounded-md px-3 text-left text-sm transition-colors ${active === title ? "bg-accent-soft font-medium text-accent" : "text-muted hover:bg-surface-hover hover:text-foreground"}`}>
            {title}{count !== null && <span className="text-xs tabular-nums opacity-80">{count}</span>}
          </button>
        ))}
      </nav>
      <div className="min-w-0 space-y-5">
      <section hidden={active !== "Personal details"} aria-label="Personal details" className="rounded-xl border border-border bg-surface p-5 sm:p-6">
      <h2 className="mb-5 text-base font-semibold">Personal details</h2>
      <div className="grid gap-5 sm:grid-cols-2">
        <Text label="Full name" value={p.name} onChange={(v) => set("name", v)} />
        <Text label="Headline" value={p.headline} onChange={(v) => set("headline", v)} placeholder="e.g. Staff Nurse, Frontend Developer" />
        <Text label="Email" value={p.email} onChange={(v) => set("email", v)} />
        <Text label="Phone" value={p.phone} onChange={(v) => set("phone", v)} />
        <Text label="Location" value={p.location} onChange={(v) => set("location", v)} placeholder="City, Country" />
        <Area label="Links" value={join(p.links)} onChange={(v) => set("links", lines(v))} rows={2} hint="One per line: LinkedIn, portfolio, GitHub." />
        <Area label="Summary" value={p.summary} onChange={(v) => set("summary", v)} rows={4} />
      </div>
      </section>

      <Section
        title="Experience"
        active={active}
        action={
          <button
            type="button"
            className={small}
            onClick={() => set("experience", [{ id: newId("x"), title: "", company: "", location: "", start: "", end: "", bullets: [] } satisfies Experience, ...p.experience])}
          >
            Add a role
          </button>
        }
      >
        {p.experience.length === 0 && <p className="text-sm text-muted">No roles yet. Add one, including part-time work, internships and volunteering.</p>}
        {p.experience.map((e, i) => (
          <fieldset key={e.id} className="grid gap-3 rounded-md border border-border bg-surface p-4 sm:grid-cols-2">
            <legend className="sr-only">{e.title || `Role ${i + 1}`}</legend>
            <Text label="Job title" value={e.title} onChange={(v) => setItem("experience", e.id, { title: v })} />
            <Text label="Employer" value={e.company} onChange={(v) => setItem("experience", e.id, { company: v })} />
            <Text label="Location" value={e.location} onChange={(v) => setItem("experience", e.id, { location: v })} />
            <div className="grid grid-cols-2 gap-3">
              <Text label="From" value={e.start} onChange={(v) => setItem("experience", e.id, { start: v })} placeholder="Jan 2022" />
              <Text label="To" value={e.end} onChange={(v) => setItem("experience", e.id, { end: v })} placeholder="Present" />
            </div>
            <Area
              label="What you did"
              value={join(e.bullets)}
              onChange={(v) => setItem("experience", e.id, { bullets: lines(v) })}
              rows={Math.min(14, Math.max(4, e.bullets.length + 1))}
              hint="One point per line. Real numbers help: how many, how much, how fast."
            />
            <div className="flex flex-wrap gap-4 sm:col-span-2">
              <button type="button" className={small} onClick={() => move(e.id, -1)} disabled={i === 0}>
                Move up
              </button>
              <button type="button" className={small} onClick={() => move(e.id, 1)} disabled={i === p.experience.length - 1}>
                Move down
              </button>
              <button type="button" className={`${small} hover:text-danger`} onClick={() => remove("experience", e.id)}>
                Remove
              </button>
            </div>
          </fieldset>
        ))}
      </Section>

      <Section
        title="Education"
        active={active}
        action={
          <button type="button" className={small} onClick={() => set("education", [...p.education, { id: newId("e"), school: "", degree: "", start: "", end: "", details: [] } satisfies Education])}>
            Add
          </button>
        }
      >
        {p.education.map((e) => (
          <fieldset key={e.id} className="grid gap-3 rounded-md border border-border bg-surface p-4 sm:grid-cols-2">
            <Text label="Qualification" value={e.degree} onChange={(v) => setItem("education", e.id, { degree: v })} placeholder="e.g. BSc Computer Science, +2 Science" />
            <Text label="School or college" value={e.school} onChange={(v) => setItem("education", e.id, { school: v })} />
            <Text label="From" value={e.start} onChange={(v) => setItem("education", e.id, { start: v })} />
            <Text label="To" value={e.end} onChange={(v) => setItem("education", e.id, { end: v })} />
            <Area label="Details" value={join(e.details)} onChange={(v) => setItem("education", e.id, { details: lines(v) })} rows={2} hint="Optional. Grades, awards, relevant modules, one per line." />
            <button type="button" className={`${small} justify-self-start hover:text-danger`} onClick={() => remove("education", e.id)}>
              Remove
            </button>
          </fieldset>
        ))}
      </Section>

      <Section title="Skills" active={active}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Area
            label="Skills and tools"
            value={p.skills.join(", ")}
            onChange={(v) => set("skills", v.split(",").map((s) => s.trimStart()))}
            rows={3}
            hint="Separated by commas. Only list what you'd be comfortable being asked about."
          />
          <Area label="Certifications and licences" value={join(p.certifications)} onChange={(v) => set("certifications", lines(v))} rows={2} hint="One per line." />
          <Area label="Languages" value={p.languages.join(", ")} onChange={(v) => set("languages", v.split(",").map((s) => s.trimStart()))} rows={1} />
        </div>
      </Section>

      <Section
        title="Projects"
        active={active}
        action={
          <button type="button" className={small} onClick={() => set("projects", [...p.projects, { id: newId("p"), name: "", link: "", bullets: [] } satisfies Project])}>
            Add
          </button>
        }
      >
        {p.projects.length === 0 && <p className="text-sm text-muted">Optional. Useful for students and career changers.</p>}
        <p className="text-sm leading-relaxed text-muted">Each project has its own title, URL and description. Only the title appears as a heading in your CV.</p>
        {p.projects.map((x, index) => (
          <fieldset key={x.id} className="grid gap-4 rounded-lg border border-border bg-background p-4 sm:grid-cols-2 sm:p-5">
            <div className="flex items-center justify-between gap-3 border-b border-border pb-3 sm:col-span-2"><p className="text-xs font-medium text-muted">Project {String(index + 1).padStart(2, "0")}</p>{webUrl(x.link) ? <a href={webUrl(x.link)!} target="_blank" rel="noreferrer" className="truncate text-xs font-medium text-accent hover:underline">Open live project ↗</a> : <span className="text-xs text-warning">URL not found in the saved import</span>}</div>
            <Text label="Project title" value={x.name} onChange={(v) => setItem("projects", x.id, { name: v })} wide />
            <div className="space-y-2 sm:col-span-2"><Text label="Project URL" value={x.link} onChange={(v) => setItem("projects", x.id, { link: v })} placeholder="https://your-project.com" />{webUrl(x.link) && <p className="break-all text-xs text-muted">Saved destination: {linkLabel(x.link)}</p>}</div>
            <Area label="Description and highlights" value={join(x.bullets)} onChange={(v) => setItem("projects", x.id, { bullets: lines(v) })} rows={Math.min(12, Math.max(5, Math.ceil(join(x.bullets).length / 100)))} hint="One point per line. Keep the context, your contribution and the result here—not in the project title." />
            <button type="button" className={`${small} justify-self-start hover:text-danger`} onClick={() => remove("projects", x.id)}>
              Remove
            </button>
          </fieldset>
        ))}
      </Section>

      <div className="space-y-2 rounded-lg border border-border bg-surface px-4 py-3">
        <ActionToast state={state} />
        <div className="flex flex-wrap items-center gap-3">
          <FormSubmit loading={pending}>
            {pending ? "Saving…" : "Save profile"}
          </FormSubmit>
          <span className="hidden items-center gap-1 text-xs text-muted sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>S</Kbd>
          </span>
          {dirty && <span className="text-xs text-warning">Unsaved changes</span>}
        </div>
      </div>
      </div>
    </form>
  );
}
