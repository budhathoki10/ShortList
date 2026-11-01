"use client";

import Link from "next/link";
import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { deleteAccount, login, requestPasswordReset, resendVerification, resetPassword, signup, type AuthState } from "@/app/actions/auth";
import { ActionToast, useToast } from "./toast";
import { Field, FormMessage, inputClass } from "./ui";
import { FormSubmit } from "./form-submit";
import { keepInputOnSubmit } from "./use-keep-input";

const link = "font-medium text-accent hover:underline max-sm:inline-flex max-sm:min-h-11 max-sm:items-center";

function useAuthFeedback(serverAction: (state: AuthState, data: FormData) => Promise<AuthState>) {
  const [result, action, pending] = useActionState(serverAction, undefined);
  const [edited, setEdited] = useState(false);
  const ref = useRef<HTMLFormElement>(null);
  const state = edited || pending ? undefined : result;
  const toast = useToast();
  const shownFor = useRef<AuthState>(undefined);
  const toastId = useRef<number | null>(null);
  useEffect(() => {
    if (state?.fields) ref.current?.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus();
  }, [state]);
  // A problem with the whole form is a toast. Problems with one field are shown under that field instead.
  useEffect(() => {
    if (!state?.error || state.fields || shownFor.current === result) return;
    shownFor.current = result;
    const credentials = state.title === "Unable to log in";
    toastId.current = toast.show({
      key: "auth-error",
      tone: "error",
      message: state.title ?? "That didn't work",
      description: credentials ? "Incorrect email or password." : state.error,
      action: state.recovery ? { label: state.recovery.label, href: state.recovery.href } : undefined,
    });
  }, [state, result, toast]);
  const dismissError = () => {
    if (toastId.current !== null) toast.dismiss(toastId.current);
    toastId.current = null;
  };
  return {
    state,
    pending,
    form: {
      ref,
      onChange: () => {
        setEdited(true);
        dismissError();
      },
      onSubmit: (event: FormEvent<HTMLFormElement>) => {
        setEdited(false);
        keepInputOnSubmit(action)(event);
      },
    },
  };
}

/** Confirmations that you may need to act on later (a link was sent) stay in the page. Errors are toasts (see above). */
function AuthMessage({ state }: { state: AuthState }) {
  if (!state?.success) return null;
  return <FormMessage success={state.success} successTitle={state.title} action={state.recovery} />;
}

export function SignupForm() {
  const { state, pending, form } = useAuthFeedback(signup);
  return (
    <form method="post" {...form} className="space-y-5">
      <Field label="Your name" error={state?.fields?.name}>
        <input name="name" required autoFocus maxLength={80} autoComplete="name" className={inputClass} />
      </Field>
      <Field label="Email" error={state?.fields?.email}>
        <input name="email" type="email" required maxLength={254} autoComplete="email" className={inputClass} />
      </Field>
      <Field label="Password" hint="At least 8 characters." error={state?.fields?.password}>
        <input name="password" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className={inputClass} />
      </Field>
      <label className="flex items-start gap-2.5 text-sm max-sm:min-h-11">
        <input name="terms" type="checkbox" required aria-invalid={!!state?.fields?.terms || undefined} aria-describedby={state?.fields?.terms ? "signup-terms-error" : undefined} className="mt-0.5 size-4 accent-[var(--accent)]" />
        <span>
          I agree to the{" "}
          <Link href="/terms" target="_blank" className={link}>
            Terms
          </Link>{" "}
          and{" "}
          <Link href="/privacy" target="_blank" className={link}>
            Privacy Policy
          </Link>
          .
        </span>
      </label>
      {state?.fields?.terms && <p id="signup-terms-error" className="text-xs text-danger">{state.fields.terms}</p>}
      <AuthMessage state={state} />
      <FormSubmit loading={pending} className="w-full">
        {pending ? "Creating your account…" : "Create account"}
      </FormSubmit>
      <p className="text-sm text-muted">
        Already have an account?{" "}
        <Link href="/login" className={link}>
          Log in
        </Link>
      </p>
    </form>
  );
}

