import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { SignupForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth/session";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = privateMetadata("Create an account");

export default async function SignupPage() {
  if (await getCurrentUser()) redirect("/app");
  return (
    <AuthShell title="Create an account" subtitle="The free plan needs no card.">
      <SignupForm />
    </AuthShell>
  );
}
