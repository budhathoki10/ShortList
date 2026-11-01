"use server";

import { revalidatePath } from "next/cache";
import { requireUser } from "@/lib/auth/session";
import { setNotificationsOn } from "@/lib/services/notification-settings";
import { overLimit } from "@/lib/services/rate-limit";

export type SettingResult = { success: true; on: boolean } | { success: false; error: string };

/** The account-wide notifications switch in Settings. Answers with a result, so the switch can show what went wrong. */
export async function setNotifications(on: boolean): Promise<SettingResult> {
  const user = await requireUser();
  if (typeof on !== "boolean") return { success: false, error: "Something went wrong. Reload the page and try again." };
  if (await overLimit(`notifications-switch:${user.id}`, 60, 60 * 60_000)) return { success: false, error: "You've changed this a lot in the last hour. Try again later." };
  try {
    await setNotificationsOn(user.id, on);
  } catch {
    return { success: false, error: "We couldn't save that. Check your connection and try again." };
  }
  revalidatePath("/app/settings");
  revalidatePath("/app/radar");
  return { success: true, on };
}
