import type { Metadata } from "next";
import Link from "next/link";
import { CancelSubscription, CheckAgain, SubscribePlans, type PlanChoice } from "@/components/subscribe-plans";
import { Badge, Notice, PageHeader } from "@/components/ui";
import { UsageMeter } from "@/components/usage-meter";
import type { Subscription, SubscriptionStatus } from "@/db/types";
import { requireUser } from "@/lib/auth/session";
import { accessUntil, effectiveStatus } from "@/lib/billing/access";
import { billingConfigured, billingMode, priceLabels } from "@/lib/billing/config";
import { formatMoney } from "@/lib/money";
import { StudioIcon } from "@/components/icons";
import { isPaid, PLAN_FEATURES, type PlanCell } from "@/lib/plans";
import { paymentsForUser } from "@/lib/services/billing";
import { claimByEmail, safePolicy, subscriptionsForUser } from "@/lib/services/subscriptions";
import { planUsage, type PlanUsage } from "@/lib/services/usage";

export const metadata: Metadata = { title: "Plan and billing" };

const date = (d: Date | null | undefined) => (d ? d.toLocaleDateString("en-GB", { dateStyle: "long" }) : null);

const TONE: Record<SubscriptionStatus, "good" | "warn" | "bad" | "neutral"> = { active: "good", pending: "neutral", past_due: "warn", cancelled: "warn", expired: "neutral", suspended: "bad" };
const LABEL: Record<SubscriptionStatus, string> = { active: "Active", pending: "Waiting for payment", past_due: "Payment failed", cancelled: "Cancelled", expired: "Expired", suspended: "Suspended" };
const PAYMENT_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = { completed: "good", refunded: "neutral", failed: "bad", pending: "warn" };

/** The row that best describes the account's billing: live ones first, then ones still paid up, then waiting, then ended. */
function primary(rows: Subscription[], now: Date) {
  const policy = safePolicy();
  const rank: Record<SubscriptionStatus, number> = { active: 0, past_due: 1, suspended: 2, cancelled: 3, pending: 4, expired: 5 };
  return rows.map((row) => ({ row, status: effectiveStatus(row, now, policy), until: accessUntil(row, now, policy) })).sort((a, b) => rank[a.status] - rank[b.status])[0] ?? null;
}

/**
 * The yearly saving, worked out from the display labels ("USD 9 / month", "USD 90 / year"). Only when each label holds
 * exactly one number, so an unusual label shows no badge rather than a wrong one.
 */
function yearlySaving(monthly: string | null, yearly: string | null): number | null {
  const one = (label: string | null) => {
    const n = label?.match(/\d+(?:\.\d+)?/g);
    return n?.length === 1 ? Number(n[0]) : null;
  };
  const m = one(monthly);
  const y = one(yearly);
  if (!m || !y) return null;
  const pct = Math.round((1 - y / (m * 12)) * 100);
  return pct > 0 ? pct : null;
}

function Cell({ value, emphasis = false }: { value: PlanCell; emphasis?: boolean }) {
  if (value === true)
    return (
      <span className="inline-flex text-success">
        <StudioIcon name="check" size={16} />
        <span className="sr-only">Included</span>
      </span>
    );
  if (value === false)
    return (
      <span className="text-faint">
        <span aria-hidden="true">—</span>
        <span className="sr-only">Not included</span>
      </span>
    );
  return <span className={emphasis ? "font-medium" : ""}>{value}</span>;
}

