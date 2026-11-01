import "server-only";
import { collections } from "@/db/mongo";

/** Why a held-back delivery was closed without sending. Shown in the data export, so it reads as plain words. */
export const NOTIFICATIONS_OFF_REASON = "Notifications turned off in Settings";

/** The account-wide switch: on unless the person turned it off. Security email never checks this. */
export function notificationsOn(user: { notificationsOff?: boolean } | null | undefined) {
  return !user?.notificationsOff;
}

export async function getNotificationsOn(userId: string) {
  const user = await (await collections()).users.findOne({ _id: String(userId) }, { projection: { notificationsOff: 1 } });
  return !!user && notificationsOn(user);
}

/**
 * Turn every non-essential notification on or off for one account. Turning them off also closes any
 * job alert still waiting to go out, so switching back on later doesn't release a backlog all at once.
 */
export async function setNotificationsOn(userId: string, on: boolean) {
  const c = await collections();
  const id = String(userId);
  await c.users.updateOne({ _id: id }, { $set: { notificationsOff: !on } });
  if (!on) {
    await c.notificationDeliveries.updateMany(
      { userId: id, state: "pending" },
      { $set: { state: "sent", sentAt: null, lockedUntil: null, failureReason: NOTIFICATIONS_OFF_REASON } },
    );
  }
}
