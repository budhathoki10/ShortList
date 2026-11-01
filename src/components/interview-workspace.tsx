"use client";

import { useEffect, useState } from "react";
import type { InterviewQuestion } from "@/lib/model/types";
import type { answerGuide } from "@/lib/tailor/interview";
import { PracticeAnswer } from "./practice-answer";
import { Button } from "./ui";

type Question = InterviewQuestion & { guide: ReturnType<typeof answerGuide> };

export function InterviewWorkspace({ jobId, questions }: { jobId: string; questions: Question[] }) {
  const [index, setIndex] = useState(0);
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const unsaved = questions.some((q) => drafts[q.id] !== undefined && drafts[q.id] !== q.answer);
  useEffect(() => {
    if (!unsaved) return;
    const warn = (event: BeforeUnloadEvent) => event.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [unsaved]);
  const current = questions[index] ?? questions[0];
  const done = questions.filter((q) => q.feedback).length;
  const scores = questions.flatMap((q) => (typeof q.feedback?.practiceScore === "number" ? [q.feedback.practiceScore] : []));
  const running = scores.length ? Math.round(scores.reduce((n, x) => n + x, 0) / scores.length) : null;
  const allAi = scores.length > 0 && questions.filter((q) => typeof q.feedback?.practiceScore === "number").every((q) => q.feedback?.scoreMethod === "ai");
  if (!current) return null;
  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><p className="t-label text-accent">Practice room</p><h2 className="t-title mt-1">One question. A better answer.</h2><p className="mt-1 text-sm text-muted">Practised {done} of {questions.length}. Build an example, get feedback, then try it out loud.</p></div>
        <div className="flex flex-wrap items-center gap-2">
          {running !== null && <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs text-muted" title="Average of your answered questions. A practice guide, not a hiring prediction."><span className="font-medium tabular-nums text-foreground">Practice score {running}/100</span> · {scores.length} answered{allAi ? "" : " · estimate"}</span>}
          <span className="rounded-full border border-border bg-surface px-3 py-1 text-xs tabular-nums text-muted">Question {index + 1} of {questions.length}</span>
        </div>
      </div>
      <div className="grid items-start gap-5 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Interview questions" className="flex gap-2 overflow-x-auto lg:sticky lg:top-6 lg:max-h-[calc(100dvh-3rem)] lg:flex-col lg:overflow-y-auto">
          {questions.map((q, i) => <button key={q.id} type="button" onClick={() => setIndex(i)} aria-current={index === i ? "step" : undefined} className={`flex min-w-44 items-start gap-3 rounded-lg border p-3 text-left text-sm lg:min-w-0 ${index === i ? "border-accent/30 bg-accent-soft" : "border-border bg-surface hover:bg-surface-hover"}`}>
            <span className={`grid size-6 shrink-0 place-items-center rounded-full text-xs font-medium ${q.feedback ? "bg-success-soft text-success" : "bg-sunken text-muted"}`}>{q.feedback ? "✓" : i + 1}</span>
            <span className="min-w-0"><span className="block text-[11px] font-medium text-muted">{q.guide.category}</span><span className="mt-0.5 line-clamp-2 text-[13px]">{q.question}</span></span>
          </button>)}
        </nav>
        <section aria-label="Current interview question" className="min-w-0 space-y-6 rounded-xl border border-border bg-surface p-5 sm:p-7">
          <div><p className="t-label text-accent">{current.guide.category}</p><h3 className="mt-2 text-xl font-semibold leading-snug tracking-tight">{current.question}</h3><p className="mt-3 text-sm leading-relaxed text-muted">{current.why}</p></div>
          <details className="rounded-lg border border-border bg-background" open>
            <summary className="cursor-pointer px-4 py-3 text-sm font-medium">How to approach this answer</summary>
            <div className="space-y-4 border-t border-border px-4 py-4">
              <ol className="list-decimal space-y-2 pl-5 text-[13px] leading-relaxed text-muted">{current.guide.steps.map((s) => <li key={s}>{s}</li>)}</ol>
              {current.guide.evidence.length > 0 && <div className="border-t border-border pt-3"><p className="text-xs font-medium">Evidence you can draw on · {current.guide.source}</p><ul className="mt-2 list-disc space-y-2 pl-4 text-xs leading-relaxed text-muted">{current.guide.evidence.map((s, i) => <li key={i}>{s}</li>)}</ul><p className="mt-3 text-xs text-muted">Choose the evidence that answers this question. Add the missing context and actual outcome yourself.</p></div>}
            </div>
          </details>
          <details className="border-b border-border pb-4"><summary className="cursor-pointer text-sm font-medium">Show an example explanation</summary><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed text-muted">{current.guide.reference?.answer ?? current.guide.starter}</p>{current.guide.reference && <a href={current.guide.reference.source.url} target="_blank" rel="noreferrer" className="mt-2 inline-block text-xs text-accent underline underline-offset-4">{current.guide.reference.source.title}</a>}<p className="mt-2 text-xs text-muted">Use this to understand the answer. Replace personal placeholders with your own facts.</p></details>
          <div><h4 className="mb-2 text-sm font-medium">Your answer</h4><PracticeAnswer key={current.id} jobId={jobId} questionId={current.id} answer={current.answer} feedback={current.feedback} draft={drafts[current.id]} onDraftChange={(value) => setDrafts((previous) => ({ ...previous, [current.id]: value }))} /></div>
          <div className="flex items-center justify-between border-t border-border pt-4"><Button type="button" variant="ghost" onClick={() => setIndex(index - 1)} disabled={index === 0}>← Previous</Button><Button type="button" variant="secondary" onClick={() => setIndex(index + 1)} disabled={index >= questions.length - 1}>Next question →</Button></div>
        </section>
      </div>
    </div>
  );
}