/** What the free trial has done so far, or what it would do. */
function TrialStatus({ usage }: { usage: Extract<PlanUsage, { plan: "free" }> }) {
  if (!usage.trialClaimed && !usage.verified)
    return (
      <p className="text-sm text-muted">
        Confirm your email to start your free trial: analysis, a tailored CV, a cover letter and interview practice for one job.{" "}
        <Link href="/app/settings" className="font-medium text-accent hover:underline">
          Resend the link
        </Link>
      </p>
    );
  if (!usage.trialClaimed)
    return (
      <p className="text-sm text-muted">
        Your free trial hasn’t started. Open any saved job and run its analysis, tailored CV, cover letter or interview practice. Everything for that one job is
        free.{" "}
        <Link href="/app/jobs" className="font-medium text-accent hover:underline">
          Choose a job
        </Link>
      </p>
    );
  return (
    <div className="space-y-4">
      <p className="text-sm text-muted">
        {usage.trialJob ? (
          <>
            Free trial on{" "}
            <Link href={`/app/jobs/${usage.trialJob.id}`} className="font-medium text-foreground hover:underline">
              {usage.trialJob.title}
              {usage.trialJob.company ? ` at ${usage.trialJob.company}` : ""}
            </Link>
            . Other jobs need a paid plan.
          </>
        ) : (
          "Your free trial has been used. A paid plan unlocks every job."
        )}
      </p>
      {usage.trialJob && <Meters usage={usage} period="in your free trial" />}
    </div>
  );
}

function Meters({ usage, period }: { usage: PlanUsage; period: string }) {
  return (
    <div className="grid gap-x-8 gap-y-4 sm:grid-cols-2 lg:grid-cols-4">
      <UsageMeter label="Tailoring runs" used={usage.used.tailor} max={usage.limits.tailor} period={period} />
      <UsageMeter label="Cover letter drafts" used={usage.used.cover} max={usage.limits.cover} period={period} />
      <UsageMeter label="Answer feedback" used={usage.used.interview} max={usage.limits.interview} period={period} />
      <UsageMeter label="Mock interviews" used={usage.used.mock} max={usage.limits.mock} period={period} />
    </div>
  );
}

