import "server-only";
import { randomUUID } from "node:crypto";
import { collections, fromDoc, isDuplicateKey } from "@/db/mongo";
import type { User } from "@/db/types";

export async function findUserByEmail(email: string): Promise<User | null> {
  const doc = await (await collections()).users.findOne({ email: String(email) });
  return doc ? fromDoc<User>(doc) : null;
}

export async function findUserById(id: string): Promise<User | null> {
  const doc = await (await collections()).users.findOne({ _id: String(id) });
  return doc ? fromDoc<User>(doc) : null;
}

/** Create an account. Returns null when the email or Google id is already taken (the unique indexes decide, so two sign-ins at once can't both win). */
export async function createUser(input: { name: string; email: string; googleId?: string; emailVerifiedAt: Date | null }): Promise<User | null> {
  const user: User = { id: randomUUID(), createdAt: new Date(), ...input };
  const { id, ...rest } = user;
  try {
    await (await collections()).users.insertOne({ _id: id, ...rest });
  } catch (err) {
    if (isDuplicateKey(err)) return null;
    throw err;
  }
  return user;
}

export type GoogleProfile = { sub: string; email: string; name: string };

/**
 * The account a Google sign-in belongs to, or null when there isn't one yet.
 * Accounts are matched on Google's id first. Failing that, an account with the same (Google-verified) email is
 * claimed: that is how accounts made before Google sign-in keep their jobs, CV and subscription.
 * "conflict" means the email already belongs to a different Google identity, which is never taken over.
 */
export async function findUserForGoogle(profile: GoogleProfile): Promise<User | "conflict" | null> {
  const { users } = await collections();
  const byId = await users.findOne({ googleId: profile.sub });
  if (byId) return fromDoc<User>(byId);

  const byEmail = await users.findOne({ email: profile.email });
  if (!byEmail) return null;
  if (byEmail.googleId && byEmail.googleId !== profile.sub) return "conflict";

  // Only an account that has no Google identity yet can be claimed, so two sign-ins at once can't both link it.
  const linked = await users.findOneAndUpdate(
    { _id: byEmail._id, googleId: { $exists: false } },
    { $set: { googleId: profile.sub, emailVerifiedAt: byEmail.emailVerifiedAt ?? new Date() } },
    { returnDocument: "after" },
  );
  if (linked) return fromDoc<User>(linked);
  const again = await users.findOne({ _id: byEmail._id });
  return again?.googleId === profile.sub ? fromDoc<User>(again) : "conflict";
}

/** Make an account for a first Google sign-in. Null when another sign-in just made it: look it up again. */
export async function createGoogleUser(profile: GoogleProfile): Promise<User | null> {
  return createUser({ name: profile.name, email: profile.email, googleId: profile.sub, emailVerifiedAt: new Date() });
}
