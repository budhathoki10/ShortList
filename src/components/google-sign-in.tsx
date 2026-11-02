import Link from "next/link";
import { GoogleButton } from "./google-button";
import { Notice } from "./ui";

const link = "font-medium text-foreground underline decoration-strong-border underline-offset-4 hover:decoration-foreground max-sm:-my-2 max-sm:py-2";

/** What each `?error=` reason from the Google callback means for the person, and what to do next. */
const PROBLEMS: Record<string, { title: string; message: string }> = {
  denied: { title: "Sign-in cancelled", message: "You closed the Google window before finishing. Try again when you’re ready." },
  expired: { title: "That sign-in timed out", message: "It took too long, or was started in another tab. Start again from here." },
  failed: { title: "We couldn’t sign you in", message: "Google didn’t complete the sign-in. Please try again in a moment." },
  unverified: { title: "Google hasn’t verified this email", message: "Verify the address in your Google account, then try again, or use a different Google account." },
  conflict: { title: "A different Google account is linked", message: "This email address belongs to an account that signs in with another Google identity. Use the Google account you used before." },
  busy: { title: "Too many attempts", message: "Please wait a few minutes and try again." },
  "not-configured": { title: "Google sign-in isn’t set up", message: "The site owner needs to add the Google client ID and secret before anyone can log in." },
};

/** The only way in: one button that starts Google sign-in, what we receive from Google, and the terms. */
export function GoogleSignIn({ next, error }: { next?: string; error?: string }) {
  const problem = error ? (PROBLEMS[error] ?? PROBLEMS.failed) : null;
  const href = next && next !== "/app" ? `/api/auth/google?next=${encodeURIComponent(next)}` : "/api/auth/google";
  return (
    <div className="space-y-5">
      {problem && (
        <Notice tone="error" title={problem.title}>
          {problem.message}
        </Notice>
      )}
      <GoogleButton href={href} />
      <p className="flex items-start justify-center gap-2 text-center text-[13px] leading-5 text-muted">
       
       
      </p>
      <p className="border-t border-border pt-5 text-center text-[13px] leading-5 text-muted">
        New here? Continuing creates your account. By continuing you agree to our{" "}
        <Link href="/terms" target="_blank" className={link}>
          Terms
        </Link>{" "}
        and{" "}
        <Link href="/privacy" target="_blank" className={link}>
          Privacy Policy
        </Link>
        .
      </p>
    </div>
  );
}
