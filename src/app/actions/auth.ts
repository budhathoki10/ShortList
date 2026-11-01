"use server";

import { redirect } from "next/navigation";
import { destroySession, requireUser } from "@/lib/auth/session";
import { deleteUser } from "@/lib/services/account";
import { overLimit } from "@/lib/services/rate-limit";

/** Sign-in itself is "Continue with Google": see src/app/api/auth/google. */
export type AuthState = { error?: string; success?: string; title?: string; fields?: Record<string, string> } | undefined;

const MINUTE = 60_000;
const TOO_MANY = "Please wait a few minutes before trying again.";

export async function logout() {
  await destroySession();
  redirect("/");
}

export async function deleteAccount(_: AuthState, formData: FormData): Promise<AuthState> {
  const user = await requireUser();
  if (await overLimit(`delete:${user.id}`, 5, 15 * MINUTE)) return { error: TOO_MANY };
  // Typing the address is the confirmation: there is no password to ask for, and it stops a stray click or an unattended tab.
  const typed = String(formData.get("confirm") ?? "").trim().toLowerCase();
  if (typed !== user.email.toLowerCase()) return { title: "Address doesn’t match", error: "Type your account’s email address exactly to confirm deletion.", fields: { confirm: "This doesn’t match your account’s email address." } };

  // An active subscription is not cancelled for them here: it stops renewing only if they cancel it first on the billing page.
  await deleteUser(user.id);
  await destroySession();
  redirect("/?deleted=1");
}
