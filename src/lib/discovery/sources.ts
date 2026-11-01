import "server-only";
import { createHash } from "node:crypto";
import type { JobSourceType } from "@/db/types";
import { htmlToText } from "@/lib/jobs/html";
import { cleanText } from "@/lib/text";

export type SourceConfig = { type: JobSourceType; key: string; company: string };
/** What the runner tells an adapter: which titles anyone wants, and which postings are already stored. */
export type FetchOptions = { wanted?: (title: string) => boolean; known?: Set<string> };
/**
 * `postings`: fully read postings. `seen`: every posting id the source currently lists, including ones not read in
 * full this time (already stored, or not wanted), so the runner can keep them open and close only what disappeared.
 */
export type SourceResult = { postings: SourcePosting[]; seen: string[] };
export type SourcePosting = {
  sourceType: JobSourceType;
  sourceKey: string;
  externalId: string;
  canonicalUrl: string;
  company: string;
  title: string;
  location: string;
  text: string;
  sourceUpdatedAt: Date | null;
  /** When the source says the posting expires, if it says. */
  expiresAt?: Date | null;
  contentHash: string;
};

/**
 * Every source the agent can read, and how to treat it.
 *
 * `board`: one employer's own careers board (Greenhouse, Lever), listed per company in JOB_SOURCE_BOARDS.
 * `feed`: a public remote-job API listing many employers, switched on by name in JOB_SOURCE_FEEDS.
 * `partial`: the feed only returns its newest postings, so a job missing from one response may still be open:
 *   those are closed by expiry or age instead of "not listed any more".
 * `minIntervalMinutes`: the politest gap between fetches. Each feed asks not to be hammered.
 * `terms`: what the source asks in return for using its API. Shortlist links every posting back to its source
 *   page (the "View source" link, without nofollow) and names the source on the card.
 *
 * LinkedIn and Nepal's job portals (MeroJob and others) aren't here: their terms forbid automated reading.
 */
export const SOURCES: Record<JobSourceType, { label: string; kind: "board" | "feed"; partial: boolean; minIntervalMinutes: number; terms?: string }> = {
  greenhouse: { label: "Greenhouse", kind: "board", partial: false, minIntervalMinutes: 0 },
  lever: { label: "Lever", kind: "board", partial: false, minIntervalMinutes: 0 },
  ashby: { label: "Ashby", kind: "board", partial: false, minIntervalMinutes: 0 },
  workable: { label: "Workable", kind: "board", partial: false, minIntervalMinutes: 0 },
  // Large employers list thousands; only the first 1,000 are read, so a posting missing from the list may still be open.
  smartrecruiters: { label: "SmartRecruiters", kind: "board", partial: true, minIntervalMinutes: 30 },
  recruitee: { label: "Recruitee", kind: "board", partial: false, minIntervalMinutes: 0 },
  remotive: { label: "Remotive", kind: "feed", partial: false, minIntervalMinutes: 360, terms: "Link back to the Remotive job URL and name Remotive as the source. Don't resubmit jobs to other job sites." },
  jobicy: { label: "Jobicy", kind: "feed", partial: true, minIntervalMinutes: 60, terms: "Credit Jobicy with a direct link; apply links go to the job URL in the feed." },
  himalayas: { label: "Himalayas", kind: "feed", partial: true, minIntervalMinutes: 60 },
  remoteok: { label: "Remote OK", kind: "feed", partial: true, minIntervalMinutes: 60, terms: "Link back to the Remote OK URL (followed, not nofollow) and name Remote OK as the source. Don't use the logo." },
  arbeitnow: { label: "Arbeitnow", kind: "feed", partial: true, minIntervalMinutes: 60, terms: "Free public API: don't abuse it; link back to the site." },
};

export const FEED_TYPES = (Object.keys(SOURCES) as JobSourceType[]).filter((type) => SOURCES[type].kind === "feed");
export const BOARD_TYPES = (Object.keys(SOURCES) as JobSourceType[]).filter((type) => SOURCES[type].kind === "board");

