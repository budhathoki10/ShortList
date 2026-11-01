import "server-only";
import { collections } from "@/db/mongo";
import type { Profile } from "@/lib/model/types";
import { CV_READER_VERSION } from "@/lib/cv/quality";
import type { OriginalCvFile } from "@/db/types";

export async function getProfileRow(userId: string) {
  const doc = await (await collections()).profiles.findOne({ _id: String(userId) }, { projection: { "original.bytes": 0 } });
  return doc ? { userId: doc._id, data: doc.data, updatedAt: doc.updatedAt, original: doc.original ? { name: doc.original.name, type: doc.original.type } : null } : null;
}

export async function getProfile(userId: string): Promise<Profile | null> {
  return (await getProfileRow(userId))?.data ?? null;
}

export async function getOriginalCv(userId: string): Promise<OriginalCvFile | null> {
  const doc = await (await collections()).profiles.findOne({ _id: String(userId) }, { projection: { original: 1 } });
  return doc?.original ?? null;
}

export async function saveProfile(userId: string, data: Profile, sourceText?: string, original?: OriginalCvFile | null) {
  const c = await collections();
  const previous = await c.profiles.findOne({ _id: String(userId) }, { projection: { data: 1 } });
  await c.profiles.updateOne({ _id: String(userId) }, { $set: { data, updatedAt: new Date(), ...(original ? { original } : {}), ...(sourceText ? { sourceText: sourceText.slice(0, 100_000), readerVersion: CV_READER_VERSION, ...(previous ? { previousData: previous.data } : {}) } : {}) }, ...(original === null ? { $unset: { original: "" } } : {}) }, { upsert: true });
  if (previous && JSON.stringify(previous.data) !== JSON.stringify(data)) {
    await Promise.all([
      c.documents.updateMany({ userId: String(userId) }, { $set: { sourceNeedsReview: true } }),
      c.interviews.updateMany({ userId: String(userId) }, { $set: { sourceNeedsReview: true } }),
    ]);
  }
}

/** True once the profile has enough to tailor from: a name and at least one role, project or education entry. */
export function profileReady(p: Profile | null): p is Profile {
  return !!p && !!p.name.trim() && p.experience.length + p.projects.length + p.education.length > 0;
}
