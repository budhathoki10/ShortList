"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { dismissRecommendation, removePushDevice, saveCareerPassport, saveRecommendationToTracker, subscribePush, unsubscribePush } from "@/lib/services/discovery";
import { NotificationsOffError, sendTestPush } from "@/lib/discovery/notifications";
import { isPushServiceEndpoint } from "@/lib/discovery/push-endpoints";
import { overLimit } from "@/lib/services/rate-limit";

const HOUR = 60 * 60_000;
/** Push actions answer with a result instead of throwing: production hides thrown messages, so the toast would say nothing useful. */
export type PushResult = { success: true } | { success: false; error: string };

export type DiscoveryState = { error?: string; success?: string } | undefined;

const list = (formData: FormData, name: string, limit = 20) =>
  String(formData.get(name) ?? "")
    .split(/[,\n]/)
    .map((value) => value.trim().replace(/\s+/g, " "))
    .filter((value, index, all) => value.length >= 2 && value.length <= 100 && all.findIndex((item) => item.toLowerCase() === value.toLowerCase()) === index)
    .slice(0, limit);

const oneOf = <T extends string>(value: FormDataEntryValue | null, allowed: readonly T[], fallback: T): T =>
  allowed.includes(value as T) ? (value as T) : fallback;

function validTimezone(value: string) {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return value;
  } catch {
    return "UTC";
  }
}

export async function updateCareerPassport(_: DiscoveryState, formData: FormData): Promise<DiscoveryState> {
  const user = await requireUser();
  const targetRoles = list(formData, "targetRoles", 12);
  if (!targetRoles.length) return { error: "Add at least one target role, such as Frontend developer." };
  // Job-alert emails are opt-in (PRD 18): anything unexpected means off.
  const emailFrequency = oneOf(formData.get("emailFrequency"), ["immediate", "daily", "off"] as const, "off");
  const pushFrequency = oneOf(formData.get("pushFrequency"), ["immediate", "daily", "off"] as const, "off");
  const minimumSalaryRaw = Number(formData.get("minimumSalary"));
  const graduationDate = String(formData.get("graduationDate") ?? "").trim();
  const remoteModes = (["remote", "hybrid", "onsite"] as const).filter((mode) => formData.getAll("remoteModes").includes(mode));
  const alertStates = (["ready", "stretch", "verify"] as const).filter((state) => formData.getAll("alertStates").includes(state));
  await saveCareerPassport(user.id, {
    targetRoles,
    excludedRoles: list(formData, "excludedRoles"),
    locations: list(formData, "locations"),
    workCountries: list(formData, "workCountries"),
    remoteModes: remoteModes.length ? remoteModes : ["remote", "hybrid", "onsite"],
    needsSponsorship: formData.get("needsSponsorship") === "on",
    graduationDate: /^\d{4}-\d{2}$/.test(graduationDate) ? graduationDate : null,
    minimumSalary: Number.isFinite(minimumSalaryRaw) && minimumSalaryRaw > 0 ? Math.round(minimumSalaryRaw) : null,
    employmentTypes: list(formData, "employmentTypes", 8),
    excludedCompanies: list(formData, "excludedCompanies"),
    discoveryEnabled: formData.get("discoveryEnabled") === "on",
    emailFrequency,
    pushFrequency,
    alertStates: alertStates.length ? [...alertStates] : ["ready"],
    quietStart: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(formData.get("quietStart"))) ? String(formData.get("quietStart")) : "22:00",
    quietEnd: /^([01]\d|2[0-3]):[0-5]\d$/.test(String(formData.get("quietEnd"))) ? String(formData.get("quietEnd")) : "08:00",
    timezone: validTimezone(String(formData.get("timezone") ?? "UTC")),
  });
  revalidatePath("/app/radar");
  if (emailFrequency !== "off" && !user.emailVerifiedAt) return { success: "Career Passport saved. Log out and sign in again with Google to confirm your email address; until then job-alert emails are held back." };
  return { success: "Career Passport saved. New source runs will use these choices." };
}

export async function dismissRadarMatch(formData: FormData) {
  const user = await requireUser();
  const recommendationId = String(formData.get("recommendationId") ?? "");
  const reason = oneOf(formData.get("reason"), ["wrong role", "wrong location", "work authorization or citizenship", "salary", "too senior or too junior", "employer preference", "duplicate", "closed or inaccurate", "not interested"] as const, "not interested");
  await dismissRecommendation(user.id, recommendationId, reason);
  revalidatePath("/app/radar");
}

export async function prepareRadarMatch(formData: FormData) {
  const user = await requireUser();
  const trackerJobId = await saveRecommendationToTracker(user.id, String(formData.get("recommendationId") ?? ""));
  if (!trackerJobId) return redirect("/app/radar");
  revalidatePath("/app", "layout");
  redirect(`/app/jobs/${trackerJobId}`);
}

export type SerializedPushSubscription = { endpoint: string; keys: { p256dh: string; auth: string } };

export async function registerPushSubscription(subscription: SerializedPushSubscription, deviceLabel: string): Promise<PushResult> {
  const user = await requireUser();
  if (await overLimit(`push-register:${user.id}`, 20, HOUR)) return { success: false, error: "Too many devices were added in the last hour. Try again later." };
  const endpoint = String(subscription?.endpoint ?? "");
  if (endpoint.length > 4_000 || !isPushServiceEndpoint(endpoint)) return { success: false, error: "This browser's push service isn't supported. Email alerts still work." };
  const p256dh = String(subscription?.keys?.p256dh ?? "");
  const auth = String(subscription?.keys?.auth ?? "");
  if (!/^[A-Za-z0-9_-]{20,300}$/.test(p256dh) || !/^[A-Za-z0-9_-]{8,100}$/.test(auth)) return { success: false, error: "The browser returned invalid push keys. Try enabling alerts again." };
  await subscribePush(user.id, { endpoint, p256dh, auth, deviceLabel: String(deviceLabel ?? "") });
  revalidatePath("/app/radar");
  return { success: true };
}

export async function removePushSubscription(endpoint: string) {
  const user = await requireUser();
  await unsubscribePush(user.id, endpoint);
  revalidatePath("/app/radar");
  return { success: true };
}

export async function removeSavedPushDevice(formData: FormData) {
  const user = await requireUser();
  await removePushDevice(user.id, String(formData.get("subscriptionId") ?? ""));
  revalidatePath("/app/settings");
}

export async function testPushNotification(): Promise<PushResult> {
  const user = await requireUser();
  if (await overLimit(`push-test:${user.id}`, 5, HOUR)) return { success: false, error: "You've sent several test notifications already. Try again in an hour." };
  try {
    await sendTestPush(user.id);
    return { success: true };
  } catch (error) {
    if (error instanceof NotificationsOffError) return { success: false, error: "Notifications are off for your account. Turn them on in Settings first." };
    return { success: false, error: "No device accepted it. Turn push notifications off and on again on this device." };
  }
}
