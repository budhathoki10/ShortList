"use client";

import { ActionToast } from "@/components/toast";
import { useActionState, useEffect, useState } from "react";
import { saveCover, writeCover } from "@/app/actions/tailor";
import { CopyButton } from "./copy-button";
import { inputClass, Kbd, Notice } from "./ui";
import { FormSubmit } from "./form-submit";
import { keepInputOnSubmit } from "./use-keep-input";
import { emailComposeUrls } from "@/lib/email-compose";
import { buttonClass } from "./ui";

export function CoverLetterEditor({ jobId, initial, flags, email, role, recipient = "" }: { jobId: string; initial: string; flags: string[]; email: string; role: string; recipient?: string }) {
  const [saved, save, saving] = useActionState(saveCover, undefined);
  const [drafted, draft, drafting] = useActionState(writeCover, undefined);
  const [text, setText] = useState(initial);
  const [baseline, setBaseline] = useState(initial);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  const dirty = text !== baseline;
  const [to, setTo] = useState(recipient);
  const [subject, setSubject] = useState(`Application for ${role}`);
  const canCompose = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to) && !!text.trim();
  const compose = emailComposeUrls({ from: email, to: to.trim(), subject, body: text });

  // What the server last confirmed becomes the new baseline. (Adjusting state while rendering, keyed on the server's answer.)
  const [seen, setSeen] = useState(saved);
  if (saved !== seen) {
    setSeen(saved);
    if (saved?.success) setBaseline(text);
  }

  // Leaving with unsaved edits asks first.
  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  return (
    <div className="grid items-start gap-6 xl:grid-cols-[minmax(0,1fr)_19rem]">
      <div className="min-w-0 space-y-4">
      <div><p className="t-label text-accent">Your application letter</p><h2 className="t-title mt-1">Make a strong introduction</h2><p className="mt-2 text-sm text-muted">Review the draft, add your voice, then open it in your inbox.</p></div>
      <form method="post" onSubmit={keepInputOnSubmit(save)} className="space-y-3 rounded-xl border border-border bg-surface p-4 sm:p-6">
        <input type="hidden" name="jobId" value={jobId} />
        <textarea
          name="text"
          aria-label="Cover letter"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && (e.key === "Enter" || e.key.toLowerCase() === "s")) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
          rows={Math.max(16, Math.min(24, text.split("\n").length + 2))}
          className={`${inputClass} border-transparent px-1 font-serif text-[16px] leading-7 hover:border-border`}
        />
        <div className="flex flex-wrap items-center gap-3">
          <FormSubmit variant="secondary" loading={saving}>
            {saving ? "Saving…" : "Save"}
          </FormSubmit>
          <CopyButton text={text} label="Copy text" what="Letter copied" />
          {/* The PDF is made from the saved letter, so unsaved edits have to be saved first. */}
          <a
            href={dirty ? undefined : `/app/print/letter/${jobId}`}
            target="_blank"
            rel="noopener"
            aria-disabled={dirty}
            title={dirty ? "Save your edits first" : "In the same look as your CV"}
            className={buttonClass("ghost", "md", dirty ? "pointer-events-none opacity-50" : "")}
          >
            Download PDF
          </a>
          <span className="hidden items-center gap-1 text-xs text-muted sm:flex">
            <Kbd>⌘</Kbd>
            <Kbd>S</Kbd> to save
          </span>
          <span className="ml-auto text-xs tabular-nums text-muted">
            {dirty && <span className="mr-3 text-warning">Unsaved changes</span>}
            <span className={words > 300 ? "text-danger" : ""}>
              {words} words{words > 300 ? ": aim for under 300" : ""}
            </span>
          </span>
        </div>
        <ActionToast state={saved} />
      </form>
      {flags.length > 0 && (
        <Notice tone="warning" title="Review these details before sending">These details could not be verified against your CV or the job description: <strong>{flags.join(", ")}</strong>. Keep them only if they are accurate.</Notice>
      )}
      <form action={draft} className="space-y-2 border-t border-border pt-4">
        <input type="hidden" name="jobId" value={jobId} />
        <FormSubmit variant="ghost" loading={drafting}>
          {drafting ? "Writing…" : "Write a new draft"}
        </FormSubmit>
        <p className="text-xs text-muted">Replaces this letter, including your edits.</p>
        <ActionToast state={drafted} only="error" />
      </form>
      </div>
      <aside aria-label="Email your application" className="space-y-4 rounded-xl border border-border bg-surface p-5 xl:sticky xl:top-6">
        <div><h2 className="text-base font-semibold">Email your application</h2><p className="mt-1 text-xs leading-relaxed text-muted">Open a draft in your mailbox and review it before sending.</p></div>
        <label className="block space-y-1.5"><span className="t-label">Your email</span><input value={email} readOnly className={`${inputClass} text-muted`} /></label>
        <label className="block space-y-1.5"><span className="t-label">Company email</span><input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="hiring@company.com" className={inputClass} /></label>
        <label className="block space-y-1.5"><span className="t-label">Subject</span><input value={subject} onChange={(e) => setSubject(e.target.value)} className={inputClass} /></label>
        <a href={canCompose ? compose.gmail : undefined} target="_blank" rel="noreferrer" aria-disabled={!canCompose} className={buttonClass("primary", "md", "w-full")}>Open in Gmail ↗</a>
        <a href={canCompose ? compose.mailto : undefined} aria-disabled={!canCompose} className={buttonClass("secondary", "md", "w-full")}>Open in my mail app</a>
        <p className="text-xs leading-relaxed text-muted">Your current letter edits are included. Check the From account in your mail app; Shortlist has no permission to send from your personal inbox.</p>
        <div className="border-t border-border pt-4"><a href={`/app/download/cv/${jobId}?format=pdf`} className="inline-flex min-h-10 items-center text-sm font-medium text-accent hover:underline max-sm:min-h-11">Download CV to attach</a><p className="mt-1 text-xs text-muted">Attach the downloaded file in your email draft.</p></div>
      </aside>
    </div>
  );
}