const SOURCE_KEY = /^[a-z0-9_-]{1,100}$/i;

/**
 * JOB_SOURCE_BOARDS uses comma-separated `provider:board=Company name` entries, where provider is greenhouse, lever,
 * ashby, workable, smartrecruiters or recruitee, and board is the company's name in that system's careers URL.
 * Example: `greenhouse:acme=Acme,ashby:linear=Linear,workable:huggingface=Hugging Face,smartrecruiters:BoschGroup=Bosch`.
 * JOB_SOURCE_FEEDS names remote-job feeds: `remotive,jobicy,himalayas,remoteok,arbeitnow`, or `all`.
 */
export function configuredSources(raw = process.env.JOB_SOURCE_BOARDS ?? "", feedsRaw = process.env.JOB_SOURCE_FEEDS ?? ""): SourceConfig[] {
  const seen = new Set<string>();
  const boards = raw.split(",").flatMap((entry) => {
    const [identity, companyRaw] = entry.trim().split("=", 2);
    const [typeRaw, keyRaw] = identity?.split(":", 2) ?? [];
    const type = typeRaw?.toLowerCase();
    const key = keyRaw?.trim();
    if (!BOARD_TYPES.includes(type as JobSourceType) || !key || !SOURCE_KEY.test(key)) return [];
    const id = `${type}:${key.toLowerCase()}`;
    if (seen.has(id)) return [];
    seen.add(id);
    const company = cleanText(companyRaw || key.replace(/[-_]+/g, " ")).slice(0, 120);
    return [{ type, key, company } as SourceConfig];
  });
  const wanted = feedsRaw.trim().toLowerCase() === "all" ? FEED_TYPES : feedsRaw.split(",").map((name) => name.trim().toLowerCase());
  const feeds = FEED_TYPES.filter((type) => wanted.includes(type)).map((type) => ({ type, key: type, company: SOURCES[type].label }));
  return [...boards, ...feeds];
}

const contentHash = (posting: Omit<SourcePosting, "contentHash">) =>
  createHash("sha256").update(JSON.stringify([posting.title, posting.location, posting.text, posting.canonicalUrl])).digest("hex");

const asDate = (value: unknown) => {
  if (typeof value === "number" && Number.isFinite(value)) return new Date(value < 1e12 ? value * 1000 : value);
  if (typeof value !== "string") return null;
  const date = new Date(value);
  return Number.isFinite(date.valueOf()) ? date : null;
};

const str = (value: unknown) => (typeof value === "string" ? value : typeof value === "number" ? String(value) : "");
const httpsUrl = (value: unknown) => (typeof value === "string" && /^https:\/\//i.test(value) ? value.slice(0, 2_000) : null);

/** "Remote (Worldwide)": every feed here is remote-only, and the restriction (if any) stays visible for eligibility. */
function remoteLocation(restriction: string) {
  const place = cleanText(restriction).replace(/^remote\s*[-–:,]?\s*/i, "").slice(0, 160);
  return `Remote (${place || "Worldwide"})`;
}

async function fetchJson(url: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", "User-Agent": "Shortlist Job Discovery/1.0" },
    signal: AbortSignal.timeout(20_000),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`Job source returned HTTP ${response.status}`);
  return response.json() as Promise<unknown>;
}

/** Shared tail for every adapter: clean, cap and hash one posting, or drop it when it can't be explained. */
function posting(source: SourceConfig, raw: { id: unknown; url: unknown; company: unknown; title: unknown; location: string; html: unknown; updated: unknown; expires?: unknown }): SourcePosting[] {
  const url = httpsUrl(raw.url);
  const title = cleanText(str(raw.title)).slice(0, 200);
  const id = str(raw.id).slice(0, 200);
  if (!url || !title || !id) return [];
  const text = cleanText(htmlToText(str(raw.html))).slice(0, 40_000);
  if (text.length < 120) return [];
  const base = {
    sourceType: source.type,
    sourceKey: source.key,
    externalId: id,
    canonicalUrl: url,
    company: cleanText(str(raw.company)).slice(0, 120) || source.company,
    title,
    location: cleanText(raw.location).slice(0, 200),
    text,
    sourceUpdatedAt: asDate(raw.updated),
    expiresAt: asDate(raw.expires),
  };
  return [{ ...base, contentHash: contentHash(base) }];
}

