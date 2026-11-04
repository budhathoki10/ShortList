  import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const isDev = process.env.NODE_ENV !== "production";

/**
 * A fresh nonce per request: only scripts Next itself renders (and anything they load) may run,
 * so injected markup can't execute even if some text were ever rendered unescaped.
 * The billing page is the one place that embeds a third party: Freemius's checkout overlay (an iframe from
 * checkout.freemius.com, opened by the @freemius/checkout package we bundle ourselves, so no outside script is loaded).
 * Only that page gets the extra hosts, and its style rule is relaxed because the overlay injects styling.
 * The exact set of hosts the overlay needs has not been confirmed against a live checkout: if the browser console
 * reports a blocked request on /app/billing, allow only the host it names here.
 */
const FREEMIUS = "https://checkout.freemius.com";

function contentSecurityPolicy(nonce: string, pathname: string) {
  const billing = pathname.startsWith("/app/billing");
  const styles = isDev || billing ? "'unsafe-inline'" : `'nonce-${nonce}'`;
  return [
    "default-src 'self'",
    `script-src 'self' 'nonce-${nonce}' 'strict-dynamic'${isDev ? " 'unsafe-eval'" : ""}`,
    `style-src 'self' ${styles}`,
    // style="" attributes (a progress bar's width) can't be nonced. They can't run code either.
    "style-src-attr 'unsafe-inline'",
    `img-src 'self' data: blob:${billing ? ` ${FREEMIUS}` : ""}`,
    "font-src 'self'",
    `connect-src 'self'${billing ? ` ${FREEMIUS}` : ""}${isDev ? " ws://localhost:* http://localhost:*" : ""}`,
    billing ? `frame-src ${FREEMIUS}` : "frame-src 'none'",
    "form-action 'self'",
    "base-uri 'self'",
    "object-src 'none'",
    "frame-ancestors 'none'",
    ...(isDev ? [] : ["upgrade-insecure-requests"]),
  ].join("; ");
}

export function proxy(request: NextRequest) {
  // Optimistic check only: real authorization happens in requireUser() next to the data.
  if (request.nextUrl.pathname.startsWith("/app") && !request.cookies.has("pc_session")) {
    const login = new URL("/login", request.url);
    login.searchParams.set("next", request.nextUrl.pathname);
    return NextResponse.redirect(login);
  }

  const nonce = btoa(crypto.randomUUID());
  const csp = contentSecurityPolicy(nonce, request.nextUrl.pathname);
  const headers = new Headers(request.headers);
  // Next reads the nonce from the request's CSP and stamps it on the scripts it renders.
  headers.set("content-security-policy", csp);
  headers.set("x-nonce", nonce);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("content-security-policy", csp);
  return response;
}

export const config = {
  // Pages only: static files and API routes (webhooks, cron) don't render HTML.
  matcher: ["/((?!api/|_next/static|_next/image|favicon.ico|sw.js).*)"],
};
