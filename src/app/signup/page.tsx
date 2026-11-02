import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { GoogleSignIn } from "@/components/google-sign-in";
import { getCurrentUser } from "@/lib/auth/session";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = privateMetadata("Create an account");

export default async function SignupPage({ searchParams }: PageProps<"/signup">) {
  if (await getCurrentUser()) redirect("/app");
  const { error } = await searchParams;
  return (
    <AuthShell title="Create your account" subtitle="Free for your first job. No card needed.">
      <GoogleSignIn error={typeof error === "string" ? error : undefined} />
    </AuthShell>
  );
}
