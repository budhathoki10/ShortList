import type { Metadata } from "next";
import { privateMetadata } from "@/lib/seo";
import { AuthShell } from "@/components/auth-shell";
import { ResetPasswordForm } from "@/components/auth-forms";
import { ButtonLink } from "@/components/ui";
import { isTokenValid } from "@/lib/auth/tokens";

export const metadata: Metadata = privateMetadata("Choose a new password");

export default async function ResetPasswordPage({ params }: PageProps<"/reset-password/[token]">) {
  const { token } = await params;
  if (await isTokenValid(token, "reset_password")) {
    return (
      <AuthShell title="Choose a new password">
        <ResetPasswordForm token={token} />
      </AuthShell>
    );
  }
  return (
    <AuthShell title="This link has expired" subtitle="Reset links work once and only for an hour.">
      <ButtonLink href="/forgot-password">Send me a new one</ButtonLink>
    </AuthShell>
  );
}