async function greenhouse(source: SourceConfig): Promise<SourcePosting[]> {
  const body = (await fetchJson(`https://boards-api.greenhouse.io/v1/boards/${encodeURIComponent(source.key)}/jobs?content=true`)) as {
    jobs?: Array<{ id?: string | number; title?: string; updated_at?: string; absolute_url?: string; location?: { name?: string }; content?: string }>;
  };
  return (body.jobs ?? []).flatMap((row) => {
    if (row.id === undefined || !row.title || !row.absolute_url || !/^https:\/\//i.test(row.absolute_url)) return [];
    const text = cleanText(htmlToText(row.content ?? "")).slice(0, 40_000);
    if (text.length < 120) return [];
    const base = {
      sourceType: "greenhouse" as const,
      sourceKey: source.key,
      externalId: String(row.id),
      canonicalUrl: row.absolute_url.slice(0, 2_000),
      company: source.company,
      title: cleanText(row.title).slice(0, 200),
      location: cleanText(row.location?.name ?? "").slice(0, 200),
      text,
      sourceUpdatedAt: asDate(row.updated_at),
    };
    return [{ ...base, contentHash: contentHash(base) }];
  });
}

async function lever(source: SourceConfig): Promise<SourcePosting[]> {
  const rows = (await fetchJson(`https://api.lever.co/v0/postings/${encodeURIComponent(source.key)}?mode=json`)) as Array<{
    id?: string;
    text?: string;
    hostedUrl?: string;
    createdAt?: number;
    categories?: { location?: string; commitment?: string; team?: string };
    descriptionPlain?: string;
    description?: string;
    lists?: Array<{ text?: string; content?: string }>;
    additionalPlain?: string;
  }>;
  if (!Array.isArray(rows)) return [];
  return rows.flatMap((row) => {
    if (!row.id || !row.text || !row.hostedUrl || !/^https:\/\//i.test(row.hostedUrl)) return [];
    const listText = (row.lists ?? []).map((item) => `${item.text ?? ""}\n${htmlToText(item.content ?? "")}`).join("\n");
    const text = cleanText([row.descriptionPlain ?? htmlToText(row.description ?? ""), listText, row.additionalPlain ?? ""].join("\n")).slice(0, 40_000);
    if (text.length < 120) return [];
    const base = {
      sourceType: "lever" as const,
      sourceKey: source.key,
      externalId: row.id,
      canonicalUrl: row.hostedUrl.slice(0, 2_000),
      company: source.company,
      title: cleanText(row.text).slice(0, 200),
      location: cleanText(row.categories?.location ?? "").slice(0, 200),
      text,
      sourceUpdatedAt: typeof row.createdAt === "number" ? new Date(row.createdAt) : null,
    };
    return [{ ...base, contentHash: contentHash(base) }];
  });
}

type Row = Record<string, unknown>;
const obj = (value: unknown): Row => (value && typeof value === "object" && !Array.isArray(value) ? (value as Row) : {});

/** "Remote (Europe)" for remote roles, otherwise the place as written. */
const placeOf = (remote: boolean, place: string) => {
  // "bangalore, , India" -> "bangalore, India": sources leave empty parts where a region is missing.
  const tidy = place.split(",").map((part) => cleanText(part)).filter(Boolean).join(", ");
  return remote ? remoteLocation(tidy) : tidy;
};

/** Ashby: every listed job with its full description, in one call. https://developers.ashbyhq.com/docs/public-job-posting-api */
async function ashby(source: SourceConfig) {
  const body = await fetchJson(`https://api.ashbyhq.com/posting-api/job-board/${encodeURIComponent(source.key)}?includeCompensation=true`);
  return rowsOf(body, "jobs")
    .filter((row) => row.isListed !== false)
    .flatMap((row) => {
      const remote = row.isRemote === true || str(row.workplaceType).toLowerCase() === "remote";
      const pay = str(obj(row.compensation).compensationTierSummary);
      return posting(source, { id: row.id, url: row.jobUrl, company: source.company, title: row.title, location: placeOf(remote, str(row.location)), html: `${str(row.employmentType)}\n${pay}\n${str(row.descriptionHtml) || str(row.descriptionPlain)}`, updated: row.publishedAt });
    });
}

/** Workable: the public careers widget, with descriptions (`details=true`), in one call. */
async function workable(source: SourceConfig) {
  const body = obj(await fetchJson(`https://apply.workable.com/api/v1/widget/accounts/${encodeURIComponent(source.key)}?details=true`));
  const company = cleanText(str(body.name)) || source.company;
  return rowsOf(body, "jobs").flatMap((row) => {
    const place = [str(row.city), str(row.country)].filter(Boolean).join(", ");
    return posting(source, { id: row.shortcode, url: row.url, company, title: row.title, location: placeOf(row.telecommuting === true, place), html: `${str(row.employment_type)}\n${str(row.experience)}\n${str(row.description)}`, updated: row.published_on });
  });
}

/** Recruitee: every open offer with its description and requirements, in one call. The board is the company's subdomain. */
async function recruitee(source: SourceConfig) {
  if (!/^[a-z0-9-]{1,63}$/i.test(source.key)) throw new Error("Recruitee board must be a company subdomain");
  const body = await fetchJson(`https://${source.key.toLowerCase()}.recruitee.com/api/offers/`);
  return rowsOf(body, "offers").flatMap((row) =>
    posting(source, { id: row.id, url: row.careers_url, company: row.company_name || source.company, title: row.title, location: placeOf(row.remote === true, str(row.location)), html: `${str(row.employment_type_code).replace(/_/g, " ")}\n${str(row.description)}\n${str(row.requirements)}`, updated: row.published_at, expires: row.close_at }),
  );
}

/**
 * SmartRecruiters: the list has no descriptions, so each posting needs its own call. Large employers list thousands,
 * so only new postings whose title someone wants are read in full, at most 30 a run; everything listed still counts
 * as seen. https://developers.smartrecruiters.com/docs/posting-api
 */
async function smartrecruiters(source: SourceConfig, options: FetchOptions): Promise<SourceResult> {
  const base = `https://api.smartrecruiters.com/v1/companies/${encodeURIComponent(source.key)}/postings`;
  const listed: Row[] = [];
  for (let page = 0; page < 10; page += 1) {
    const body = obj(await fetchJson(`${base}?limit=100&offset=${page * 100}`));
    const rows = rowsOf(body, "content");
    listed.push(...rows);
    if (rows.length < 100 || listed.length >= Number(body.totalFound ?? 0)) break;
  }
  const seen = listed.map((row) => str(row.id)).filter(Boolean);
  const postings: SourcePosting[] = [];
  let reads = 0;
  for (const row of listed) {
    const id = str(row.id);
    if (!id || options.known?.has(id) || (options.wanted && !options.wanted(str(row.name)))) continue;
    if (reads >= 30) break;
    reads += 1;
    const detail = obj(await fetchJson(`${base}/${encodeURIComponent(id)}`));
    const sections = obj(obj(detail.jobAd).sections);
    const html = ["jobDescription", "qualifications", "additionalInformation", "companyDescription"].map((name) => str(obj(sections[name]).text)).join("\n");
    const where = obj(row.location);
    const place = str(where.fullLocation) || [str(where.city), str(where.country).toUpperCase()].filter(Boolean).join(", ");
    postings.push(...posting(source, { id, url: detail.postingUrl, company: obj(row.company).name || source.company, title: row.name, location: placeOf(where.remote === true, place), html: `${str(obj(row.typeOfEmployment).label)}\n${str(obj(row.experienceLevel).label)}\n${html}`, updated: row.releasedDate }));
  }
  return { postings, seen };
}
const rowsOf = (body: unknown, key: string): Row[] => {
  const list = Array.isArray(body) ? body : body && typeof body === "object" ? (body as Row)[key] : null;
  return Array.isArray(list) ? list.filter((row): row is Row => !!row && typeof row === "object") : [];
};

/** Remotive: every open remote job in one response. */
async function remotive(source: SourceConfig) {
  return rowsOf(await fetchJson("https://remotive.com/api/remote-jobs"), "jobs").flatMap((row) =>
    posting(source, { id: row.id, url: row.url, company: row.company_name, title: row.title, location: remoteLocation(str(row.candidate_required_location)), html: `${str(row.job_type)}\n${str(row.salary)}\n${str(row.description)}`, updated: row.publication_date }),
  );
}

/** Jobicy: the newest 100 remote jobs. */
async function jobicy(source: SourceConfig) {
  return rowsOf(await fetchJson("https://jobicy.com/api/v2/remote-jobs?count=100"), "jobs").flatMap((row) =>
    posting(source, { id: row.id, url: row.url, company: row.companyName, title: row.jobTitle, location: remoteLocation(str(row.jobGeo)), html: `${[row.jobType].flat().join(", ")}\n${str(row.jobLevel)}\n${str(row.jobDescription)}`, updated: row.pubDate }),
  );
}

/** Himalayas: 20 per page, newest first, paged by cursor. Five pages per run covers each run's new postings. */
async function himalayas(source: SourceConfig) {
  const out: SourcePosting[] = [];
  let cursor = "";
  for (let page = 0; page < 5; page += 1) {
    const body = (await fetchJson(`https://himalayas.app/jobs/api?limit=20${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ""}`)) as Row;
    for (const row of rowsOf(body, "jobs")) {
      const places = Array.isArray(row.locationRestrictions) ? row.locationRestrictions.map(str).filter(Boolean).join(", ") : "";
      out.push(...posting(source, { id: row.guid, url: row.applicationLink ?? row.guid, company: row.companyName, title: row.title, location: remoteLocation(places), html: `${str(row.employmentType)}\n${str(row.description)}`, updated: row.pubDate, expires: row.expiryDate }));
    }
    cursor = str(body.nextCursor);
    if (!cursor) break;
  }
  return out;
}

/** Remote OK: the newest ~100 remote jobs. The first array element is its legal notice, not a job. */
async function remoteok(source: SourceConfig) {
  return rowsOf(await fetchJson("https://remoteok.com/api"), "")
    .filter((row) => row.id && row.position)
    .flatMap((row) => posting(source, { id: row.id, url: row.url, company: row.company, title: row.position, location: remoteLocation(str(row.location)), html: str(row.description), updated: row.date ?? row.epoch }));
}

/** Arbeitnow: the newest 300 jobs, mostly on-site in Germany; only the remote ones are useful here. */
async function arbeitnow(source: SourceConfig) {
  return rowsOf(await fetchJson("https://www.arbeitnow.com/api/job-board-api"), "data")
    .filter((row) => row.remote === true)
    .flatMap((row) => posting(source, { id: row.slug, url: row.url, company: row.company_name, title: row.title, location: remoteLocation(str(row.location)), html: `${[row.job_types].flat().join(", ")}\n${str(row.description)}`, updated: row.created_at }));
}

/** Sources whose one call returns every posting in full. */
const SIMPLE: Partial<Record<JobSourceType, (source: SourceConfig) => Promise<SourcePosting[]>>> = { greenhouse, lever, ashby, workable, recruitee, remotive, jobicy, himalayas, remoteok, arbeitnow };

export async function fetchSource(source: SourceConfig, options: FetchOptions = {}): Promise<SourceResult> {
  if (source.type === "smartrecruiters") return smartrecruiters(source, options);
  const postings = await SIMPLE[source.type]!(source);
  return { postings, seen: postings.map((item) => item.externalId) };
}
