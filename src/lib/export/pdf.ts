import "server-only";
import PDFDocument from "pdfkit";
import { CV_SECTIONS, type CvSection, type Profile } from "@/lib/model/types";
import { skillGroupLines } from "@/lib/cv/presentation";
import { linkLabel, textLinks, webUrl } from "@/lib/cv/links";

/** A real, selectable-text PDF. Pagination and links never depend on browser print settings. */
export async function cvPdfBuffer(cv: Profile): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 46, bottom: 46, left: 48, right: 48 }, bufferPages: true,
    info: { Title: `${cv.name} — CV`, Author: cv.name, Creator: "Shortlist" } });
  const chunks: Buffer[] = [];
  const complete = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (chunk: Buffer) => chunks.push(chunk));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  const width = doc.page.width - 96;
  const bottom = () => doc.page.height - 46;
  const space = (height: number) => { if (doc.y + height > bottom()) doc.addPage(); };
  const plain = () => doc.font("Helvetica").fontSize(10.5).fillColor("#26313d");
  const paragraph = (text: string, options: PDFKit.Mixins.TextOptions = {}) => {
    plain();
    doc.text(text, 48, doc.y, { width, lineGap: 2.5, paragraphGap: 3, ...options });
    doc.y += 3;
  };
  const heading = (title: string, keep = 64) => {
    space(keep);
    doc.y += 8;
    doc.font("Helvetica-Bold").fontSize(10).fillColor("#172b41").text(title.toUpperCase(), 48, doc.y, { width, characterSpacing: 0.6 });
    doc.y += 5;
    doc.moveTo(48, doc.y).lineTo(doc.page.width - 48, doc.y).lineWidth(0.5).strokeColor("#ccd5df").stroke();
    doc.y += 7;
  };
  const entry = (title: string, detail = "", dates = "") => {
    plain();
    const titleHeight = doc.heightOfString(title, { width: dates ? width - 125 : width });
    space(titleHeight + (detail ? 15 : 0) + 28);
    const y = doc.y;
    doc.font("Helvetica-Bold").fontSize(10.5).fillColor("#17212d").text(title, 48, y, { width: dates ? width - 125 : width, lineGap: 2 });
    const after = doc.y;
    if (dates) doc.font("Helvetica").fontSize(9).fillColor("#566372").text(dates, doc.page.width - 173, y + 1, { width: 125, align: "right" });
    doc.y = after + 3;
    if (detail) {
      doc.font("Helvetica").fontSize(9.5).fillColor("#566372").text(detail, 48, doc.y, { width, lineGap: 2 });
      doc.y += 4;
    }
  };
  const points = (items: string[]) => {
    for (const text of items.filter(Boolean)) {
      space(28);
      plain();
      // Long source paragraphs may flow across pages; a whole project is never forced
      // into an unbreakable box that leaves half a page empty or clips the text.
      doc.text("•", 49, doc.y, { continued: false, lineBreak: false });
      const url = textLinks(text)[0];
      const label = url ? text.replace(/\s*\(https?:\/\/[^\s]+\)/g, "") : text;
      doc.text(label, 60, doc.y, { width: width - 12, lineGap: 2.5, paragraphGap: 3, ...(url ? { link: url, underline: true } : {}) });
      doc.y += 2;
    }
    doc.y += 3;
  };
  doc.font("Helvetica-Bold").fontSize(23).fillColor("#172b41").text(cv.name, 48, doc.y, { width });
  if (cv.headline) {
    doc.y += 4;
    doc.font("Helvetica").fontSize(11.5).fillColor("#425468").text(cv.headline, 48, doc.y, { width });
  }
  doc.y += 8;
  const contacts = [cv.email, cv.phone, cv.location].filter(Boolean);
  if (contacts.length) paragraph(contacts.join("  |  "));
  const links = cv.links.map(webUrl).filter((url): url is string => !!url);
  if (links.length) {
    plain(); doc.fontSize(9.5);
    links.forEach((url, index) => { if (index) doc.fillColor("#566372").text("   |   ", { continued: true, link: null }); doc.fillColor("#244f78").text(linkLabel(url), { link: url, underline: true, continued: index < links.length - 1 }); });
    doc.y += 4;
  }
  const sections: Record<CvSection, () => void> = {
  summary: () => { if (cv.summary) { heading("Profile"); paragraph(cv.summary); } },
  skills: () => { if (cv.skills.length) { heading("Skills"); const lines = skillGroupLines(cv); if (lines) for (const g of lines) paragraph(`${g.label}: ${g.items}`); else paragraph(cv.skills.join(" · ")); } },
  experience: () => { if (cv.experience.length) {
    heading("Experience", 110);
    for (const e of cv.experience) { entry(e.title, [e.company, e.location].filter(Boolean).join(" · "), [e.start, e.end].filter(Boolean).join(" – ")); points(e.bullets); }
  } },
  projects: () => { if (cv.projects.length) {
    heading("Projects", 140);
    for (const p of cv.projects) {
      plain();
      const bodyHeight = p.bullets.reduce((sum, text) => sum + doc.heightOfString(text, { width: width - 12, lineGap: 2.5 }) + 7, 0);
      const projectHeight = bodyHeight + 55 + doc.heightOfString(p.name, { width });
      // Keep a concise project together. Full-source descriptions can exceed a page,
      // in which case normal paragraph pagination must remain available.
      space(projectHeight < doc.page.height - 120 ? projectHeight : 95);
      entry(p.name);
      const url = webUrl(p.link);
      if (url) { plain(); doc.fontSize(9).fillColor("#244f78").text(linkLabel(url), 48, doc.y, { width, link: url, underline: true }); doc.y += 5; }
      points(p.bullets);
    }
  } },
  education: () => { if (cv.education.length) {
    heading("Education", 110);
    for (const e of cv.education) { entry(e.degree, e.school, [e.start, e.end].filter(Boolean).join(" – ")); points(e.details); }
  } },
  certifications: () => { if (cv.certifications.length) { heading("Certifications & achievements"); points(cv.certifications); } },
  languages: () => { if (cv.languages.length) { heading("Languages"); paragraph(cv.languages.join(" · ")); } },
  };
  const order = cv.sectionOrder?.length === CV_SECTIONS.length && new Set(cv.sectionOrder).size === CV_SECTIONS.length && cv.sectionOrder.every((id) => CV_SECTIONS.includes(id)) ? cv.sectionOrder : CV_SECTIONS;
  for (const id of order) sections[id]();
  const range = doc.bufferedPageRange();
  for (let n = range.start; n < range.start + range.count; n++) {
    doc.switchToPage(n);
    // Disable automatic text pagination in the footer margin.
    const savedMargin = doc.page.margins.bottom;
    doc.page.margins.bottom = 0;
    doc.font("Helvetica").fontSize(8).fillColor("#718091").text(`${cv.name}  ·  ${n + 1} / ${range.count}`, 48, doc.page.height - 28, { width, align: "right", lineBreak: false });
    doc.page.margins.bottom = savedMargin;
  }
  doc.end();
  return complete;
}
