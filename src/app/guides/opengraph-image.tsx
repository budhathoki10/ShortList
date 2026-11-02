import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Job search and CV guides — Shortlist Job Radar";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ eyebrow: "Guides", title: "Job search and CV guides", subtitle: "Plain-English answers on finding jobs, tailoring your CV, applying and interviewing." });
}
