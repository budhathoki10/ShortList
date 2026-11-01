import Link from "next/link";
import type { User } from "@/db/types";
import type { TrialKind } from "@/lib/plans";
import { planUsage, trialStateFor } from "@/lib/services/usage";

const UNIT: Record<TrialKind, string> = { tailor: "tailoring runs", cover: "cover letter drafts", interview: "answer reviews", mock: "mock interviews" };
const link = "font-medium text-accent hover:underline";

/**
 * One line under an AI button saying what pressing it costs, so nobody spends their only free trial by accident:
 * it starts the trial here, how much of it is left, that it lives on another job, or that the email needs confirming.
 */
export async function TrialNote({ user, jobId, kind, suffix = "", className = "" }: { user: User; jobId: string; kind: TrialKind; suffix?: string; className?: string }) {
  const usage = await planUsage(user);
  const state = trialStateFor(usage, jobId);
  const limit = usage.limits[kind];
  const left = Math.max(0, limit - usage.used[kind]);
  const cls = `text-xs leading-relaxed text-muted ${className}`;

  if (state === "paid")
    return (
      <p className={cls}>
        {left} of {limit} {UNIT[kind]} left this month.{suffix}
      </p>
    );
  if (state === "unverified")
    return (
      <p className={cls}>
        Confirm your email to start your free trial.{" "}
        <Link href="/app/settings" className={link}>
          Resend the link
        </Link>
      </p>
    );
  if (state === "unclaimed") return <p className={cls}>This starts your free trial on this job: analysis, tailored CV, cover letter and interview practice for this one role.</p>;
  if (state === "other-job")
    return (
      <p className={cls}>
        Your free trial is on another job.{" "}
        <Link href="/app/billing" className={link}>
          Upgrade
        </Link>{" "}
        to use this on every job you apply to.
      </p>
    );
  return (
    <p className={cls}>
      {left} of {limit} free {UNIT[kind]} left for this job.{suffix}
    </p>
  );
}
