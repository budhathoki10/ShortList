import type { Metadata } from "next";
import Link from "next/link";
import { LegalPage } from "@/components/legal-page";
import { LIMITS } from "@/lib/plans";
import { SITE } from "@/lib/site";

export const metadata: Metadata = { title: "Terms of Service" };

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service">
      <p>
        These terms are an agreement between you and {SITE.operator} ({SITE.country}), who runs {SITE.name}. By creating an account you agree to them.
      </p>

      <h2>What Shortlist does</h2>
      <p>
        Shortlist helps you apply for jobs. You give it your CV and job posts you&apos;re interested in. It checks how well you match, suggests
        changes to your CV for each job, drafts cover letters, prepares interview questions, and keeps track of your applications. It doesn&apos;t
        apply to jobs for you, contact employers, or promise any result.
      </p>

      <h2>Your responsibilities</h2>
      <ul>
        <li>You must be at least 16 and give accurate information about yourself.</li>
        <li>
          Everything you send to an employer is your responsibility. Shortlist only builds on what&apos;s in your profile and flags anything a suggestion
          adds, but you should read every document before you send it.
        </li>
        <li>Only upload CVs and job posts you&apos;re entitled to use. Don&apos;t upload other people&apos;s personal data beyond what a CV normally contains.</li>
        <li>Don&apos;t try to break, overload or scrape the service, or use it to write anything misleading or unlawful.</li>
        <li>Keep your password safe. You&apos;re responsible for activity on your account.</li>
      </ul>

      <h2>AI-written text</h2>
      <p>
        Suggestions, cover letters and interview feedback are written with the help of AI models. They can be wrong. Our fact check blocks changes that
        add names, numbers, tools or qualifications that aren&apos;t in your profile, but it can&apos;t judge whether your profile itself is accurate.
      </p>

      <h2>Plans and payment</h2>
      <ul>
        <li>
          The free plan includes a one-time trial on one job of your choice: up to {LIMITS.free.tailor} tailoring runs, {LIMITS.free.cover} cover letter drafts,
          {LIMITS.free.interview} practice answer reviews and {LIMITS.free.mock} mock interview for that job. The trial starts on the first job you use one of these features on, and doesn&apos;t
          renew. CV imports are limited to {LIMITS.free.import} each calendar month.
        </li>
        <li>
          A paid plan is a monthly or yearly subscription that renews automatically until you cancel. You can cancel at any time from the billing page: it
          then stops renewing, and you keep paid features until the end of the period you&apos;ve already paid for. Paid plans have fair-use limits of{" "}
          {LIMITS.paid.tailor} tailored CVs, {LIMITS.paid.cover} cover letters, {LIMITS.paid.interview} practice answer reviews and {LIMITS.paid.mock} mock interviews a month.
        </li>
        <li>
          Subscription payments are handled by Freemius, which acts as the seller of record, and Freemius&apos;s terms apply to the payment.
        </li>
        <li>
          Refunds follow our <Link href="/refund">Refund Policy</Link>.
        </li>
      </ul>

      <h2>Your content</h2>
      <p>
        Your CV, job posts and documents remain yours. You give us permission to store and process them only to provide the service to you. See the{" "}
        <Link href="/privacy">Privacy Policy</Link>.
      </p>

      <h2>Ending your account</h2>
      <p>
        You can delete your account at any time in Settings, which deletes your data straight away. We may suspend accounts that break these terms.
      </p>

      <h2>Liability</h2>
      <p>
        Shortlist is provided as is. We don&apos;t guarantee interviews, offers or that the service will always be available. To the extent the law
        allows, our total liability is limited to what you paid us in the 12 months before the claim.
      </p>

      <h2>Changes and contact</h2>
      <p>
        We&apos;ll tell you by email before any change that affects you materially. Questions: <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a>.
      </p>
    </LegalPage>
  );
}
