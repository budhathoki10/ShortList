import PDFDocument from "pdfkit";
import { Document, ExternalHyperlink, Packer, Paragraph, TextRun } from "docx";
import { afterEach, describe, expect, it, vi } from "vitest";
import { extractLinks, extractText, getDocumentProxy } from "unpdf";
import { cvFileToText } from "@/lib/cv/extract-text";
import { heuristicProfile } from "@/lib/cv/heuristic";
import { webUrl } from "@/lib/cv/links";
import { ProfileSchema, profileError } from "@/lib/cv/profile-schema";
import { cvPdfBuffer } from "@/lib/export/pdf";
import { emailComposeUrls } from "@/lib/email-compose";
import { answerFeedback, answerGuide } from "@/lib/tailor/interview";
import { EMPTY_PROFILE } from "@/lib/model/types";
import { profileNeedsRepair } from "@/lib/cv/quality";
import { presentCv } from "@/lib/cv/presentation";
import { parseCv } from "@/lib/cv/parse";
import { isJobSearchPage, jobHasCriteria } from "@/lib/jobs/quality";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

async function linkedPdf() {
  const doc = new PDFDocument({ margin: 45 });
  const chunks: Buffer[] = [];
  const done = new Promise<Buffer>((resolve) => { doc.on("data", (c: Buffer) => chunks.push(c)); doc.on("end", () => resolve(Buffer.concat(chunks))); });
  doc.fontSize(12).text("Alex Example\nSoftware Developer\nalex@example.com | +977 9801234567");
  doc.text("LinkedIn", { link: "https://linkedin.com/in/alex-example" });
  doc.text("GitHub", { link: "https://github.com/alex-example" });
  doc.text("S U M M A R Y\nDeveloper building reliable software products.\nPROJECTS\nQueueBoard — Automation SaaS");
  doc.text("Live", { link: "https://queueboard.example.com" });
  doc.text("Tech Stack: TypeScript, Redis\nBuilt a queue worker that processes webhook events and retries failures.\nUsers can review results before approving them.");
  doc.addPage();
  doc.text("ReviewKit — Code Review App");
  doc.text("Live", { link: "https://reviewkit.example.com" });
  doc.text("Tech Stack: Node.js, MongoDB\nBuilt a review tool that validates incoming webhook signatures.\nEXPERIENCE\nBackend Developer Jun 2025 – Feb 2026\nExample College — Kathmandu, Nepal\n• Built backend services.\nCERTIFICATIONS & ACHIEVEMENTS\n• Backend Developer Certificate\nEDUCATION\nBSc Computer Science 2024 – Present\nExample University — Kathmandu, Nepal\n• Database Systems\nSKILLS\nTools & Platforms: Git, GitHub, Redis\nLANGUAGES\nEnglish: Professional Nepali: Native Hindi: Conversational\n2");
  doc.end();
  return done;
}

