function siteOrigin() {
  const configured = process.env.APP_URL?.trim() || "http://localhost:3000";
  try {
    return new URL(configured).origin;
  } catch {
    return "http://localhost:3000";
  }
}

/** Business details shown across public and legal pages. Set these env vars before going live. */
export const SITE = {
  name: "Shortlist Job Radar",
  url: siteOrigin(),
  operator: process.env.LEGAL_OPERATOR_NAME || "the operator of Shortlist Job Radar",
  country: process.env.LEGAL_COUNTRY || "Nepal",
  supportEmail: process.env.SUPPORT_EMAIL || "support@example.com",
  legalUpdated: "1 November 2026",
};

/** Preview and local deployments should never compete with the production domain in search. */
export function searchIndexingEnabled() {
  if (process.env.SEO_INDEXING_ENABLED === "true") return true;
  if (process.env.SEO_INDEXING_ENABLED === "false") return false;
  const url = new URL(SITE.url);
  return process.env.NODE_ENV === "production" && url.protocol === "https:" && !["localhost", "127.0.0.1"].includes(url.hostname);
}
