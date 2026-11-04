import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { cache } from "react";
import { collections, fromDoc } from "@/db/mongo";
import type { User } from "@/db/types";
import { accessUntilForUser } from "@/lib/services/subscriptions";

export const SESSION_COOKIE = "pc_session";
const SESSION_DAYS = 30;

export const hashToken = (token: string) => createHash("sha256").update(token).digest("hex");

export async function createSession(userId: string) {
  const token = randomBytes(32).toString("base64url");
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await (await collections()).sessions.insertOne({ _id: hashToken(token), userId, expiresAt });
  (await cookies()).set(SESSION_COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    expires: expiresAt,
  });
}

export async function destroySession() {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) await (await collections()).sessions.deleteOne({ _id: hashToken(token) });
  store.delete(SESSION_COOKIE);
}

/** The signed-in user, or null. Cached for the duration of one request. */
export const getCurrentUser = cache(async (): Promise<User | null> => {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const { sessions, users } = await collections();
  const session = await sessions.findOne({ _id: hashToken(token), expiresAt: { $gt: new Date() } });
  if (!session) return null;
  // Independent of each other, so they run together instead of one after the other on every request.
  // Paid access from a subscription is worked out here, on the server, from what Freemius confirmed. It is never read from a request.
  const [doc, accessUntil] = await Promise.all([users.findOne({ _id: session.userId }), accessUntilForUser(session.userId)]);
  if (!doc) return null;
  const user = fromDoc<User>(doc);
  user.subscriptionAccessUntil = accessUntil;
  return user;
});

export async function requireUser(): Promise<User> {
  const user = await getCurrentUser();
  if (!user) redirect("/login");
  return user;
}
