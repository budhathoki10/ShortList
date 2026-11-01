import { FlashToast } from "@/components/toast";
import Link from "next/link";
import type { CSSProperties } from "react";
import type { Metadata } from "next";
import { JsonLd } from "@/components/json-ld";
import { HeroPreview } from "@/components/landing/hero-preview";
import { HowItWorks } from "@/components/landing/how-it-works";
import { MotionFeatures } from "@/components/landing/motion-features";
import { Reveal } from "@/components/landing/reveal";
import { ScrollWords } from "@/components/landing/scroll-words";
import { SiteFooter, SiteHeader } from "@/components/site-chrome";
import { ButtonLink } from "@/components/ui";
import { priceLabels } from "@/lib/billing/config";
import { PLAN_FEATURES } from "@/lib/plans";
import { publicMetadata } from "@/lib/seo";
import { SITE } from "@/lib/site";

const description = "Find jobs that match your CV, tailor each CV and cover letter without inventing experience, track applications and prepare for interviews.";
export const metadata: Metadata = publicMetadata({ title: "Shortlist Job Radar — Find jobs that fit your CV", description, path: "/" });

const STEPS = [
  ["Add your CV once", "Upload a PDF or Word file, or paste it. Check what we read. From then on, it’s the only source of facts about you."],
  ["Paste a job", "A link or the description. You see straight away what you already show, what’s only on your skills list, and what’s missing."],
  ["Tailor it", "Your most relevant work moves up, in the employer’s words. You accept each change. Download a PDF or Word file."],
  ["Apply, then follow up", "Track every application. A week with no answer, we remind you, with a polite note ready to send."],
] as const;

const FAQ = [
  {
    q: "Will it make things up about me?",
    a: "No. Every suggestion is checked against your own CV. A change that adds an employer, title, number, tool, skill or qualification you didn’t give us is blocked, and you’ll see exactly which word was the problem.",
  },
  {
    q: "Does it apply to jobs for me?",
    a: "No. Mass auto-applying gets accounts banned on job sites and annoys recruiters. Shortlist Job Radar helps you send fewer, better applications, yourself.",
  },
  {
    q: "What if a site won’t let you read the job post?",
    a: "Some sites only show posts to signed-in users. Copy the description from the page and paste it in; it works the same.",
  },
  {
    q: "Is it only for tech jobs?",
    a: "No. Nursing, teaching, hospitality, sales, accounting, trades, admin, design: anything with a job post and a CV.",
  },
  {
    q: "What happens to my CV?",
    a: "It’s stored in your account to do the work you ask for, never sold, and not used to train AI models. Download or delete everything from Settings at any time.",
  },
];

const WHY = [
  "Recruiters spend seconds on a CV, and screening software looks for the words in the job post. The same CV sent to twenty jobs reads as written for none of them. Tailoring each one is what job seekers say is the hardest part.",
  "AI tools that “optimise” a CV often do it by adding skills you don’t have. That gets you an interview you can’t pass. Shortlist Job Radar only rewords and reorders what you’ve actually done, and shows you every change before it’s used.",
];

const h2 = "text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem] sm:leading-[1.15]";

/** A headline broken into words that rise out of a mask, one after another. Plain CSS: it plays without JavaScript. */
function Words({ text, from = 0 }: { text: string; from?: number }) {
  return text.split(" ").map((word, i) => (
    <span key={i}>
      <span className="word">
        <span style={{ "--i": from + i } as CSSProperties}>{word}</span>
      </span>{" "}
    </span>
  ));
}

