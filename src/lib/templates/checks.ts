import { changeLayout, hasSidebar, type Layout, type TemplateSpec } from "./spec";

/** Plain-code checks on a spec, so built-in and custom templates get the same honest answers. */

export type AtsLevel = "safe" | "mostly" | "caution";

export const ATS_LABELS: Record<AtsLevel, string> = {
  safe: "ATS-safe",
  mostly: "Mostly ATS-safe",
  caution: "Harder for some ATS",
};

const ONE_COLUMN: readonly Layout[] = ["classic", "split-header", "compact", "executive", "academic", "timeline", "banner"];

export function atsReport(spec: TemplateSpec): { level: AtsLevel; reasons: string[] } {
  const reasons: string[] = [];
  let level: AtsLevel = "safe";
  if (hasSidebar(spec.layout)) {
    level = "caution";
    reasons.push("Two columns. Some applicant tracking systems read across both columns line by line, which can mix up the order.");
  } else if (!ONE_COLUMN.includes(spec.layout)) {
    level = "mostly";
    reasons.push("Section titles sit in their own column. Most systems read this fine.");
  }
  if (spec.photo !== "off") {
    if (level === "safe") level = "mostly";
    reasons.push("A photo is ignored by applicant tracking systems, and some recruiters must skip CVs that have one.");
  }
  return { level, reasons };
}

/** The same look as one simple column with no photo: what to send through an online application form. */
export function atsTwin(spec: TemplateSpec): TemplateSpec {
  if (atsReport(spec).level === "safe") return spec;
  const layout: Layout = spec.layout === "sidebar-left" || spec.layout === "sidebar-right" ? "split-header" : spec.layout === "modern-grid" ? "classic" : spec.layout;
  return { ...changeLayout(spec, layout), photo: "off" };
}

// WCAG 2 relative luminance and contrast ratio.
function luminance(hex: string) {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

/** Pairs of colours that will be hard to read, with a plain explanation. */
export function contrastIssues(spec: TemplateSpec): string[] {
  const { ink, accent, muted, panel, panelInk } = spec.palette;
  const issues: string[] = [];
  const check = (fg: string, bg: string, min: number, what: string) => {
    const ratio = contrastRatio(fg, bg);
    if (ratio < min) issues.push(`${what} is hard to read (contrast ${ratio.toFixed(1)}:1, needs ${min}:1).`);
  };
  check(ink, "#ffffff", 4.5, "Body text");
  check(muted, "#ffffff", 4.5, "Dates and places");
  check(accent, "#ffffff", 3, "Section titles");
  if (hasSidebar(spec.layout) || spec.layout === "banner") check(panelInk, panel, 4.5, "Text on the coloured panel");
  return issues;
}

/** Where photos are expected, and where recruiters prefer none. Matched on a free-text location. */
const PHOTO_EXPECTED =
  /\b(uae|dubai|abu dhabi|sharjah|qatar|doha|saudi|riyadh|jeddah|kuwait|bahrain|oman|muscat|nepal|kathmandu|india|pakistan|bangladesh|sri lanka|malaysia|indonesia|philippines|china|japan|korea|thailand|vietnam|germany|austria|switzerland|france|italy|spain|portugal|poland|czech|turkey)\b/i;
const PHOTO_DISCOURAGED = /\b(usa|united states|us|canada|uk|united kingdom|england|scotland|wales|ireland|australia|new zealand|new york|london|toronto|sydney|california|texas)\b/i;

/**
 * What a CV does with the person's photo: "shown", "off" (they turned it off), "no-slot" (this template has no place
 * for one) or "none" (nothing uploaded). Every screen and download explains the photo from this one answer.
 */
export function photoSlot(spec: TemplateSpec, photo: { onCv: boolean } | null): "shown" | "off" | "no-slot" | "none" {
  if (!photo) return "none";
  if (spec.photo === "off") return "no-slot";
  return photo.onCv ? "shown" : "off";
}

export type PhotoAdvice = { tone: "info" | "warning"; text: string } | null;

export function photoAdvice(spec: TemplateSpec, ...locations: (string | null | undefined)[]): PhotoAdvice {
  const where = locations.filter(Boolean).join(" ");
  const discouraged = PHOTO_DISCOURAGED.test(where);
  if (spec.photo !== "off" && discouraged) {
    return { tone: "warning", text: "Recruiters in the US, UK, Canada, Ireland and Australia usually prefer CVs without a photo. Some must ignore CVs that have one." };
  }
  if (spec.photo === "off" && PHOTO_EXPECTED.test(where) && !discouraged) {
    return { tone: "info", text: "A photo is common on CVs here. You can turn one on under Photo." };
  }
  return null;
}
