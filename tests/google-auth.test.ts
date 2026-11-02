import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { exchangeGoogleCode, GoogleAuthError, googleAuthorizeUrl, pkceChallenge, readIdToken } from "@/lib/auth/google";
import { readOAuthCookie } from "@/lib/auth/oauth-cookie";

const NOW = Date.UTC(2026, 10, 1, 12, 0, 0);
const jwt = (claims: Record<string, unknown>) => `e30.${Buffer.from(JSON.stringify(claims)).toString("base64url")}.sig`;
const good = { iss: "https://accounts.google.com", aud: "client-123", exp: NOW / 1000 + 600, nonce: "n-1", sub: "1098", email: "Asha.Gurung@Example.com", email_verified: true, name: "Asha Gurung" };
const reason = (fn: () => unknown) => {
  try {
    fn();
  } catch (err) {
    return err instanceof GoogleAuthError ? err.reason : "other";
  }
  return "none";
};

beforeEach(() => {
  vi.stubEnv("GOOGLE_CLIENT_ID", "client-123");
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "secret-456");
  vi.stubEnv("APP_URL", "https://shortlist.test");
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

describe("reading Google's ID token", () => {
  it("returns who signed in, with the email lower-cased", () => {
    expect(readIdToken(jwt(good), "n-1", NOW)).toEqual({ sub: "1098", email: "asha.gurung@example.com", name: "Asha Gurung" });
  });

  it("falls back to the start of the email when Google sends no name", () => {
    expect(readIdToken(jwt({ ...good, name: undefined }), "n-1", NOW).name).toBe("asha.gurung");
  });

  it("accepts either issuer spelling, an audience list and the string form of email_verified", () => {
    expect(readIdToken(jwt({ ...good, iss: "accounts.google.com", aud: ["other", "client-123"], email_verified: "true" }), "n-1", NOW).sub).toBe("1098");
  });

  it("refuses a token meant for another app, another issuer, an old one, or another sign-in", () => {
    expect(reason(() => readIdToken(jwt({ ...good, aud: "someone-elses-client" }), "n-1", NOW))).toBe("failed");
    expect(reason(() => readIdToken(jwt({ ...good, iss: "https://evil.example" }), "n-1", NOW))).toBe("failed");
    expect(reason(() => readIdToken(jwt({ ...good, exp: NOW / 1000 - 1 }), "n-1", NOW))).toBe("failed");
    expect(reason(() => readIdToken(jwt(good), "a-different-nonce", NOW))).toBe("failed");
    expect(reason(() => readIdToken(jwt({ ...good, nonce: undefined }), "", NOW))).toBe("failed");
  });

  it("refuses tokens with no account details or that aren't tokens at all", () => {
    expect(reason(() => readIdToken(jwt({ ...good, sub: "" }), "n-1", NOW))).toBe("failed");
    expect(reason(() => readIdToken(jwt({ ...good, email: undefined }), "n-1", NOW))).toBe("failed");
    expect(reason(() => readIdToken("not-a-token", "n-1", NOW))).toBe("failed");
    expect(reason(() => readIdToken("a.!!!.c", "n-1", NOW))).toBe("failed");
  });

  it("refuses an email Google hasn't verified, so nobody can claim an address they don't own", () => {
    expect(reason(() => readIdToken(jwt({ ...good, email_verified: false }), "n-1", NOW))).toBe("unverified");
    expect(reason(() => readIdToken(jwt({ ...good, email_verified: undefined }), "n-1", NOW))).toBe("unverified");
    expect(reason(() => readIdToken(jwt({ ...good, email_verified: "false" }), "n-1", NOW))).toBe("unverified");
  });
});

describe("the sign-in request", () => {
  it("computes the PKCE challenge the way RFC 7636 does", () => {
    expect(pkceChallenge("dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk")).toBe("E9Melhoa2OwvFrEMTJguCHaoeK1t8URWbuGJSstw-cM");
  });

  it("asks only for the profile and email, with state, nonce and PKCE", () => {
    const url = new URL(googleAuthorizeUrl({ state: "s-1", nonce: "n-1", verifier: "v-1" }));
    expect(url.origin + url.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(Object.fromEntries(url.searchParams)).toMatchObject({
      client_id: "client-123",
      redirect_uri: "https://shortlist.test/api/auth/google/callback",
      response_type: "code",
      scope: "openid email profile",
      state: "s-1",
      nonce: "n-1",
      code_challenge: pkceChallenge("v-1"),
      code_challenge_method: "S256",
    });
  });

  it("sends the code, secret and verifier to Google's token endpoint and returns the ID token", async () => {
    const fetchMock = vi.fn(async () => Response.json({ id_token: "the.id.token", access_token: "unused" }));
    vi.stubGlobal("fetch", fetchMock);
    expect(await exchangeGoogleCode("code-1", "verifier-1")).toBe("the.id.token");
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe("https://oauth2.googleapis.com/token");
    expect(Object.fromEntries(init.body as URLSearchParams)).toMatchObject({ code: "code-1", client_secret: "secret-456", code_verifier: "verifier-1", grant_type: "authorization_code" });
  });

  it("fails cleanly when Google refuses the code or can't be reached", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ error: "invalid_grant" }, { status: 400 })));
    await expect(exchangeGoogleCode("bad", "v")).rejects.toMatchObject({ reason: "failed" });
    vi.stubGlobal("fetch", vi.fn(async () => { throw new TypeError("network down"); }));
    await expect(exchangeGoogleCode("code", "v")).rejects.toMatchObject({ reason: "failed" });
  });
});

describe("the sign-in cookie", () => {
  const cookie = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");

  it("reads back what the first step stored", () => {
    const attempt = { state: "s", nonce: "n", verifier: "v", next: "/app/jobs" };
    expect(readOAuthCookie(cookie(attempt))).toEqual(attempt);
  });

  it("rejects a missing, malformed or incomplete cookie", () => {
    expect(readOAuthCookie(undefined)).toBeNull();
    expect(readOAuthCookie("%%%")).toBeNull();
    expect(readOAuthCookie(cookie({ state: "s" }))).toBeNull();
    expect(readOAuthCookie(cookie({ state: 1, nonce: "n", verifier: "v", next: "/app" }))).toBeNull();
    expect(readOAuthCookie(cookie({ state: "s", nonce: "n", verifier: "v", next: "x".repeat(601) }))).toBeNull();
  });
});
