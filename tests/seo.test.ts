import { readFileSync, existsSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { GUIDES, guideBySlug } from "@/lib/guides";
import manifest from "@/app/manifest";
import sitemap from "@/app/sitemap";

describe("guides", () => {
  it("have unique slugs, titles and descriptions of a searchable length", () => {
    expect(new Set(GUIDES.map((g) => g.slug)).size).toBe(GUIDES.length);
    expect(new Set(GUIDES.map((g) => g.title)).size).toBe(GUIDES.length);
    for (const g of GUIDES) {
      expect(g.title.length, g.slug).toBeLessThanOrEqual(60);
      expect(g.description.length, g.slug).toBeGreaterThanOrEqual(100);
      expect(g.description.length, g.slug).toBeLessThanOrEqual(160);
      expect(g.answer.split(/\s+/).length, g.slug).toBeGreaterThanOrEqual(30);
      expect(g.faq.length, g.slug).toBeGreaterThan(0);
      for (const r of g.related) expect(guideBySlug(r), `${g.slug} -> ${r}`).toBeDefined();
    }
  });
});

describe("manifest", () => {
  it("only references icons that exist, with maskable variants at 192 and 512", () => {
    const icons = manifest().icons ?? [];
    for (const icon of icons) expect(existsSync(`public${icon.src}`), icon.src).toBe(true);
    for (const size of ["192x192", "512x512"]) expect(icons.some((i) => i.purpose === "maskable" && i.sizes === size)).toBe(true);
  });

  it("serves PNG icons with the dimensions they claim", () => {
    for (const icon of (manifest().icons ?? []).filter((i) => i.type === "image/png")) {
      const buf = readFileSync(`public${icon.src}`);
      const [w, h] = [buf.readUInt32BE(16), buf.readUInt32BE(20)];
      expect(`${w}x${h}`, icon.src).toBe(icon.sizes);
    }
  });
});

describe("sitemap", () => {
  it("lists every guide and no private route when indexing is on", () => {
    process.env.SEO_INDEXING_ENABLED = "true";
    const urls = sitemap().map((e) => e.url);
    for (const g of GUIDES) expect(urls.some((u) => u.endsWith(`/guides/${g.slug}`))).toBe(true);
    expect(urls.some((u) => /\/(app|login|signup|api|render)(\/|$)/.test(u))).toBe(false);
    expect(new Set(urls).size).toBe(urls.length);
  });
});
