import { NextResponse, type NextRequest } from "next/server";
import { googleAuthorizeUrl, googleConfigured, randomValue } from "@/lib/auth/google";
import { OAUTH_COOKIE, OAUTH_COOKIE_PATH, OAUTH_TTL_SECONDS } from "@/lib/auth/oauth-cookie";
import { ipLimit } from "@/lib/services/rate-limit";
import { appUrl, safeRedirectPath } from "@/lib/util";

const back = (error: string) => NextResponse.redirect(appUrl(`/login?error=${error}`));

/**
 * Step 1 of "Continue with Google": remember a one-time state, nonce and PKCE verifier in a short-lived cookie,
 * then send the browser to Google. It is a plain link (GET), so the page's `form-action 'self'` rule doesn't apply.
 */
export async function GET(request: NextRequest) {
  if (!googleConfigured()) return back("not-configured");
  if (await ipLimit("google-start", request.headers, 30, 15 * 60_000)) return back("busy");

  const state = randomValue(16);
  const nonce = randomValue(16);
  const verifier = randomValue(32);
  const next = safeRedirectPath(request.nextUrl.searchParams.get("next"), "/app");

  const response = NextResponse.redirect(googleAuthorizeUrl({ state, nonce, verifier }));
  response.cookies.set(OAUTH_COOKIE, Buffer.from(JSON.stringify({ state, nonce, verifier, next })).toString("base64url"), {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    // Lax, not strict: Google sends the browser back with a top-level GET from another site, and strict would drop the cookie.
    sameSite: "lax",
    path: OAUTH_COOKIE_PATH,
    maxAge: OAUTH_TTL_SECONDS,
  });
  return response;
}
