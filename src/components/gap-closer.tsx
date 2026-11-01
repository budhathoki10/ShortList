"use client";

import { useActionState, useId, useState } from "react";
import { addSkillEvidence } from "@/app/actions/profile";
import { ActionToast } from "@/components/toast";
import { SKILL_LEVELS, skillLabel } from "@/lib/cv/skill-levels";
import type { CloseGap, SkillLevel } from "@/lib/model/types";
import { FormSubmit } from "./form-submit";
import { inputClass } from "./ui";

type Role = { id: string; label: string };

/**
 * The honest way to fit a job better: skills the post asks for that your CV doesn't show yet.
 * If you really have one, say where you used it, in your own words, and it goes into your CV.
 */
export function GapCloser({ gaps, roles, closeGaps = [] }: { gaps: string[]; roles: Role[]; closeGaps?: CloseGap[] }) {
  // The list as it was when the page opened: a skill you add stays, marked as added, instead of vanishing.
  const [list] = useState(gaps);
  if (list.length === 0) return null;
  // Advice only for what is still missing, so it goes away once the skill is genuinely added.
  const advice = closeGaps.filter((g) => gaps.some((x) => x.toLowerCase() === g.skill.toLowerCase())).slice(0, 3);
  return (
    <div className="space-y-5">
    <section aria-labelledby="gap-closer" className="space-y-2">
      <div>
        <h2 id="gap-closer" className="text-sm font-semibold">
          Not in your CV yet <span className="font-normal text-muted">· {list.length}</span>
        </h2>
        <p className="mt-0.5 text-xs text-muted">Only add what you’ve really done, at the level that’s true. It goes into your CV as you write it.</p>
      </div>
      <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
        {list.map((skill) => (
          <GapRow key={skill} skill={skill} roles={roles} />
        ))}
      </ul>
    </section>
    {advice.length > 0 && (
      <section aria-labelledby="close-gap" className="space-y-2">
        <div>
          <h2 id="close-gap" className="text-sm font-semibold">Close the gap</h2>
          <p className="mt-0.5 text-xs text-muted">Not on your CV, and not claimed there. Ways to earn it first.</p>
        </div>
        <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border bg-surface">
          {advice.map((g) => (
            <li key={g.skill} className="space-y-1 px-4 py-3 text-sm">
              <p className="font-medium">{g.skill}</p>
              <p className="text-muted">{g.action}</p>
              <p className="text-xs text-muted">{g.describeAs}</p>
            </li>
          ))}
        </ul>
      </section>
    )}
    </div>
  );
}

function GapRow({ skill, roles }: { skill: string; roles: Role[] }) {
  const [open, setOpen] = useState(false);
  const [state, action, pending] = useActionState(addSkillEvidence, undefined);
  const [level, setLevel] = useState<SkillLevel | "">("");
  const [where, setWhere] = useState(roles[0]?.id ?? "");
  const id = useId();
  const added = !!state?.success;
  const strong = level === "work" || level === "project";
  const prompt = level === "learning" ? "e.g. Working through a C course, writing small programs" : level === "practice" ? `e.g. Wrote linked-list exercises in ${skill} for a data-structures course` : `e.g. Set up ${skill} for 40 customer accounts`;
  return (
    <li>
      <div className="flex items-center gap-3 px-4 py-2.5 text-sm">
        <span aria-hidden="true" className={`size-2 shrink-0 rounded-full ${added ? "bg-success" : "bg-danger"}`} />
        <span className="min-w-0 flex-1 truncate" title={skill}>
          {skill}
        </span>
        {added && <span className="text-xs font-medium text-success">Added{level && level !== "work" && level !== "project" ? ` · ${skillLabel(skill, level)}` : ""}</span>}
        {!open && !added && (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="rounded px-2 py-1 text-xs font-medium text-accent transition-colors duration-150 hover:bg-accent-soft focus-visible:outline-2 focus-visible:outline-accent/40 max-sm:min-h-10"
          >
            I have this
          </button>
        )}
      </div>
      <ActionToast state={state} />
      {open && !added && (
        <form action={action} className="space-y-3 px-4 pb-4 pl-9">
          <input type="hidden" name="skill" value={skill} />
          <fieldset className="space-y-1.5">
            <legend className="text-[13px] font-medium">
              How well do you know it? <span className="font-normal text-muted">Required. It goes on your CV as you choose.</span>
            </legend>
            <div className="flex flex-wrap gap-1.5">
              {SKILL_LEVELS.map((l) => (
                <label key={l.value} className={`cursor-pointer rounded-full border px-3 py-1.5 text-xs transition-colors duration-150 has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-accent/40 max-sm:min-h-10 max-sm:py-2.5 ${level === l.value ? "border-accent bg-accent-soft font-medium text-accent" : "border-border hover:bg-surface-hover"}`} title={l.hint}>
                  <input type="radio" name="level" value={l.value} required checked={level === l.value} onChange={() => setLevel(l.value)} className="sr-only" />
                  {l.label}
                </label>
              ))}
            </div>
          </fieldset>
          {level === "work" && roles.length > 0 && (
            <div className="space-y-1">
              <label htmlFor={`${id}-where`} className="text-[13px] font-medium">
                Where did you use it?
              </label>
              <select
                id={`${id}-where`}
                name="experienceId"
                value={where}
                onChange={(e) => setWhere(e.target.value)}
                className="h-9 w-full rounded border border-strong-border bg-surface px-2.5 text-sm hover:border-faint focus-visible:outline-2 focus-visible:outline-accent/30 max-sm:h-11 max-sm:text-base"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {r.label}
                  </option>
                ))}
                <option value="">Add to my projects instead</option>
              </select>
            </div>
          )}
          {level && (
            <div className="space-y-1">
              <label htmlFor={`${id}-what`} className="text-[13px] font-medium">
                What did you do with it? {!strong && <span className="font-normal text-muted">Optional</span>}
              </label>
              <input id={`${id}-what`} name="sentence" required={strong} minLength={strong ? 12 : undefined} maxLength={300} placeholder={prompt} className={inputClass} />
              {!strong && <p className="text-xs text-muted">If you write something, it goes under Projects, never under an employer.</p>}
            </div>
          )}
          <div className="flex items-center gap-2">
            <FormSubmit size="sm" loading={pending}>
              {pending ? "Adding…" : "Add to my CV"}
            </FormSubmit>
            <button type="button" onClick={() => setOpen(false)} className="rounded px-2 py-1 text-xs text-muted hover:text-foreground max-sm:min-h-10">
              Cancel
            </button>
          </div>
        </form>
      )}
    </li>
  );
}
