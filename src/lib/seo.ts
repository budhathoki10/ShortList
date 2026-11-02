import type { Metadata } from "next";
import { SITE, searchIndexingEnabled } from "./site";

export const DEFAULT_DESCRIPTION =
  "Find jobs that match your CV and preferences, tailor every application truthfully, track progress and prepare for interviews with Shortlist Job Radar.";

/** Home-page snippet: leads with the query, stays under ~155 characters so Google does not cut it. */
export const HOME_DESCRIPTION = "Find jobs that match your CV. Tailor your CV and cover letter without made-up experience, track applications and prepare for interviews.";

export const HOME_TITLE = "Shortlist Job Radar — Find Jobs That Match Your CV";

type PublicMetadataInput = {
  title: string;
  description: string;
  path: string;
  /** Use the title as written, without the " · Shortlist Job Radar" suffix from the root layout. */
  absoluteTitle?: boolean;
  /** Article pages declare their publish and update dates for search and answer engines. */
  article?: { published: string; modified: string };
};

export function publicMetadata({ title, description, path, absoluteTitle, article }: PublicMetadataInput): Metadata {
  const socialTitle = absoluteTitle ? title : `${title} · ${SITE.name}`;
  return {
    title: absoluteTitle ? { absolute: title } : title,
    description,
    alternates: { canonical: path },
    openGraph: {
      ...(article
        ? { type: "article" as const, publishedTime: article.published, modifiedTime: article.modified, authors: [SITE.name] }
        : { type: "website" as const }),
      locale: "en_US",
      siteName: SITE.name,
      url: path,
      title: socialTitle,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title: socialTitle,
      description,
    },
  };
}

export function privateMetadata(title: string): Metadata {
  return {
    title,
    robots: { index: false, follow: false, noarchive: true },
  };
}

export const publicRobots: Metadata["robots"] = searchIndexingEnabled()
  ? {
      index: true,
      follow: true,
      googleBot: { index: true, follow: true, "max-image-preview": "large", "max-snippet": -1, "max-video-preview": -1 },
    }
  : { index: false, follow: false, noarchive: true };

/** Stable schema.org ids so every page's graph points at the same organisation and website. */
export const ORGANIZATION_ID = `${SITE.url}/#organization`;
export const WEBSITE_ID = `${SITE.url}/#website`;

export function organizationNode() {
  return {
    "@type": "Organization",
    "@id": ORGANIZATION_ID,
    name: SITE.name,
    url: SITE.url,
    logo: { "@type": "ImageObject", url: `${SITE.url}/icons/icon-512.png`, width: 512, height: 512 },
    description: DEFAULT_DESCRIPTION,
  };
}

export function breadcrumbNode(trail: ReadonlyArray<readonly [name: string, path: string]>) {
  return {
    "@type": "BreadcrumbList",
    itemListElement: [[SITE.name, ""] as const, ...trail].map(([name, path], index) => ({
      "@type": "ListItem",
      position: index + 1,
      name,
      item: `${SITE.url}${path}`,
    })),
  };
}

export function faqNode(items: ReadonlyArray<{ q: string; a: string }>) {
  return {
    "@type": "FAQPage",
    mainEntity: items.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
  };
}