describe("CV import regressions", () => {
  it("rejects fragmented AI projects and keeps the source project boundaries and URLs", async () => {
    const text = await cvFileToText({ name: "cv.pdf", type: "application/pdf", bytes: await linkedPdf() });
    const fragmented = { ...EMPTY_PROFILE, name: "Alex Example", projects: Array.from({ length: 8 }, (_, i) => ({ id: `p${i}`, name: `Tech Stack: this is not a project title ${i}`, link: "", bullets: [] })) };
    expect(profileNeedsRepair(fragmented)).toBe(true);
    vi.stubEnv("ANTHROPIC_API_KEY", "unit-test-key");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(fragmented) }] })));
    const { profile, method } = await parseCv(text);
    expect(method).toBe("basic");
    expect(profile.projects).toHaveLength(2);
    expect(profile.projects.every((p) => p.link && p.bullets.length)).toBe(true);
  });

  it("offers verbatim focused highlights while preserving every original source fact", () => {
    const original = { ...EMPTY_PROFILE, summary: "First fact. Second fact. Third fact.", projects: [{ id: "p", name: "Product", link: "https://product.example.com", bullets: ["Tech Stack: TypeScript, Redis", "Built a queue worker that retries failed jobs. Users review the resulting drafts. Validated every incoming webhook signature. Kept the complete original description for later review."] }] };
    const before = JSON.stringify(original);
    const focused = presentCv(original, "focused");
    expect(focused.summary).toBe("First fact. Second fact.");
    expect(focused.projects[0].link).toBe(original.projects[0].link);
    for (const bullet of focused.projects[0].bullets.filter((b) => !b.startsWith("Technologies:"))) expect(original.projects[0].bullets.join(" ")).toContain(bullet);
    expect(presentCv(original, "full")).toEqual(original);
    expect(presentCv(original)).toEqual(original);
    expect(JSON.stringify(original)).toBe(before);
  });

  it("uses the embedded source URLs even when an AI response invents different destinations", async () => {
    const text = await cvFileToText({ name: "cv.pdf", type: "application/pdf", bytes: await linkedPdf() });
    const invented = heuristicProfile(text);
    invented.links = ["https://invented.example.com/"];
    invented.projects[0].link = "https://wrong-project.example.com/";
    vi.stubEnv("ANTHROPIC_API_KEY", "unit-test-key");
    vi.stubGlobal("fetch", vi.fn(async () => Response.json({ type: "message", role: "assistant", stop_reason: "end_turn", content: [{ type: "text", text: JSON.stringify(invented) }] })));
    const { profile } = await parseCv(text);
    expect(profile.links).toEqual(["https://linkedin.com/in/alex-example", "https://github.com/alex-example"]);
    expect(profile.projects[0].link).toBe("https://queueboard.example.com/");
    expect(JSON.stringify(profile)).not.toContain("invented.example.com");
    expect(JSON.stringify(profile)).not.toContain("wrong-project.example.com");
  });
  it("recovers hidden contact links and associates repeated Live labels with the correct project, across pages", async () => {
    const text = await cvFileToText({ name: "linked-cv.pdf", type: "application/pdf", bytes: await linkedPdf() });
    const profile = heuristicProfile(text);
    expect(profile.links).toEqual(["https://linkedin.com/in/alex-example", "https://github.com/alex-example"]);
    expect(profile.projects).toHaveLength(2);
    expect(profile.projects.map((p) => p.link)).toEqual(["https://queueboard.example.com/", "https://reviewkit.example.com/"]);
    expect(profile.projects[0].bullets.join(" ")).toContain("retries failures");
    expect(profile.summary).toBe("Developer building reliable software products.");
    expect(profile.experience[0]).toMatchObject({ title: "Backend Developer", company: "Example College", location: "Kathmandu, Nepal" });
    expect(profile.experience[0].bullets).not.toContain("Backend Developer Certificate");
    expect(profile.certifications).toEqual(["Backend Developer Certificate"]);
    expect(profile.education).toHaveLength(1);
    expect(profile.education[0].school).toContain("Example University");
    expect(profile.skills).toEqual(["Git", "GitHub", "Redis"]);
    expect(profile.languages).toEqual(["English: Professional", "Nepali: Native", "Hindi: Conversational"]);
    expect(ProfileSchema.safeParse(profile).success).toBe(true);
  });

  it("reads Word hyperlinks whose destination is not visible text", async () => {
    const doc = new Document({ sections: [{ children: [
      new Paragraph("Alex Example"), new Paragraph("alex@example.com"),
      new Paragraph({ children: [new ExternalHyperlink({ link: "https://github.com/alex-example", children: [new TextRun("GitHub")] })] }),
      new Paragraph("SUMMARY"), new Paragraph("Software developer building and maintaining reliable web applications for small teams."),
    ] }] });
    const text = await cvFileToText({ name: "cv.docx", type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", bytes: await Packer.toBuffer(doc) });
    expect(heuristicProfile(text).links).toEqual(["https://github.com/alex-example"]);
  });

  it("exports a paginated PDF with clickable URLs, no browser chrome, and no extra footer-only pages", async () => {
    const profile = heuristicProfile(await cvFileToText({ name: "cv.pdf", type: "application/pdf", bytes: await linkedPdf() }));
    const bytes = new Uint8Array(await cvPdfBuffer(profile));
    const roundTrip = heuristicProfile(await cvFileToText({ name: "export.pdf", type: "application/pdf", bytes }));
    expect(roundTrip.projects).toHaveLength(2);
    expect(roundTrip.projects.map((p) => p.link)).toEqual(profile.projects.map((p) => p.link));
    expect(roundTrip.skills).toEqual(profile.skills);
    expect(roundTrip.languages).toEqual(profile.languages);
    const pdf = await getDocumentProxy(new Uint8Array(bytes));
    try {
      expect(pdf.numPages).toBeLessThanOrEqual(2);
      const { text } = await extractText(pdf);
      for (const page of text) { expect(page.length).toBeGreaterThan(100); expect(page).not.toContain("localhost:"); }
      expect(text.join(" ")).toContain("Example University");
      expect((await extractLinks(pdf)).links).toEqual(expect.arrayContaining(["https://github.com/alex-example", "https://queueboard.example.com/", "https://reviewkit.example.com/"]));
    } finally { await pdf.loadingTask.destroy(); }
  });

  it("never exposes active-content URLs as CV links", () => {
    for (const value of ["javascript:alert(1)", "data:text/html,<script>", "https://user:secret@example.com", "file:///etc/passwd"]) expect(webUrl(value)).toBeNull();
  });
});

