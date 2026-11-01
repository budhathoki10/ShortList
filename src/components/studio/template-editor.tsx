"use client";

import { ActionToast, useToast } from "@/components/toast";
import Link from "next/link";
import { useActionState, useCallback, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { saveTemplateAction } from "@/app/actions/templates";
import { CvSheet, measureFit } from "@/components/cv/cv-sheet";
import { StudioIcon as Icon } from "@/components/icons";
import type { Profile } from "@/lib/model/types";
import { COLOURS, COLOUR_IDS, palette } from "@/lib/templates/builtin/palettes";
import { atsReport, contrastIssues, photoAdvice } from "@/lib/templates/checks";
import { BODY_FONT_IDS, FONT_IDS, FONTS, fontStack, type FontId } from "@/lib/templates/fonts";
import {
  BULLETS,
  changeLayout,
  DATE_STYLES,
  hasSidebar,
  HEADING_STYLES,
  LAYOUT_LABELS,
  LAYOUTS,
  LIMITS,
  PHOTO_STYLES,
  SECTION_LABELS,
  SKILLS_STYLES,
  type Layout,
  type TemplateSpec,
} from "@/lib/templates/spec";
import { AtsBadge } from "./template-bits";

const LABELS: Record<string, string> = {
  underline: "Underline",
  "caps-rule": "Capitals",
  block: "Block",
  "side-bar": "Side bar",
  minimal: "Plain",
  numbered: "Numbered",
  disc: "•",
  dash: "–",
  arrow: "›",
  square: "▪",
  none: "None",
  right: "Right",
  under: "Under",
  left: "Left",
  inline: "Inline",
  tags: "Tags",
  columns: "Columns",
  lines: "Lines",
  off: "Off",
  circle: "Circle",
  rounded: "Rounded",
};

function Group({ title, children, defaultOpen = true }: { title: string; children: ReactNode; defaultOpen?: boolean }) {
  return (
    <details open={defaultOpen} className="group border-b border-border py-3 [&_summary::-webkit-details-marker]:hidden">
      <summary className="flex cursor-pointer list-none items-center justify-between text-[13px] font-medium">
        {title}
        <Icon name="chevron" size={14} className="text-muted transition group-open:rotate-90" />
      </summary>
      <div className="mt-3 space-y-3">{children}</div>
    </details>
  );
}

function Segmented<T extends string>({ label, value, options, onChange, render }: { label: string; value: T; options: readonly T[]; onChange: (v: T) => void; render?: (v: T) => ReactNode }) {
  return (
    <fieldset>
      <legend className="mb-1.5 text-[12px] text-muted">{label}</legend>
      <div className="flex flex-wrap gap-1">
        {options.map((o) => (
          <button
            key={o}
            type="button"
            aria-pressed={value === o}
            onClick={() => onChange(o)}
            className={`h-8 min-w-9 rounded-md border px-2 text-[12px] ${value === o ? "border-accent bg-accent text-on-accent" : "border-border bg-surface hover:border-strong-border"}`}
          >
            {render ? render(o) : (LABELS[o] ?? o)}
          </button>
        ))}
      </div>
    </fieldset>
  );
}

function Slider({ label, value, min, max, step, unit, onChange }: { label: string; value: number; min: number; max: number; step: number; unit: string; onChange: (v: number) => void }) {
  const id = useId();
  return (
    <div>
      <div className="flex justify-between text-[12px]">
        <label htmlFor={id} className="text-muted">
          {label}
        </label>
        <span className="tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(Number(e.target.value))} className="mt-1 w-full accent-[var(--ink)]" />
    </div>
  );
}

function ColourInput({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  const id = useId();
  return (
    <label htmlFor={id} className="flex items-center justify-between gap-2 text-[12px]">
      <span className="text-muted">{label}</span>
      <span className="flex items-center gap-2">
        <span className="font-mono uppercase">{value}</span>
        <input id={id} type="color" value={value} onChange={(e) => onChange(e.target.value.toLowerCase())} className="size-7 cursor-pointer rounded border border-border bg-transparent p-0" />
      </span>
    </label>
  );
}

function FontSelect({ label, value, options, onChange }: { label: string; value: FontId; options: FontId[]; onChange: (v: FontId) => void }) {
  const id = useId();
  return (
    <div>
      <label htmlFor={id} className="mb-1 block text-[12px] text-muted">
        {label}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value as FontId)}
        style={{ fontFamily: fontStack(value) }}
        className="h-9 w-full rounded-xl border border-border bg-surface shadow-1 px-2 text-sm"
      >
        {options.map((f) => (
          <option key={f} value={f} style={{ fontFamily: fontStack(f) }}>
            {FONTS[f].label}
          </option>
        ))}
      </select>
    </div>
  );
}

