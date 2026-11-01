import { describe, expect, it } from "vitest";
import { withSkillEvidence } from "@/lib/cv/skill-evidence";
import { declaredSkills, parseSkillLabel, reconcileSkills, skillLabel } from "@/lib/cv/skill-levels";
import { ProfileSchema } from "@/lib/cv/profile-schema";
import type { Profile } from "@/lib/model/types";

const base: Profile = {
  name: "Asha Gurung",
  headline: "",
  email: "",
  phone: "",
  location: "",
  links: [],
  summary: "",
  experience: [{ id: "x1", title: "Support Specialist", company: "Brightdesk", location: "", start: "2022", end: "Present", bullets: ["Answered tickets in Zendesk"] }],
  education: [],
  skills: ["Zendesk"],
  projects: [],
  certifications: [],
  languages: [],
} as Profile;

const ok = (r: ReturnType<typeof withSkillEvidence>) => {
  if ("error" in r) throw new Error(r.error);
  return r.profile;
};

describe("I have this", () => {
  it("adds only the candidate's own sentence, under the role they picked", () => {
    const p = ok(withSkillEvidence(base, { skill: "HubSpot", experienceId: "x1", sentence: "  - Set up HubSpot   for 40 accounts ", level: "work" }));
    expect(p.skills).toEqual(["Zendesk", "HubSpot"]);
    expect(p.skillLevels).toEqual({ HubSpot: "work" });
    expect(p.experience[0].bullets).toEqual(["Answered tickets in Zendesk", "Set up HubSpot for 40 accounts"]);
    expect(base.experience[0].bullets).toHaveLength(1); // the original is untouched
  });

  it("requires a level and, for work or project use, the candidate's own words", () => {
    expect(withSkillEvidence(base, { skill: "HubSpot", experienceId: "x1", sentence: "Set up HubSpot for 40 accounts", level: "" })).toHaveProperty("error");
    expect(withSkillEvidence(base, { skill: "HubSpot", experienceId: "x1", sentence: "yes", level: "work" })).toHaveProperty("error");
    expect(withSkillEvidence(base, { skill: "HubSpot", experienceId: "", sentence: "", level: "project" })).toHaveProperty("error");
    expect(withSkillEvidence(base, { skill: "HubSpot", experienceId: "nope", sentence: "Set up HubSpot for 40 accounts", level: "work" })).toHaveProperty("error");
    expect(withSkillEvidence(base, { skill: " ", experienceId: "", sentence: "", level: "learning" })).toHaveProperty("error");
  });

  it("shows the level on the CV: plain for work and project, labelled for practice and learning", () => {
    expect(ok(withSkillEvidence(base, { skill: "C", experienceId: "", sentence: "Wrote a small shell in C for a side project", level: "project" })).skills).toContain("C");
    expect(ok(withSkillEvidence(base, { skill: "C", experienceId: "", sentence: "", level: "practice" })).skills).toContain("C (coursework)");
    expect(ok(withSkillEvidence(base, { skill: "C", experienceId: "", sentence: "", level: "learning" })).skills).toContain("C (learning)");
  });

  it("never files a practice or learning sentence under an employer", () => {
    const p = ok(withSkillEvidence(base, { skill: "C", experienceId: "x1", sentence: "Working through the K&R exercises", level: "learning" }));
    expect(p.experience[0].bullets).toEqual(["Answered tickets in Zendesk"]);
    expect(p.projects.flatMap((x) => x.bullets)).toContain("Working through the K&R exercises");
  });

  it("doesn't list a skill twice, and re-declaring replaces the level instead of upgrading silently", () => {
    const once = ok(withSkillEvidence(base, { skill: "C", experienceId: "", sentence: "", level: "learning" }));
    const twice = ok(withSkillEvidence(once, { skill: "c", experienceId: "", sentence: "", level: "practice" }));
    expect(twice.skills.filter((s) => /^c\b/i.test(s))).toEqual(["C (coursework)"]);
    expect(ok(withSkillEvidence(base, { skill: "zendesk", experienceId: "", sentence: "", level: "learning" })).skills).toEqual(["Zendesk (learning)"]);
  });
});

describe("skill levels", () => {
  it("formats and reads back labels", () => {
    expect(skillLabel("C", "learning")).toBe("C (learning)");
    expect(skillLabel("C", "work")).toBe("C");
    expect(parseSkillLabel("C (coursework)")).toEqual({ name: "C", level: "practice" });
    expect(parseSkillLabel("C++")).toEqual({ name: "C++" });
  });

  it("keeps the list and the record in agreement and never promotes a level", () => {
    // The person deleted the label by hand: the record still decides, so the CV stays modest.
    expect(reconcileSkills(["C"], { C: "learning" })).toEqual({ skills: ["C (learning)"], skillLevels: { C: "learning" } });
    // A typed label with no record becomes the record.
    expect(reconcileSkills(["Go (learning)"], {})).toEqual({ skills: ["Go (learning)"], skillLevels: { Go: "learning" } });
    // A removed skill drops its level.
    expect(reconcileSkills(["React"], { C: "learning" })).toEqual({ skills: ["React"], skillLevels: {} });
  });

  it("survives the profile schema and lists declared skills", () => {
    const parsed = ProfileSchema.parse({ ...base, skills: ["C (learning)"], skillLevels: { C: "learning" } });
    expect(parsed.skillLevels).toEqual({ C: "learning" });
    expect(declaredSkills(parsed as Profile)).toEqual([{ skill: "C", level: "learning", label: "C (learning)" }]);
    expect(ProfileSchema.safeParse({ ...base, skillLevels: { C: "expert" } }).success).toBe(false);
  });
});
