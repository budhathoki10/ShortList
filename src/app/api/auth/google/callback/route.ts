import { timingSafeEqual } from "node:crypto";
import { NextResponse, type NextRequest } from "next/server";
import { createSession } from "@/lib/auth/session";
import { exchangeGoogleCode, GoogleAuthError, googleConfigured, readIdToken } from "@/lib/auth/google";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, readOAuthCookie } from "@/lib/auth/oauth-cookie";
import { ipLimit } from "@/lib/services/rate-limit";
import { createGoogleUser, findUserForGoogle } from "@/lib/services/users";
import { appUrl, safeRedirectPath } from "@/lib/util";

const sameValue = (a: string, b: string) => a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));

/** Always clears the one-time cookie, whatever happened, so a sign-in attempt can't be replayed. */
function finish(destination: string) {
  const response = NextResponse.redirect(appUrl(destination));
  response.cookies.set(OAUTH_COOKIE, "", { path: OAUTH_COOKIE_PATH, maxAge: 0 });
  return response;
}

/**
 * Step 2 of "Continue with Google": check the state, swap the code for the ID token, find or create the account and
 * start a session. Every failure goes back to the login page with a reason, never to a blank error.
 */
export async function GET(request: NextRequest) {
  const fail = (reason: string) => finish(`/login?error=${reason}`);
  const params = request.nextUrl.searchParams;
  if (!googleConfigured()) return fail("not-configured");
  if (params.get("error")) return fail(params.get("error") === "access_denied" ? "denied" : "failed");

  const attempt = readOAuthCookie(request.cookies.get(OAUTH_COOKIE)?.value);
  const state = params.get("state") ?? "";
  const code = params.get("code") ?? "";
  // Without our own cookie, or with a state that isn't the one we issued, this sign-in wasn't started here.
  if (!attempt || !state || !code || !sameValue(state, attempt.state)) return fail("expired");
  if (await ipLimit("google-callback", request.headers, 30, 15 * 60_000)) return fail("busy");

  try {
    const identity = readIdToken(await exchangeGoogleCode(code, attempt.verifier), attempt.nonce);
    let user = await findUserForGoogle(identity);
    if (user === "conflict") return fail("conflict");
    let created = false;
    if (!user) {
      // Making accounts is limited per address, so one machine can't farm free trials.
      if (await ipLimit("signup", request.headers, 10, 60 * 60_000)) return fail("busy");
      user = (await createGoogleUser(identity)) ?? (await findUserForGoogle(identity));
      if (!user || user === "conflict") return fail("failed");
      created = true;
    }
    await createSession(user.id);
    return finish(created ? "/app/profile?welcome=1" : safeRedirectPath(attempt.next, "/app"));
  } catch (err) {
    if (err instanceof GoogleAuthError) {
      if (err.reason === "failed") console.error("Google sign-in failed:", err.message);
      return fail(err.reason === "unverified" ? "unverified" : "failed");
    }
    console.error("Google sign-in failed:", err);
    return fail("failed");
  }
}
