import { guideBySlug } from "@/lib/guides";
import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;
export const alt = "Shortlist Job Radar guide";

export default async function Image({ params }: { params: Promise<{ slug: string }> }) {
  const guide = guideBySlug((await params).slug);
  return ogImage({ eyebrow: "Guide", title: guide?.h1 ?? "Job search guide", subtitle: guide?.description ?? "Job search and CV guidance from Shortlist Job Radar." });
}
