import { CV_SECTIONS, type Change, type Profile } from "@/lib/model/types";

/** The CV for one job: the profile with the accepted changes applied. Rejected and flagged changes are ignored. */
export function applyChanges(profile: Profile, changes: Change[]): Profile {
  const cv: Profile = structuredClone(profile);
  for (const c of changes) {
    if (!c.accepted || c.flags.length > 0) continue;
    if (c.kind === "summary" && c.before === profile.summary) cv.summary = c.after;
    if (c.kind === "headline" && c.before === profile.headline) cv.headline = c.after;
    if (c.kind === "project-bullet") {
      const project = cv.projects.find((p) => p.id === c.projectId);
      if (project && c.index >= 0 && c.before === project.bullets[c.index]) project.bullets[c.index] = c.after;
    }
    if (c.kind === "section-order" && c.order.length === CV_SECTIONS.length && new Set(c.order).size === CV_SECTIONS.length && c.order.every((id) => CV_SECTIONS.includes(id))) cv.sectionOrder = [...c.order];
    if (c.kind === "skills-order") {
      const known = c.order.filter((s) => cv.skills.includes(s));
      cv.skills = [...known, ...cv.skills.filter((s) => !known.includes(s))];
    }
    if (c.kind === "skills-groups") {
      // Only skills the profile already has, each once; any it forgot to place go in a last group.
      const seen = new Set<string>();
      const groups = c.groups
        .map((g) => ({ label: g.label, skills: g.skills.filter((s) => profile.skills.includes(s) && !seen.has(s) && seen.add(s)) }))
        .filter((g) => g.skills.length > 0);
      const rest = profile.skills.filter((s) => !seen.has(s));
      if (groups.length > 1 && rest.length) groups.push({ label: "Other", skills: rest });
      if (groups.length > 1) {
        cv.skillGroups = groups;
        cv.skills = groups.flatMap((g) => g.skills);
      } else if (groups.length === 1) cv.skills = [...groups[0].skills, ...rest];
    }
    const exp = "experienceId" in c ? cv.experience.find((e) => e.id === c.experienceId) : undefined;
    if (!exp) continue;
    if (c.kind === "bullet" && c.index >= 0 && c.index < exp.bullets.length && c.before === exp.bullets[c.index]) exp.bullets[c.index] = c.after;
  }
  // Reorder after rewriting, so bullet indexes in rewrites always refer to the original order.
  for (const c of changes) {
    if (c.accepted && !c.flags.length && c.kind === "projects-order" && c.order.length === cv.projects.length && new Set(c.order).size === cv.projects.length && c.order.every((id) => cv.projects.some((p) => p.id === id))) cv.projects = c.order.map((id) => cv.projects.find((p) => p.id === id)!);
    if (!c.accepted || c.flags.length > 0 || c.kind !== "bullet-order") continue;
    const exp = cv.experience.find((e) => e.id === c.experienceId);
    if (!exp || !isPermutation(c.order, exp.bullets.length)) continue;
    exp.bullets = c.order.map((i) => exp.bullets[i]);
  }
  // Drops go last and find their bullet by its text, so reordering never moves the wrong one.
  for (const c of changes) {
    if (!c.accepted || c.flags.length > 0) continue;
    if (c.kind === "experience-order" && c.order.length === cv.experience.length && new Set(c.order).size === c.order.length && c.order.every((id) => cv.experience.some((e) => e.id === id))) cv.experience = c.order.map((id) => cv.experience.find((e) => e.id === id)!);
    if (c.kind === "bullet-drop") {
      const exp = cv.experience.find((e) => e.id === c.experienceId);
      const at = exp ? exp.bullets.indexOf(c.before) : -1;
      if (exp && at >= 0 && exp.bullets.length > 1) exp.bullets.splice(at, 1);
    }
    if (c.kind === "skills-trim") {
      const keep = cv.skills.filter((s) => !c.drop.includes(s));
      if (keep.length >= 3) {
        cv.skills = keep;
        if (cv.skillGroups) cv.skillGroups = cv.skillGroups.map((g) => ({ ...g, skills: g.skills.filter((s) => keep.includes(s)) })).filter((g) => g.skills.length > 0);
      }
    }
  }
  return cv;
}

export function isPermutation(order: number[], length: number): boolean {
  return order.length === length && new Set(order).size === length && order.every((i) => Number.isInteger(i) && i >= 0 && i < length);
}
