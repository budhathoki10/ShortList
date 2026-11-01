import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { SITE } from "@/lib/site";
import { publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({ title: "Privacy Policy", description: "How Shortlist Job Radar handles your account, CV, job-search preferences, matched jobs, application documents and alerts.", path: "/privacy" });

export default function PrivacyPage() {
  return (
    <LegalPage title="Privacy Policy">
      <p>
        A CV is personal. This page explains what {SITE.name} keeps, why, who else sees it, and how to get it back or delete it. The short version: we use
        your data only to help you apply for jobs, we never sell it, we don&apos;t send marketing email, and it isn&apos;t used to train AI models.
      </p>

      <h2>What we collect</h2>
      <ul>
        <li>
          <strong>Account:</strong> your name and email address, and Google&apos;s identifier for your account, from Google when you sign in. We never see or store a password, and we don&apos;t receive your Google password or any other Google data.
        </li>
        <li>
          <strong>Your CV:</strong> the file or text you upload and the profile made from it: contact details, work history, education, skills and
          anything else you include. We keep the original file so you can download it with its formatting unchanged. Files awaiting import confirmation expire after one hour.
        </li>
        <li>
          <strong>Your job hunt:</strong> job posts you add, match results, tailored CVs, cover letters, interview questions and your practice answers,
          application statuses and notes.
          This includes application plans, learning progress and work sample links, mock interview conversations, and coaching reports.
        </li>
        <li>
          <strong>Your Career Passport:</strong> the search preferences you enter for Job Radar: target and excluded roles, places and employment types,
          expected graduation month, minimum salary, companies to skip, and your alert settings. It can also hold details you choose to give, such as the
          countries you can work in and whether you need visa sponsorship. Every field is optional. We use these only to decide which jobs to show you. We
          never infer them from your CV.
        </li>
        <li>
          <strong>Job Radar matches:</strong> the jobs we found for you, how well they fit your CV and Career Passport, the CV evidence behind each match,
          and the reason you give when you dismiss one.
        </li>
        <li>
          <strong>Alert devices and delivery records:</strong> if you turn on push alerts, your browser&apos;s push address and its encryption keys (the
          keys are stored encrypted), plus a device name such as &quot;Chrome on Android&quot;. We also keep a record of each job alert we queue or send, so
          the same alert is never sent twice.
        </li>
        <li>
          <strong>Payments:</strong> your subscription, when you paid and how much. Card details go to Freemius; we never receive them.
        </li>
        <li>
          <strong>Security and fair use:</strong>
          <ul>
            <li>A session cookie keeps you logged in. We use no advertising or tracking cookies.</li>
            <li>
              Counters that slow down repeated log-in attempts and other costly actions. They are stored under a one-way hash of your email address or IP
              address, never the address itself, and delete themselves automatically within a few hours.
            </li>
            <li>
              A free-trial record: see &quot;How long we keep it&quot; below, because it outlives your account.
            </li>
          </ul>
        </li>
        <li>
          <strong>In your browser:</strong> when you open Settings or Job Radar, your browser installs a small background script (a service worker). It
          only shows the alerts you have switched on.
        </li>
      </ul>

      <h2>Who processes data for us</h2>
      <ul>
        <li>Our hosting and database providers, to run the service. They may process data outside {SITE.country}.</li>
        <li>
          Anthropic, whose Claude models read CVs and job posts and write suggestions. Your content is sent only to produce your results. Under
          Anthropic&apos;s commercial terms, content sent through its API is not used to train its models.
        </li>
        <li>Job sites you link to, which we fetch once to read the post.</li>
        <li>
          The job boards and feeds Job Radar reads (employer boards on Greenhouse, Lever, Ashby, Workable, SmartRecruiters and Recruitee, and the
          Remotive, Jobicy, Himalayas, Remote OK and Arbeitnow feeds). We read their public postings on our servers. We send them nothing about you, and
          matching against your CV happens on our servers.
        </li>
        <li>
          Google, to sign you in. Google tells us your name, email address and account identifier when you choose &ldquo;Continue with Google&rdquo;; we ask for nothing else.
        </li>
        <li>
          Resend, to send follow-up reminders and the job alert emails you turn on.
        </li>
        <li>
          Your browser&apos;s push service (Google for Chrome and Android, Mozilla for Firefox, Apple for Safari, Microsoft for Edge), if you turn on push
          alerts. It receives your device&apos;s push address and delivers our messages, which are encrypted so that only your browser can read them.
        </li>
        <li>Freemius, to take payments.</li>
      </ul>
      <p>We don&apos;t sell or share your data with employers, recruiters or advertisers.</p>

      <h2>Alerts and email</h2>
      <ul>
        <li>
          Job alert emails and push alerts are <strong>off until you turn them on</strong>, and only go to your Google-confirmed email address. They show the
          company, role, place and match level. They don&apos;t quote your CV or list your Career Passport entries.
        </li>
        <li>
          Follow-up reminders are emailed when an application you marked as applied has had no answer for a week.
        </li>
        <li>
          One switch in <Link href="/app/settings#notifications">Settings</Link> turns off all job alerts, push messages and follow-up reminders. You can
          also remove any saved device there.
        </li>
        <li>Emails about the account itself are always sent, because you can&apos;t use the account without them.</li>
      </ul>

      <h2>How long we keep it</h2>
      <p>
        As long as your account exists. When you delete your account, your profile, jobs, documents, Career Passport, Job Radar matches, saved devices,
        alert records and everything else tied to your account are deleted straight away.
      </p>
      <p>Two things can remain:</p>
      <ul>
        <li>
          <strong>Free-trial record.</strong> Each email address gets one free trial. To stop the trial being repeated by deleting an account and signing
          up again, we keep a one-way fingerprint (a hash) of your email address after deletion, with a random internal number that no longer matches any
          account. It can&apos;t be turned back into your email address and holds nothing else about you. If you want it removed too, email us. A new
          account with that address would then get a new free trial.
        </li>
        <li>Payment records may be kept by Freemius as its laws require.</li>
      </ul>

      <h2>Your rights</h2>
      <ul>
        <li>Download everything we hold about you from Settings, as a JSON file. It includes your Career Passport, Job Radar matches and alert settings.</li>
        <li>Correct your profile and Career Passport at any time.</li>
        <li>Delete your account and all its data from Settings.</li>
        <li>Switch off alerts, or remove a saved device, from Settings.</li>
        <li>
          For anything else, email <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
        </li>
      </ul>

      <h2>Changes to this policy</h2>
      <p>
        If we change what we collect or who we share it with, we&apos;ll update this page and its date, and tell you by email when the change affects data
        you already gave us.
      </p>

      <h2>Contact</h2>
      <p>
        {SITE.operator}, {SITE.country}. <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>
      </p>
    </LegalPage>
  );
}
