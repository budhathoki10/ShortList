import type { CSSProperties } from "react";
import { Parallax } from "./interactive";

/** Delay for the CSS animations, in ms. */
const d = (ms: number) => ({ "--d": `${ms}ms` }) as CSSProperties;
const card = "rounded-xl border bg-surface shadow-[0_10px_30px_-14px_rgb(17_19_26/0.22)]";

/**
 * The product's one idea, shown working: words you have are marked, a change that adds a fact is blocked.
 * It plays once on load in plain CSS (no JavaScript needed, so it is on screen with the first paint), then
 * the cards float a few pixels. The whole thing is described once for screen readers.
 */
export function HeroPreview() {
  return (
    <Parallax>
      <div className="space-y-3.5" role="img" aria-label="Example: Shortlist Job Radar matches a job post against a CV and blocks a suggested change that adds a skill the CV doesn't have">
        <div className="rise" style={d(450)}>
          <div className="float" style={d(3200)}>
            <div className={`${card} border-border p-5 text-sm leading-relaxed`}>
              <p className="flex items-center gap-2 text-xs font-medium text-muted">
                <i className="size-1.5 rounded-full bg-accent" />
                Job post · Customer Success Lead
              </p>
              <p className="mt-2.5">
                You’ll own onboarding for new accounts, keep <mark className="wipe rounded-[2px] bg-transparent px-0.5 text-inherit" style={d(1000)}>churn</mark> low and work closely with sales. Experience with{" "}
                <mark className="wipe rounded-[2px] bg-transparent px-0.5 text-inherit" style={d(1250)}>Zendesk</mark> and <mark className="rounded-[2px] bg-warning-soft px-0.5 text-inherit">HubSpot</mark> needed;{" "}
                <mark className="rounded-[2px] bg-danger-soft px-0.5 text-danger">Salesforce</mark> is a plus.
              </p>
              <div className="mt-4 border-t border-border pt-3">
                <div className="flex items-center gap-3">
                  <span className="font-mono text-2xl font-medium tabular-nums">
                    <span className="ticker" aria-hidden="true" style={d(1300)} />
                    <span className="sr-only">72</span>%
                  </span>
                  <span className="text-[13px] text-muted">Worth applying, with a tailored CV</span>
                </div>
                <div className="mt-2.5 h-1.5 overflow-hidden rounded-full bg-sunken" aria-hidden="true">
                  <div className="h-full w-[72%] origin-left rounded-full bg-success" style={{ animation: "grow-x 1300ms var(--ease-out) 1300ms both" }} />
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="rise ml-4 sm:ml-6" style={d(900)}>
          <div className="float" style={d(3600)}>
            <div className={`${card} border-strong-border p-4 text-sm`}>
              <p className="text-[13px] font-medium">Support Specialist, Brightdesk</p>
              <p className="mt-2 leading-relaxed">
                <del className="text-faint" style={{ animation: "strike-in 500ms ease-out 1700ms both" }}>
                  Answered customer tickets{" "}
                </del>
                <ins className="wipe rounded-[2px] bg-transparent px-0.5 no-underline" style={d(1900)}>
                  Onboarded 40 new business accounts and handled their support in Zendesk,{" "}
                </ins>
                keeping churn under 3%
              </p>
              <p className="rise mt-2 flex items-center gap-1.5 text-[13px] text-success" style={d(2400)}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d="M5 12.5l4.5 4.5L19 7.5" />
                </svg>
                Using · every fact is in your CV
              </p>
            </div>
          </div>
        </div>

        <div className="rise ml-8 sm:ml-12" style={d(1300)}>
          <div className="float" style={d(4000)}>
            <div style={{ animation: "nudge 520ms ease-in-out 2800ms both" }}>
              <div className="rounded-xl border border-danger/30 bg-danger-soft p-4 text-sm shadow-[0_10px_30px_-14px_rgb(196_43_43/0.25)]">
                <p className="leading-relaxed">
                  …managed renewals in <strong>Salesforce</strong>
                </p>
                <p className="mt-1 flex items-center gap-1.5 text-[13px] text-danger">
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.25" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                    <path d="M6 6l12 12M18 6 6 18" />
                  </svg>
                  Blocked · Salesforce isn&apos;t in your CV
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </Parallax>
  );
}