describe("job description quality", () => {
  it("recognises a search-results page and refuses to turn a title into a match score", () => {
    expect(isJobSearchPage("Get notified about new Fulllstack jobs. Sign in to create job alert. 11,000+ Fulllstack Jobs in United States")).toBe(true);
    expect(jobHasCriteria({ title: "Full Stack Engineer", company: "Example", salary: "", location: "", summary: "Search results", requirements: [], keywords: ["Full Stack", "Software Engineer"] })).toBe(false);
  });
});

describe("application coaching", () => {
  it("turns schema failures into a named field and recovery step without exposing validator jargon", () => {
    const parsed = ProfileSchema.safeParse({ ...EMPTY_PROFILE, name: "Alex", projects: [{ id: "p", name: "x".repeat(301), link: "", bullets: [] }] });
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const message = profileError(parsed.error.issues);
    expect(message).toBe("Projects · entry 1 · Project title: use 300 characters or fewer, then save again.");
    expect(message).not.toMatch(/too_big|expected|string|array|>=|<=/);
  });
  it("coaches a short answer and provides question-specific evidence before answering", async () => {
    const profile = { ...EMPTY_PROFILE, projects: [{ id: "p", name: "API integration", link: "", bullets: ["Built an API and integrated it with a frontend developer."] }] };
    const post = { title: "Developer", company: "Example", location: "", salary: "", summary: "", requirements: [], keywords: [] };
    const feedback = await answerFeedback("How did you collaborate on API integration?", "I can collaborate with frontend in integrating API, handle data.", profile, post);
    expect(feedback.method).toBe("checklist");
    expect(feedback.score).toBeNull();
    expect(feedback.rubric).toHaveLength(5);
    expect(feedback.rewrite).toContain("[Describe the actual result");
    const guide = answerGuide("How did you design the API integration?", profile);
    expect(guide.category).toBe("Technical");
    expect(guide.evidence).toEqual(profile.projects[0].bullets);
    expect(guide.steps.join(" ")).toContain("trade-off");
    expect(feedback.improve.join(" ")).toContain("API endpoint");
  });

  it("does not mistake an unrelated long answer with numbers for a strong answer", async () => {
    const feedback = await answerFeedback("How did you collaborate with your colleague on API design?", "I built a garden and improved my 20 tomato plants. ".repeat(12), EMPTY_PROFILE, { title: "Developer", company: "", location: "", salary: "", summary: "", requirements: [], keywords: [] });
    expect(feedback.score).toBeNull();
    expect(feedback.improve.join(" ")).toContain("connection to this question");
  });

  it("encodes the current letter and chosen mailbox without permitting extra email headers", () => {
    const urls = emailComposeUrls({ from: "alex@example.com", to: "jobs@example.com", subject: "Application & interview", body: "Hi,\nMy work uses C++ & APIs.\nThanks." });
    const gmail = new URL(urls.gmail);
    expect(gmail.searchParams.get("authuser")).toBe("alex@example.com");
    expect(gmail.searchParams.get("body")).toContain("C++ & APIs");
    expect(urls.mailto).toContain("%0A");
    expect(urls.mailto).not.toContain("\n");
  });
});
