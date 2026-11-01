import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { appUrl } from "@/lib/util";

/**
 * Sign in with Google (OpenID Connect, authorization-code flow with PKCE).
 *
 * The browser is sent to Google with a one-time `state`, `nonce` and PKCE challenge. Google sends it back with a
 * `code`, which the server alone swaps for an ID token (using the client secret and the PKCE verifier). The token comes
 * straight from Google's token endpoint over TLS, so, as the OpenID spec allows, its claims are checked here rather
 * than its signature.
 */

const GOOGLE_AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const GOOGLE_TOKEN_URL = "https://oauth2.googleapis.com/token";
const ISSUERS = ["https://accounts.google.com", "accounts.google.com"];

/** Why a sign-in was refused. `unverified`: Google says the address isn't confirmed. `failed`: anything else. */
export class GoogleAuthError extends Error {
  constructor(readonly reason: "failed" | "unverified", message: string) {
    super(message);
  }
}

export type GoogleIdentity = { sub: string; email: string; name: string };

const clientId = () => process.env.GOOGLE_CLIENT_ID ?? "";
const clientSecret = () => process.env.GOOGLE_CLIENT_SECRET ?? "";

/** Whether Google sign-in is set up. Without it nobody can log in, so the login page says so instead of sending people to a broken button. */
export const googleConfigured = () => !!clientId() && !!clientSecret();

/** The address Google sends people back to. It must be listed under "Authorized redirect URIs" for the OAuth client. */
export const googleRedirectUri = () => appUrl("/api/auth/google/callback");

/** A random value for `state`, `nonce` or a PKCE verifier. */
export const randomValue = (bytes = 32) => randomBytes(bytes).toString("base64url");

export const pkceChallenge = (verifier: string) => createHash("sha256").update(verifier).digest("base64url");

export function googleAuthorizeUrl(input: { state: string; nonce: string; verifier: string }): string {
  const url = new URL(process.env.GOOGLE_AUTH_URL || GOOGLE_AUTH_URL);
  url.search = new URLSearchParams({
    client_id: clientId(),
    redirect_uri: googleRedirectUri(),
    response_type: "code",
    scope: "openid email profile",
    state: input.state,
    nonce: input.nonce,
    code_challenge: pkceChallenge(input.verifier),
    code_challenge_method: "S256",
    // Always show the account chooser, so someone on a shared computer isn't signed in as the last person without being asked.
    prompt: "select_account",
  }).toString();
  return url.toString();
}

/** Swap the one-time code for Google's ID token. */
export async function exchangeGoogleCode(code: string, verifier: string): Promise<string> {
  let res: Response;
  try {
    res = await fetch(process.env.GOOGLE_TOKEN_URL || GOOGLE_TOKEN_URL, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        code,
        client_id: clientId(),
        client_secret: clientSecret(),
        redirect_uri: googleRedirectUri(),
        grant_type: "authorization_code",
        code_verifier: verifier,
      }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch {
    throw new GoogleAuthError("failed", "Google did not answer");
  }
  const body = (await res.json().catch(() => null)) as { id_token?: unknown } | null;
  if (!res.ok || typeof body?.id_token !== "string") throw new GoogleAuthError("failed", `Google refused the code (${res.status})`);
  return body.id_token;
}

/** Check the ID token's claims and return who it says signed in. */
export function readIdToken(idToken: string, expectedNonce: string, now = Date.now()): GoogleIdentity {
  const parts = idToken.split(".");
  if (parts.length !== 3) throw new GoogleAuthError("failed", "Malformed ID token");
  let claims: Record<string, unknown>;
  try {
    claims = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
  } catch {
    throw new GoogleAuthError("failed", "Unreadable ID token");
  }
  if (!claims || typeof claims !== "object") throw new GoogleAuthError("failed", "Unreadable ID token");

  const audience = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!ISSUERS.includes(String(claims.iss))) throw new GoogleAuthError("failed", "ID token from the wrong issuer");
  if (!clientId() || !audience.includes(clientId())) throw new GoogleAuthError("failed", "ID token for a different app");
  if (typeof claims.exp !== "number" || claims.exp * 1000 <= now) throw new GoogleAuthError("failed", "ID token expired");
  if (!expectedNonce || claims.nonce !== expectedNonce) throw new GoogleAuthError("failed", "ID token nonce does not match");
  if (typeof claims.sub !== "string" || !claims.sub || typeof claims.email !== "string" || !claims.email) throw new GoogleAuthError("failed", "ID token has no account details");
  if (claims.email_verified !== true && claims.email_verified !== "true") throw new GoogleAuthError("unverified", "Google has not verified this email address");

  const email = claims.email.trim().toLowerCase();
  const name = (typeof claims.name === "string" ? claims.name : "").trim().slice(0, 80) || email.split("@")[0];
  return { sub: claims.sub, email, name };
}
