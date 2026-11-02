import type { Metadata } from "next";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { CvDocument, printPageCss } from "@/components/cv/cv-document";
import { PrintButton } from "@/components/print-button";
import { ResponsivePrintPreview } from "@/components/responsive-print-preview";
import { requireUser } from "@/lib/auth/session";
import { presentCv } from "@/lib/cv/presentation";
import { cvFileName } from "@/lib/export/docx";
import { photoUrl } from "@/lib/services/photos";
import { getProfile, profileReady } from "@/lib/services/profile";
import { getTemplate, resolveCvStyle } from "@/lib/services/templates";
import { parseSpec } from "@/lib/templates/spec";

export async function generateMetadata(): Promise<Metadata> {
  const user = await requireUser();
  const profile = await getProfile(user.id);
  // Browsers suggest the page title as the PDF's file name.
  return { title: { absolute: profile ? cvFileName(profile, "", "pdf").replace(/\.pdf$/, "") : "CV" } };
}

/** The design in the editor, sent along unsaved. Anything that isn't a valid template spec is ignored. */
function specFromQuery(raw: string | string[] | undefined) {
  if (typeof raw !== "string" || raw.length > 6000) return null;
  try {
    return parseSpec(JSON.parse(Buffer.from(raw, "base64url").toString("utf8")));
  } catch {
    return null;
  }
}

/**
 * Your CV (not a job's tailored version) in any look, ready to save as a PDF from the print dialog:
 * the design open in the editor (`spec`), a template (`template`), or your default.
 */
export default async function PrintProfile({ searchParams }: PageProps<"/app/print/profile">) {
  const user = await requireUser();
  const [query, profile] = await Promise.all([searchParams, getProfile(user.id)]);
  if (!profileReady(profile)) redirect("/app/profile?needed=1");
  const fromEditor = specFromQuery(query.spec);
  const chosen = typeof query.template === "string" ? await getTemplate(user.id, query.template) : null;
  const spec = fromEditor ?? chosen?.spec ?? (await resolveCvStyle(user.id)).spec;
  const [photo, nonce] = await Promise.all([photoUrl(user.id), headers().then((h) => h.get("x-nonce") ?? undefined)]);
  return (
    <div className="mx-auto max-w-[60rem] space-y-4 print:max-w-none">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <p className="text-sm text-muted"><span className="sm:hidden">Preview your CV, then save it as a PDF if your browser supports printing.</span><span className="max-sm:hidden">In the print window, choose &ldquo;Save as PDF&rdquo;.</span></p>
        <PrintButton auto />
      </div>
      {/* Built only from validated numbers and enums (see printPageCss). */}
      <style nonce={nonce}>{printPageCss(spec)}</style>
      <div className="rounded-md bg-sunken p-3 sm:p-5 print:bg-transparent print:p-0">
        <ResponsivePrintPreview>
          <div className="rounded-md border border-strong-border print:rounded-none print:border-0">
            <CvDocument spec={spec} cv={presentCv(profile, "full")} photoUrl={photo} titleLevel={1} />
          </div>
        </ResponsivePrintPreview>
      </div>
    </div>
  );
}
