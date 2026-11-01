"use client";

import { useActionState, useEffect, useRef } from "react";
import { updateCareerPassport, type DiscoveryState } from "@/app/actions/discovery";
import type { AlertFrequency, RecommendationState } from "@/db/types";
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
  needsSponsorship: boolean;
  graduationDate: string | null;
  minimumSalary: number | null;
  employmentTypes: string[];
  excludedCompanies: string[];
  discoveryEnabled: boolean;
  emailFrequency: AlertFrequency;
  pushFrequency: AlertFrequency;
  alertStates: RecommendationState[];
  quietStart: string;
  quietEnd: string;
  timezone: string;
};

const joined = (items: string[]) => items.join(", ");

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
  // A new passport starts in the browser's own time zone, so quiet hours mean the person's night, not UTC's.
  const timezone = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (timezone.current && !timezone.current.value) timezone.current.value = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  }, []);
  return (
    <form ref={form} action={action} className="space-y-7">
      <ActionToast state={state} toastKey="career-passport" />
      <div className="grid gap-5 sm:grid-cols-2">
        <Field label="Target roles" hint="Comma-separated. Be specific enough to avoid unrelated jobs.">
          <input name="targetRoles" defaultValue={joined(value.targetRoles)} placeholder="Frontend developer, Full-stack engineer" className={inputClass} required />
        </Field>
        <Field label="Roles to exclude" hint="Optional.">
          <input name="excludedRoles" defaultValue={joined(value.excludedRoles)} placeholder="Sales engineer, Engineering manager" className={inputClass} />
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
        </div>
        <Field label="Employment types" hint="Optional.">
          <input name="employmentTypes" defaultValue={joined(value.employmentTypes)} placeholder="Full-time, Internship" className={inputClass} />
        </Field>
        <Field label="Companies to exclude" hint="Optional.">
          <input name="excludedCompanies" defaultValue={joined(value.excludedCompanies)} placeholder="Example Corp" className={inputClass} />
        </Field>
        <Field
          label="Expected graduation month"
          hint={fromCv.graduationYear ? `Your CV says you finish in ${fromCv.graduationYear}; pick the month. Used only when a posting states a graduation window.` : "Optional. Used only when a posting states a graduation window."}
        >
          <input type="month" name="graduationDate" defaultValue={value.graduationDate ?? ""} className={inputClass} />
        </Field>
        <Field label="Minimum annual salary" hint="Optional. Compared only with numeric ranges in the same currency you use for reviewing postings.">
          <input type="number" min="0" step="1000" name="minimumSalary" defaultValue={value.minimumSalary ?? ""} className={inputClass} />
        </Field>
      </div>

      <fieldset className="space-y-2">
        <legend className="t-label">Work arrangement</legend>
        <Checks name="remoteModes" selected={value.remoteModes} values={[{ value: "remote", label: "Remote" }, { value: "hybrid", label: "Hybrid" }, { value: "onsite", label: "On-site" }]} />
      </fieldset>

      <label className="flex items-start gap-3 rounded-md border border-border bg-sunken p-4 text-sm">
        <input type="checkbox" name="needsSponsorship" defaultChecked={value.needsSponsorship} className="mt-0.5 size-4 accent-accent" />
        <span><span className="block font-medium">I need employer sponsorship now or in the future</span><span className="mt-0.5 block text-[13px] text-muted">A posting that explicitly refuses sponsorship will be blocked. Ambiguous language will be marked for verification.</span></span>
      </label>

      <div className="grid gap-5 border-t border-border pt-7 sm:grid-cols-2">
        <Field label="Email alerts">
          <select name="emailFrequency" defaultValue={value.emailFrequency} className={inputClass}><option value="immediate">Immediate</option><option value="daily">Daily digest</option><option value="off">Off</option></select>
        </Field>
        <Field label="Push alerts" hint="Push also needs to be turned on for each device, in Settings.">
          <select name="pushFrequency" defaultValue={value.pushFrequency} className={inputClass}><option value="immediate">Immediate</option><option value="daily">Daily digest</option><option value="off">Off</option></select>
        </Field>
        <Field label="Quiet hours start">
          <input type="time" name="quietStart" defaultValue={value.quietStart} className={inputClass} />
        </Field>
        <Field label="Quiet hours end">
          <input type="time" name="quietEnd" defaultValue={value.quietEnd} className={inputClass} />
        </Field>
        <Field label="Time zone" hint="IANA name, such as Asia/Kathmandu.">
          <input ref={timezone} name="timezone" defaultValue={value.timezone} placeholder="Asia/Kathmandu" className={inputClass} />
        </Field>
      </div>

      <fieldset className="space-y-2">
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
