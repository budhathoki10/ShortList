/** Shapes stored as JSON. The profile is the single source of facts about the user. */

export type Experience = {
  id: string;
  title: string;
  company: string;
  location: string;
  start: string;
  /** "Present" for a current role. */
  end: string;
  bullets: string[];
};

export type Education = {
  id: string;
  school: string;
  degree: string;
  start: string;
  end: string;
  details: string[];
};

export type Project = { id: string; name: string; link: string; bullets: string[] };
export const CV_SECTIONS = ["summary", "skills", "experience", "projects", "education", "certifications", "languages"] as const;
export type CvSection = typeof CV_SECTIONS[number];

export type Profile = {
  name: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  links: string[];
  summary: string;
  experience: Experience[];
  education: Education[];
  skills: string[];
  projects: Project[];
  certifications: string[];
  languages: string[];
  /** The word each link sat on in the original CV ("LinkedIn", "Live"), keyed by address. Display only. */
  linkLabels?: Record<string, string>;
  /** Presentation of an accepted tailored version; never new candidate facts. */
  sectionOrder?: CvSection[];
  /** Grouped presentation of the same skills (for example "Languages", "Tools"), job-relevant group first. Never adds a skill. */
  skillGroups?: SkillGroup[];
};

export type SkillGroup = { label: string; skills: string[] };

export const EMPTY_PROFILE: Profile = {
  name: "",
  headline: "",
  email: "",
  phone: "",
  location: "",
  links: [],
  summary: "",
  experience: [],
  education: [],
  skills: [],
  projects: [],
  certifications: [],
  languages: [],
};

export type Requirement = { text: string; kind: "must" | "nice"; keywords: string[] };

export type JobPost = {
  title: string;
  company: string;
  location: string;
  salary: string;
  summary: string;
  requirements: Requirement[];
  /** Skills, tools and qualifications the post asks for, in the post's own words. */
  keywords: string[];
};

export type KeywordHit = { keyword: string; where: "shown" | "listed" | "missing"; evidence: string | null };

export type Match = {
  score: number;
  keywords: KeywordHit[];
  requirements: { text: string; kind: "must" | "nice"; status: "shown" | "listed" | "missing"; evidence: string | null }[];
};

/**
 * One proposed edit to the profile for a specific job. Edits only rephrase or reorder what's
 * already in the profile; anything that introduces a new fact is flagged and can't be accepted.
 */
type ChangeBase = { id: string; reason: string; flags: string[]; accepted: boolean; /** Off by default and left out of "Use all": shortening or reshuffling the person's history. */ optional?: boolean };

export type Change =
  | (ChangeBase & { kind: "summary"; before: string; after: string })
  | (ChangeBase & { kind: "headline"; before: string; after: string })
  | (ChangeBase & { kind: "bullet"; experienceId: string; index: number; before: string; after: string })
  | (ChangeBase & { kind: "bullet-order"; experienceId: string; order: number[] })
  | (ChangeBase & { kind: "bullet-drop"; experienceId: string; index: number; before: string })
  | (ChangeBase & { kind: "experience-order"; order: string[] })
  | (ChangeBase & { kind: "skills-order"; order: string[] })
  | (ChangeBase & { kind: "skills-groups"; groups: SkillGroup[] })
  | (ChangeBase & { kind: "skills-trim"; drop: string[] })
  | (ChangeBase & { kind: "project-bullet"; projectId: string; index: number; before: string; after: string })
  | (ChangeBase & { kind: "projects-order"; order: string[] })
  | (ChangeBase & { kind: "section-order"; order: CvSection[] });

/** A requirement the CV can't honestly claim, with a real way to earn it. Shown beside the CV, never put in it. */
export type CloseGap = { skill: string; action: string; describeAs: string };

export type TailoredCv = { changes: Change[]; closeGaps?: CloseGap[] };

export type InterviewQuestion = { id: string; question: string; why: string; answer: string; feedback: AnswerFeedback | null; prompt?: import("@/lib/career/types").CareerQuestion };

export type AnswerFeedback = {
  score: number | null; strengths: string[]; improve: string[]; rewrite: string;
  method?: "ai" | "checklist";
  rubric?: { label: string; score: number | null; note: string }[];
  corrections?: string[]; modelAnswer?: string; sources?: { title: string; url: string }[];
};
