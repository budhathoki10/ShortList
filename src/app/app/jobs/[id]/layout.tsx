import Link from "next/link";
import { notFound } from "next/navigation";
import { JobTabs } from "@/components/job-tabs";
import { StatusControl } from "@/components/status-control";
import { requireUser } from "@/lib/auth/session";
import { listMockSessions } from "@/lib/services/career";
import { getCoverLetter, getInterview, getTailoredCv } from "@/lib/services/documents";
import { isStatus, ownedJob } from "@/lib/services/jobs";

export default async function JobLayout({ children, params }: LayoutProps<"/app/jobs/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const [job, cv, letter, interview, mocks] = await Promise.all([
    ownedJob(user.id, id),
    getTailoredCv(user.id, id),
    getCoverLetter(user.id, id),
    getInterview(user.id, id),
    listMockSessions(user.id, id),
  ]);
  if (!job) notFound();
  // A step counts as done once there's something real to show for it.
  const done = {
    cv: !!cv?.cv,
    letter: !!letter?.text?.trim(),
    interview: !!interview?.questions.some((q) => q.answer) || mocks.some((m) => m.status === "complete"),
  };
  const facts = [job.post.company, job.post.location, job.post.salary].filter(Boolean);
  return (
    <div className="space-y-6">
      <div className="print:hidden">
        <Link href="/app/jobs" className="inline-flex items-center gap-1 rounded text-[13px] text-muted transition-colors duration-150 hover:text-foreground max-sm:min-h-11">
          <span aria-hidden="true">←</span> Jobs
        </Link>
        <div className="mt-2 flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="min-w-0">
            <h1 className="t-heading text-balance">{job.post.title || "Untitled job"}</h1>
            {facts.length > 0 && <p className="mt-1 text-sm text-muted">{facts.join(" · ")}</p>}
          </div>
          <StatusControl jobId={job.id} status={isStatus(job.status) ? job.status : "saved"} />
        </div>
      </div>
      <JobTabs jobId={job.id} done={done} />
      {children}
    </div>
  );
}
