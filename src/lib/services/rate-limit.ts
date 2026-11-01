import "server-only";
import { createHash } from "node:crypto";
import { collections, isDuplicateKey } from "@/db/mongo";
import { aiEnabled } from "@/lib/ai";
import { clientIp } from "@/lib/util";

/** Stable, non-reversible key part, so raw emails and IPs are never stored. */
export const keyPart = (value: string) => createHash("sha256").update(`shortlist:${value}`).digest("hex").slice(0, 32);

/**
 * Count one attempt against `key` in a fixed window and say whether it is now over `limit`.
 * One atomic upsert per attempt, so parallel requests can't slip past the limit. MongoDB's
 * TTL index clears old windows.
 */
export async function overLimit(key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const bucket = Math.floor(now / windowMs);
  const { rateLimits } = await collections();
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const doc = await rateLimits.findOneAndUpdate(
        { _id: `${key}:${bucket}` },
        { $inc: { count: 1 }, $setOnInsert: { expiresAt: new Date((bucket + 2) * windowMs) } },
        { upsert: true, returnDocument: "after" },
      );
      return (doc?.count ?? 1) > limit;
    } catch (err) {
      // Two first attempts raced to create the window; the second one now updates it.
      if (!isDuplicateKey(err)) throw err;
    }
  }
  return false;
}

/**
 * A per-IP counter. With no address we can trust (see clientIp) there is nothing to count against, so it
 * does not limit: lumping everyone into one "unknown" bucket would lock all users out together.
 */
export async function ipLimit(name: string, headers: Headers, limit: number, windowMs: number): Promise<boolean> {
  const address = clientIp(headers);
  return address ? overLimit(`${name}:ip:${keyPart(address)}`, limit, windowMs) : false;
}

const positiveInt =(value: string | undefined, fallback: number) => (Number.isInteger(Number(value)) && Number(value) > 0 ? Number(value) : fallback);

/**
 * The ceiling on paid AI calls, shared by every feature that calls the model: a few per minute per account, so one
 * user (or a script) can't burn the Anthropic credit in a burst, and an hourly total for the whole app as a backstop
 * against many accounts doing it together. Both are env-tunable. Without an API key nothing is spent, so nothing is limited.
 * Returns the message to show when the call must wait, or null when it may go ahead.
 */
export async function aiThrottle(userId: string): Promise<string | null> {
  if (!aiEnabled()) return null;
  const perMinute = positiveInt(process.env.AI_CALLS_PER_MINUTE, 2);
  const perHour = positiveInt(process.env.AI_GLOBAL_PER_HOUR, 200);
  if (await overLimit(`ai-burst:${userId}`, perMinute, 60_000)) {
    return `AI actions are limited to ${perMinute} per minute. Wait a minute, then try again.`;
  }
  if (await overLimit("ai-global", perHour, 60 * 60_000)) {
    return "AI is very busy right now. Please try again in a little while.";
  }
  return null;
}

/** Whether `key` has already used up `limit` in the current window, without counting an attempt. */
export async function limitReached(key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const bucket = Math.floor(now / windowMs);
  const doc = await (await collections()).rateLimits.findOne({ _id: `${key}:${bucket}` }, { projection: { count: 1 } });
  return (doc?.count ?? 0) >= limit;
}
