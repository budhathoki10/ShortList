/** The short-lived cookie that carries a Google sign-in from the first redirect to the callback. */
export const OAUTH_COOKIE = "pc_oauth";
export const OAUTH_COOKIE_PATH = "/api/auth/google";
export const OAUTH_TTL_SECONDS = 10 * 60;

export type OAuthAttempt = { state: string; nonce: string; verifier: string; next: string };

/** The attempt stored in the cookie, or null if it is missing or has been tampered with into something else. */
export function readOAuthCookie(value: string | undefined): OAuthAttempt | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as Record<string, unknown>;
    const { state, nonce, verifier, next } = parsed;
    if ([state, nonce, verifier, next].every((v) => typeof v === "string" && v.length > 0 && v.length <= 600)) return { state, nonce, verifier, next } as OAuthAttempt;
  } catch {
    // fall through
  }
  return null;
}
