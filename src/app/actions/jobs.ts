"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { addDays } from "@/lib/dates";
import { extractJob } from "@/lib/jobs/extract";
import { fetchJobPost } from "@/lib/jobs/fetch-post";
import { scoreMatch } from "@/lib/match/score";
import { today } from "@/lib/plans";
import { createJob, deleteJob, isStatus, ownedJob, setFollowUp, setNotes, setStatus } from "@/lib/services/jobs";
import { getProfile, profileReady } from "@/lib/services/profile";
import { aiThrottle, overLimit } from "@/lib/services/rate-limit";
import { htmlToText, looksLikeHtml } from "@/lib/jobs/html";
import { cleanText } from "@/lib/text";
import { isJobSearchPage, jobHasCriteria } from "@/lib/jobs/quality";
import { collections } from "@/db/mongo";

export type JobState = { error?: string; success?: string; needText?: boolean; url?: string } | undefined;

const FETCH_ERRORS = {
  login: "This website requires a login to view the vacancy. Copy the full job description and paste it below.",
  blocked: "This website restricts access to its pages. Copy the full job description and paste it below to continue.",
  unreachable: "Unable to open this link. Check the address, or paste the full job description below.",
  too_short: "No complete job description was found on this page. Copy the description and paste it below.",
} as const;

/** Add a job from a link or pasted text, read it, and check it against the profile. */
export async function addJob(_: JobState, formData: FormData): Promise<JobState> {
  const user = await requireUser();
  // Reading a post fetches a web page and may call the AI model, so adding jobs has a ceiling of its own.
  if (await overLimit(`add-job:${user.id}`, 40, 60 * 60_000)) return { error: "You’ve reached the hourly limit for adding jobs. Please try again in an hour." };
  const url = String(formData.get("url") ?? "").trim().slice(0, 2000);
  let text = cleanText(pastedText(formData));
  let source: string | null = null;

  if (!text && url) {
    const fetched = await fetchJobPost(url);
    if (!fetched.ok) return { error: FETCH_ERRORS[fetched.reason], needText: true, url };
    text = fetched.text;
    source = fetched.url;
  } else if (url) {
    source = url;
  }
  if (text.length < 120) return { error: "Paste the full job description, including the title, responsibilities and requirements.", needText: true, url };
  if (isJobSearchPage(text)) return { error: "This is a job search results page. Open one vacancy and paste its full description, including responsibilities and requirements.", needText: true, url };

  const slow = await aiThrottle(user.id);
  if (slow) return { error: slow, needText: true, url };
  const { post } = await extractJob(text.slice(0, 40_000));
  if (!jobHasCriteria(post)) return { error: "We found a title, but not enough job requirements to assess a match. Paste the full description below.", needText: true, url };
  const profile = await getProfile(user.id);
  const job = await createJob(user.id, {
    url: source && /^https?:\/\//i.test(source) ? source.slice(0, 2000) : null,
    postText: text.slice(0, 40_000),
    post,
    match: profileReady(profile) ? scoreMatch(profile, post) : null,
  });
  revalidatePath("/app", "layout");
  redirect(`/app/jobs/${job.id}`);
}

export async function updateJobDescription(_: JobState, formData: FormData): Promise<JobState> {
  const { user, job } = await requireJob(formData.get("jobId"));
  const text = cleanText(pastedText(formData)).slice(0, 40_000);
  if (text.length < 120 || isJobSearchPage(text)) return { error: "Paste the description for this specific vacancy, including its responsibilities and requirements." };
  if (await overLimit(`add-job:${user.id}`, 40, 60 * 60_000)) return { error: "You’ve reached the hourly limit for reading job descriptions. Please try again in an hour." };
  const slow = await aiThrottle(user.id);
  if (slow) return { error: slow };
  const { post } = await extractJob(text);
  if (!jobHasCriteria(post)) return { error: "The description still has no clear requirements. Include the skills and experience the employer asks for." };
  const profile = await getProfile(user.id);
  await (await collections()).jobs.updateOne({ _id: job.id, userId: user.id }, { $set: { postText: text, post, match: profileReady(profile) ? scoreMatch(profile, post) : null, updatedAt: new Date() } });
  await (await collections()).documents.updateMany({ userId: user.id, jobId: job.id }, { $set: { sourceNeedsReview: true } });
  await (await collections()).interviews.updateOne({ _id: job.id, userId: user.id }, { $set: { sourceNeedsReview: true } });
  revalidatePath("/app", "layout");
  return { success: "Job description updated. The match now uses this vacancy’s actual requirements." };
}

async function requireJob(jobId: FormDataEntryValue | null) {
  const user = await requireUser();
  const job = await ownedJob(user.id, String(jobId ?? ""));
  if (!job) redirect("/app/jobs");
  return { user, job };
}

export async function changeStatus(formData: FormData) {
  const { user, job } = await requireJob(formData.get("jobId"));
  const status = formData.get("status");
  if (isStatus(status)) await setStatus(user.id, job.id, status);
  revalidatePath("/app", "layout");
}

export async function saveNotes(formData: FormData) {
  const { user, job } = await requireJob(formData.get("jobId"));
  await setNotes(user.id, job.id, String(formData.get("notes") ?? "").slice(0, 5000));
  revalidatePath(`/app/jobs/${job.id}`);
}

/** "I followed up" clears the reminder; "Remind me later" moves it four days out. */
export async function followUpAction(formData: FormData) {
  const { user, job } = await requireJob(formData.get("jobId"));
  const later = formData.get("op") === "later";
  await setFollowUp(user.id, job.id, later ? addDays(today(), 4) : null);
  revalidatePath("/app", "layout");
}

export async function removeJob(formData: FormData) {
  const { user, job } = await requireJob(formData.get("jobId"));
  await deleteJob(user.id, job.id);
  revalidatePath("/app", "layout");
  redirect("/app/jobs");
}

/** A pasted post can be the page's HTML (copied from source, or from a board that pastes markup): read it as text. */
function pastedText(formData: FormData): string {
  const raw = String(formData.get("text") ?? "");
  return looksLikeHtml(raw) ? htmlToText(raw) : raw;
}
