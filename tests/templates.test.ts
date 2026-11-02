import { readFileSync } from "node:fs";
import mammoth from "mammoth";
import sharp from "sharp";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { CvDocument } from "@/components/cv/cv-document";
import { heuristicProfile } from "@/lib/cv/heuristic";
import { linkLabel } from "@/lib/cv/links";
import { cvDocxBuffer } from "@/lib/export/docx";
import { cvPdfBuffer } from "@/lib/export/pdf";
import { EMPTY_PROFILE, type Profile } from "@/lib/model/types";
import { BUILTIN_TEMPLATES, CATEGORY_IDS } from "@/lib/templates/builtin";
import { atsReport, atsTwin, contrastIssues, contrastRatio, photoAdvice, photoSlot } from "@/lib/templates/checks";
import { fitSteps } from "@/lib/templates/fit";
import { filterTemplates, getBuiltin, recommendTemplates, visibleBuiltins } from "@/lib/templates/registry";
import { SAMPLE_PROFILE } from "@/lib/templates/sample";
import { changeLayout, DEFAULT_SPEC, LIMITS, parseSpec, SECTION_IDS, type TemplateSpec } from "@/lib/templates/spec";

const real = heuristicProfile(readFileSync("tests/fixtures/cv.txt", "utf8"));
const long: Profile = {
  ...SAMPLE_PROFILE,
  experience: Array.from({ length: 6 }, (_, i) => ({ ...SAMPLE_PROFILE.experience[0], id: `x${i}`, company: `Company ${i + 1}` })),
  projects: [{ id: "p1", name: "Route planner", link: "github.com/maya/routes", bullets: ["Built a sheet that plans routes"] }],
};
const firstJob: Profile = { ...EMPTY_PROFILE, name: "Sita Rai", headline: "Student", education: SAMPLE_PROFILE.education, skills: ["Excel"], languages: ["Nepali"] };

const html = (spec: TemplateSpec, cv: Profile, photoUrl?: string) => renderToStaticMarkup(createElement(CvDocument, { spec, cv, photoUrl }));
const text = (markup: string) =>
  markup
    .replace(/<wbr\/?>/g, "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#x27;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ");

/** Every fact a profile holds, which an applicant tracking system must be able to read. */
function facts(cv: Profile): string[] {
  return [
    cv.name,
    cv.headline,
    cv.email,
    cv.phone,
    cv.location,
    ...cv.links,
    cv.summary,
    ...cv.experience.flatMap((e) => [e.title, e.company, e.location, e.start, e.end, ...e.bullets]),
    ...cv.education.flatMap((e) => [e.degree, e.school, e.start, e.end, ...e.details]),
    ...cv.skills,
    ...cv.projects.flatMap((p) => [p.name, p.link, ...p.bullets]),
    ...cv.certifications,
    ...cv.languages,
  ].filter(Boolean);
}

describe("template spec", () => {
  it("accepts the default and rejects anything that isn't a plain value in range", () => {
    expect(parseSpec(DEFAULT_SPEC)).toEqual(DEFAULT_SPEC);
    const bad = (patch: object) => parseSpec({ ...DEFAULT_SPEC, ...patch });
    expect(bad({ layout: "magazine" })).toBeNull();
    expect(bad({ palette: { ...DEFAULT_SPEC.palette, accent: "red; background:url(x)" } })).toBeNull();
    expect(bad({ palette: { ...DEFAULT_SPEC.palette, ink: "#12345" } })).toBeNull();
    expect(bad({ fonts: { heading: "comic-sans", body: "inter" } })).toBeNull();
    expect(bad({ fonts: { heading: "inter", body: "playfair" } })).toBeNull(); // display faces are for headings only
    expect(bad({ density: { ...DEFAULT_SPEC.density, fontSize: 4 } })).toBeNull();
    expect(bad({ page: { size: "A3", margin: 16 } })).toBeNull();
    expect(bad({ sections: DEFAULT_SPEC.sections.slice(1) })).toBeNull();
    expect(bad({ sections: [...DEFAULT_SPEC.sections.slice(1), DEFAULT_SPEC.sections[1]] })).toBeNull();
    expect(bad({ extra: "<script>" })).not.toHaveProperty("extra");
  });

  it("lower-cases colours so the same colour is stored one way", () => {
    expect(parseSpec({ ...DEFAULT_SPEC, palette: { ...DEFAULT_SPEC.palette, accent: "#ABCDEF" } })?.palette.accent).toBe("#abcdef");
  });

  it("moves sections to sensible columns when the layout changes", () => {
    const side = changeLayout(DEFAULT_SPEC, "sidebar-left");
    expect(side.sections.find((s) => s.id === "skills")?.column).toBe("side");
    expect(changeLayout(side, "classic").sections.every((s) => s.column === "main")).toBe(true);
  });
});

