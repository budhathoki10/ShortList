import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { TemplateGallery } from "@/components/studio/template-gallery";
import { Eyebrow } from "@/components/ui";
import { SAMPLE_PROFILE } from "@/lib/templates/sample";
import { publicMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

const description = "Browse 100 free CV and resume templates, each clearly labelled for ATS readability. Preview every design and personalise it in Shortlist Job Radar.";
export const metadata: Metadata = publicMetadata({ title: "100 free CV and resume templates", description, path: "/templates" });

export default function PublicTemplates() {
  return (
    <>
      <JsonLd data={{ "@context": "https://schema.org", "@type": "CollectionPage", "@id": `${SITE.url}/templates#page`, url: `${SITE.url}/templates`, name: "100 free CV and resume templates", description, isPartOf: { "@id": `${SITE.url}/#website` }, mainEntity: { "@type": "ItemList", name: "Shortlist Job Radar CV templates", numberOfItems: 100 } }} />
      <SiteHeader />
      <main className="mx-auto w-full max-w-6xl flex-1 px-5 py-12">
        <header className="mb-10 max-w-2xl">
          <Eyebrow>CV templates</Eyebrow>
          <h1 className="mt-2 font-serif text-5xl leading-tight tracking-tight">100 free CV and resume templates, honestly labelled.</h1>
          <p className="mt-4 text-lg text-muted">
            Each template says whether applicant tracking systems can read it. All are free. Sign up to see them with your own CV, change fonts and colours, or
            make your own.
          </p>
        </header>
        <TemplateGallery cv={SAMPLE_PROFILE} photoUrl="/sample-photo.svg" mode={{ kind: "public" }} />
      </main>
      <SiteFooter />
    </>
  );
}
