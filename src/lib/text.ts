/** Plain-text helpers shared by matching and the fact check. No dependencies, so it's all testable. */

/** Different spellings of the same skill. Keys and values are lowercase. */
const SYNONYMS: Record<string, string[]> = {
  javascript: ["js", "ecmascript"],
  typescript: ["ts"],
  "node.js": ["node", "nodejs"],
  "react": ["react.js", "reactjs"],
  "next.js": ["nextjs"],
  "vue": ["vue.js", "vuejs"],
  postgresql: ["postgres", "psql"],
  kubernetes: ["k8s"],
  "machine learning": ["ml"],
  "artificial intelligence": ["ai"],
  "amazon web services": ["aws"],
  "google cloud": ["gcp", "google cloud platform"],
  "continuous integration": ["ci/cd", "ci"],
  "user experience": ["ux"],
  "user interface": ["ui"],
  "search engine optimization": ["seo"],
  "customer relationship management": ["crm"],
  "microsoft excel": ["excel", "ms excel"],
  "project management": ["pm"],
};

const ALIASES = new Map<string, string>();
for (const [canonical, alts] of Object.entries(SYNONYMS)) {
  ALIASES.set(canonical, canonical);
  for (const a of alts) ALIASES.set(a, canonical);
}

export function canonical(term: string): string {
  const t = term.trim().toLowerCase();
  return ALIASES.get(t) ?? t;
}

/** Every spelling worth searching for when looking for `term`. */
export function spellings(term: string): string[] {
  const c = canonical(term);
  return [...new Set([term.trim().toLowerCase(), c, ...(SYNONYMS[c] ?? [])])].filter(Boolean);
}

const escape = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

/**
 * Whole-term search that copes with C++, C#, .NET and Node.js, and doesn't let
 * "Java" match "JavaScript" or "R" match "React".
 */
export function containsTerm(text: string, term: string): boolean {
  // One-letter languages (C, R) only count as capitals standing alone: not "c" in a list, "R&D" or "C++" for C.
  if (term.trim().length === 1) return new RegExp(`(^|[^A-Za-z0-9+#])${escape(term.trim().toUpperCase())}(?![A-Za-z0-9+#&]|\\.[a-z])`).test(text);
  const hay = text.toLowerCase();
  return spellings(term).some((s) => new RegExp(`(^|[^a-z0-9+#])${escape(s)}(?![a-z0-9+#])`, "i").test(hay));
}

const STOP = new Set(
  "a an and or the of to in on for with at by from as is are be been being this that these those you your we our they their it its will can must should may have has had do does not no but if than then so such into over under about across within per via using use used able ability strong good great excellent experience experienced years year plus etc including include includes work working team role job candidate ideal knowledge understanding skills skill".split(
    " ",
  ),
);

/** Lowercase content words, for rough overlap between a requirement and a bullet. */
export function contentWords(text: string): string[] {
  return (text.toLowerCase().match(/[a-z0-9][a-z0-9+#.\-/]*[a-z0-9+#]|[a-z0-9]/g) ?? []).filter((w) => w.length > 2 && !STOP.has(w));
}

/** Crude English stemming, so "reducing", "reduced" and "reduces" compare equal. */
export function stem(word: string): string {
  const base = word.replace(/(ations?|ings?|ed|es|er|ers|ly|s)$/, "").replace(/(.)\1$/, "$1");
  // "reduce" and "reducing" share a stem once a trailing silent e goes.
  return base.length > 4 ? base.replace(/e$/, "") : base;
}

/**
 * Everyday ways of saying the same thing in CVs and job posts: "kept churn under 3%", "cut churn" and
 * "lowered churn" all mean "reduced churn". Only used to compare wording, never to write anything.
 */
export function sameMeaning(text: string): string {
  return text
    .replace(/\b(kept|keeping|keep|held|holding|hold)\b(?=[^.;]{0,40}\b(under|below|beneath|less than|down|low)\b)/gi, "reduce")
    .replace(/\b(cut|cutting|lowered|lowering|decreased|decreasing|minimi[sz]ed?|minimi[sz]ing|slashed|shrank|trimmed|reduced|reduces|reducing)\b/gi, "reduce");
}

export function overlap(a: string, b: string): number {
  const wa = new Set(contentWords(sameMeaning(a)).map(stem));
  if (wa.size === 0) return 0;
  const wb = new Set(contentWords(sameMeaning(b)).map(stem));
  let hit = 0;
  for (const w of wa) if (wb.has(w)) hit++;
  return hit / wa.size;
}

export function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+(?=[A-Z0-9"'(])/)
    .map((s) => s.trim())
    .filter(Boolean);
}

/** Collapse whitespace and drop control characters from pasted or extracted text. */
export function cleanText(text: string): string {
  return text
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(/[ \t ]+/g, " ")
    .replace(/ *\n */g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

let counter = 0;
/** Short id for profile entries; only needs to be unique within one profile. */
export function localId(prefix: string): string {
  counter = (counter + 1) % 1_000_000;
  return `${prefix}${Date.now().toString(36)}${counter.toString(36)}${Math.random().toString(36).slice(2, 6)}`;
}
