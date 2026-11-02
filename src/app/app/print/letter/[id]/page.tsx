import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { printPageCss } from "@/components/cv/cv-document";
import { LetterDocument } from "@/components/cv/letter-document";
import { PrintButton } from "@/components/print-button";
import { ResponsivePrintPreview } from "@/components/responsive-print-preview";
import { requireUser } from "@/lib/auth/session";
import { presentCv } from "@/lib/cv/presentation";
import { cvFileName } from "@/lib/export/docx";
import { getCoverLetter } from "@/lib/services/documents";
import { ownedJob } from "@/lib/services/jobs";
import { photoUrl } from "@/lib/services/photos";
import { getProfile, profileReady } from "@/lib/services/profile";
import { resolveCvStyle } from "@/lib/services/templates";

export async function generateMetadata({ params }: PageProps<"/app/print/letter/[id]">): Promise<Metadata> {
  const user = await requireUser();
  const { id } = await params;
  const [job, profile] = await Promise.all([ownedJob(user.id, id), getProfile(user.id)]);
  // Browsers suggest the page title as the PDF's file name: "asha-gurung-cover-letter-support-lead".
  const name = job && profile ? cvFileName(profile, job.post.title, "pdf").replace(/\.pdf$/, "").replace(/-cv(-|$)/, "-cover-letter$1") : "cover-letter";
  return { title: { absolute: name } };
}

/** The saved cover letter in the same look as the CV for this job, ready to save as a PDF. */
export default async function PrintLetter({ params }: PageProps<"/app/print/letter/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const [job, profile, doc] = await Promise.all([ownedJob(user.id, id), getProfile(user.id), getCoverLetter(user.id, id)]);
  if (!job) notFound();
  if (!profileReady(profile) || !doc?.text?.trim()) redirect(`/app/jobs/${id}/cover-letter`);
  const [{ spec }, photo, nonce] = await Promise.all([resolveCvStyle(user.id, job), photoUrl(user.id), headers().then((h) => h.get("x-nonce") ?? undefined)]);
  return (
    <div className="mx-auto max-w-[60rem] space-y-4 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted"><span className="sm:hidden">Preview your letter, then save it as a PDF if your browser supports printing.</span><span className="max-sm:hidden">In the print window, choose &ldquo;Save as PDF&rdquo;.</span></p>
        <PrintButton auto />
      </div>
      {/* Built only from validated numbers and enums (see printPageCss). */}
      <style nonce={nonce}>{printPageCss(spec)}</style>
      <div className="rounded-md bg-sunken p-3 sm:p-5 print:bg-transparent print:p-0">
        <ResponsivePrintPreview>
          <div className="rounded-md border border-strong-border print:rounded-none print:border-0">
            <LetterDocument spec={spec} cv={presentCv(profile, "full")} text={doc.text} photoUrl={photo} />
          </div>
        </ResponsivePrintPreview>
      </div>
    </div>
  );
}
