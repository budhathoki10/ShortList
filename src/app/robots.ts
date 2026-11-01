import type { MetadataRoute } from "next";
import { SITE, searchIndexingEnabled } from "@/lib/site";

export default function robots(): MetadataRoute.Robots {
  if (!searchIndexingEnabled()) return { rules: { userAgent: "*", disallow: "/" } };
  return {
    rules: {
      userAgent: "*",
      allow: "/",
      disallow: ["/app", "/app/", "/api/", "/render/"],
    },
    sitemap: `${SITE.url}/sitemap.xml`,
    host: SITE.url,
  };
}