function Arrow() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" className="transition-transform duration-200 ease-out group-hover:translate-x-0.5">
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export default async function Home({ searchParams }: PageProps<"/">) {
  const { deleted } = await searchParams;
  const prices = priceLabels();
  const cell = (v: string | boolean) => (v === true ? "Yes" : v === false ? "No" : v);
  const rows = PLAN_FEATURES.map((f) => [f.feature, cell(f.free), cell(f.paid)] as const);
  return (
    <>
      <JsonLd
        data={{
          "@context": "https://schema.org",
          "@graph": [
            { "@type": "WebSite", "@id": `${SITE.url}/#website`, name: SITE.name, url: SITE.url, description },
            {
              "@type": "WebApplication",
              "@id": `${SITE.url}/#app`,
              name: SITE.name,
              url: SITE.url,
              description,
              applicationCategory: "BusinessApplication",
              operatingSystem: "Any modern web browser",
              browserRequirements: "Requires JavaScript and a modern web browser",
              featureList: ["CV-based job discovery", "Truthful CV tailoring", "Cover letter drafting", "Application tracking", "Interview preparation"],
              offers: { "@type": "Offer", price: "0", priceCurrency: "USD", description: "Free for the first job; no card required" },
            },
            {
              "@type": "FAQPage",
              mainEntity: FAQ.map(({ q, a }) => ({ "@type": "Question", name: q, acceptedAnswer: { "@type": "Answer", text: a } })),
            },
          ],
        }}
      />
      <SiteHeader />
      <MotionFeatures>
      <main id="main" className="flex-1">
        <FlashToast message={deleted === "1" ? "Account deleted. Everything in it has been removed." : null} clear={["deleted"]} />

        {/* Hero: the headline, then the product doing its one job. */}
        <section className="relative isolate overflow-hidden">
          <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10">
            <div className="dots absolute inset-0 opacity-60" />
            <div className="wash absolute -right-40 top-6 size-[40rem] max-lg:size-[26rem]" />
          </div>
          <div className="mx-auto grid max-w-5xl gap-12 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_1fr] lg:items-center lg:gap-14 lg:pb-28 lg:pt-20">
            <div>
              <p className="rise inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-[13px] font-medium text-muted">
                <i className="size-1.5 rounded-full bg-accent" />
                Job search and application toolkit
              </p>
              <h1 className="t-display mt-5 text-balance">
                <Words text="A CV for every job." />
                <span className="block text-accent">
                  <Words text="Nothing made up." from={5} />
                </span>
              </h1>
              <p className="rise mt-5 max-w-xl text-base leading-7 text-muted sm:text-lg" style={{ "--d": "650ms" } as CSSProperties}>
                Shortlist Job Radar finds roles that match your CV and preferences, shows how well you fit, tailors your CV and cover letter using only what&apos;s true, tracks the application and reminds you to follow up.
              </p>
              <div className="rise mt-8 flex flex-wrap items-center gap-x-5 gap-y-3" style={{ "--d": "800ms" } as CSSProperties}>
                <ButtonLink href="/signup" size="lg" className="group">
                  Start free
                  <Arrow />
                </ButtonLink>
                <span className="text-sm text-muted">Free for your first job. No card.</span>
              </div>
            </div>
            <HeroPreview />
          </div>
        </section>

        <section className="border-y border-border bg-surface">
          <div className="mx-auto grid max-w-5xl gap-8 px-4 py-14 sm:px-6 sm:py-20 md:grid-cols-[1.2fr_0.8fr] md:items-center md:gap-14">
            <div>
              <p className="t-label text-accent">Personalised job search</p>
              <h2 className={`${h2} mt-2`}>Find jobs that fit your CV and eligibility.</h2>
              <p className="mt-4 max-w-2xl text-base leading-7 text-muted">
                Choose target roles, locations, remote or on-site work, employment types and whether you need sponsorship. Job Radar checks approved public job sources, then explains which matches are ready, a stretch, or need verification.
              </p>
              <Link href="/job-search" className="mt-5 inline-flex min-h-10 items-center gap-2 font-medium text-accent hover:underline">
                See how the job search works <Arrow />
              </Link>
            </div>
            <div className="rounded-xl border border-border bg-tint p-5 sm:p-6">
              <p className="font-medium">Built for focused searches</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-muted">
                <li>Local, hybrid and remote jobs</li>
                <li>Graduate jobs, entry-level roles and internships</li>
                <li>Full-time and part-time preferences</li>
                <li>Explicit location and sponsorship conflicts flagged before you apply</li>
              </ul>
            </div>
          </div>
        </section>

        <section id="how" className="scroll-mt-16 border-y border-border bg-tint">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
            <HowItWorks steps={STEPS} />
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
          <div className="grid gap-8 md:grid-cols-[1fr_1.4fr] md:gap-12">
            <Reveal>
              <h2 className={h2}>Why one CV doesn&apos;t work</h2>
            </Reveal>
            <div className="space-y-5 text-lg leading-8 text-foreground">
              {WHY.map((text) => (
                <ScrollWords key={text} text={text} />
              ))}
            </div>
          </div>
        </section>

        <section id="pricing" className="scroll-mt-16 border-y border-border bg-surface">
          <div className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
            <Reveal>
              <h2 className={h2}>Pricing</h2>
              <p className="mt-3 text-muted">Try everything free on your first job. Upgrade monthly or yearly to use it on every job you apply to, and cancel whenever you like.</p>
            </Reveal>
            <div className="mt-8 grid gap-4 sm:hidden">
              {[
                { name: "Free", price: "$0", note: null, col: 1, tinted: false },
                { name: "Paid plan", price: prices.monthly ?? "Monthly", note: prices.yearly ? `or ${prices.yearly}` : null, col: 2, tinted: true },
              ].map((plan, i) => (
                <Reveal key={plan.name} delay={i * 0.08} className={`rounded-xl border p-5 ${plan.tinted ? "border-accent/40 bg-tint" : "border-border bg-background"}`}>
                  <p className={`text-sm font-medium ${plan.tinted ? "text-accent-strong" : ""}`}>{plan.name}</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight tabular-nums">{plan.price}</p>
                  {plan.note && <p className="mt-0.5 text-[13px] text-muted">{plan.note}</p>}
                  <ul className="mt-4 space-y-2.5 border-t border-border pt-4 text-sm">
                    {rows.map((r) => (
                      <li key={r[0]} className="flex items-baseline justify-between gap-4">
                        <span className="text-muted">{r[0]}</span>
                        <span className="shrink-0 text-right font-medium">{r[plan.col]}</span>
                      </li>
                    ))}
                  </ul>
                </Reveal>
              ))}
            </div>
            <Reveal className="mt-8 hidden overflow-x-auto rounded-xl border border-border shadow-[0_1px_0_rgb(17_19_26/0.03)] sm:block">
              <table className="w-full min-w-[32rem] text-sm">
                <caption className="sr-only">What each plan includes</caption>
                <thead className="border-b border-border bg-background text-left">
                  <tr>
                    <th scope="col" className="px-4 py-5 sm:w-1/2">
                      <span className="sr-only">Feature</span>
                    </th>
                    <th scope="col" className="px-4 py-5">
                      <span className="block font-medium">Free</span>
                      <span className="block text-2xl font-semibold tracking-tight tabular-nums">$0</span>
                    </th>
                    <th scope="col" className="bg-tint px-4 py-5">
                      <span className="block font-medium text-accent-strong">Paid plan</span>
                      <span className="block text-2xl font-semibold tracking-tight tabular-nums">{prices.monthly ?? "Monthly"}</span>
                      {prices.yearly && <span className="mt-0.5 block text-[13px] font-normal text-muted">or {prices.yearly}</span>}
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {rows.map(([row, free, pass]) => (
                    <tr key={row} className="transition-colors duration-150 hover:bg-surface-hover">
                      <th scope="row" className="px-4 py-3.5 text-left font-normal text-muted">
                        {row}
                      </th>
                      <td className="px-4 py-3.5">{free}</td>
                      <td className="bg-tint px-4 py-3.5 font-medium">{pass}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Reveal>
            <Reveal className="mt-6 flex flex-wrap items-center gap-x-6 gap-y-3" delay={0.1}>
              <ButtonLink href="/signup" className="group">
                Start free
                <Arrow />
              </ButtonLink>
              <p className="text-sm text-muted">Monthly or yearly. Cancel any time and keep what you&apos;ve paid for until it runs out.</p>
            </Reveal>
          </div>
        </section>

        <section className="mx-auto max-w-5xl px-4 py-16 sm:px-6 sm:py-24">
          <Reveal>
            <h2 className={h2}>Questions</h2>
          </Reveal>
          <dl className="mt-8 divide-y divide-border border-y border-border">
            {FAQ.map((f, i) => (
              <Reveal key={f.q} delay={Math.min(i, 3) * 0.06} className="grid gap-2 py-5 transition-colors duration-150 md:grid-cols-[1fr_1.6fr] md:gap-8">
                <dt className="font-medium">{f.q}</dt>
                <dd className="leading-6 text-muted">{f.a}</dd>
              </Reveal>
            ))}
          </dl>
          <p className="mt-8 text-sm text-muted">
            Something else?{" "}
            <Link href="/terms" className="text-accent underline underline-offset-4">
              Read the terms
            </Link>{" "}
            or write to us.
          </p>
        </section>

        {/* The close: one clear next step, on a solid brand-colour band. */}
        <section className="mx-auto max-w-5xl px-4 pb-16 sm:px-6 sm:pb-24">
          <Reveal className="relative overflow-hidden rounded-2xl bg-accent px-6 py-12 text-on-accent sm:px-12 sm:py-16">
            <div aria-hidden="true" className="dots absolute inset-0 opacity-20 [--dot:currentColor]" />
            <div className="relative max-w-xl">
              <h2 className="text-2xl font-semibold tracking-[-0.02em] sm:text-[2rem] sm:leading-[1.15]">Your next application, tailored today.</h2>
              <p className="mt-3 text-base leading-7 opacity-90">Add your CV once, paste a job, and check every change before it&apos;s used.</p>
              <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-3">
                <ButtonLink href="/signup" size="lg" className="group bg-on-accent! text-accent! hover:opacity-90">
                  Start free
                  <Arrow />
                </ButtonLink>
                <span className="text-sm opacity-90">Free for your first job. No card.</span>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      </MotionFeatures>
      <SiteFooter />
    </>
  );
}
