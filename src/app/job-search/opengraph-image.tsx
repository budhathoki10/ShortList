import { OG_CONTENT_TYPE, OG_SIZE, ogImage } from "@/lib/og";

export const alt = "Find jobs that match your CV — Shortlist Job Radar";
export const size = OG_SIZE;
export const contentType = OG_CONTENT_TYPE;

export default function Image() {
  return ogImage({ eyebrow: "CV-based job search", title: "Find jobs that match your CV", subtitle: "Local, remote, graduate and entry-level roles checked against your skills, location and eligibility." });
}