export default async function BillingPage({ searchParams }: PageProps<"/app/billing">) {
  const user = await requireUser();
  const { for: reason } = await searchParams;
  const now = new Date();

  // A purchase made before the account's email was confirmed attaches itself now that it can be trusted.
  await claimByEmail(user);
  const [rows, payments, usage] = await Promise.all([subscriptionsForUser(user.id), paymentsForUser(user.id), planUsage(user, now)]);
  const current = primary(rows, now);
  const paid = isPaid(user, now);
  const configured = billingConfigured();
  const labels = priceLabels();
  const saving = yearlySaving(labels.monthly, labels.yearly);

  const blocked = current && ["active", "past_due", "suspended"].includes(current.status);
  const waiting = current?.status === "pending";
  const disabledReason = !configured
    ? "Subscriptions aren't available yet."
    : blocked
      ? "You already have a subscription. Manage it above instead of buying another."
      : waiting
        ? "A checkout is already open for your account. Finish it, or wait a few minutes."
        : null;

  const plans: PlanChoice[] = [
    { interval: "monthly", title: "Monthly", price: labels.monthly, note: "Billed every month. Cancel any time." },
    { interval: "yearly", title: "Yearly", price: labels.yearly, note: "Billed once a year. Cancel any time.", badge: saving ? `Save ${saving}%` : null, recommended: true },
  ];

  const summary: Array<[string, string]> = [];
  if (current && ["active", "past_due", "cancelled", "suspended", "expired"].includes(current.status)) summary.push(["Billing", current.row.interval === "yearly" ? "Yearly subscription" : "Monthly subscription"]);
  if (current?.status === "active") summary.push(["Next payment", date(current.row.nextPaymentAt ?? current.row.paidThrough) ?? "To be confirmed"]);
  if (current?.status === "past_due") summary.push(["Paid features until", date(current.until) ?? "To be confirmed"]);
  if (current?.status === "cancelled") summary.push(["Access until", date(current.row.paidThrough) ?? "To be confirmed"]);
  if (current?.status === "expired") summary.push(["Ended on", date(current.row.paidThrough) ?? "To be confirmed"]);
  const canCancel = !!current && !!current.row.freemiusSubscriptionId && ["active", "past_due"].includes(current.status) && !current.row.cancelRequestedAt;

  return (
    <div className="max-w-3xl space-y-12">
      <PageHeader title="Plan and billing" description="Your plan, what you have used, and your payments." />

      {(reason === "docx" && !paid) || (configured && billingMode() === "sandbox") ? (
        <div className="space-y-3">
          {reason === "docx" && !paid && <Notice title="Word downloads are part of the paid plan">You can still download your CV as a PDF on the free plan.</Notice>}
          {configured && billingMode() === "sandbox" && <Notice title="Test checkout">Checkout is in sandbox mode. No real payment will be taken.</Notice>}
        </div>
      ) : null}

      {/* Where you are now: the plan, its dates, and how to end it. */}
      <section aria-labelledby="your-plan" className="rounded-md border border-border bg-surface">
        <div className="flex flex-wrap items-start justify-between gap-3 p-5">
          <div>
            <h2 id="your-plan" className="text-[13px] font-medium text-muted">
              Current plan
            </h2>
            <p className="mt-1 text-xl font-semibold tracking-[-0.015em]" data-testid="current-plan">
              {paid ? "Paid" : "Free"}
            </p>
          </div>
          {current && <Badge tone={TONE[current.status]}>{LABEL[current.status]}</Badge>}
        </div>

        {summary.length > 0 && (
          <dl className="divide-y divide-border border-t border-border text-sm">
            {summary.map(([label, value]) => (
              <div key={label} className="flex flex-wrap justify-between gap-x-6 gap-y-1 px-5 py-3">
                <dt className="text-muted">{label}</dt>
                <dd className="font-medium tabular-nums">{value}</dd>
              </div>
            ))}
          </dl>
        )}

        {(current || waiting) && (
          <div className="space-y-3 border-t border-border p-5 text-sm text-muted">
            {current?.status === "active" && <p>Renews automatically until you cancel.</p>}
            {current?.status === "past_due" && (
              <p>We couldn’t take your last payment, and it’s being retried. Update your card using the link in the email Freemius sent you.</p>
            )}
            {current?.status === "cancelled" && <p>Cancelled, so it won’t renew. You keep paid features until the date above.</p>}
            {current?.status === "suspended" && <p>This subscription was suspended because a payment couldn’t be completed. Contact support if this looks wrong.</p>}
            {current?.status === "expired" && <p>Your last subscription has ended. You can subscribe again below.</p>}
            {waiting && (
              <div className="flex flex-wrap items-center gap-3">
                <p>Waiting for your payment to be confirmed. If you’ve paid, this updates within a minute or two.</p>
                <CheckAgain />
              </div>
            )}
            {current?.row.cancelRequestedAt && !current.row.cancelledAt && current.status !== "expired" && (
              <p>Cancellation requested. We’re waiting for the payment provider to confirm it.</p>
            )}
          </div>
        )}

        {current && canCancel && (
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-border px-5 py-3">
            <p className="text-[13px] text-muted">Cancel any time and keep paid features until {date(current.row.paidThrough) ?? "the end of the period you’ve paid for"}.</p>
            <CancelSubscription subscriptionId={current.row.id} paidThrough={date(current.row.paidThrough)} />
          </div>
        )}
      </section>

      {/* What has been used. */}
      <section aria-labelledby="usage" className="space-y-4">
        <div>
          <h2 id="usage" className="t-title">
            Usage
          </h2>
          <p className="mt-1.5 text-sm text-muted">{usage.plan === "free" ? "Your free trial covers one job." : "Allowances renew every month."}</p>
        </div>
        <div className="rounded-md border border-border bg-surface p-5">{usage.plan === "free" ? <TrialStatus usage={usage} /> : <Meters usage={usage} period="this month" />}</div>
      </section>

      {/* The offer. */}
      <section aria-labelledby="plans" className="space-y-4">
        <div>
          <h2 id="plans" className="t-title">
            {paid ? "Change or renew" : "Upgrade to a paid plan"}
          </h2>
          <p className="mt-1.5 max-w-2xl text-sm text-muted">
            {paid
              ? "Choose monthly or yearly when your current subscription ends."
              : "Everything from your free trial, for every job you apply to: a CV rebuilt for each role, a cover letter, interview practice and Word downloads."}
          </p>
        </div>
        <SubscribePlans plans={plans} disabledReason={disabledReason} />
      </section>

      {/* Free and paid, side by side. */}
      <section aria-labelledby="compare" className="space-y-4">
        <h2 id="compare" className="t-title">
          Free and paid
        </h2>

        {/* Phones: one row per feature, both plans underneath. */}
        <ul className="divide-y divide-border rounded-md border border-border bg-surface sm:hidden">
          {PLAN_FEATURES.map((f) => (
            <li key={f.feature} className="space-y-2 px-4 py-3 text-sm">
              <p className="font-medium">{f.feature}</p>
              <dl className="grid grid-cols-[3.5rem_1fr] gap-x-3 gap-y-1 text-[13px]">
                <dt className="text-muted">Free</dt>
                <dd>
                  <Cell value={f.free} />
                </dd>
                <dt className="text-muted">Paid</dt>
                <dd>
                  <Cell value={f.paid} emphasis />
                </dd>
              </dl>
            </li>
          ))}
        </ul>

        {/* Wider screens: a table. */}
        <div className="hidden overflow-hidden rounded-md border border-border bg-surface sm:block">
          <table className="w-full text-sm">
            <caption className="sr-only">What the free and paid plans include</caption>
            <thead className="border-b border-border text-left">
              <tr>
                <th scope="col" className="w-[44%] px-4 py-3 text-[13px] font-medium text-muted">
                  Feature
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Free
                </th>
                <th scope="col" className="px-4 py-3 font-medium">
                  Paid
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {PLAN_FEATURES.map((f) => (
                <tr key={f.feature}>
                  <th scope="row" className="px-4 py-3 text-left font-normal text-muted">
                    {f.feature}
                  </th>
                  <td className="px-4 py-3">
                    <Cell value={f.free} />
                  </td>
                  <td className="px-4 py-3">
                    <Cell value={f.paid} emphasis />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="text-[13px] text-muted">
          Payments are handled by Freemius. Cancel whenever you like and keep paid features until the period you’ve paid for ends. See the{" "}
          <Link href="/refund" className="text-accent underline underline-offset-4 hover:text-accent-hover">
            refund policy
          </Link>
          .
        </p>
      </section>

      <section aria-labelledby="history" className="space-y-4">
        <h2 id="history" className="t-title">
          Payment history
        </h2>
        {payments.length === 0 ? (
          <p className="rounded-md border border-dashed border-strong-border px-5 py-6 text-sm text-muted">No payments yet. They appear here once you subscribe.</p>
        ) : (
          <div className="overflow-x-auto rounded-md border border-border bg-surface">
            <table className="w-full min-w-[28rem] text-sm">
              <caption className="sr-only">Your payments, newest first</caption>
              <thead className="border-b border-border text-left text-[13px] text-muted">
                <tr>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Date
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Provider
                  </th>
                  <th scope="col" className="px-4 py-2.5 text-right font-medium">
                    Amount
                  </th>
                  <th scope="col" className="px-4 py-2.5 font-medium">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {payments.map((p) => (
                  <tr key={p.id}>
                    <td className="px-4 py-2.5 tabular-nums">{date(p.createdAt)}</td>
                    <td className="px-4 py-2.5 text-muted">Freemius</td>
                    <td className="px-4 py-2.5 text-right tabular-nums">{formatMoney(p.amountMinor, p.currency)}</td>
                    <td className="px-4 py-2.5">
                      <Badge tone={PAYMENT_TONE[p.status] ?? "neutral"}>{p.status.charAt(0).toUpperCase() + p.status.slice(1)}</Badge>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
