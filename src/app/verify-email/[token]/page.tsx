import type { Metadata } from "next";
import { privateMetadata } from "@/lib/seo";
import { confirmEmail } from "@/app/actions/auth";
import { AuthShell } from "@/components/auth-shell";
import { SubmitButton } from "@/components/submit-button";
import { ButtonLink } from "@/components/ui";
import { isTokenValid } from "@/lib/auth/tokens";

export const metadata: Metadata = privateMetadata("Confirm your email");

/**
 * The link in the email only opens this page. The token is used up by pressing the button, which is a POST:
 * mail scanners and link previewers fetch links with GET, and would otherwise burn the token before the person
 * ever clicked it.
 */
export default async function VerifyEmailPage({ params }: PageProps<"/verify-email/[token]">) {
  const { token } = await params;
  if (!(await isTokenValid(token, "verify_email"))) {
    return (
      <AuthShell title="This link has expired" subtitle="Confirmation links work once and last three days. You can send a fresh one from inside Shortlist Job Radar.">
        <ButtonLink href="/app">Go to Shortlist Job Radar</ButtonLink>
      </AuthShell>
    );
  }
  return (
    <AuthShell title="Confirm your email" subtitle="One tap and your address is confirmed, so we can send you receipts and password resets.">
      <form action={confirmEmail}>
        <input type="hidden" name="token" value={token} />
        <SubmitButton pendingLabel="Confirming…" className="w-full">
          Confirm my email
        </SubmitButton>
      </form>
    </AuthShell>
  );
}
