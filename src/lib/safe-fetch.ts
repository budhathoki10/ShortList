import http from "node:http";
import https from "node:https";
import dns from "node:dns";
import net from "node:net";
import type { LookupFunction } from "node:net";

export class FetchBlockedError extends Error {}

export type SafeResponse = {
  status: number;
  finalUrl: string;
  redirects: number;
  headers: http.IncomingHttpHeaders;
  body: string;
  bytes: number;
  responseMs: number;
};

const MAX_BYTES = 3 * 1024 * 1024;
const MAX_REDIRECTS = 5;

/** True for loopback, private, link-local, CGNAT, multicast and other non-public ranges. */
export function isPrivateAddress(ip: string): boolean {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  if (net.isIPv6(ip)) return isPrivateIPv6(ip);
  return true;
}

/** The eight 16-bit groups of an IPv6 address, or null if it can't be read. Handles "::" and a trailing dotted IPv4. */
function ipv6Groups(ip: string): number[] | null {
  let s = ip.toLowerCase().split("%")[0];
  const dotted = s.match(/(\d+)\.(\d+)\.(\d+)\.(\d+)$/);
  if (dotted) {
    const [a, b, c, d] = dotted.slice(1).map(Number);
    s = `${s.slice(0, -dotted[0].length)}${((a << 8) | b).toString(16)}:${((c << 8) | d).toString(16)}`;
  }
  const halves = s.split("::");
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(":") : [];
  const tail = halves.length === 2 && halves[1] ? halves[1].split(":") : [];
  const fill = 8 - head.length - tail.length;
  if (halves.length === 1 ? head.length !== 8 : fill < 1) return null;
  const groups = [...head, ...Array<string>(halves.length === 2 ? fill : 0).fill("0"), ...tail].map((g) => parseInt(g, 16));
  return groups.length === 8 && groups.every((g) => g >= 0 && g <= 0xffff) ? groups : null;
}

const v4From = (hi: number, lo: number) => `${hi >> 8}.${hi & 255}.${lo >> 8}.${lo & 255}`;

/**
 * IPv6 forms that carry an IPv4 address (mapped, compatible, NAT64, 6to4) are judged by the IPv4
 * inside them: "::ffff:a9fe:a9fe" is 169.254.169.254, the cloud metadata address, however it's written.
 */
function isPrivateIPv6(ip: string): boolean {
  const g = ipv6Groups(ip);
  if (!g) return true;
  const [g0, g1, g2, g3, g4, g5, g6, g7] = g;
  const zeros = (...xs: number[]) => xs.every((x) => x === 0);
  if (zeros(g0, g1, g2, g3, g4, g5, g6) && g7 <= 1) return true; // :: and ::1
  if (zeros(g0, g1, g2, g3, g4) && g5 === 0xffff) return isPrivateAddress(v4From(g6, g7)); // ::ffff:a.b.c.d
  if (zeros(g0, g1, g2, g3) && g4 === 0xffff && g5 === 0) return isPrivateAddress(v4From(g6, g7)); // ::ffff:0:a.b.c.d
  if (zeros(g0, g1, g2, g3, g4, g5)) return isPrivateAddress(v4From(g6, g7)); // ::a.b.c.d
  if (g0 === 0x64 && g1 === 0xff9b) return g2 !== 0 || !zeros(g3, g4, g5) || isPrivateAddress(v4From(g6, g7)); // NAT64
  if (g0 === 0x2002) return isPrivateAddress(v4From(g1, g2)); // 6to4
  return (
    (g0 === 0x2001 && (g1 === 0 || g1 === 0xdb8)) || // Teredo, documentation
    (g0 === 0x100 && zeros(g1, g2, g3)) || // discard-only
    (g0 & 0xfe00) === 0xfc00 || // unique local
    (g0 & 0xffc0) === 0xfe80 || // link-local
    (g0 & 0xffc0) === 0xfec0 || // site-local
    g0 >> 8 === 0xff // multicast
  );
}

function allowPrivate() {
  return process.env.FETCH_ALLOW_PRIVATE_HOSTS === "1";
}

/**
 * DNS lookup that refuses private addresses. It runs at connect time, so a
 * hostname that re-resolves to an internal IP (DNS rebinding) is still blocked.
 */
export const guardedLookup: LookupFunction = (hostname, options, callback) => {
  dns.lookup(hostname, { ...options, all: true }, (err, addresses) => {
    if (err) return callback(err, "", 0);
    const list = addresses as dns.LookupAddress[];
    if (!allowPrivate() && list.some((a) => isPrivateAddress(a.address))) {
      return callback(new FetchBlockedError(`Blocked private address for ${hostname}`), "", 0);
    }
    if (options.all) return (callback as unknown as (e: null, a: dns.LookupAddress[]) => void)(null, list);
    callback(null, list[0].address, list[0].family);
  });
};

export function normalizeUrl(input: string): URL {
  const trimmed = input.trim();
  const hasScheme = /^[a-z][a-z0-9+.-]*:\/\//i.test(trimmed);
  if (hasScheme && !/^https?:\/\//i.test(trimmed)) {
    throw new FetchBlockedError("Only http and https URLs can be audited");
  }
  const withScheme = hasScheme ? trimmed : `https://${trimmed}`;
  const url = new URL(withScheme);
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new FetchBlockedError("Only http and https URLs can be audited");
  }
  if (url.username || url.password) throw new FetchBlockedError("URLs with credentials are not allowed");
  if (!allowPrivate()) {
    const host = url.hostname.replace(/^\[|\]$/g, "");
    if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".internal")) {
      throw new FetchBlockedError("Local addresses cannot be audited");
    }
    if (net.isIP(host) && isPrivateAddress(host)) throw new FetchBlockedError("Private addresses cannot be audited");
  }
  if (url.port && !["80", "443", ""].includes(url.port) && !allowPrivate()) {
    throw new FetchBlockedError("Only standard web ports can be audited");
  }
  url.hash = "";
  return url;
}

function requestOnce(url: URL, timeoutMs: number): Promise<Omit<SafeResponse, "finalUrl" | "redirects" | "responseMs">> {
  const mod = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const req = mod.request(
      url,
      {
        method: "GET",
        lookup: guardedLookup,
        timeout: timeoutMs,
        headers: {
          "user-agent": "Mozilla/5.0 (compatible; ShortlistJobRadarBot/1.0; +job post reader)",
          accept: "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
          "accept-encoding": "identity",
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        let bytes = 0;
        res.on("data", (chunk: Buffer) => {
          bytes += chunk.length;
          if (bytes <= MAX_BYTES) chunks.push(chunk);
          else res.destroy();
        });
        res.on("close", () =>
          resolve({
            status: res.statusCode ?? 0,
            headers: res.headers,
            body: Buffer.concat(chunks).toString("utf8"),
            bytes,
          }),
        );
        res.on("error", reject);
      },
    );
    req.on("timeout", () => req.destroy(new Error("Timed out")));
    req.on("error", reject);
    req.end();
  });
}

/** GET a public web page, following redirects and re-validating every hop. */
export async function safeFetch(input: string, timeoutMs = 10_000): Promise<SafeResponse> {
  let url = normalizeUrl(input);
  const started = Date.now();
  for (let redirects = 0; redirects <= MAX_REDIRECTS; redirects++) {
    const res = await requestOnce(url, timeoutMs);
    const location = res.headers.location;
    if (res.status >= 300 && res.status < 400 && location) {
      url = normalizeUrl(new URL(location, url).toString());
      continue;
    }
    return { ...res, finalUrl: url.toString(), redirects, responseMs: Date.now() - started };
  }
  throw new Error("Too many redirects");
}