describe("the 100 built-in templates", () => {
  it("has 100 with unique, permanent-looking ids and names", () => {
    expect(BUILTIN_TEMPLATES).toHaveLength(100);
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.id)).size).toBe(100);
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.name)).size).toBe(100);
    BUILTIN_TEMPLATES.forEach((t, i) => expect(t.id).toBe(`sl-${String(i + 1).padStart(3, "0")}`));
  });

  it("all validate and every category has a good choice", () => {
    for (const t of BUILTIN_TEMPLATES) expect(parseSpec(t.spec), t.id).toEqual(t.spec);
    for (const c of CATEGORY_IDS) expect(BUILTIN_TEMPLATES.filter((t) => t.categories.includes(c)).length, c).toBeGreaterThanOrEqual(6);
    expect(new Set(BUILTIN_TEMPLATES.map((t) => t.spec.layout)).size).toBe(10);
  });

  it("only puts truly ATS-safe templates in the ATS-safe category", () => {
    for (const t of BUILTIN_TEMPLATES.filter((t) => t.categories.includes("ats"))) expect(atsReport(t.spec).level, t.id).toBe("safe");
  });

  it("are all readable: body text, dates and titles have enough contrast", () => {
    for (const t of BUILTIN_TEMPLATES) expect(contrastIssues(t.spec), `${t.id} ${t.name}`).toEqual([]);
  });

  it.each([
    ["a real CV", real],
    ["a long CV", long],
    ["a first-job CV with no experience", firstJob],
  ])("render %s with every fact readable, in every template", (_, cv) => {
    const expected = facts(cv);
    for (const t of BUILTIN_TEMPLATES) {
      const out = text(html(t.spec, cv, "/app/photo"));
      for (const fact of expected) {
        // Web addresses are links now, shown short ("linkedin.com/in/x"); the full address is the link target.
        const shown = /^https?:\/\//i.test(fact) ? fact.replace(/^https?:\/\/(www\.)?/i, "").replace(/\/$/, "") : fact;
        expect(out, `${t.id} is missing "${shown}"`).toContain(shown);
      }
    }
  });

  it("make email and web addresses real links, so they work in the saved PDF", () => {
    const out = html(BUILTIN_TEMPLATES[0].spec, real, undefined);
    expect(out).toContain('href="mailto:asha.gurung@example.com"');
    expect(out).toContain('href="https://linkedin.com/in/ashagurung"');
  });

  it("link the same words as the original CV: LinkedIn, GitHub, Live, Certificate", () => {
    const cv: Profile = {
      ...SAMPLE_PROFILE,
      links: ["https://www.linkedin.com/in/maya/", "https://github.com/maya"],
      projects: [{ id: "p1", name: "FeedWatch", link: "https://feedwatch.example.com/", bullets: ["Finds leads."] }],
      certifications: ["Backend Developer – Herald College Certificate (https://cert.example.com/a.jpg)"],
      linkLabels: {
        "https://www.linkedin.com/in/maya/": "LinkedIn",
        "https://github.com/maya": "GitHub",
        "https://feedwatch.example.com/": "Live",
        "https://cert.example.com/a.jpg": "Certificate",
      },
    };
    for (const t of BUILTIN_TEMPLATES) {
      const out = html(t.spec, cv);
      expect(out, t.id).toContain('<a href="https://www.linkedin.com/in/maya/">LinkedIn</a>');
      expect(out, t.id).toContain('<a href="https://github.com/maya">GitHub</a>');
      expect(out, t.id).toContain('<a href="https://feedwatch.example.com/">Live</a>');
      expect(out, t.id).toContain('<a href="https://cert.example.com/a.jpg">Certificate</a>');
      // The raw addresses never show as text.
      expect(text(out), t.id).not.toMatch(/linkedin\.com|cert\.example\.com|feedwatch\.example\.com/);
    }
  });

  it("keep the reading order: name, then work, then the side panel", () => {
    for (const t of BUILTIN_TEMPLATES) {
      const out = text(html(t.spec, SAMPLE_PROFILE));
      const name = out.indexOf("Maya Thapa");
      const work = out.indexOf("Planned weekly delivery routes");
      expect(name, t.id).toBeGreaterThanOrEqual(0);
      expect(work, t.id).toBeGreaterThan(name);
    }
  });

  it("leave out empty sections and hidden ones", () => {
    const out = html(DEFAULT_SPEC, firstJob);
    expect(out).not.toContain(">Experience<");
    const hidden = { ...DEFAULT_SPEC, sections: DEFAULT_SPEC.sections.map((s) => (s.id === "skills" ? { ...s, visible: false } : s)) };
    expect(html(hidden, SAMPLE_PROFILE)).not.toContain(">Skills<");
  });

  it("show the photo only when the template has a slot and there's a photo", () => {
    const photo = getBuiltin("sl-081")!.spec;
    expect(html(photo, SAMPLE_PROFILE, "/app/photo")).toContain('src="/app/photo"');
    expect(html(photo, SAMPLE_PROFILE)).not.toContain("<img");
    expect(html(DEFAULT_SPEC, SAMPLE_PROFILE, "/app/photo")).not.toContain("<img");
  });

  it("never put user text into styles", () => {
    const sneaky = { ...SAMPLE_PROFILE, name: '"><style>body{display:none}</style>', skills: ["</li><script>alert(1)</script>"] };
    const out = html(getBuiltin("sl-084")!.spec, sneaky);
    expect(out).not.toContain("<style>");
    expect(out).not.toContain("<script>");
  });
});

