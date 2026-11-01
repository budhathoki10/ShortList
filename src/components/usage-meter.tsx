/** "1 of 3" with a thin bar. Turns red when the allowance is used up. `period` finishes the screen-reader label ("this month"). */
export function UsageMeter({ label, used, max, period }: { label: string; used: number; max: number; period: string }) {
  const pct = Math.min(100, Math.round((used / Math.max(1, max)) * 100));
  return (
    <div className="min-w-0">
      <div className="flex items-baseline justify-between gap-2 text-[13px]">
        <span className="truncate text-muted">{label}</span>
        <span className="tabular-nums">
          {used} of {max}
        </span>
      </div>
      <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-sunken" role="img" aria-label={`${used} of ${max} ${label.toLowerCase()} used ${period}`}>
        <div className={`h-full rounded-full ${pct >= 100 ? "bg-danger" : "bg-accent"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
