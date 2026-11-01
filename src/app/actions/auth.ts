"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { z } from "zod";
import { hashPassword, verifyPassword } from "@/lib/auth/password";
import { createSession, destroySession, requireUser } from "@/lib/auth/session";
import { consumeAuthToken, revokeAuthTokens, tokensSentRecently } from "@/lib/auth/tokens";
import { deleteAllSessions, deleteUser, markEmailVerified, sendPasswordResetEmail, sendVerificationEmail } from "@/lib/services/account";
import { keyPart, limitReached, overLimit } from "@/lib/services/rate-limit";
import { createUser, findUserByEmail, setPasswordHash } from "@/lib/services/users";
import { clientIp, safeRedirectPath } from "@/lib/util";

export type AuthState = { error?: string; success?: string; title?: string; fields?: Record<string, string>; recovery?: { href: string; label: string } } | undefined;

const password = z.string().min(8, "Use at least 8 characters for your password.").max(200, "Use a password with 200 characters or fewer.");
const email = z.string().trim().toLowerCase().pipe(z.email("Enter a valid email address, such as name@example.com.").max(254, "Use an email address with 254 characters or fewer."));

const SignupSchema = z.object({
  name: z.string().trim().min(1, "Enter your name.").max(80, "Use 80 characters or fewer for your name."),
  email,
  password,
  terms: z.literal("on", "Agree to the Terms and Privacy Policy to create your account."),
});

const LoginSchema = z.object({
  email,
  password: z.string().min(1, "Enter your password.").max(200, "Use a password with 200 characters or fewer."),
});

