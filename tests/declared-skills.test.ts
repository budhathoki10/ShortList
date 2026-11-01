import { describe, expect, it } from "vitest";
import { withSkillEvidence } from "@/lib/cv/skill-evidence";
import { scoreMatch } from "@/lib/match/score";
import { EMPTY_PROFILE, type Change, type JobPost, type Profile, type SkillLevel } from "@/lib/model/types";
import { applyChanges } from "@/lib/tailor/apply";
import { basicChanges, gapSkills } from "@/lib/tailor/basic";
import { levelViolations, unsupportedCvFacts } from "@/lib/tailor/fact-check";

const dev: Profile = {
  ...EMPTY_PROFILE,
  name: "Sam Rivera",
  headline: "Full-stack Software Developer",
  summary: "Full-stack developer with three years building web applications in JavaScript and Node.js.",
  experience: [
    { id: "e1", title: "Software Developer", company: "Pixelworks", location: "Austin", start: "Jan 2022", end: "Present", bullets: ["Built React dashboards used by 300 customers", "Wrote REST APIs in Node.js and Express backed by PostgreSQL", "Set up Linux servers and Docker deployments"] },
  ],
  skills: ["JavaScript", "TypeScript", "React", "Node.js", "Express", "PostgreSQL", "Docker", "Linux", "Git"],
  projects: [{ id: "p1", name: "Log parser", link: "", bullets: ["Wrote a Node.js tool that streams 2GB log files on Linux"] }],
};
const cJob: JobPost = {
  title: "C Developer", company: "Lowlevel Ltd", location: "", salary: "", summary: "",
  requirements: [{ text: "Strong C programming", kind: "must", keywords: ["C"] }, { text: "Linux systems", kind: "must", keywords: ["Linux"] }],
  keywords: ["C", "Linux", "Docker", "Git"],
};

function declare(level: SkillLevel, sentence = ""): Profile {
  const r = withSkillEvidence(dev, { skill: "C", experienceId: "", sentence, level });
  if ("error" in r) throw new Error(r.error);
  return r.profile;
}
const build = (profile: Profile, post = cJob) => {
  const changes = basicChanges(profile, post, scoreMatch(profile, post)).changes.map((c): Change => ({ ...c, accepted: c.flags.length === 0 }));
  return { changes, cv: applyChanges(profile, changes) };
};

describe("declared skills in tailoring", () => {
  it("shows a learning-level C as 'C (learning)', and it stops being a missing skill", () => {
    const p = declare("learning");
    expect(gapSkills(scoreMatch(dev, cJob), cJob)).toContain("C");
    expect(gapSkills(scoreMatch(p, cJob), cJob)).not.toContain("C");
    const { cv } = build(p);
    expect(cv.skills).toContain("C (learning)");
    expect(cv.skills).not.toContain("C");
  });

  it("words the summary at the declared level and never stronger", () => {
    for (const level of ["learning", "practice"] as const) {
      const { cv, changes } = build(declare(level));
      expect(cv.summary).toMatch(/building C skills/i);
      expect(cv.summary).not.toMatch(/expert|specialist|proficient|advanced|years of C|experienced in C/i);
      const summary = changes.find((c) => c.kind === "summary");
      expect(summary?.flags).toEqual([]);
    }
  });

  it("keeps a learning skill out of the headline and behind real experience in the list", () => {
    const { cv } = build(declare("learning"));
    expect(cv.headline).not.toMatch(/\bC\b/);
    expect(cv.skills.indexOf("Linux")).toBeLessThan(cv.skills.indexOf("C (learning)"));
  });

  it("lets a project-level C lead, appear in the summary and in the title line when the job centres on it", () => {
    const { cv } = build(declare("project", "Wrote a small shell in C for a systems course project"));
    expect(cv.skills[0]).toBe("C");
    expect(cv.summary).toMatch(/applied C in project work/);
    expect(cv.headline).toBe("Full-stack Software Developer · C");
  });

  it("blocks an injected 'C specialist' summary at every level", () => {
    for (const level of ["learning", "practice", "project", "work"] as const) {
      const p = declare(level, "Used C in a course project for memory allocators");
      expect(unsupportedCvFacts("C specialist with a track record of low-level performance work.", p).length, level).toBeGreaterThan(0);
      expect(unsupportedCvFacts("Five years of C programming.", p).length, level).toBeGreaterThan(0);
    }
  });

  it("blocks overstating a learning or coursework level, and an unlabelled mention of it", () => {
    const learning = declare("learning");
    expect(levelViolations("Experienced in C and Linux systems.", learning)).not.toEqual([]);
    expect(levelViolations("Strong C programmer.", learning)).not.toEqual([]);
    expect(levelViolations("Software developer working in C.", learning)).not.toEqual([]);
    expect(levelViolations("Currently building C skills through hands-on practice.", learning)).toEqual([]);
    expect(levelViolations("Skills: Linux, C (learning)", learning)).toEqual([]);
    // A project-level skill is allowed to be stated plainly.
    expect(levelViolations("Has applied C in project work.", declare("project", "Wrote a small shell in C for a course"))).toEqual([]);
  });

  it("flags a skill that was never declared or listed", () => {
    const p = declare("learning");
    expect(unsupportedCvFacts("Rust specialist and Go developer.", p).length).toBeGreaterThan(0);
    expect(unsupportedCvFacts("Experienced in Kubernetes and Terraform.", p).length).toBeGreaterThan(0);
    expect(unsupportedCvFacts("Currently building C skills through hands-on practice.", p)).toEqual([]);
  });

  it("leaves a candidate with nothing declared exactly as before", () => {
    const { cv } = build(dev);
    expect(cv.skills).not.toContain("C");
    expect(cv.summary).not.toMatch(/\bC skills\b/);
  });

  it("never lets a level be raised by the system: levels come only from the candidate's record", () => {
    const p = declare("learning");
    const { cv } = build(p);
    expect(cv.skillLevels).toEqual({ C: "learning" });
    // Even an accepted-looking AI skill order can't relabel it: only exact profile strings are kept.
    const forged: Change = { id: "x", kind: "skills-order", order: ["C", ...p.skills], reason: "", flags: [], accepted: true };
    expect(applyChanges(p, [forged]).skills).toContain("C (learning)");
    expect(applyChanges(p, [forged]).skills).not.toContain("C");
  });
});
