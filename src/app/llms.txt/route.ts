import { GUIDES } from "@/lib/guides";
import { DEFAULT_DESCRIPTION } from "@/lib/seo";
import { SITE, searchIndexingEnabled } from "@/lib/site";

/** A plain-text map of the site for AI assistants and answer engines (the llms.txt convention). */
export function GET() {
  if (!searchIndexingEnabled()) return new Response("Not found", { status: 404 });
  const body = `# ${SITE.name}

> ${DEFAULT_DESCRIPTION}

Shortlist Job Radar is a private job search and application workspace. It compares public vacancies with a user's CV and preferences (target roles, locations, remote or on-site work, work eligibility), explains why each match fits, tailors CVs and cover letters using only facts from the user's own CV, tracks applications and prepares users for interviews. It is not a public job board and never applies to jobs on a user's behalf.

## Main pages

- [Home](${SITE.url}/): what the product does, pricing and common questions
- [Job search matched to your CV](${SITE.url}/job-search): how CV-based job matching, location and eligibility checks work
- [CV templates](${SITE.url}/templates): 100 free CV and resume templates labelled for ATS readability
- [Guides](${SITE.url}/guides): job search and CV guides

## Guides

${GUIDES.map((g) => `- [${g.h1}](${SITE.url}/guides/${g.slug}): ${g.description}`).join("\n")}

## Policies

- [Privacy](${SITE.url}/privacy)
- [Terms](${SITE.url}/terms)
- [Refunds](${SITE.url}/refund)
`;
  return new Response(body, { headers: { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "public, max-age=3600" } });
}
