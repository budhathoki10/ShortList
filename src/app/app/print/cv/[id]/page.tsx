import type { Metadata } from "next";
import { headers } from "next/headers";
import { notFound, redirect } from "next/navigation";
import { CvDocument, printPageCss } from "@/components/cv/cv-document";
import { PrintButton } from "@/components/print-button";
import { ResponsivePrintPreview } from "@/components/responsive-print-preview";
import { requireUser } from "@/lib/auth/session";
import { cvFileName } from "@/lib/export/docx";
import { getTailoredCv } from "@/lib/services/documents";
import { ownedJob } from "@/lib/services/jobs";
import { photoUrl } from "@/lib/services/photos";
import { getOriginalCv, getProfile, profileReady } from "@/lib/services/profile";
import { resolveCvStyle } from "@/lib/services/templates";
import { applyChanges } from "@/lib/tailor/apply";
import { presentCv } from "@/lib/cv/presentation";

export async function generateMetadata({ params }: PageProps<"/app/print/cv/[id]">): Promise<Metadata> {
  const user = await requireUser();
  const { id } = await params;
  const [job, profile] = await Promise.all([ownedJob(user.id, id), getProfile(user.id)]);
  // Browsers suggest the page title as the PDF's file name.
  return { title: { absolute: job && profile ? cvFileName(profile, job.post.title, "pdf").replace(/\.pdf$/, "") : "CV" } };
}

export default async function PrintCv({ params, searchParams }: PageProps<"/app/print/cv/[id]">) {
  const user = await requireUser();
  const { id } = await params;
  const [job, profile, doc] = await Promise.all([ownedJob(user.id, id), getProfile(user.id), getTailoredCv(user.id, id)]);
  if (!job || !profileReady(profile)) notFound();
  const { content, layout } = await searchParams;
  if (layout !== "redesigned") {
    const original = await getOriginalCv(user.id);
    if (original?.type === "application/pdf") redirect("/app/download/original?inline=1");
    if (layout === "original") redirect("/app/profile");
  }
  const cv = presentCv(applyChanges(profile, doc?.sourceNeedsReview ? [] : doc?.cv?.changes ?? []), content === "focused" ? "focused" : "full");
  const [{ spec }, photo, nonce] = await Promise.all([resolveCvStyle(user.id, job), photoUrl(user.id), headers().then((h) => h.get("x-nonce") ?? undefined)]);
  return (
    <div className="mx-auto max-w-[60rem] space-y-4 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted"><span className="sm:hidden">Preview your finished CV, then save it as a PDF if your browser supports printing.</span><span className="max-sm:hidden">In the print window, choose &ldquo;Save as PDF&rdquo; as the destination.</span></p>
        <PrintButton auto />
      </div>
      {/* Built only from validated numbers and enums (see printPageCss). */}
      <style nonce={nonce}>{printPageCss(spec)}</style>
      <div className="rounded-md bg-sunken p-3 sm:p-5 print:bg-transparent print:p-0">
        <ResponsivePrintPreview>
          <div className="rounded-md border border-strong-border print:rounded-none print:border-0">
            <CvDocument spec={spec} cv={cv} photoUrl={photo} titleLevel={1} />
          </div>
        </ResponsivePrintPreview>
      </div>
    </div>
  );
}
