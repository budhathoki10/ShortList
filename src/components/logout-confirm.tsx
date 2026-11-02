"use client";

import { useEffect, useId, useRef } from "react";
import { logout } from "@/app/actions/auth";
import { SubmitButton } from "./submit-button";
import { Button } from "./ui";

export const OPEN_LOGOUT_CONFIRM = "shortlist:confirm-logout";

/** One confirmation surface for every sign-out entry point. */
export function LogoutConfirm() {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const open = () => {
      if (!ref.current?.open) ref.current?.showModal();
    };
    window.addEventListener(OPEN_LOGOUT_CONFIRM, open);
    return () => window.removeEventListener(OPEN_LOGOUT_CONFIRM, open);
  }, []);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className="m-auto w-[min(26rem,calc(100vw-2rem))] rounded-xl p-6 shadow-xl shadow-black/10"
      onClick={(event) => event.target === ref.current && ref.current?.close()}
    >
      <form action={logout}>
        <h2 id={titleId} className="t-title">
          Log out?
        </h2>
        <p className="mt-2 text-sm text-muted">You’ll need to sign in with Google to return to your job hunt.</p>
        <div className="mt-6 flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={() => ref.current?.close()}>
            Cancel
          </Button>
          <SubmitButton variant="danger" pendingLabel="Logging out…">
            Log out now
          </SubmitButton>
        </div>
      </form>
    </dialog>
  );
}
