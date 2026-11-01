import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { GoogleSignIn } from "@/components/google-sign-in";
import { getCurrentUser } from "@/lib/auth/session";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = privateMetadata("Log in");

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/app");
  const { next, error } = await searchParams;
  return (
    <AuthShell title="Welcome back" subtitle="Log in with the Google account you signed up with.">
      <GoogleSignIn next={typeof next === "string" ? next : undefined} error={typeof error === "string" ? error : undefined} />
    </AuthShell>
  );
}
