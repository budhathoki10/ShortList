import { collections } from "@/db/mongo";
import type { User } from "@/db/types";
import { createUser } from "@/lib/services/users";
import { randomUUID } from "node:crypto";
import { shortId } from "@/lib/util";

export async function resetDb() {
  const c = await collections();
  await Promise.all(Object.values(c).map((coll) => coll.deleteMany({})));
}

export async function makeUser(overrides: Partial<Pick<User, "email" | "name" | "subscriptionAccessUntil" | "emailVerifiedAt">> = {}): Promise<User> {
  const { email = `${shortId()}@example.com`, name = "Test User", subscriptionAccessUntil, ...rest } = overrides;
  const user = await createUser({ email, name, googleId: `google-${randomUUID()}`, emailVerifiedAt: null });
  if (!user) throw new Error("makeUser: email already in use");
  if (Object.keys(rest).length) {
    await (await collections()).users.updateOne({ _id: user.id }, { $set: rest });
    Object.assign(user, rest);
  }
  // Paid access is derived from subscriptions on every request, never stored on the user, so a test passes it in directly.
  if (subscriptionAccessUntil !== undefined) user.subscriptionAccessUntil = subscriptionAccessUntil;
  return user;
}

export const DAY = 86_400_000;
