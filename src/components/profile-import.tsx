"use client";

import { ActionToast } from "@/components/toast";
import { useActionState, useState } from "react";
import { importCv } from "@/app/actions/profile";
import { inputClass } from "./ui";
import { FormSubmit } from "./form-submit";
import { keepInputOnSubmit } from "./use-keep-input";

export function ProfileImport({ replacing }: { replacing: boolean }) {
  const [state, action, pending] = useActionState(importCv, undefined);
  const [mode, setMode] = useState<"file" | "text">("file");
  return (
    <form method="post" onSubmit={keepInputOnSubmit(action)} className="space-y-4">
      <div role="tablist" aria-label="How to add your CV" className="flex gap-1 border-b border-border text-sm">
        {(["file", "text"] as const).map((m) => (
          <button
            key={m}
            type="button"
            role="tab"
            aria-selected={mode === m}
            onClick={() => setMode(m)}
            className={`-mb-px inline-flex h-10 items-center border-b-2 px-3 transition-colors duration-150 ${mode === m ? "border-accent font-medium text-foreground" : "border-transparent text-muted hover:text-foreground"}`}
          >
            {m === "file" ? "Upload a file" : "Paste the text"}
          </button>
        ))}
      </div>
      {mode === "file" ? (
        <div className="space-y-3 rounded-lg border border-dashed border-strong-border bg-background px-5 py-6">
          <label htmlFor="cv-file" className="t-label block">
            Your CV
          </label>
          <input
            id="cv-file"
            name="file"
            type="file"
            accept=".pdf,.docx,.txt,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document,text/plain"
            className="block w-full cursor-pointer text-sm text-muted file:mr-3 file:h-9 file:cursor-pointer max-sm:file:h-11 file:rounded file:border file:border-strong-border file:bg-surface file:px-3.5 file:text-sm file:font-medium file:text-foreground file:transition-colors file:duration-150 hover:file:bg-surface-hover"
          />
          <p className="text-xs text-muted">PDF, Word (.docx) or text, up to 5 MB. Embedded LinkedIn, GitHub and project links are included.</p>
        </div>
      ) : (
        <div className="space-y-1.5">
          <label htmlFor="cv-text" className="t-label block">
            CV text
          </label>
          <textarea id="cv-text" name="text" rows={10} className={inputClass} placeholder="Paste everything: name, contact details, jobs, education, skills." />
        </div>
      )}
      <ActionToast state={state} />
      <FormSubmit loading={pending}>
        {pending ? "Reading your CV…" : replacing ? "Replace my profile" : "Read my CV"}
      </FormSubmit>
      <p className="text-xs text-muted">Your profile is filled in from it. You can edit anything afterwards.</p>
    </form>
  );
}
