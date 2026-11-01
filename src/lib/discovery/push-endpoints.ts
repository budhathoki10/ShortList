/**
 * The push services browsers actually hand out endpoints for. A subscription's endpoint is where the server will
 * POST, so accepting any https URL would let a signed-in user aim the server at hosts of their choosing (including
 * internal ones) and fire requests on demand with "Send test". Only these hosts are accepted.
 *
 * Chrome, Edge (Chromium), Opera, Brave, Samsung Internet: fcm.googleapis.com (older: android.googleapis.com)
 * Firefox: updates.push.services.mozilla.com
 * Safari (macOS 13+, iOS 16.4+): web.push.apple.com
 * Legacy Edge / Windows: *.notify.windows.com
 */
const EXACT = new Set(["fcm.googleapis.com", "android.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"]);
const SUFFIXES = [".notify.windows.com", ".push.apple.com"];

export function isPushServiceEndpoint(endpoint: string): boolean {
  let url: URL;
  try {
    url = new URL(endpoint);
  } catch {
    return false;
  }
  if (url.protocol !== "https:" || url.username || url.password || (url.port && url.port !== "443")) return false;
  const host = url.hostname.toLowerCase();
  return EXACT.has(host) || SUFFIXES.some((suffix) => host.endsWith(suffix));
}
