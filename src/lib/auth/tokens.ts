import "server-only";
import { randomBytes } from "node:crypto";
import { collections } from "@/db/mongo";
import { hashToken } from "./session";

export type TokenPurpose = "reset_password" | "verify_email";

export const TOKEN_TTL_MS: Record<TokenPurpose, number> = {
  reset_password: 60 * 60 * 1000,
  verify_email: 3 * 24 * 60 * 60 * 1000,
};

/** Create a one-time token and return the raw value to put in the emailed link. */
export async function createAuthToken(userId: string, purpose: TokenPurpose): Promise<string> {
  const token = randomBytes(32).toString("base64url");
  const now = Date.now();
  await (await collections()).authTokens.insertOne({
    _id: hashToken(token),
    userId,
    purpose,
    expiresAt: new Date(now + TOKEN_TTL_MS[purpose]),
    usedAt: null,
    createdAt: new Date(now),
  });
  return token;
}

/** Only a string can be hashed into a lookup key, so a crafted object in a request can't reach the query. */
function validFilter(token: string, purpose: TokenPurpose) {
  return { _id: hashToken(String(token)), purpose, usedAt: null, expiresAt: { $gt: new Date() } };
}

/** Check a token without using it up (e.g. to show the reset form). */
export async function isTokenValid(token: string, purpose: TokenPurpose): Promise<boolean> {
  return !!(await (await collections()).authTokens.findOne(validFilter(token, purpose), { projection: { _id: 1 } }));
}

/** Mark a token used and return its user id. Only the first caller succeeds. */
export async function consumeAuthToken(token: string, purpose: TokenPurpose): Promise<string | null> {
  const doc = await (await collections()).authTokens.findOneAndUpdate(validFilter(token, purpose), { $set: { usedAt: new Date() } }, { returnDocument: "before" });
  return doc?.userId ?? null;
}

/** Mark every unused token of one purpose as used, e.g. the other reset links once a password has been reset. */
export async function revokeAuthTokens(userId: string, purpose: TokenPurpose) {
  await (await collections()).authTokens.updateMany({ userId: String(userId), purpose, usedAt: null }, { $set: { usedAt: new Date() } });
}

export async function tokensSentRecently(userId: string, purpose: TokenPurpose, windowMs: number): Promise<number> {
  return (await collections()).authTokens.countDocuments({ userId: String(userId), purpose, createdAt: { $gt: new Date(Date.now() - windowMs) } });
}
