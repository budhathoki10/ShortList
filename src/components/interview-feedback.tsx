type Review = {
  method?: "ai" | "checklist"; score: number | null; practiceScore?: number; scoreMethod?: "ai" | "estimate"; strengths: string[]; improvements: string[];
  corrections: string[]; modelAnswer: string; improvedAnswer: string;
  rubric: { label: string; score: number | null; note: string }[];
  sources?: { title: string; url: string }[];
};

/** Lead with a useful next action; keep the detailed grading available without overwhelming practice. */
export function InterviewFeedback({ review }: { review: Review }) {
  const scored = review.method === "ai" && typeof review.score === "number";
  const first = review.corrections[0] || review.improvements[0];
  const example = review.improvedAnswer || review.modelAnswer;
  return <div aria-label="Answer feedback" aria-live="polite" className="space-y-5 rounded-lg border border-border bg-surface p-5 sm:p-6">
    <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-semibold">{review.corrections.length ? "There’s a point to correct" : scored && review.score! >= 4 ? "A strong answer — refine the detail" : "Build your next answer"}</h3><span className="text-xs font-medium text-muted">{typeof review.practiceScore === "number" ? <><span className="tabular-nums text-foreground">{review.practiceScore}/100</span> · Practice score ({review.scoreMethod === "ai" ? "AI review" : "estimate"})</> : scored ? `${review.score}/5 · AI coaching estimate` : "Guided practice · unscored"}</span></div>
    {!scored && <p className="text-xs leading-relaxed text-muted">AI review is unavailable. These are reference explanations and practice prompts; your overall correctness has not been assessed.{typeof review.practiceScore === "number" && " The Practice score is a rough estimate from how fully you covered the key points, how clearly you structured the answer and how concrete it was. It cannot judge whether the content is correct."}</p>}
    {first && <div className="border-l-2 border-accent pl-4"><h4 className="text-sm font-medium">Fix this first</h4><p className="mt-1 text-sm leading-relaxed">{first}</p></div>}
    {example && <div><h4 className="text-sm font-medium">An example to learn from</h4><p className="mt-1 text-xs text-muted">Fill any [brackets] with your own facts, then practise in your own words.</p><p className="mt-3 whitespace-pre-wrap text-sm leading-relaxed">{example}</p></div>}
    {!!review.sources?.length && <p className="text-xs text-muted">Check the explanation: {review.sources.map((source, i) => <span key={source.url}>{i > 0 && " · "}<a href={source.url} target="_blank" rel="noreferrer" className="text-accent underline underline-offset-4">{source.title}</a></span>)}</p>}
    <details className="border-t border-border pt-3"><summary className="cursor-pointer py-1 text-sm font-medium">Detailed review</summary><div className="mt-4 space-y-4">
      {([["Working", review.strengths], ["Next improvements", [...review.corrections.slice(1), ...review.improvements.filter((s) => s !== first)]]] as const).map(([title, items]) => items.length > 0 && <div key={title}><h4 className="text-sm font-medium">{title}</h4><ul className="mt-1 list-disc space-y-1 pl-5 text-sm text-muted">{items.map((item, i) => <li key={i}>{item}</li>)}</ul></div>)}
      {review.modelAnswer && review.modelAnswer !== example && <div><h4 className="text-sm font-medium">What the answer should explain</h4><p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-muted">{review.modelAnswer}</p></div>}
      <dl className="space-y-3">{review.rubric.map((r) => <div key={r.label}><dt className="flex justify-between gap-3 text-sm font-medium capitalize">{r.label}<span className="text-muted">{scored && r.score !== null ? `${r.score}/5` : "Unassessed"}</span></dt><dd className="mt-1 text-xs leading-relaxed text-muted">{r.note}</dd></div>)}</dl>
      <p className="text-xs text-muted">Scores are coaching estimates. Written clarity does not establish vocal confidence. Code has not been executed.</p>
    </div></details>
  </div>;
}
