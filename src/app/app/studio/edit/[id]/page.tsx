import type { Metadata } from "next";
import { FlashToast } from "@/components/toast";
import Link from "next/link";
import { notFound } from "next/navigation";
import { TemplateEditor } from "@/components/studio/template-editor";
import { requireUser } from "@/lib/auth/session";
import { photoUrl } from "@/lib/services/photos";
import { getProfile, profileReady } from "@/lib/services/profile";
import { getTemplate } from "@/lib/services/templates";
import { atsTwin } from "@/lib/templates/checks";
import { SAMPLE_PROFILE } from "@/lib/templates/sample";

export const metadata: Metadata = { title: "Template editor" };

export default async function EditTemplate({ params, searchParams }: PageProps<"/app/studio/edit/[id]">) {
  const user = await requireUser();
  const [{ id }, { twin, saved }] = await Promise.all([params, searchParams]);
  const [template, profile, photo] = await Promise.all([getTemplate(user.id, id), getProfile(user.id), photoUrl(user.id)]);
  if (!template) notFound();
  const ready = profileReady(profile);
  const startFromTwin = twin === "1";
  return (
    <div className="space-y-2">
      <nav aria-label="Breadcrumb" className="text-[13px] text-muted">
        <Link href="/app/studio" className="hover:text-foreground max-sm:inline-block max-sm:py-3">
          CV Studio
        </Link>{" "}
        / {template.builtin ? <Link href="/app/studio/templates" className="hover:text-foreground max-sm:inline-block max-sm:py-3">Templates</Link> : "My templates"} / {template.name}
      </nav>
      <FlashToast message={saved === "1" ? "Saved to My templates." : null} clear={["saved"]} />
      <TemplateEditor
        key={`${template.id}-${startFromTwin}`}
        initial={startFromTwin ? atsTwin(template.spec) : template.spec}
        templateId={template.id}
        ownTemplate={!template.builtin}
        name={template.builtin ? `${template.name}${startFromTwin ? " ATS" : ""} (mine)` : template.name}
        basedOn={template.builtin ? template.id : template.basedOn}
        cv={ready ? profile : SAMPLE_PROFILE}
        photoUrl={ready ? photo : "/sample-photo.svg"}
        usingSample={!ready}
      />
    </div>
  );
}