/** A tiny drawing of each layout, so people pick by shape rather than by name. */
function LayoutIcon({ layout }: { layout: Layout }) {
  const bar = "rounded-[1px] bg-current";
  const lines = (
    <div className="space-y-[3px]">
      <div className={`${bar} h-[3px] w-full opacity-40`} />
      <div className={`${bar} h-[3px] w-4/5 opacity-40`} />
      <div className={`${bar} h-[3px] w-full opacity-40`} />
    </div>
  );
  return (
    <div className="flex h-14 w-11 flex-col gap-1 overflow-hidden rounded-sm border border-current/30 bg-paper p-1 text-paper-ink">
      {layout === "banner" && <div className="-m-1 mb-0 h-3 bg-current" />}
      {layout.startsWith("sidebar") ? (
        <div className={`flex h-full gap-1 ${layout === "sidebar-right" ? "flex-row-reverse" : ""}`}>
          <div className="w-3 -my-1 bg-current" style={{ marginLeft: layout === "sidebar-left" ? -4 : 0, marginRight: layout === "sidebar-right" ? -4 : 0 }} />
          <div className="flex-1 space-y-1">
            <div className={`${bar} h-1 w-3/4`} />
            {lines}
          </div>
        </div>
      ) : (
        <>
          {layout !== "banner" && (
            <div className={`flex ${layout === "split-header" ? "justify-between" : layout === "executive" || layout === "academic" ? "justify-center" : ""}`}>
              <div className={`${bar} h-1 w-1/2`} />
              {layout === "split-header" && <div className={`${bar} h-1 w-1/4 opacity-50`} />}
            </div>
          )}
          {layout === "executive" && <div className="h-[2px] border-y border-current" />}
          {layout === "modern-grid" || layout === "compact" || layout === "academic" ? (
            <div className="flex gap-1">
              <div className={`${bar} h-6 w-2 opacity-30`} />
              <div className="flex-1">{lines}</div>
            </div>
          ) : layout === "timeline" ? (
            <div className="ml-0.5 border-l border-current pl-1">{lines}</div>
          ) : (
            lines
          )}
        </>
      )}
    </div>
  );
}

type Draft = { spec: TemplateSpec; key: string; at: number };

/** Undo/redo history. Rapid changes to the same control (a slider drag) count as one step. */
function useHistory(initial: TemplateSpec) {
  const [state, setState] = useState<{ stack: Draft[]; index: number }>({ stack: [{ spec: initial, key: "", at: 0 }], index: 0 });
  const spec = state.stack[state.index].spec;
  const change = useCallback((key: string, next: TemplateSpec) => {
    setState(({ stack, index }) => {
      const now = Date.now();
      const top = stack[index];
      const base = stack.slice(0, index + 1);
      if (top.key === key && now - top.at < 800 && index > 0) base[index] = { spec: next, key, at: now };
      else base.push({ spec: next, key, at: now });
      const trimmed = base.slice(-100);
      return { stack: trimmed, index: trimmed.length - 1 };
    });
  }, []);
  return {
    spec,
    change,
    canUndo: state.index > 0,
    canRedo: state.index < state.stack.length - 1,
    undo: () => setState((s) => ({ ...s, index: Math.max(0, s.index - 1) })),
    redo: () => setState((s) => ({ ...s, index: Math.min(s.stack.length - 1, s.index + 1) })),
  };
}