describe("template checks", () => {
  it("labels ATS safety from the layout and photo", () => {
    expect(atsReport(DEFAULT_SPEC).level).toBe("safe");
    expect(atsReport({ ...DEFAULT_SPEC, photo: "circle" }).level).toBe("mostly");
    expect(atsReport(changeLayout(DEFAULT_SPEC, "modern-grid")).level).toBe("mostly");
    expect(atsReport(changeLayout(DEFAULT_SPEC, "sidebar-right")).level).toBe("caution");
  });

  it("makes an ATS-safe twin that keeps the look", () => {
    const fancy = getBuiltin("sl-085")!.spec;
    const twin = atsTwin(fancy);
    expect(atsReport(twin).level).toBe("safe");
    expect(twin.fonts).toEqual(fancy.fonts);
    expect(twin.palette).toEqual(fancy.palette);
    expect(twin.sections.every((s) => s.column === "main")).toBe(true);
  });

  it("measures contrast like WCAG", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 0);
    expect(contrastRatio("#777777", "#ffffff")).toBeCloseTo(4.48, 1);
    expect(contrastIssues({ ...DEFAULT_SPEC, palette: { ...DEFAULT_SPEC.palette, muted: "#bbbbbb" } })).toHaveLength(1);
  });

  it("gives photo advice by place", () => {
    expect(photoAdvice(DEFAULT_SPEC, "Dubai, UAE")?.tone).toBe("info");
    expect(photoAdvice({ ...DEFAULT_SPEC, photo: "circle" }, "London, UK")?.tone).toBe("warning");
    expect(photoAdvice(DEFAULT_SPEC, "London, UK")).toBeNull();
  });
});

describe("fit to pages", () => {
  it("only ever tightens, stays within limits, and ends at the tightest allowed", () => {
    const steps = fitSteps(getBuiltin("sl-008")!.spec);
    expect(steps[0].density).toEqual(getBuiltin("sl-008")!.spec.density);
    for (let i = 1; i < steps.length; i++) {
      const [a, b] = [steps[i - 1], steps[i]];
      expect(b.density.fontSize).toBeLessThanOrEqual(a.density.fontSize);
      expect(b.density.sectionGap).toBeLessThanOrEqual(a.density.sectionGap);
      expect(b.density.lineHeight).toBeLessThanOrEqual(a.density.lineHeight);
      expect(b.margin).toBeLessThanOrEqual(a.margin);
    }
    const last = steps.at(-1)!;
    expect(last.density.fontSize).toBe(LIMITS.fontSize[0]);
    expect(last.margin).toBeGreaterThanOrEqual(LIMITS.margin[0]);
    for (const s of steps) expect(parseSpec({ ...DEFAULT_SPEC, density: s.density, page: { size: "A4", margin: s.margin } })).not.toBeNull();
  });
});

describe("finding templates", () => {
  it("filters by category, ATS label, columns, photo, colour and words", () => {
    const all = visibleBuiltins();
    expect(filterTemplates(all, { category: "tech" }).every((t) => t.categories.includes("tech"))).toBe(true);
    expect(filterTemplates(all, { columns: "2" }).every((t) => t.spec.layout.startsWith("sidebar"))).toBe(true);
    expect(filterTemplates(all, { photo: "yes" }).every((t) => t.spec.photo !== "off")).toBe(true);
    expect(filterTemplates(all, { ats: "safe", colour: "teal" }).length).toBeGreaterThan(0);
    expect(filterTemplates(all, { q: "kathmandu" }).map((t) => t.id)).toEqual(["sl-090"]);
  });

  it("recommends by field and place, spread over different layouts", () => {
    const nurseInDubai = recommendTemplates({ ...SAMPLE_PROFILE, headline: "Staff Nurse", location: "Dubai, UAE" });
    expect(new Set(nurseInDubai.map((t) => t.family)).size).toBe(nurseInDubai.length);
    expect(nurseInDubai.some((t) => t.categories.includes("healthcare"))).toBe(true);
    expect(nurseInDubai.some((t) => t.spec.photo !== "off")).toBe(true);

    const devInLondon = recommendTemplates({ ...SAMPLE_PROFILE, headline: "Software Engineer", location: "London, UK" });
    expect(devInLondon.every((t) => t.spec.photo === "off")).toBe(true);
    expect(devInLondon[0].categories).toContain("tech");
  });
});

