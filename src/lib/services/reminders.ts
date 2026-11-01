import "server-only";
import { noticeMessage, sendEmail } from "@/lib/email";
import { appUrl } from "@/lib/util";
import { allDueFollowUps } from "./jobs";

/** One email per person listing the applications worth a follow-up today. */
export async function sendFollowUpDigests() {
  const rows = await allDueFollowUps();
  const byUser = new Map<string, { name: string; jobs: string[] }>();
  for (const r of rows) {
    const entry = byUser.get(r.email) ?? { name: r.name, jobs: [] };
    entry.jobs.push([r.job.post.title, r.job.post.company].filter(Boolean).join(" at ") || "A job you applied for");
    byUser.set(r.email, entry);
  }
  let sent = 0;
  for (const [email, { jobs }] of byUser) {
    try {
      await sendEmail(
        noticeMessage(
          email,
          jobs.length === 1 ? `Time to follow up: ${jobs[0]}` : `${jobs.length} applications to follow up on`,
          "A week with no answer",
          [
            jobs.map((j) => `• ${j}`).join("\n"),
            "A short, polite note now often gets a reply. Shortlist Job Radar has one drafted for each, ready to copy.",
          ],
          { label: "Open Shortlist Job Radar", url: appUrl("/app") },
        ),
      );
      sent++;
    } catch (err) {
      console.error("Follow-up digest failed", err);
    }
  }
  return { people: byUser.size, sent };
}
