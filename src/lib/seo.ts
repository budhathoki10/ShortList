import type { Metadata } from "next";
import { SITE, searchIndexingEnabled } from "./site";

export const DEFAULT_DESCRIPTION =
  "Find jobs that match your CV and preferences, tailor every application truthfully, track progress and prepare for interviews with Shortlist Job Radar.";

export function publicMetadata({ title, description, path }: { title: string; description: string; path: string }): Metadata {
  return {
    title,
    description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      locale: "en_US",
      siteName: SITE.name,
      url: path,
      title,
      description,
    },
    twitter: {
      card: "summary_large_image",
      title,
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
