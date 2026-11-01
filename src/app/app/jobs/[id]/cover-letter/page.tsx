import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { writeCover } from "@/app/actions/tailor";
import { AiActionButton } from "@/components/ai-action-button";
import { CoverLetterEditor } from "@/components/cover-letter-editor";
import { TrialNote } from "@/components/trial-note";
import { ButtonLink, EmptyState } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { getCoverLetter } from "@/lib/services/documents";
import { ownedJob } from "@/lib/services/jobs";
import { getProfile, profileReady } from "@/lib/services/profile";
import { unsupportedFacts } from "@/lib/tailor/fact-check";
import { jobHasCriteria } from "@/lib/jobs/quality";

export const metadata: Metadata = { title: "Cover letter" };

export default async function CoverTab({ params }: PageProps<"/app/jobs/[id]/cover-letter">) {
  const user = await requireUser();
  const { id } = await params;
  const [job, profile, doc] = await Promise.all([ownedJob(user.id, id), getProfile(user.id), getCoverLetter(user.id, id)]);
  if (!job) notFound();
  if (!jobHasCriteria(job.post)) return <EmptyState title="Read the full vacancy before writing" action={<ButtonLink href={`/app/jobs/${job.id}#job-description`}>Add job description</ButtonLink>}>Give the letter a real role to respond to. Paste this vacancy’s responsibilities and requirements first.</EmptyState>;
  if (!profileReady(profile)) {
    return (
      <EmptyState title="Add your CV first" action={<ButtonLink href="/app/profile">Add your CV</ButtonLink>}>
        The letter is written from what’s in it.
      </EmptyState>
    );
  }
  if (!doc?.text) {
    return (
      <div className="max-w-2xl space-y-4 rounded-md border border-border bg-surface p-5 sm:p-6">
        <h2 className="t-title">A cover letter for this job</h2>
        <p className="text-sm text-muted">
          Short, specific and in plain words: why this job, and two or three things you’ve actually done that it needs. Nothing invented. Edit it until it sounds like you.
        </p>
        <AiActionButton action={writeCover} jobId={job.id} label="Write a draft" pendingLabel="Writing…" />
        <TrialNote user={user} jobId={job.id} kind="cover" />
      </div>
    );
  }
  return (
    <div className="space-y-4">
      {doc.generationMethod === "basic" && <p className="rounded-lg border border-warning/25 bg-warning-soft px-4 py-3 text-sm text-warning">AI drafting was unavailable. This is a local draft built from your CV; review the examples and wording before sending.</p>}
      <CoverLetterEditor key={doc.id} jobId={job.id} initial={doc.text} flags={unsupportedFacts(doc.text, profile, JSON.stringify(job.post))} email={user.email} role={job.post.title} recipient={job.postText.match(/[\w.+-]+@[\w-]+\.[\w.-]+/)?.[0] ?? ""} />
    </div>
  );
}
