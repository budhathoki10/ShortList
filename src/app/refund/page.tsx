import type { Metadata } from "next";
import { LegalPage } from "@/components/legal-page";
import { SITE } from "@/lib/site";
import { publicMetadata } from "@/lib/seo";

export const metadata: Metadata = publicMetadata({ title: "Refund Policy", description: "Shortlist Job Radar's 14-day money-back guarantee, renewal terms and instructions for requesting a refund.", path: "/refund" });

export default function RefundPage() {
  return (
    <LegalPage title="Refund Policy">
      <p>If Shortlist Job Radar isn&apos;t helping your job hunt, you can have your money back.</p>

      <h2>14-day money-back guarantee</h2>
      <ul>
        <li>Ask within 14 days of buying a paid plan or pass and we&apos;ll refund it in full. No questions asked.</li>
        <li>Card payments are refunded through Freemius, which processes our card payments, to the original payment method. Timing depends on your bank.</li>
        <li>Paid access ends when the refund is made, and your account returns to the free plan with all your data kept.</li>
      </ul>

      <h2>Renewals</h2>
      <p>A subscription renews until you cancel it. You can cancel any time from the billing page: it stops renewing, and you keep what you&apos;ve paid for until it runs out.</p>

      <h2>How to ask</h2>
      <p>
        Email <a href={`mailto:${SITE.supportEmail}`}>{SITE.supportEmail}</a> from the address on your account. Card buyers can also use the link in
        their payment receipt.
      </p>
    </LegalPage>
  );
}
