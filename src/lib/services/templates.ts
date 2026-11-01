import "server-only";
import { randomUUID } from "node:crypto";
import { collections } from "@/db/mongo";
import type { CvTemplateDoc, Job } from "@/db/types";
import { applyFit, type Fit } from "@/lib/templates/fit";
import { DEFAULT_TEMPLATE_ID, getBuiltin, isBuiltinId } from "@/lib/templates/registry";
import { parseSpec, type TemplateSpec } from "@/lib/templates/spec";
import type { CvStyle } from "@/lib/templates/style";

/** Most templates one person can keep. */
export const MAX_TEMPLATES = 50;
export const MAX_TEMPLATE_NAME = 60;

export type ResolvedTemplate = { id: string; name: string; spec: TemplateSpec; builtin: boolean; basedOn: string | null };

/** A template of someone's own, as the pages use it. */
export type MyTemplate = { id: string; name: string; basedOn: string | null; spec: TemplateSpec; createdAt: Date; updatedAt: Date };

const isUuid = (id: unknown): id is string => typeof id === "string" && /^[0-9a-f-]{36}$/i.test(id);

/** A built-in template, or one of this user's own. Anyone else's template doesn't exist for them. */
export async function getTemplate(userId: string, id: string | null | undefined): Promise<ResolvedTemplate | null> {
  if (!id || typeof id !== "string") return null;
  if (isBuiltinId(id)) {
    const t = getBuiltin(id);
    return t ? { id: t.id, name: t.name, spec: t.spec, builtin: true, basedOn: null } : null;
  }
  if (!isUuid(id)) return null;
  const row = await (await collections()).cvTemplates.findOne({ _id: id, userId: String(userId) });
  // Re-validate on the way out too: the database is not trusted to hold a safe spec.
  const spec = row && parseSpec(row.spec);
  return row && spec ? { id: row._id, name: row.name, spec, builtin: false, basedOn: row.basedOn } : null;
}

const toMine = (d: CvTemplateDoc): MyTemplate => ({ id: d._id, name: d.name, basedOn: d.basedOn, spec: d.spec, createdAt: d.createdAt, updatedAt: d.updatedAt });

export async function listMyTemplates(userId: string): Promise<MyTemplate[]> {
  const docs = await (await collections()).cvTemplates.find({ userId: String(userId) }).sort({ updatedAt: -1 }).limit(MAX_TEMPLATES).toArray();
  return docs.map(toMine);
}

export class TemplateLimitError extends Error {}

const cleanName = (name: string) => name.replace(/\s+/g, " ").trim().slice(0, MAX_TEMPLATE_NAME) || "My template";

/**
 * Save a template: updates one of theirs when `id` is given, otherwise creates a new one.
 * The spec must already be validated. Creating fails past MAX_TEMPLATES.
 */
export async function saveTemplate(userId: string, input: { id?: string | null; name: string; spec: TemplateSpec; basedOn?: string | null }): Promise<MyTemplate | null> {
  const uid = String(userId);
  const { cvTemplates } = await collections();
  const name = cleanName(input.name);
  if (input.id) {
    if (!isUuid(input.id)) return null;
    const row = await cvTemplates.findOneAndUpdate({ _id: input.id, userId: uid }, { $set: { name, spec: input.spec, updatedAt: new Date() } }, { returnDocument: "after" });
    return row ? toMine(row) : null;
  }
  // Insert, then count: if several saves arrive together and push the person past the limit, the ones over it take themselves back out.
  const now = new Date();
  const doc: CvTemplateDoc = { _id: randomUUID(), userId: uid, name, basedOn: input.basedOn ?? null, spec: input.spec, createdAt: now, updatedAt: now };
  await cvTemplates.insertOne(doc);
  if ((await cvTemplates.countDocuments({ userId: uid })) > MAX_TEMPLATES) {
    await cvTemplates.deleteOne({ _id: doc._id });
    throw new TemplateLimitError(`You can keep up to ${MAX_TEMPLATES} templates. Delete one to make room.`);
  }
  return toMine(doc);
}

/** Delete one of theirs. Jobs and the default that used it fall back to the default template. */
export async function deleteTemplate(userId: string, id: string) {
  if (!isUuid(id)) return false;
  const uid = String(userId);
  const c = await collections();
  const deleted = await c.cvTemplates.deleteOne({ _id: id, userId: uid });
  if (!deleted.deletedCount) return false;
  await Promise.all([
    c.profiles.updateOne({ _id: uid, defaultTemplateId: id }, { $set: { defaultTemplateId: null } }),
    c.jobs.updateMany({ userId: uid, "cvStyle.templateId": id }, { $set: { cvStyle: null } }),
  ]);
  return true;
}

/** Only templates they can see can be chosen; anything else is refused. */
export async function setDefaultTemplate(userId: string, id: string) {
  if (!(await getTemplate(userId, id))) return false;
  const updated = await (await collections()).profiles.updateOne({ _id: String(userId) }, { $set: { defaultTemplateId: id } });
  return updated.matchedCount > 0;
}

export async function getDefaultTemplateId(userId: string) {
  const row = await (await collections()).profiles.findOne({ _id: String(userId) }, { projection: { defaultTemplateId: 1 } });
  return row?.defaultTemplateId ?? null;
}

export async function setJobStyle(userId: string, jobId: string, style: CvStyle | null) {
  if (style && !(await getTemplate(userId, style.templateId))) return false;
  const updated = await (await collections()).jobs.updateOne({ _id: String(jobId), userId: String(userId) }, { $set: { cvStyle: style } });
  return updated.matchedCount > 0;
}

/**
 * The template and final spec for a CV: the job's choice, else their default, else Classic.
 * A choice that no longer resolves for this user (deleted, or someone else's) falls back quietly.
 */
export async function resolveCvStyle(userId: string, job?: Pick<Job, "cvStyle"> | null): Promise<{ template: ResolvedTemplate; spec: TemplateSpec; fit: Fit | null }> {
  const candidates = [job?.cvStyle?.templateId, await getDefaultTemplateId(userId), DEFAULT_TEMPLATE_ID];
  for (const id of candidates) {
    const template = await getTemplate(userId, id);
    if (template) {
      const fit = job?.cvStyle && job.cvStyle.templateId === template.id ? job.cvStyle.fit : null;
      return { template, spec: applyFit(template.spec, fit), fit };
    }
  }
  throw new Error("The default template is missing");
}