const ResetSchema = z
  .object({ token: z.string().min(20).max(200), password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { message: "Enter the same password in both fields.", path: ["confirm"] });

function validationFeedback(issues: z.core.$ZodIssue[]): AuthState {
  const fields: Record<string, string> = {};
  for (const issue of issues) {
    const name = String(issue.path[0] ?? "");
    if (!fields[name]) fields[name] = issue.message;
  }
  return { title: "Check your details", error: "Review the highlighted fields and try again.", fields };
}

const MAX_RESETS_PER_HOUR = 3;
const VERIFY_RESEND_COOLDOWN_MS = 2 * 60 * 1000;
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const TOO_MANY = "Please wait a few minutes before trying again.";
/** Wrong passwords allowed per address in 15 minutes. */
const LOGIN_FAILURES = 10;

/**
 * A per-IP counter. With no address we can trust (see clientIp) there is nothing to count against, so it
 * does not limit: lumping everyone into one "unknown" bucket would lock all users out together.
 * Login also has a per-account limit (below) that doesn't depend on this.
 */
async function ipLimit(name: string, limit: number, windowMs: number): Promise<boolean> {
  const address = clientIp(await headers());
  return address ? overLimit(`${name}:ip:${keyPart(address)}`, limit, windowMs) : false;
}
export async function signup(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = SignupSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationFeedback(parsed.error.issues);
  if (await ipLimit("signup", 10, HOUR)) return { error: TOO_MANY };
  const { name, email, password } = parsed.data;

  // The unique email index decides, so two sign-ups at once can't both win.
  const user = await createUser({ name, email, passwordHash: await hashPassword(password) });
  if (!user) return { title: "This email is already registered", error: "Log in to your existing account, or reset your password if you need access." };
  await createSession(user.id);
  try {
    await sendVerificationEmail(user);
  } catch (err) {
    // Signing up should still work if the email provider is down; they can resend later.
    console.error("Verification email failed", err);
  }
  redirect("/app/profile?welcome=1");
}

export async function login(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = LoginSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationFeedback(parsed.error.issues);
  // Failed attempts are counted per address, whether or not the account exists, so guessing passwords is slow and
  // reveals nothing. Successful logins don't count, so someone who logs in often is never locked out.
  const failedKey = `login-failed:email:${keyPart(parsed.data.email)}`;
  if ((await limitReached(failedKey, LOGIN_FAILURES, 15 * MINUTE)) || (await ipLimit("login", 100, 15 * MINUTE))) {
    return { title: "Too many attempts", error: "Too many log-in attempts for this account. Wait 15 minutes, or reset your password.", recovery: { href: "/forgot-password", label: "Reset your password" } };
  }
  const user = await findUserByEmail(parsed.data.email);
  if (!user || !(await verifyPassword(parsed.data.password, user.passwordHash))) {
    await overLimit(failedKey, LOGIN_FAILURES, 15 * MINUTE);
    return { title: "Unable to log in", error: "The email and password don’t match. Check your details and try again." };
  }
  await createSession(user.id);
  redirect(safeRedirectPath(formData.get("next"), "/app"));
}

export async function logout() {
  await destroySession();
  redirect("/");
}

export async function deleteAccount(_: AuthState, formData: FormData): Promise<AuthState> {
  const user = await requireUser();
  if (await overLimit(`delete:${user.id}`, 5, 15 * MINUTE)) return { error: TOO_MANY };
  const given = String(formData.get("password") ?? "");
  if (!(await verifyPassword(given, user.passwordHash))) return { title: "Password not recognised", error: "Enter your current account password to confirm deletion.", fields: { password: "Check your current password and try again." } };

  // An active subscription is not cancelled for them here: it stops renewing only if they cancel it first on the billing page.
  await deleteUser(user.id);
  await destroySession();
  redirect("/?deleted=1");
}

export async function requestPasswordReset(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = email.safeParse(formData.get("email"));
  if (!parsed.success) return { title: "Check your email address", error: "Enter the email address you use for your Shortlist account.", fields: { email: "Enter a valid email address, such as name@example.com." } };
  if (await ipLimit("reset", 10, HOUR)) return { error: TOO_MANY };
  const user = await findUserByEmail(parsed.data);
  // Same answer whether or not the account exists, so this can't be used to find out who has an account.
  const done = { title: "Check your inbox", success: "If an account exists for that email, a password reset link will be sent. Check your spam folder if it doesn’t arrive.", recovery: { href: "/login", label: "Back to log in" } };
  if (!user || (await tokensSentRecently(user.id, "reset_password", HOUR)) >= MAX_RESETS_PER_HOUR) return done;
  try {
    await sendPasswordResetEmail(user);
  } catch (err) {
    console.error("Password reset email failed", err);
    return { title: "Email could not be sent", error: "Please try again in a few minutes." };
  }
  return done;
}

export async function resetPassword(_: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = ResetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return validationFeedback(parsed.error.issues);
  if (await ipLimit("reset-use", 20, HOUR)) return { error: TOO_MANY };
  const userId = await consumeAuthToken(parsed.data.token, "reset_password");
  if (!userId) return { title: "Request a new reset link", error: "This link has expired or has already been used.", recovery: { href: "/forgot-password", label: "Request a reset link" } };

  await setPasswordHash(userId, await hashPassword(parsed.data.password));
  await deleteAllSessions(userId);
  // Any other reset link sent before this one stops working too.
  await revokeAuthTokens(userId, "reset_password");
  // Opening the emailed link proves they own the address.
  await markEmailVerified(userId);
  await createSession(userId);
  redirect("/app?reset=1");
}

export async function resendVerification(_: AuthState): Promise<AuthState> {
  const user = await requireUser();
  if (user.emailVerifiedAt) return { success: "Your email is already confirmed." };
  if ((await tokensSentRecently(user.id, "verify_email", VERIFY_RESEND_COOLDOWN_MS)) > 0) {
    return { title: "Verification email recently sent", error: "Please wait two minutes before requesting another email. You can also check your spam folder." };
  }
  try {
    await sendVerificationEmail(user);
  } catch (err) {
    console.error("Verification email failed", err);
    return { title: "Email could not be sent", error: "Please try again in a few minutes." };
  }
  return { title: "Verification email sent", success: `Check ${user.email} for your verification link.` };
}

/** Uses up an email-confirmation token. Only reachable by a form POST from the confirmation page, so mail scanners can't burn it. */
export async function confirmEmail(formData: FormData) {
  const token = String(formData.get("token") ?? "").slice(0, 200);
  const userId = token ? await consumeAuthToken(token, "verify_email") : null;
  if (userId) await markEmailVerified(userId);
  redirect(`/app?verified=${userId ? 1 : 0}`);
}
