import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "100 free CV and resume templates — Shortlist Job Radar";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ eyebrow: "CV templates", title: "100 free CV and resume templates", subtitle: "Every design is labelled for how well applicant tracking systems can read it." });
}
