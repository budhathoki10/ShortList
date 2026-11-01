import type { Metadata } from "next";
import Link from "next/link";
import { JsonLd } from "@/components/json-ld";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ButtonLink, Eyebrow } from "@/components/ui";
import { publicMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

const description = "Use Shortlist Job Radar as a personalised job finder for local, remote, graduate and entry-level jobs matched against your CV, location and eligibility preferences.";

export const metadata: Metadata = publicMetadata({
  title: "Job search matched to your CV and preferences",
  description,
  path: "/job-search",
});

const questions = [
  {
    q: "How can I find jobs near me with Shortlist Job Radar?",
    a: "Enter the cities, regions or countries you want in your Career Passport. Job Radar compares those preferences with the location written in each vacancy. It does not use your phone’s precise location or track where you go.",
  },
  {
    q: "Can Shortlist Job Radar find remote jobs?",
    a: "Yes. Choose remote, hybrid or on-site work and add the countries or regions where you can work. Shortlist Job Radar filters explicit work-mode conflicts and flags remote roles that still have a regional restriction.",
  },
  {
    q: "Can it find entry-level jobs, graduate jobs and internships?",
    a: "Yes. Add the role names and employment types you want, such as graduate software engineer, junior accountant, internship or full-time work. Matches still depend on what is available from the configured public sources.",
  },
  {
    q: "Does it find jobs with visa sponsorship?",
    a: "You can state that you need sponsorship. If a vacancy explicitly says sponsorship is unavailable, Shortlist Job Radar blocks that match. If the post is unclear, it asks you to verify instead of guessing that sponsorship exists.",
  },
  {
    q: "Is Shortlist Job Radar a public job board?",
    a: "No. It is a private job search and application workspace. Job Radar monitors approved employer boards and public feeds for your saved preferences, while the rest of Shortlist Job Radar helps you tailor, track and prepare for the jobs you choose.",
  },
  {
    q: "Will Shortlist Job Radar apply to jobs automatically?",
    a: "No. You review every match and submit every application yourself. Shortlist Job Radar prepares evidence-based materials but never sends an application or contacts an employer for you.",
  },
];

const steps = [
  ["Add your CV", "Your CV supplies the skills, projects and experience used to explain each match."],
  ["Set your search preferences", "Choose target roles, locations, work countries, remote modes, employment types, salary needs and companies to skip."],
  ["Review matched jobs", "Job Radar shows the source, freshness, CV evidence and any eligibility issue it can verify from the vacancy."],
  ["Prepare the application", "Save a suitable role, tailor your CV, draft a cover letter, track the application and practise for the interview."],
] as const;

export default function JobSearchPage() {
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebPage", "@id": `${SITE.url}/job-search#page`, url: `${SITE.url}/job-search`, name: "Job search matched to your CV and preferences", description, isPartOf: { "@id": `${SITE.url}/#website` } },
            { "@type": "BreadcrumbList", itemListElement: [{ "@type": "ListItem", position: 1, name: SITE.name, item: SITE.url }, { "@type": "ListItem", position: 2, name: "Job search", item: `${SITE.url}/job-search` }] },
            { "@type": "FAQPage", mainEntity: questions.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })) },
          ],
        }}
      />
      <SiteHeader />
      <main id="main" className="flex-1">
        <section className="border-b border-border bg-tint">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
            <Eyebrow>CV-based job finder</Eyebrow>
            <h1 className="t-display mt-3 max-w-4xl text-balance">Find jobs that fit your CV, location and eligibility.</h1>
            <p className="mt-5 max-w-3xl text-lg leading-8 text-muted">
              Search for local jobs, remote jobs, graduate roles, entry-level jobs and internships without opening the same job boards every day. Shortlist Job Radar monitors approved public sources for your preferences and shows why each match may—or may not—fit.
            </p>
            <div className="mt-8 flex flex-wrap items-center gap-4">
              <ButtonLink href="/signup" size="lg">Start your job search free</ButtonLink>
              <span className="text-sm text-muted">You review and submit every application.</span>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="max-w-3xl">
            <Eyebrow>How Job Radar works</Eyebrow>
            <h2 className="mt-2 text-3xl font-semibold tracking-[-0.025em]">One focused search, checked repeatedly.</h2>
            <p className="mt-4 text-base leading-7 text-muted">Shortlist Job Radar is not a copy of a general job board. It narrows public vacancies using facts you confirm and evidence already present in your CV.</p>
          </div>
          <ol className="mt-10 grid gap-4 md:grid-cols-2">
            {steps.map(([title, text], index) => (
              <li key={title} className="rounded-xl border border-border bg-surface p-5 sm:p-6">
                <span className="font-mono text-xs text-accent">0{index + 1}</span>
                <h3 className="mt-3 text-lg font-semibold">{title}</h3>
                <p className="mt-2 leading-6 text-muted">{text}</p>
              </li>
            ))}
          </ol>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-5xl gap-10 px-4 py-16 sm:px-6 sm:py-24 md:grid-cols-2 md:gap-14">
            <div>
              <Eyebrow>Search preferences</Eyebrow>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">More useful than a broad “jobs near me” search.</h2>
              <p className="mt-4 leading-7 text-muted">A nearby vacancy is only useful if the role, work mode and eligibility also fit. Your private Career Passport can include:</p>
              <ul className="mt-5 space-y-2.5 leading-6 text-muted">
                <li>Target and excluded job titles</li>
                <li>Cities, regions, countries and remote work preferences</li>
                <li>Full-time, part-time, internship or other employment types</li>
                <li>Work countries, graduation date and sponsorship need</li>
                <li>Minimum salary and companies you want to skip</li>
              </ul>
            </div>
            <div>
              <Eyebrow>Evidence before ranking</Eyebrow>
              <h2 className="mt-2 text-2xl font-semibold tracking-[-0.02em]">Know why a job was recommended.</h2>
              <p className="mt-4 leading-7 text-muted">Each recommendation links back to its public source and separates four outcomes:</p>
              <dl className="mt-5 space-y-4">
                <div><dt className="font-medium">Ready</dt><dd className="mt-1 text-sm leading-6 text-muted">The available evidence supports a realistic application.</dd></div>
                <div><dt className="font-medium">Stretch</dt><dd className="mt-1 text-sm leading-6 text-muted">Some requirements are missing, but the role may still be worth reviewing.</dd></div>
                <div><dt className="font-medium">Verify</dt><dd className="mt-1 text-sm leading-6 text-muted">The vacancy does not say enough about an important eligibility detail.</dd></div>
                <div><dt className="font-medium">Blocked</dt><dd className="mt-1 text-sm leading-6 text-muted">The source explicitly conflicts with a preference such as location or sponsorship.</dd></div>
              </dl>
            </div>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
          <Eyebrow>Job search questions</Eyebrow>
          <h2 className="mt-2 text-3xl font-semibold tracking-[-0.025em]">Straight answers before you sign up.</h2>
          <dl className="mt-8 divide-y divide-border border-y border-border">
            {questions.map(({ q, a }) => <div key={q} className="grid gap-2 py-6 md:grid-cols-[1fr_1.5fr] md:gap-10"><dt className="font-medium">{q}</dt><dd className="leading-7 text-muted">{a}</dd></div>)}
          </dl>
          <div className="mt-10 flex flex-wrap items-center gap-5 rounded-xl bg-accent px-6 py-8 text-on-accent sm:px-8">
            <div className="min-w-0 flex-1"><h2 className="text-2xl font-semibold">Start with the jobs you actually want.</h2><p className="mt-2 opacity-90">Add your CV, confirm your preferences and review every recommendation yourself.</p></div>
            <ButtonLink href="/signup" size="lg" className="bg-on-accent! text-accent! hover:opacity-90">Start free</ButtonLink>
          </div>
          <p className="mt-8 text-sm text-muted">Already comparing application materials? Browse the <Link href="/templates" className="font-medium text-accent underline underline-offset-4">free ATS-labelled CV templates</Link> or read <Link href="/privacy" className="font-medium text-accent underline underline-offset-4">how job-search preferences are handled</Link>.</p>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}