it("knows every section", () => {
  expect(new Set(DEFAULT_SPEC.sections.map((s) => s.id))).toEqual(new Set(SECTION_IDS));
});

describe("Word export follows the template", () => {
  const families = [...new Map(BUILTIN_TEMPLATES.map((t) => [t.family, t])).values()];

  it.each(families.map((t) => [t.family, t] as const))("%s: every fact is in the Word file", async (_, t) => {
    const photo = await sharp({ create: { width: 20, height: 20, channels: 3, background: "#888888" } }).png().toBuffer();
    const buf = await cvDocxBuffer(long, t.spec, photo);
    const { value } = await mammoth.extractRawText({ buffer: buf });
    // Links are written as a clickable label ("LinkedIn"), with the address behind it.
    const links = new Set([...long.links, ...long.projects.map((p) => p.link)]);
    for (const fact of facts(long)) {
      const shown = links.has(fact) ? linkLabel(fact) : fact;
      expect(value, `${t.id} Word file is missing "${shown}"`).toContain(shown);
    }
  });

  it("uses the template's fonts, colours and paper size", async () => {
    const t = getBuiltin("sl-033")!; // Charter: Playfair Display and Lora, burgundy, A4
    const xml = await import("jszip").then(async ({ default: JSZip }) => (await JSZip.loadAsync(await cvDocxBuffer(SAMPLE_PROFILE, t.spec))).file("word/document.xml")!.async("string"));
    expect(xml).toContain('w:ascii="Playfair Display"');
    expect(xml).toContain('w:ascii="Lora"');
    expect(xml).toContain(t.spec.palette.accent.slice(1).toUpperCase());
    expect(xml).toContain('w:w="11906"'); // A4 width in twips
  });
});

describe("an uploaded photo reaches every kind of CV", () => {
  const withSlot = getBuiltin("sl-081")!.spec; // Sidecar: left sidebar with a photo slot
  const photoPng = () => sharp({ create: { width: 40, height: 40, channels: 3, background: "#cc3333" } }).png().toBuffer();
  const pdfImages = (pdf: Buffer) => (pdf.toString("latin1").match(/\/Subtype \/Image/g) ?? []).length;

  it("puts the photo into the PDF, which used to ignore it", async () => {
    const png = await photoPng();
    expect(pdfImages(await cvPdfBuffer(SAMPLE_PROFILE))).toBe(0);
    for (const shape of ["circle", "square", "rounded"] as const) expect(pdfImages(await cvPdfBuffer(SAMPLE_PROFILE, { png, shape }))).toBe(1);
  });

  it("stays a valid, larger PDF once a photo is added", async () => {
    const withPhoto = await cvPdfBuffer(SAMPLE_PROFILE, { png: await photoPng(), shape: "circle" });
    expect(withPhoto.subarray(0, 5).toString()).toBe("%PDF-");
    expect((await cvPdfBuffer(SAMPLE_PROFILE)).length).toBeLessThan(withPhoto.length);
  });

  it("explains the photo from one answer: shown, off, no slot, or none", () => {
    expect(photoSlot(withSlot, { onCv: true })).toBe("shown");
    expect(photoSlot(withSlot, { onCv: false })).toBe("off");
    expect(photoSlot(DEFAULT_SPEC, { onCv: true })).toBe("no-slot");
    expect(photoSlot(withSlot, null)).toBe("none");
  });

  it("shows the photo in the preview and the Word file for a template with a slot", async () => {
    expect(html(withSlot, SAMPLE_PROFILE, "/app/photo?v=1")).toContain('src="/app/photo?v=1"');
    const { default: JSZip } = await import("jszip");
    const zip = await JSZip.loadAsync(await cvDocxBuffer(SAMPLE_PROFILE, withSlot, await photoPng()));
    expect(Object.keys(zip.files).some((name) => name.startsWith("word/media/"))).toBe(true);
  });
});
