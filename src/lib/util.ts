import { randomBytes } from "node:crypto";
import { isIP } from "node:net";

const ALPHABET = "abcdefghijkmnpqrstuvwxyz23456789";

/** Short, unguessable, URL-friendly id (e.g. for public report links). */
export function shortId(length = 10): string {
  const bytes = randomBytes(length);
  let out = "";
  for (const b of bytes) out += ALPHABET[b % ALPHABET.length];
  return out;
}

/**
 * The caller's IP address, or null when there is no address we can trust.
 *
 * `X-Forwarded-For` is a list that every proxy appends to, and the part a client sends itself sits at
 * the start, where it can say anything. The entries nearest the server were written by our own proxies,
 * so we count from the right: with one proxy in front (Vercel, a load balancer) the client is the last
 * entry; with two (a CDN in front of that) it is the second from last. TRUSTED_PROXY_HOPS says how many.
 * Set it to 0 when nothing sits in front of the app: the header is then ignored entirely.
 */
export function clientIp(headers: Headers, hops = Number(process.env.TRUSTED_PROXY_HOPS ?? 1)): string | null {
  if (!Number.isInteger(hops) || hops < 1) return null;
  const entries = (headers.get("x-forwarded-for") ?? "").split(",").map((p) => p.trim()).filter(Boolean);
  const candidate = entries.at(-hops);
  return candidate && isIP(candidate) ? candidate : null;
}

/**
 * A same-site path that is safe to redirect to, or `fallback`. Browsers read a backslash as a
 * slash, so "/\evil.com" would otherwise leave the site, as would "//evil.com" or a control character.
 */
export function safeRedirectPath(value: unknown, fallback: string): string {
  if (typeof value !== "string" || value.length > 500) return fallback;
  if (!value.startsWith("/") || value.startsWith("//")) return fallback;
  for (const ch of value) {
    const code = ch.charCodeAt(0);
    if (ch === "\\" || code < 0x20 || code === 0x7f) return fallback;
  }
  return value;
}

export function appUrl(path = ""): string {
  const base = (process.env.APP_URL ?? "http://localhost:3000").replace(/\/$/, "");
  return `${base}${path}`;
}

