import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ButtonLink, Eyebrow } from "@/components/ui";
import { GUIDES, guideBySlug } from "@/lib/guides";
import { ORGANIZATION_ID, WEBSITE_ID, breadcrumbNode, faqNode, publicMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

export function generateStaticParams() {
  return GUIDES.map(({ slug }) => ({ slug }));
}

export async function generateMetadata({ params }: PageProps<"/guides/[slug]">): Promise<Metadata> {
  const guide = guideBySlug((await params).slug);
  if (!guide) return {};
  return publicMetadata({ title: guide.title, description: guide.description, path: `/guides/${guide.slug}`, absoluteTitle: true, article: { published: guide.published, modified: guide.modified } });
}

const dateLabel = (iso: string) => new Date(iso).toLocaleDateString("en-GB", { day: "numeric", month: "long", year: "numeric", timeZone: "UTC" });

export default async function GuidePage({ params }: PageProps<"/guides/[slug]">) {
  const guide = guideBySlug((await params).slug);
  if (!guide) notFound();
  const url = `${SITE.url}/guides/${guide.slug}`;
  const related = guide.related.map(guideBySlug).filter((g) => g !== undefined);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Article",
              "@id": `${url}#article`,
              mainEntityOfPage: url,
              headline: guide.h1,
              description: guide.description,
              datePublished: guide.published,
              dateModified: guide.modified,
              inLanguage: "en",
              image: `${url}/opengraph-image`,
              author: { "@id": ORGANIZATION_ID },
              publisher: { "@id": ORGANIZATION_ID },
              isPartOf: { "@id": WEBSITE_ID },
            },
            breadcrumbNode([["Guides", "/guides"], [guide.h1, `/guides/${guide.slug}`]]),
            faqNode(guide.faq),
          ],
        }}
      />
      <SiteHeader />
      <main id="main" className="mx-auto w-full max-w-3xl flex-1 px-4 py-12 sm:px-6 sm:py-16">
        <nav aria-label="Breadcrumb" className="text-[13px] text-muted">
          <Link href="/guides" className="hover:text-foreground">Guides</Link>
          <span aria-hidden="true"> / </span>
          <span>{guide.h1}</span>
        </nav>
        <article className="mt-6">
          <header>
            <Eyebrow>Updated {dateLabel(guide.modified)}</Eyebrow>
            <h1 className="t-display mt-3 text-balance">{guide.h1}</h1>
          </header>
          <p className="mt-6 rounded-xl border border-border bg-tint p-5 text-lg leading-8">{guide.answer}</p>
          {guide.sections.map((s) => (
            <section key={s.heading} className="mt-10">
              <h2 className="text-2xl font-semibold tracking-[-0.02em]">{s.heading}</h2>
              {s.body.map((p) => <p key={p} className="mt-3 text-base leading-7 text-foreground">{p}</p>)}
              {s.list && <ul className="mt-3 list-disc space-y-1.5 pl-6 leading-7 marker:text-faint">{s.list.map((item) => <li key={item}>{item}</li>)}</ul>}
            </section>
          ))}
          <section className="mt-12">
            <h2 className="text-2xl font-semibold tracking-[-0.02em]">Frequently asked questions</h2>
            <dl className="mt-4 divide-y divide-border border-y border-border">
              {guide.faq.map(({ q, a }) => (
                <div key={q} className="py-5">
                  <dt className="font-medium">{q}</dt>
                  <dd className="mt-2 leading-7 text-muted">{a}</dd>
                </div>
              ))}
            </dl>
          </section>
        </article>
        <aside className="mt-12 flex flex-wrap items-center gap-4 rounded-xl bg-accent px-6 py-7 text-on-accent">
          <div className="min-w-0 flex-1">
            <p className="text-xl font-semibold">Put this into practice with your own CV.</p>
            <p className="mt-1 opacity-90">Shortlist Job Radar finds matching jobs, tailors your CV truthfully and tracks every application. Free for your first job.</p>
          </div>
          <ButtonLink href="/signup" size="lg" className="bg-on-accent! text-accent! hover:opacity-90">Start free</ButtonLink>
        </aside>
        <nav aria-label="Related guides" className="mt-12">
          <h2 className="text-lg font-semibold">Keep reading</h2>
          <ul className="mt-3 space-y-2">
            {related.map((g) => <li key={g.slug}><Link href={`/guides/${g.slug}`} className="font-medium text-accent underline underline-offset-4">{g.h1}</Link></li>)}
            <li><Link href="/job-search" className="font-medium text-accent underline underline-offset-4">How Job Radar finds jobs that fit your CV</Link></li>
          </ul>
        </nav>
      </main>
      <SiteFooter />
    </>
  );
}
