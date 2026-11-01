import { z } from "zod";

const str = (max: number) => z.string().trim().max(max);
export const ProfileSchema = z.object({
  name: str(120).min(1, "Add your name"), headline: str(200), email: str(200), phone: str(60), location: str(200),
  links: z.array(str(1000)).max(30), summary: str(6000),
  experience: z.array(z.object({ id: str(60), title: str(300), company: str(300), location: str(200), start: str(60), end: str(60), bullets: z.array(str(3000)).max(50) })).max(40),
  education: z.array(z.object({ id: str(60), school: str(300), degree: str(300), start: str(60), end: str(60), details: z.array(str(2000)).max(30) })).max(20),
  skills: z.array(str(200)).max(200),
  projects: z.array(z.object({ id: str(60), name: str(300), link: str(1000), bullets: z.array(str(5000)).max(60) })).max(40),
  certifications: z.array(str(3000)).max(60), languages: z.array(str(200)).max(30),
  skillLevels: z.record(z.string().max(200), z.enum(["work", "project", "practice", "learning"])).refine((r) => Object.keys(r).length <= 200).optional(),
  linkLabels: z.record(z.string().max(1000), str(40)).refine((r) => Object.keys(r).length <= 60).optional(),
});

export function profileError(issues: z.core.$ZodIssue[]): string {
  const issue = issues[0];
  if (!issue) return "Review your profile details and try saving again.";
  if (issue.message === "Add your name") return "Enter your full name before saving your profile.";
  const labels: Record<string, string> = { name: "Full name", headline: "Headline", email: "Email address", phone: "Phone number", location: "Location", links: "Links", summary: "Summary", experience: "Experience", education: "Education", skills: "Skills", projects: "Projects", certifications: "Certifications", languages: "Languages", title: "Role title", company: "Company", school: "School", degree: "Qualification", start: "Start date", end: "End date", bullets: "Description", details: "Details", link: "Project URL" };
  const field = issue.path.map((part) => typeof part === "number" ? `entry ${part + 1}` : part === "name" && issue.path[0] === "projects" ? "Project title" : labels[String(part)] ?? "Profile detail").join(" · ") || "Profile";
  if (issue.code === "too_big") return `${field}: use ${issue.maximum} ${issue.origin === "array" ? "items" : "characters"} or fewer, then save again.`;
  if (issue.code === "too_small") return `${field}: add the missing information, then save again.`;
  return `${field}: review this information and try saving again. Your changes have not been saved.`;
}
