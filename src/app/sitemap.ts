import type { MetadataRoute } from "next";
import { SITE, searchIndexingEnabled } from "@/lib/site";

const routes = [
  { path: "", changeFrequency: "weekly", priority: 1 },
  { path: "/job-search", changeFrequency: "weekly", priority: 0.9 },
  { path: "/templates", changeFrequency: "monthly", priority: 0.8 },
  { path: "/privacy", changeFrequency: "yearly", priority: 0.2 },
  { path: "/terms", changeFrequency: "yearly", priority: 0.2 },
  { path: "/refund", changeFrequency: "yearly", priority: 0.1 },
] as const;

export default function sitemap(): MetadataRoute.Sitemap {
  if (!searchIndexingEnabled()) return [];
  return routes.map(({ path, changeFrequency, priority }) => ({ url: `${SITE.url}${path}`, changeFrequency, priority }));
}
