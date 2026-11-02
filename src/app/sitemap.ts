import type { MetadataRoute } from "next";
import { GUIDES } from "@/lib/guides";
import { SITE, searchIndexingEnabled } from "@/lib/site";

// Bump a page's date only when its content changes: a lastmod that always says "now" teaches crawlers to ignore it.
const routes = [
  { path: "", changeFrequency: "weekly", priority: 1, lastModified: "2026-11-02" },
  { path: "/job-search", changeFrequency: "weekly", priority: 0.9, lastModified: "2026-11-02" },
  { path: "/guides", changeFrequency: "weekly", priority: 0.8, lastModified: "2026-11-02" },
  { path: "/templates", changeFrequency: "monthly", priority: 0.8, lastModified: "2026-11-02" },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2, lastModified: "2026-11-01" },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2, lastModified: "2026-11-01" },
  { path: "/refund", changeFrequency: "yearly", priority: 0.1, lastModified: "2026-11-01" },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  if (!searchIndexingEnabled()) return [];
  const guides = GUIDES.map((g) => ({ url: `${SITE.url}/guides/${g.slug}`, lastModified: g.modified, changeFrequency: "monthly" as const, priority: 0.7 }));
  return [...routes.map(({ path, ...rest }) => ({ url: `${SITE.url}${path}`, ...rest })), ...guides];
}