export function TemplateEditor({
  initial,
  templateId,
  ownTemplate,
  name: initialName,
  basedOn,
  cv,
  photoUrl,
  usingSample,
}: {
  initial: TemplateSpec;
  templateId: string;
  ownTemplate: boolean;
  name: string;
  basedOn: string | null;
  cv: Profile;
  photoUrl: string | null;
  usingSample: boolean;
}) {
  const { spec, change, canUndo, canRedo, undo, redo } = useHistory(initial);
  const [name, setName] = useState(initialName);
  const [pages, setPages] = useState(1);
  const [tab, setTab] = useState<"design" | "preview" | "checks">("preview");
  const [atsText, setAtsText] = useState<string | null>(null);
  const toast = useToast();
  const [state, save, saving] = useActionState(saveTemplateAction, undefined);
  const article = useRef<HTMLElement | null>(null);

  const set = <K extends keyof TemplateSpec>(key: K, value: TemplateSpec[K]) => change(key, { ...spec, [key]: value });
  const setIn = <K extends "fonts" | "palette" | "header" | "density" | "page">(key: K, patch: Partial<TemplateSpec[K]>, coalesce: string = key) =>
    change(String(coalesce), { ...spec, [key]: { ...spec[key], ...patch } });

  const report = atsReport(spec);
  const contrast = contrastIssues(spec);
  const advice = photoAdvice(spec, cv.location);
  const empty = useMemo(
    () => spec.sections.filter((s) => s.visible && (s.id === "summary" ? !cv.summary.trim() : cv[s.id].length === 0)).map((s) => SECTION_LABELS[s.id]),
    [spec.sections, cv],
  );

  const fit = (target: number) => {
    if (!article.current) return;
    const step = measureFit(article.current, spec, target);
    if (!step) {
      toast.show({ tone: "error", key: "fit", message: `Needs more than ${target} ${target === 1 ? "page" : "pages"}`, description: "Even at the smallest readable size. Shorten a few points instead." });
      return;
    }
    change("fit", { ...spec, density: step.density, page: { ...spec.page, margin: step.margin } });
  };

  const moveSection = (index: number, dir: -1 | 1) => {
    const j = index + dir;
    if (j < 0 || j >= spec.sections.length) return;
    const sections = [...spec.sections];
    [sections[index], sections[j]] = [sections[j], sections[index]];
    change("sections", { ...spec, sections });
  };
  const [dragging, setDragging] = useState<number | null>(null);

  const controls = (
    <div className="pb-6">
      <Group title="Layout">
        <div className="grid grid-cols-5 gap-2">
          {LAYOUTS.map((l) => (
            <button
              key={l}
              type="button"
              onClick={() => change("layout", changeLayout(spec, l))}
              aria-pressed={spec.layout === l}
              title={LAYOUT_LABELS[l]}
              className={`flex flex-col items-center gap-1 rounded-md p-1 text-[10px] leading-tight ${spec.layout === l ? "bg-accent-soft ring-2 ring-accent" : "hover:bg-sunken"}`}
            >
              <LayoutIcon layout={l} />
              <span className="sr-only">{LAYOUT_LABELS[l]}</span>
            </button>
          ))}
        </div>
        <p className="text-[12px] text-muted">{LAYOUT_LABELS[spec.layout]}</p>
        {hasSidebar(spec.layout) && (
          <Slider label="Side panel width" value={spec.sidebarWidth} min={LIMITS.sidebarWidth[0]} max={LIMITS.sidebarWidth[1]} step={1} unit="%" onChange={(v) => set("sidebarWidth", v)} />
        )}
      </Group>

      <Group title="Colours">
        <div className="flex flex-wrap gap-1.5">
          {COLOUR_IDS.map((c) => (
            <button
              key={c}
              type="button"
              title={COLOURS[c].label}
              aria-label={`${COLOURS[c].label} colours`}
              onClick={() => change("palette", { ...spec, palette: palette(c, hasSidebar(spec.layout) || spec.layout === "banner" ? (spec.palette.panelInk === "#ffffff" ? "deep" : "soft") : "plain") })}
              className={`size-7 rounded-full ring-1 ring-border ${spec.palette.accent === COLOURS[c].accent ? "ring-2 ring-foreground ring-offset-2" : ""}`}
              style={{ background: COLOURS[c].accent }}
            />
          ))}
        </div>
        <ColourInput label="Accent" value={spec.palette.accent} onChange={(v) => setIn("palette", { accent: v }, "palette.accent")} />
        <ColourInput label="Text" value={spec.palette.ink} onChange={(v) => setIn("palette", { ink: v }, "palette.ink")} />
        <ColourInput label="Dates and places" value={spec.palette.muted} onChange={(v) => setIn("palette", { muted: v }, "palette.muted")} />
        <ColourInput label="Lines" value={spec.palette.rule} onChange={(v) => setIn("palette", { rule: v }, "palette.rule")} />
        {(hasSidebar(spec.layout) || spec.layout === "banner") && (
          <>
            <ColourInput label="Panel" value={spec.palette.panel} onChange={(v) => setIn("palette", { panel: v }, "palette.panel")} />
            <ColourInput label="Text on panel" value={spec.palette.panelInk} onChange={(v) => setIn("palette", { panelInk: v }, "palette.panelInk")} />
          </>
        )}
      </Group>

      <Group title="Fonts">
        <FontSelect label="Name and headings" value={spec.fonts.heading} options={FONT_IDS} onChange={(v) => setIn("fonts", { heading: v })} />
        <FontSelect label="Body text" value={spec.fonts.body} options={BODY_FONT_IDS} onChange={(v) => setIn("fonts", { body: v })} />
      </Group>

      <Group title="Header">
        <Segmented label="Align" value={spec.header.align} options={["left", "center"] as const} onChange={(v) => setIn("header", { align: v })} render={(v) => (v === "left" ? "Left" : "Centre")} />
        <Segmented label="Name" value={spec.header.nameCase} options={["normal", "upper"] as const} onChange={(v) => setIn("header", { nameCase: v })} render={(v) => (v === "upper" ? "CAPITALS" : "As typed")} />
        <Slider label="Name size" value={spec.header.nameSize} min={LIMITS.nameSize[0]} max={LIMITS.nameSize[1]} step={1} unit="pt" onChange={(v) => setIn("header", { nameSize: v }, "header.nameSize")} />
      </Group>

      <Group title="Style" defaultOpen={false}>
        <Segmented label="Section titles" value={spec.headingStyle} options={HEADING_STYLES} onChange={(v) => set("headingStyle", v)} />
        <Segmented label="Bullets" value={spec.bullets} options={BULLETS} onChange={(v) => set("bullets", v)} />
        <Segmented label="Dates" value={spec.dateStyle} options={DATE_STYLES} onChange={(v) => set("dateStyle", v)} />
        <Segmented label="Skills" value={spec.skillsStyle} options={SKILLS_STYLES} onChange={(v) => set("skillsStyle", v)} />
      </Group>

      <Group title="Spacing and page" defaultOpen={false}>
        <Slider label="Text size" value={spec.density.fontSize} min={LIMITS.fontSize[0]} max={LIMITS.fontSize[1]} step={0.25} unit="pt" onChange={(v) => setIn("density", { fontSize: v }, "density.fontSize")} />
        <Slider label="Line spacing" value={spec.density.lineHeight} min={LIMITS.lineHeight[0]} max={LIMITS.lineHeight[1]} step={0.05} unit="" onChange={(v) => setIn("density", { lineHeight: v }, "density.lineHeight")} />
        <Slider label="Space between sections" value={spec.density.sectionGap} min={LIMITS.sectionGap[0]} max={LIMITS.sectionGap[1]} step={1} unit="pt" onChange={(v) => setIn("density", { sectionGap: v }, "density.sectionGap")} />
        <Slider label="Margins" value={spec.page.margin} min={LIMITS.margin[0]} max={LIMITS.margin[1]} step={1} unit="mm" onChange={(v) => setIn("page", { margin: v }, "page.margin")} />
        <Segmented label="Paper" value={spec.page.size} options={["A4", "Letter"] as const} onChange={(v) => setIn("page", { size: v })} render={(v) => (v === "A4" ? "A4" : "US Letter")} />
      </Group>

      <Group title="Photo" defaultOpen={false}>
        <Segmented label="Photo" value={spec.photo} options={PHOTO_STYLES} onChange={(v) => set("photo", v)} />
        {spec.photo !== "off" && !photoUrl && (
          <p className="text-[12px] text-muted">
            You haven&apos;t added a photo, so no photo shows.{" "}
            <Link href="/app/studio#photo" className="underline underline-offset-4">
              Add one
            </Link>
          </p>
        )}
      </Group>

      <Group title="Sections">
        <p className="text-[12px] text-muted">Drag to reorder, or use the arrows.</p>
        <ol className="space-y-1">
          {spec.sections.map((s, i) => (
            <li
              key={s.id}
              draggable
              onDragStart={() => setDragging(i)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => {
                if (dragging === null || dragging === i) return;
                const sections = [...spec.sections];
                const [moved] = sections.splice(dragging, 1);
                sections.splice(i, 0, moved);
                change("sections", { ...spec, sections });
                setDragging(null);
              }}
              className={`flex items-center gap-1.5 rounded-xl border border-border bg-surface shadow-1 px-2 py-1.5 text-[13px] ${dragging === i ? "opacity-50" : ""}`}
            >
              <Icon name="grip" size={14} className="cursor-grab text-faint" />
              <label className="flex flex-1 items-center gap-2">
                <input
                  type="checkbox"
                  checked={s.visible}
                  onChange={(e) => change("sections", { ...spec, sections: spec.sections.map((x) => (x.id === s.id ? { ...x, visible: e.target.checked } : x)) })}
                />
                <span className={s.visible ? "" : "text-muted line-through"}>{SECTION_LABELS[s.id]}</span>
              </label>
              {hasSidebar(spec.layout) && (
                <select
                  aria-label={`${SECTION_LABELS[s.id]} column`}
                  value={s.column}
                  onChange={(e) =>
                    change("sections", { ...spec, sections: spec.sections.map((x) => (x.id === s.id ? { ...x, column: e.target.value as "main" | "side" } : x)) })
                  }
                  className="h-7 rounded border border-border bg-surface px-1 text-[12px]"
                >
                  <option value="main">Main</option>
                  <option value="side">Side</option>
                </select>
              )}
              <button type="button" onClick={() => moveSection(i, -1)} disabled={i === 0} aria-label={`Move ${SECTION_LABELS[s.id]} up`} className="rounded p-1 text-muted hover:bg-sunken disabled:opacity-30">
                ↑
              </button>
              <button
                type="button"
                onClick={() => moveSection(i, 1)}
                disabled={i === spec.sections.length - 1}
                aria-label={`Move ${SECTION_LABELS[s.id]} down`}
                className="rounded p-1 text-muted hover:bg-sunken disabled:opacity-30"
              >
                ↓
              </button>
            </li>
          ))}
        </ol>
      </Group>
    </div>
  );

  const checks = (
    <div className="space-y-5 text-[13px]">
      <div className="space-y-1.5">
        <h3 className="font-medium">Applicant tracking systems</h3>
        <AtsBadge level={report.level} />
        {report.reasons.map((r) => (
          <p key={r} className="text-muted">
            {r}
          </p>
        ))}
        {report.level === "safe" && <p className="text-muted">One column, real text, standard headings. Reads cleanly.</p>}
      </div>
      <div className="space-y-1.5">
        <h3 className="font-medium">Length</h3>
        <p className={pages > 2 ? "text-danger" : "text-muted"}>
          {pages} {pages === 1 ? "page" : "pages"}. {pages === 1 ? "Ideal for most jobs." : pages === 2 ? "Fine with several years of experience." : "Most recruiters stop reading after 2 pages."}
        </p>
      </div>
      <div className="space-y-1.5">
        <h3 className="font-medium">Readability</h3>
        {contrast.length ? (
          contrast.map((c) => (
            <p key={c} className="text-danger">
              {c}
            </p>
          ))
        ) : (
          <p className="text-muted">All text has enough contrast to read and to print.</p>
        )}
      </div>
      {empty.length > 0 && (
        <div className="space-y-1.5">
          <h3 className="font-medium">Empty sections</h3>
          <p className="text-muted">
            {empty.join(", ")} {empty.length === 1 ? "is" : "are"} empty in your CV, so {empty.length === 1 ? "it doesn't" : "they don't"} show.{" "}
            <Link href="/app/profile" className="underline underline-offset-4">
              Add to your CV
            </Link>
          </p>
        </div>
      )}
      {advice && (
        <div className="space-y-1.5">
          <h3 className="font-medium">Photo</h3>
          <p className={advice.tone === "warning" ? "text-danger" : "text-muted"}>{advice.text}</p>
        </div>
      )}
    </div>
  );

  const toolbarButton = "inline-flex h-9 items-center max-sm:h-11 gap-1.5 rounded-lg border border-border bg-surface px-3 text-[13px] hover:border-strong-border disabled:opacity-40";

  return (
    <div className="space-y-4">
      <form action={save} className="flex flex-wrap items-center gap-2">
        <input type="hidden" name="spec" value={JSON.stringify(spec)} />
        <input type="hidden" name="id" value={ownTemplate ? templateId : ""} />
        <input type="hidden" name="basedOn" value={basedOn ?? ""} />
        <label className="sr-only" htmlFor="template-name">
          Template name
        </label>
        <input
          id="template-name"
          name="name"
          value={name}
          maxLength={60}
          onChange={(e) => setName(e.target.value)}
          className="h-10 min-w-0 flex-1 rounded-lg border border-transparent bg-transparent px-2 text-xl font-semibold tracking-tight hover:border-border focus:border-accent focus:bg-surface focus:outline-none sm:max-w-sm"
        />
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={undo} disabled={!canUndo} className={toolbarButton} aria-label="Undo">
            <Icon name="undo" size={15} />
          </button>
          <button type="button" onClick={redo} disabled={!canRedo} className={toolbarButton} aria-label="Redo">
            <Icon name="redo" size={15} />
          </button>
          {!usingSample && (
            <a
              href={`/app/print/profile?spec=${encodeURIComponent(toBase64Url(JSON.stringify(spec)))}`}
              target="_blank"
              rel="noopener"
              className={`${toolbarButton} gap-1.5`}
              title="Your CV in this design, as a PDF"
            >
              <Icon name="download" size={15} /> Download PDF
            </a>
          )}
          {ownTemplate ? (
            <>
              <button type="submit" disabled={saving} className="inline-flex h-9 items-center max-sm:h-11 gap-1.5 rounded-lg bg-accent px-4 text-[13px] font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
                {saving ? "Saving…" : "Save"}
              </button>
              <button type="submit" name="asNew" value="1" disabled={saving} className={toolbarButton}>
                Save as new
              </button>
            </>
          ) : (
            <button type="submit" name="asNew" value="1" disabled={saving} className="inline-flex h-9 items-center max-sm:h-11 gap-1.5 rounded-lg bg-accent px-4 text-[13px] font-medium text-on-accent hover:bg-accent-hover disabled:opacity-60">
              {saving ? "Saving…" : "Save as my template"}
            </button>
          )}
        </div>
      </form>
      <ActionToast state={state} />
      {usingSample && (
        <p className="rounded-lg border border-border bg-sunken px-3 py-2 text-[13px]">
          You&apos;re seeing a sample CV.{" "}
          <Link href="/app/profile" className="font-medium underline underline-offset-4">
            Add your CV
          </Link>{" "}
          to design with your own.
        </p>
      )}

      <div role="tablist" aria-label="Editor panels" className="flex gap-1 rounded-lg border border-border bg-surface p-1 lg:hidden">
        {(["design", "preview", "checks"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            type="button"
            aria-selected={tab === t}
            onClick={() => setTab(t)}
            className={`h-9 flex-1 rounded-md text-[13px] capitalize max-sm:h-11 ${tab === t ? "bg-accent text-on-accent" : "text-muted"}`}
          >
            {t}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[280px_minmax(0,1fr)_240px]">
        <aside aria-label="Design controls" className={`${tab === "design" ? "" : "hidden"} lg:block lg:max-h-[calc(100dvh-180px)] lg:overflow-y-auto lg:pr-2`}>
          {controls}
        </aside>
        <section aria-label="Preview" className={`${tab === "preview" ? "" : "hidden"} min-w-0 space-y-3 lg:block`}>
          <div className="flex flex-wrap items-center gap-2">
            <button type="button" className={toolbarButton} onClick={() => fit(1)}>
              Fit to 1 page
            </button>
            <button type="button" className={toolbarButton} onClick={() => fit(2)}>
              Fit to 2 pages
            </button>
            <button type="button" className={toolbarButton} onClick={() => setAtsText((t) => (t === null ? (article.current?.innerText ?? "") : null))} aria-pressed={atsText !== null}>
              <Icon name="eye" size={15} /> What an ATS reads
            </button>
            <span className="ml-auto text-[12px] tabular-nums text-muted">
              {pages} {pages === 1 ? "page" : "pages"} · {spec.page.size}
            </span>
          </div>
          {atsText !== null && (
            <div className="rounded-lg border border-border bg-surface p-4">
              <p className="mb-2 text-[12px] text-muted">The plain text an applicant tracking system gets from this CV, in reading order.</p>
              <pre className="max-h-72 overflow-auto whitespace-pre-wrap font-mono text-[12px] leading-relaxed">{atsText}</pre>
            </div>
          )}
          <div className="rounded-xl bg-sunken p-3 sm:p-6">
            <CvSheet spec={spec} cv={cv} photoUrl={photoUrl} onPages={setPages} articleRef={article} />
          </div>
        </section>
        <aside aria-label="Checks" className={`${tab === "checks" ? "" : "hidden"} lg:block`}>
          {checks}
        </aside>
      </div>
    </div>
  );
}

/** URL-safe base64 of UTF-8 text (the editor's design, for the print page). */
function toBase64Url(text: string) {
  const bytes = new TextEncoder().encode(text);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
