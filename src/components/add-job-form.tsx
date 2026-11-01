"use client";

import { ActionToast } from "@/components/toast";
import { useActionState, useEffect, useRef, useState } from "react";
import { addJob } from "@/app/actions/jobs";
import { inputClass, Kbd } from "./ui";
import { FormSubmit } from "./form-submit";
import { keepInputOnSubmit } from "./use-keep-input";

export function AddJobForm() {
  const [state, action, pending] = useActionState(addJob, undefined);
  const [paste, setPaste] = useState(false);
  const urlRef = useRef<HTMLInputElement>(null);
  const showText = paste || state?.needText;

  // The one thing to do on this page: start typing. Not on touch screens, where it would raise the keyboard on arrival.
  useEffect(() => {
    if (window.matchMedia("(pointer: fine)").matches) urlRef.current?.focus();
  }, []);

  return (
    <form method="post" onSubmit={keepInputOnSubmit(action)} className="space-y-3">
      <label htmlFor="job-url" className="sr-only">
        Link to the job post
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input
          ref={urlRef}
          id="job-url"
          name="url"
          type="text"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          defaultValue={state?.url}
          placeholder="Paste a link to a job post"
          className={inputClass}
        />
        {!showText && (
          <FormSubmit loading={pending} className="shrink-0">
            {pending ? "Reading the post…" : "Add job"}
          </FormSubmit>
        )}
      </div>
      {!showText ? (
        <button type="button" onClick={() => setPaste(true)} className="rounded text-[13px] text-muted transition-colors duration-150 hover:text-foreground hover:underline max-sm:min-h-11">
          Or paste the job description
        </button>
      ) : (
        <div className="space-y-2">
          <label htmlFor="job-text" className="t-label block">
            Job description
          </label>
          <textarea
            id="job-text"
            name="text"
            rows={10}
            autoFocus={!!state?.needText}
            onKeyDown={(e) => {
              if ((e.metaKey || e.ctrlKey) && e.key === "Enter") e.currentTarget.form?.requestSubmit();
            }}
            className={inputClass}
            placeholder="Paste the whole post: title, company, what you'd do, and what they're looking for."
          />
          <div className="flex items-center gap-3">
            <FormSubmit loading={pending}>
              {pending ? "Reading the post…" : "Add job"}
            </FormSubmit>
            <span className="hidden items-center gap-1 text-xs text-muted sm:flex">
              <Kbd>⌘</Kbd>
              <Kbd>Enter</Kbd> to add
            </span>
          </div>
        </div>
      )}
      <ActionToast state={state} only="error" />
    </form>
  );
}
