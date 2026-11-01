import "server-only";
import { createHash } from "node:crypto";
import { collections, isDuplicateKey } from "@/db/mongo";

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

/** Whether `key` has already used up `limit` in the current window, without counting an attempt. */
export async function limitReached(key: string, limit: number, windowMs: number, now = Date.now()): Promise<boolean> {
  const bucket = Math.floor(now / windowMs);
  const doc = await (await collections()).rateLimits.findOne({ _id: `${key}:${bucket}` }, { projection: { count: 1 } });
  return (doc?.count ?? 0) >= limit;
}
