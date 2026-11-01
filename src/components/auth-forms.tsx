"use client";

import { useActionState, useEffect, useRef, useState, type FormEvent } from "react";
import { deleteAccount, type AuthState } from "@/app/actions/auth";
import { useToast } from "./toast";
import { Field, FormMessage, inputClass } from "./ui";
import { FormSubmit } from "./form-submit";
import { keepInputOnSubmit } from "./use-keep-input";

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
    toastId.current = toast.show({ key: "auth-error", tone: "error", message: state.title ?? "That didn't work", description: state.error });
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

export function DeleteAccountForm({ email }: { email: string }) {
  const { state, pending, form } = useAuthFeedback(deleteAccount);
  return (
    <form method="post" {...form} className="space-y-4">
      <p className="text-sm text-muted">
        Permanently deletes your account, CV, saved jobs, application documents and interview notes. Download a copy of anything you want to keep before continuing.
      </p>
      <Field label="Type your email address to confirm" hint={email} error={state?.fields?.confirm}>
        <input name="confirm" type="email" required maxLength={254} autoComplete="off" spellCheck={false} className={`${inputClass} max-w-xs`} />
      </Field>
      <FormMessage success={state?.success} successTitle={state?.title} />
      <FormSubmit variant="danger" loading={pending}>
        {pending ? "Deleting…" : "Delete my account"}
      </FormSubmit>
    </form>
  );
}
