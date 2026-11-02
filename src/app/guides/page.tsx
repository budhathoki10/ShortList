import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ButtonLink, Eyebrow } from "@/components/ui";
import { GUIDES } from "@/lib/guides";
import { ORGANIZATION_ID, WEBSITE_ID, breadcrumbNode, publicMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

const description = "Plain-English guides on finding jobs that match your CV, tailoring applications, ATS-friendly CVs, cover letters, following up and interview preparation.";
export const metadata: Metadata = publicMetadata({ title: "Job search and CV guides", description, path: "/guides" });

export default function GuidesIndex() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "CollectionPage",
              "@id": `${SITE.url}/guides#page`,
              url: `${SITE.url}/guides`,
              name: "Job search and CV guides",
              description,
              isPartOf: { "@id": WEBSITE_ID },
              publisher: { "@id": ORGANIZATION_ID },
              mainEntity: { "@type": "ItemList", itemListElement: GUIDES.map((g, i) => ({ "@type": "ListItem", position: i + 1, url: `${SITE.url}/guides/${g.slug}`, name: g.h1 })) },
            },
            breadcrumbNode([["Guides", "/guides"]]),
          ],
        }}
      />
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-5xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <header className="max-w-3xl">
          <Eyebrow>Guides</Eyebrow>
          <h1 className="t-display mt-3 text-balance">Job search and CV guides</h1>
          <p className="mt-4 text-lg leading-8 text-muted">Straight answers to the questions job seekers ask most, from finding jobs that fit your CV to preparing for the interview.</p>
        </header>
        <ul className="mt-10 grid gap-4 md:grid-cols-2">
          {GUIDES.map((g) => (
            <li key={g.slug}>
              <Link href={`/guides/${g.slug}`} className="group flex h-full flex-col rounded-xl border border-border bg-surface p-5 transition-colors duration-150 hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 sm:p-6">
                <h2 className="text-lg font-semibold tracking-[-0.015em] group-hover:text-accent">{g.h1}</h2>
                <p className="mt-2 flex-1 leading-6 text-muted">{g.description}</p>
                <span className="mt-4 text-sm font-medium text-accent">Read the guide</span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="mt-12 flex flex-wrap items-center gap-4 rounded-xl border border-border bg-tint p-6">
          <p className="min-w-0 flex-1 font-medium">Want this done for you? Job Radar matches jobs to your CV and prepares each application.</p>
          <ButtonLink href="/signup">Start free</ButtonLink>
        </div>
      </main>
      <SiteFooter />
    </>
  );
}
