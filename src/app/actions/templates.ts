"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { overLimit } from "@/lib/services/rate-limit";
import { ownedJob } from "@/lib/services/jobs";
import { deletePhoto, PhotoError, savePhoto, setPhotoOnCv } from "@/lib/services/photos";
import {
  deleteTemplate,
  getTemplate,
  saveTemplate,
  setDefaultTemplate,
  setJobStyle,
  TemplateLimitError,
} from "@/lib/services/templates";
import { parseSpec } from "@/lib/templates/spec";
import { cvStyleSchema, fitSchema, templateIdSchema } from "@/lib/templates/style";

export type TemplateState = { error?: string; success?: string; id?: string } | undefined;

const field = (formData: FormData, name: string) => String(formData.get(name) ?? "");

/** Save the editor's spec as a new template of their own, or over one of theirs. */
export async function saveTemplateAction(_: TemplateState, formData: FormData): Promise<TemplateState> {
  const user = await requireUser();
  let raw: unknown;
  try {
    raw = JSON.parse(field(formData, "spec"));
  } catch {
    return { error: "Unable to read these template settings. Refresh the page and try again." };
  }
  const spec = parseSpec(raw);
  if (!spec) return { error: "Some settings are out of range. Reset the last change and try again." };
  const id = field(formData, "id") || null;
  const asNew = formData.get("asNew") === "1";
  const basedOn = field(formData, "basedOn") || null;
  try {
    const row = await saveTemplate(user.id, { id: asNew ? null : id, name: field(formData, "name"), spec, basedOn: basedOn && templateIdSchema.safeParse(basedOn).success ? basedOn : null });
    if (!row) return { error: "This template cannot be edited directly. Save a copy to make your changes." };
    revalidatePath("/app/studio", "layout");
    if (asNew || !id) redirect(`/app/studio/edit/${row.id}?saved=1`);
    return { success: "Template saved.", id: row.id };
  } catch (err) {
    if (err instanceof TemplateLimitError) return { error: err.message };
    throw err;
  }
}

export async function deleteTemplateAction(formData: FormData) {
  const user = await requireUser();
  await deleteTemplate(user.id, field(formData, "id"));
  revalidatePath("/app", "layout");
  redirect("/app/studio?deleted=1");
}

/** Make a copy of any template they can see (a built-in or one of theirs) to edit. */
export async function duplicateTemplateAction(formData: FormData) {
  const user = await requireUser();
  const source = await getTemplate(user.id, field(formData, "id"));
  if (!source) redirect("/app/studio/templates");
  let id: string;
  try {
    const row = await saveTemplate(user.id, { name: `${source.name} copy`, spec: source.spec, basedOn: source.builtin ? source.id : source.basedOn });
    id = row!.id;
  } catch (err) {
    if (err instanceof TemplateLimitError) redirect("/app/studio?full=1");
    throw err;
  }
  revalidatePath("/app/studio", "layout");
  redirect(`/app/studio/edit/${id}`);
}

export async function setDefaultTemplateAction(_: TemplateState, formData: FormData): Promise<TemplateState> {
  const user = await requireUser();
  if (!(await setDefaultTemplate(user.id, field(formData, "id")))) return { error: "Add your CV first, then choose a default look." };
  revalidatePath("/app", "layout");
  return { success: "Default CV template updated. Jobs without a custom template will use this design." };
}

/** Choose the look of one job's CV, optionally with a fit-to-pages setting. */
export async function setJobTemplateAction(_: TemplateState, formData: FormData): Promise<TemplateState> {
  const user = await requireUser();
  const jobId = field(formData, "jobId");
  if (!(await ownedJob(user.id, jobId))) return { error: "This job is no longer available. Return to Jobs and select a saved vacancy." };
  const templateId = field(formData, "templateId");
  if (!templateId) {
    await setJobStyle(user.id, jobId, null);
  } else {
    let fit = null;
    const rawFit = field(formData, "fit");
    if (rawFit) {
      try {
        const parsed = fitSchema.safeParse(JSON.parse(rawFit));
        if (parsed.success) fit = parsed.data;
      } catch {}
    }
    const style = cvStyleSchema.safeParse({ templateId, fit });
    if (!style.success || !(await setJobStyle(user.id, jobId, style.data))) return { error: "This template is unavailable. Choose another design and try again." };
  }
  revalidatePath(`/app/jobs/${jobId}`, "layout");
  return { success: "CV design updated." };
}

export async function uploadPhotoAction(_: TemplateState, formData: FormData): Promise<TemplateState> {
  const user = await requireUser();
  const file = formData.get("photo");
  if (!(file instanceof File) || file.size === 0) return { error: "Choose a photo first." };
  if (await overLimit(`photo:${user.id}`, 20, 60 * 60_000)) return { error: "You’ve uploaded several photos in the last hour. Please try again later." };
  try {
    await savePhoto(user.id, new Uint8Array(await file.arrayBuffer()));
  } catch (err) {
    if (err instanceof PhotoError) return { error: err.message };
    throw err;
  }
  revalidatePath("/app", "layout");
  return { success: "Photo saved. It shows on templates with a photo slot." };
}

export async function setPhotoOnCvAction(onCv: boolean) {
  const user = await requireUser();
  await setPhotoOnCv(user.id, onCv === true);
  revalidatePath("/app", "layout");
}

export async function removePhotoAction(_: TemplateState): Promise<TemplateState> {
  const user = await requireUser();
  await deletePhoto(user.id);
  revalidatePath("/app", "layout");
  return { success: "Photo removed." };
}
