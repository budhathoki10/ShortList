import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthShell } from "@/components/auth-shell";
import { LoginForm } from "@/components/auth-forms";
import { getCurrentUser } from "@/lib/auth/session";
import { privateMetadata } from "@/lib/seo";

export const metadata: Metadata = privateMetadata("Log in");

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  if (await getCurrentUser()) redirect("/app");
  const { next } = await searchParams;
  return (
    <AuthShell title="Log in">
      <LoginForm next={typeof next === "string" ? next : undefined} />
    </AuthShell>
  );
}
