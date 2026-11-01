import Link from "next/link";
import type { PracticeReport } from "@/lib/career/types";

const METHOD: Record<PracticeReport["method"], string> = { ai: "From AI review of your answers", estimate: "An estimate from answer length, structure, concrete detail and the key points covered. It can’t judge correctness", mixed: "Part AI review, part estimate" };

/** One number, a small bar per area, and what to improve. Not a hiring prediction. */
export function PracticeScore({ report, jobId, sessionId }: { report: PracticeReport; jobId: string; sessionId: string }) {
  if (report.score === null) return <p className="text-sm text-muted">No answers were scored in this session.</p>;
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
        <div>
          <p id="practice-score-label" className="text-sm text-muted">Practice score</p>
          <p className="mt-1 flex items-baseline gap-1" aria-labelledby="practice-score-label"><span className="text-5xl font-semibold tabular-nums tracking-tight">{report.score}</span><span className="text-lg text-muted">/100</span></p>
        </div>
        <p className="max-w-xs text-xs leading-relaxed text-muted">{METHOD[report.method]}. A guide for practising, not a prediction of any hiring decision.</p>
      </div>
      <ul aria-label="Practice score by area" className="grid gap-x-8 gap-y-3 sm:grid-cols-2">
        {report.areas.map((a) => (
          <li key={a.key}>
            <div className="flex justify-between text-sm"><span>{a.label}</span><span className="tabular-nums text-muted">{a.score}</span></div>
            <div role="meter" aria-label={a.label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={a.score} className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-sunken"><div className="h-full rounded-full bg-accent" style={{ width: `${a.score}%` }} /></div>
          </li>
        ))}
      </ul>
      {report.improve.length > 0 && (
        <div>
          <h3 className="text-sm font-semibold">Most worth improving</h3>
          <ol className="mt-2 space-y-2.5">
            {report.improve.map((item) => (
              <li key={item.turnId} className="text-sm">
                <Link href={`/app/jobs/${jobId}/interview/mock/${sessionId}#turn-${item.turnId}`} className="font-medium text-accent underline underline-offset-4">{item.question}</Link>
                <p className="mt-0.5 text-xs leading-relaxed text-muted">{item.area} · {item.score}/100 · {item.note}</p>
              </li>
            ))}
          </ol>
        </div>
      )}
    </div>
  );
}
