import "server-only";
import { sendFollowUpDigests } from "@/lib/services/reminders";
import { runJobDiscovery } from "@/lib/discovery/runner";
import { sendDiscoveryDigests } from "@/lib/discovery/notifications";

/** Scheduled jobs by the name used in /api/cron-job/:job. */
export const JOBS = {
  daily: () => sendFollowUpDigests(),
  discovery: () => runJobDiscovery(),
  "discovery-daily": () => sendDiscoveryDigests(),
} as const;

export type JobName = keyof typeof JOBS;

export function isJobName(name: string): name is JobName {
  return Object.hasOwn(JOBS, name);
}
