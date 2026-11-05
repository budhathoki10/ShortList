"use client";

import { useActionState, useRef } from "react";
import { updateCareerPassport, type DiscoveryState } from "@/app/actions/discovery";
import type { RecommendationState } from "@/db/types";
import { ActionToast } from "@/components/toast";
import { Field, inputClass } from "@/components/ui";
import type { PassportFromCv } from "@/lib/discovery/passport-from-cv";
import { SubmitButton } from "@/components/submit-button";

export type PassportFormValue = {
  targetRoles: string[];
  excludedRoles: string[];
  locations: string[];
  workCountries: string[];
  remoteModes: string[];
  employmentTypes: string[];
  discoveryEnabled: boolean;
  alertStates: RecommendationState[];
  quietStart: string;
  quietEnd: string;
  timezone: string;
};

const INTERNATIONAL_REGIONS = ["USA", "UK", "Europe", "Canada", "Australia", "UAE", "APAC"];

const joined =(items: string[]) => items.join(", ");

function Checks({ name, values, selected }: { name: string; values: Array<{ value: string; label: string }>; selected: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-5 gap-y-2">
      {values.map((item) => (
        <label key={item.value} className="inline-flex min-h-9 items-center gap-2 text-sm max-sm:min-h-11">
          <input type="checkbox" name={name} value={item.value} defaultChecked={selected.includes(item.value)} className="size-4 accent-accent" />
          {item.label}
        </label>
      ))}
    </div>
  );
}

/** Merge comma lists, keeping the first spelling of each entry. */
function merge(current: string, extra: string[]) {
  const items = current.split(",").map((item) => item.trim()).filter(Boolean);
  for (const item of extra) if (!items.some((existing) => existing.toLowerCase() === item.toLowerCase())) items.push(item);
  return items.join(", ");
}

export function CareerPassportForm({ value, fromCv }: { value: PassportFormValue; fromCv: PassportFromCv }) {
  const [state, action] = useActionState<DiscoveryState, FormData>(updateCareerPassport, undefined);
  const form = useRef<HTMLFormElement>(null);
  const field = (name: string) => form.current?.elements.namedItem(name) as HTMLInputElement | null;

  function addCountry() {
    const countries = field("workCountries");
    if (countries && fromCv.country) countries.value = merge(countries.value, [fromCv.country]);
  }
  function addRegion(region: string) {
    const countries = field("workCountries");
    if (countries) countries.value = merge(countries.value, [region]);
  }
  return (
    <form ref={form} action={action} className="space-y-7">
      <ActionToast state={state} toastKey="career-passport" />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Target roles" hint="Comma-separated. Be specific enough to avoid unrelated jobs.">
          <input name="targetRoles" defaultValue={joined(value.targetRoles)} placeholder="Frontend developer, Full-stack engineer" className={inputClass} required />
        </Field>
        <Field label="Target locations" hint="Cities, regions, or countries. Leave blank if location is flexible.">
          <input name="locations" defaultValue={joined(value.locations)} placeholder="Kathmandu, United Kingdom, Remote" className={inputClass} />
        </Field>
        <div className="space-y-1.5">
          <Field label="Countries where you can work" hint="Only countries where you're allowed to work. Shortlist Job Radar won't assume this from your CV.">
            <input name="workCountries" defaultValue={joined(value.workCountries)} placeholder="Nepal" className={inputClass} />
          </Field>
          {fromCv.country && (
            <button type="button" onClick={addCountry} className="text-left text-[13px] font-medium text-accent hover:underline max-sm:min-h-11">
              Add {fromCv.country}, where your CV says you live
            </button>
          )}
          <div className="flex flex-wrap items-center gap-1.5 pt-1" role="group" aria-label="Add regions you apply to abroad">
            <span className="text-[13px] text-muted">Applying abroad too?</span>
            {INTERNATIONAL_REGIONS.map((region) => (
              <button key={region} type="button" onClick={() => addRegion(region)} className="inline-flex min-h-8 items-center rounded-md border border-border bg-surface px-2.5 text-[13px] font-medium text-foreground transition-colors hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent max-sm:min-h-11">
                + {region}
              </button>
            ))}
          </div>
          <p className="text-[13px] text-muted">Remote roles limited to a region you haven't listed show as "Verify first".</p>
        </div>
        <Field label="Employment types" hint="Optional.">
          <input name="employmentTypes" defaultValue={joined(value.employmentTypes)} placeholder="Full-time, Internship" className={inputClass} />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="t-label">Work arrangement</legend>
        <Checks name="remoteModes" selected={value.remoteModes} values={[{ value: "remote", label: "Remote" }, { value: "hybrid", label: "Hybrid" }, { value: "onsite", label: "On-site" }]} />
      </fieldset>

      <fieldset className="space-y-2 border-t border-border pt-7">
        <legend className="t-label">Which matches can alert you</legend>
        <Checks name="alertStates" selected={value.alertStates} values={[{ value: "ready", label: "Ready to apply" }, { value: "stretch", label: "Strong stretch" }, { value: "verify", label: "Verify first" }]} />
      </fieldset>

      <div className="flex flex-wrap items-center justify-between gap-4 border-t border-border pt-6">
        <label className="inline-flex min-h-10 items-center gap-2 text-sm font-medium">
          <input type="checkbox" name="discoveryEnabled" defaultChecked={value.discoveryEnabled} className="size-4 accent-accent" />
          Keep the discovery agent running
        </label>
        <SubmitButton pendingLabel="Saving…">Save Career Passport</SubmitButton>
      </div>
    </form>
  );
}