export function LoginForm({ next }: { next?: string }) {
  const { state, pending, form } = useAuthFeedback(login);
  return (
    <form method="post" {...form}>
      <input type="hidden" name="next" value={next ?? "/app"} />
      <div className="space-y-5">
      <Field label="Email" error={state?.fields?.email} invalid={state?.title === "Unable to log in"}>
        <input name="email" type="email" required autoFocus maxLength={254} autoComplete="email" className={inputClass} />
      </Field>
      <Field label="Password" error={state?.fields?.password} invalid={state?.title === "Unable to log in"}>
        <input name="password" type="password" required maxLength={200} autoComplete="current-password" className={inputClass} />
      </Field>
      </div>
      <AuthMessage state={state} />
      <FormSubmit loading={pending} className="mt-6 w-full">
        {pending ? "Logging in…" : "Log in"}
      </FormSubmit>
      <div className="mt-5 flex flex-wrap justify-between gap-x-4 gap-y-2 text-sm">
        <Link href="/forgot-password" className={link}>
          Forgot password?
        </Link>
        <Link href="/signup" className={link}>
          Create an account
        </Link>
      </div>
    </form>
  );
}

export function ForgotPasswordForm() {
  const { state, pending, form } = useAuthFeedback(requestPasswordReset);
  if (state?.success) return <AuthMessage state={state} />;
  return (
    <form method="post" {...form} className="space-y-5">
      <Field label="Email" error={state?.fields?.email}>
        <input name="email" type="email" required autoFocus maxLength={254} autoComplete="email" className={inputClass} />
      </Field>
      <AuthMessage state={state} />
      <FormSubmit loading={pending} className="w-full">
        {pending ? "Sending reset link…" : "Send reset link"}
      </FormSubmit>
      <p className="text-sm">
        <Link href="/login" className={link}>
          Back to log in
        </Link>
      </p>
    </form>
  );
}

export function ResetPasswordForm({ token }: { token: string }) {
  const { state, pending, form } = useAuthFeedback(resetPassword);
  return (
    <form method="post" {...form} className="space-y-5">
      <input type="hidden" name="token" value={token} />
      <Field label="New password" hint="At least 8 characters." error={state?.fields?.password}>
        <input name="password" type="password" required autoFocus minLength={8} maxLength={200} autoComplete="new-password" className={inputClass} />
      </Field>
      <Field label="Type it again" error={state?.fields?.confirm}>
        <input name="confirm" type="password" required minLength={8} maxLength={200} autoComplete="new-password" className={inputClass} />
      </Field>
      <AuthMessage state={state} />
      <FormSubmit loading={pending} className="w-full">
        {pending ? "Updating password…" : "Save new password"}
      </FormSubmit>
    </form>
  );
}

export function DeleteAccountForm() {
  const { state, pending, form } = useAuthFeedback(deleteAccount);
  return (
    <form method="post" {...form} className="space-y-4">
      <p className="text-sm text-muted">
        Permanently deletes your account, CV, saved jobs, application documents and interview notes. Download a copy of anything you want to keep before continuing.
      </p>
      <Field label="Confirm with your password" error={state?.fields?.password}>
        <input name="password" type="password" required maxLength={200} autoComplete="current-password" className={`${inputClass} max-w-xs`} />
      </Field>
      <AuthMessage state={state} />
      <FormSubmit variant="danger" loading={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </FormSubmit>
    </form>
  );
}

export function VerifyEmailBanner({ email }: { email: string }) {
  const [state, action, pending] = useActionState(resendVerification, undefined);
  return (
    <div className="mt-3">
      <p className="break-all text-sm text-muted">{email}</p>
      <p className="mt-1 text-sm text-muted">Verify this address for account recovery and email notifications.</p>
      <form action={action} className="mt-3 space-y-3 text-sm">
        <button type="submit" disabled={pending} className="inline-flex min-h-10 items-center rounded-md border border-strong-border px-3 font-medium hover:bg-surface-hover disabled:opacity-50">
          {pending ? "Sending verification email…" : "Send verification email"}
        </button>
        <ActionToast state={state} />
      </form>
    </div>
  );
}
