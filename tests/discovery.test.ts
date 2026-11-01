import { afterEach, describe, expect, it, vi } from "vitest";
import type { CareerPassportDoc, DiscoveredJobDoc } from "@/db/types";
import { eligibilityFindings } from "@/lib/discovery/eligibility";
import { DISCOVERY_RULE_VERSION, evaluateJob, remoteRegionFinding, roleCompatibility } from "@/lib/discovery/match";
import { configuredSources, fetchSource } from "@/lib/discovery/sources";
import { isPushServiceEndpoint } from "@/lib/discovery/push-endpoints";
import { passportFromCv } from "@/lib/discovery/passport-from-cv";
import type { Profile } from "@/lib/model/types";

const now = new Date("2026-11-01T00:00:00Z");
const profile: Profile = {
  name: "Asha", headline: "Frontend developer", email: "asha@example.com", phone: "", location: "Kathmandu", links: [], summary: "Frontend developer building accessible products.",
  experience: [{ id: "e", title: "Frontend developer", company: "Northwind", location: "Kathmandu", start: "2024", end: "Present", bullets: ["Built React and TypeScript interfaces used by 2,000 customers."] }],
  education: [{ id: "d", school: "Herald College", degree: "BSc Computer Science", start: "2023", end: "2026", details: [] }], skills: ["React", "TypeScript", "Node.js"], projects: [], certifications: [], languages: ["English"],
};
const passport: CareerPassportDoc = {
  _id: "user", targetRoles: ["Frontend developer"], excludedRoles: [], locations: ["Remote"], workCountries: ["Nepal"], remoteModes: ["remote"], needsSponsorship: true, graduationDate: "2026-06", minimumSalary: null, employmentTypes: ["Full-time"], excludedCompanies: [], discoveryEnabled: true, emailFrequency: "immediate", pushFrequency: "off", alertStates: ["ready"], quietStart: "22:00", quietEnd: "08:00", timezone: "Asia/Kathmandu", version: 1, createdAt: now, updatedAt: now,
};
const job: DiscoveredJobDoc = {
  _id: "job", sourceType: "greenhouse", sourceKey: "acme", externalId: "1", canonicalUrl: "https://example.com/job", company: "Acme", title: "Frontend Developer", location: "Remote", text: "Frontend Developer\nRequirements\n- React and TypeScript\n- 2 years of experience", post: { title: "Frontend Developer", company: "Acme", location: "Remote", salary: "", summary: "Build interfaces.", requirements: [{ text: "React and TypeScript", kind: "must", keywords: ["React", "TypeScript"] }], keywords: ["React", "TypeScript"] }, contentHash: "hash", sourceUpdatedAt: now, firstSeenAt: now, lastSeenAt: now, closedAt: null, createdAt: now, updatedAt: now,
};

afterEach(() => vi.unstubAllGlobals());

describe("job discovery configuration", () => {
  it("parses allowlisted source declarations and rejects malformed entries", () => {
    expect(configuredSources("greenhouse:acme=Acme, lever:northwind=Northwind Labs, bad:x, greenhouse:acme=Duplicate")).toEqual([
      { type: "greenhouse", key: "acme", company: "Acme" },
      { type: "lever", key: "northwind", company: "Northwind Labs" },
    ]);
  });

  it("normalizes Greenhouse and Lever feeds without scraping their application pages", async () => {
    const responses = [
      { jobs: [{ id: 7, title: "Frontend Developer", updated_at: "2026-11-01T00:00:00Z", absolute_url: "https://boards.example/jobs/7", location: { name: "Remote" }, content: "&lt;p&gt;Build accessible React products for customers around the world and work closely with designers, engineers and customer-support teams.&lt;/p&gt;&lt;p&gt;Requirements include TypeScript, automated testing, code review and careful written communication.&lt;/p&gt;" }] },
      [{ id: "lever-9", text: "Product Engineer", hostedUrl: "https://jobs.example/lever-9", createdAt: 1_793_491_200_000, categories: { location: "London" }, descriptionPlain: "Build and test customer-facing products with TypeScript and React while working closely with product managers, designers and support teams.", lists: [{ text: "Requirements", content: "<li>Three years of relevant engineering experience</li><li>Strong written communication and careful code review</li>" }] }],
    ];
    vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(responses.shift()), { status: 200, headers: { "content-type": "application/json" } })));
    const green = (await fetchSource({ type: "greenhouse", key: "acme", company: "Acme" })).postings;
    const lever = (await fetchSource({ type: "lever", key: "northwind", company: "Northwind" })).postings;
    expect(green[0]).toMatchObject({ sourceType: "greenhouse", externalId: "7", title: "Frontend Developer", location: "Remote" });
    expect(green[0].text).toContain("Build accessible React products");
    expect(lever[0]).toMatchObject({ sourceType: "lever", externalId: "lever-9", title: "Product Engineer", location: "London" });
    expect(lever[0].text).toContain("Three years of relevant engineering experience");
    expect(green[0].contentHash).toMatch(/^[a-f0-9]{64}$/);
  });
});

describe("eligibility-first matching", () => {
  it("matches related role titles but refuses unrelated roles", () => {
    expect(roleCompatibility("Senior Frontend Engineer", ["Frontend developer"])).toBeGreaterThanOrEqual(45);
    expect(roleCompatibility("Account executive", ["Frontend developer"])).toBe(0);
  });

  it("blocks a role that explicitly refuses sponsorship", () => {
    const text = `${job.text}\nWe are unable to sponsor visas now or in the future.`;
    const findings = eligibilityFindings(text, profile, passport);
    expect(findings).toContainEqual(expect.objectContaining({ code: "sponsorship", severity: "blocker" }));
    expect(evaluateJob(profile, now, passport, { ...job, text })?.state).toBe("blocked");
  });

  it("keeps the evidence score separate and explains why a qualified role appeared", () => {
    const result = evaluateJob(profile, now, passport, job);
    expect(result).toMatchObject({ state: "ready", evidenceScore: 100, ruleVersion: DISCOVERY_RULE_VERSION });
    expect(result?.reasons).toEqual(expect.arrayContaining([expect.stringContaining("role-title fit"), expect.stringContaining("CV evidence")]));
    expect(result?.match.requirements[0]).toMatchObject({ status: "shown", evidence: expect.stringContaining("React") });
  });

  it("filters explicit work arrangements and employment types that conflict with the Career Passport", () => {
    expect(evaluateJob(profile, now, passport, { ...job, location: "On-site in London" })).toBeNull();
    expect(evaluateJob(profile, now, passport, { ...job, text: `${job.text}\nThis is a six-month contract role.` })).toBeNull();
  });

  it("respects explicit graduation windows and numeric minimum salary constraints", () => {
    const graduationText = `${job.text}\nApplicants must be graduating between 2027 and 2028.`;
    expect(evaluateJob(profile, now, passport, { ...job, text: graduationText })?.state).toBe("blocked");
    expect(evaluateJob(profile, now, { ...passport, minimumSalary: 50_000 }, { ...job, post: { ...job.post, salary: "USD 35,000 to 40,000" } })).toBeNull();
  });
});

describe("push endpoints", () => {
  it("accepts only the browser push services, so a subscription can't aim the server at another host", () => {
    for (const ok of [
      "https://fcm.googleapis.com/fcm/send/abc123",
      "https://updates.push.services.mozilla.com/wpush/v2/abc",
      "https://web.push.apple.com/QAbc",
      "https://wns2-par02p.notify.windows.com/w/?token=abc",
    ]) expect(isPushServiceEndpoint(ok), ok).toBe(true);
    for (const bad of [
      "http://fcm.googleapis.com/fcm/send/abc",
      "https://fcm.googleapis.com.evil.example/x",
      "https://evil.example/fcm.googleapis.com",
      "https://169.254.169.254/latest/meta-data",
      "https://localhost:3000/api",
      "https://user:pass@fcm.googleapis.com/x",
      "https://fcm.googleapis.com:8443/x",
      "not a url",
    ]) expect(isPushServiceEndpoint(bad), bad).toBe(false);
  });
});

describe("Career Passport from a CV", () => {
  const cv = (over: Partial<Profile>): Profile => ({ ...profile, ...over });

  it("takes real job titles from the CV and leaves out headline phrases that aren't roles", () => {
    const result = passportFromCv(cv({ headline: "Software Developer | AI Enthusiast", experience: [{ ...profile.experience[0], title: "Frontend developer" }] }), now);
    expect(result.targetRoles).toEqual(["Frontend developer", "Software Developer"]);
  });

  it("uses the CV's location, and offers its country only as a suggestion", () => {
    const result = passportFromCv(cv({ location: "Kathmandu, Nepal" }), now);
    expect(result.locations).toEqual(["Kathmandu, Nepal"]);
    expect(result.country).toBe("Nepal");
  });

  it("fills a graduation month only when the CV writes one, and offers internships to students", () => {
    const withMonth = passportFromCv(cv({ education: [{ ...profile.education[0], end: "May 2027" }] }), now);
    expect(withMonth.graduationDate).toBe("2027-05");
    expect(withMonth.employmentTypes).toEqual(["Full-time", "Internship"]);
    const yearOnly = passportFromCv(cv({ education: [{ ...profile.education[0], end: "2027" }] }), now);
    expect(yearOnly).toMatchObject({ graduationDate: null, graduationYear: "2027" });
    const finished = passportFromCv(cv({ education: [{ ...profile.education[0], end: "2024" }] }), now);
    expect(finished).toMatchObject({ graduationDate: null, graduationYear: null, employmentTypes: ["Full-time"] });
  });

  it("never fills in work permission, salary or sponsorship", () => {
    const result = passportFromCv(profile, now) as Record<string, unknown>;
    for (const key of ["workCountries", "minimumSalary", "needsSponsorship"]) expect(result).not.toHaveProperty(key);
  });
});

describe("remote-job feeds", () => {
  const body = "Build accessible React and TypeScript products for customers around the world, review pull requests and pair with designers every week.";
  const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });

  it("turns on only the feeds named in JOB_SOURCE_FEEDS, or all of them", () => {
    expect(configuredSources("", "remotive, jobicy, nope").map((s) => s.type)).toEqual(["remotive", "jobicy"]);
    expect(configuredSources("", "all").map((s) => s.type)).toEqual(["remotive", "jobicy", "himalayas", "remoteok", "arbeitnow"]);
    expect(configuredSources("", "")).toEqual([]);
  });

  it("normalizes each feed into the same posting shape, keeping the employer and the remote region", async () => {
    const feeds: Record<string, unknown> = {
      remotive: { jobs: [{ id: 1, url: "https://remotive.com/remote-jobs/1", title: "Frontend Developer", company_name: "Acme", candidate_required_location: "Worldwide", job_type: "full_time", description: `<p>${body}</p>`, publication_date: "2026-10-31T10:00:00" }] },
      jobicy: { jobs: [{ id: 2, url: "https://jobicy.com/jobs/2", jobTitle: "React Engineer", companyName: "Beta", jobGeo: "USA", jobType: ["Full-Time"], jobDescription: `<p>${body}</p>`, pubDate: "2026-10-31T10:00:00+00:00" }] },
      himalayas: { jobs: [{ guid: "https://himalayas.app/companies/gamma/jobs/3", applicationLink: "https://himalayas.app/companies/gamma/jobs/3", title: "Web Developer", companyName: "Gamma", locationRestrictions: [], description: body, pubDate: 1793404804, expiryDate: 1798701851 }], nextCursor: null },
      remoteok: [{ legal: "API Terms of Service" }, { id: "4", url: "https://remoteOK.com/remote-jobs/4", position: "Frontend Engineer", company: "Delta", location: "Europe", description: body, date: "2026-10-31T00:00:04+00:00" }],
      arbeitnow: { data: [{ slug: "on-site", remote: false, url: "https://www.arbeitnow.com/jobs/x", title: "Kellner", company_name: "Cafe", description: body }, { slug: "remote-5", remote: true, url: "https://www.arbeitnow.com/jobs/5", title: "UI Developer", company_name: "Epsilon", location: "Berlin", job_types: ["Full Time"], description: `<p>${body}</p>`, created_at: 1793515215 }] },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => json(feeds[Object.keys(feeds).find((name) => String(url).includes(name))!])));
    const all = await Promise.all((["remotive", "jobicy", "himalayas", "remoteok", "arbeitnow"] as const).map(async (type) => (await fetchSource({ type, key: type, company: type })).postings));
    expect(all.map((list) => list.length)).toEqual([1, 1, 1, 1, 1]);
    expect(all[0][0]).toMatchObject({ sourceType: "remotive", externalId: "1", company: "Acme", location: "Remote (Worldwide)", canonicalUrl: "https://remotive.com/remote-jobs/1" });
    expect(all[1][0]).toMatchObject({ company: "Beta", location: "Remote (USA)" });
    expect(all[2][0]).toMatchObject({ company: "Gamma", location: "Remote (Worldwide)", expiresAt: new Date(1798701851 * 1000) });
    expect(all[3][0]).toMatchObject({ company: "Delta", title: "Frontend Engineer", location: "Remote (Europe)" });
    expect(all[4][0]).toMatchObject({ externalId: "remote-5", company: "Epsilon" });
    for (const [posting] of all) expect(posting.text).toContain("Build accessible React");
  });

  it("asks to verify a remote role limited to a region the person hasn't listed", () => {
    const where = { workCountries: ["Nepal"], locations: ["Kathmandu, Nepal"] };
    expect(remoteRegionFinding({ location: "Remote (USA only)" }, where)).toMatchObject({ code: "location", severity: "verify" });
    expect(remoteRegionFinding({ location: "Remote (Worldwide)" }, where)).toBeNull();
    expect(remoteRegionFinding({ location: "Remote (India, Nepal, Bangladesh)" }, where)).toBeNull();
    expect(remoteRegionFinding({ location: "Kathmandu" }, where)).toBeNull();
    const evaluated = evaluateJob(profile, now, { ...passport, needsSponsorship: false, graduationDate: null }, { ...job, location: "Remote (United States)" });
    expect(evaluated?.state).toBe("verify");
  });
});

describe("company boards on Ashby, Workable, SmartRecruiters and Recruitee", () => {
  const body = "Build accessible React and TypeScript products for customers around the world, review pull requests and pair with designers every week.";
  const json = (value: unknown) => new Response(JSON.stringify(value), { status: 200, headers: { "content-type": "application/json" } });

  it("accepts the new board providers in JOB_SOURCE_BOARDS, keeping the board name's case", () => {
    expect(configuredSources("ashby:linear=Linear, workable:huggingface=Hugging Face, smartrecruiters:BoschGroup=Bosch, recruitee:bunq=bunq, myspace:x=Nope", "")).toEqual([
      { type: "ashby", key: "linear", company: "Linear" },
      { type: "workable", key: "huggingface", company: "Hugging Face" },
      { type: "smartrecruiters", key: "BoschGroup", company: "Bosch" },
      { type: "recruitee", key: "bunq", company: "bunq" },
    ]);
  });

  it("reads Ashby, Workable and Recruitee boards in one call each", async () => {
    const replies: Record<string, unknown> = {
      "api.ashbyhq.com": { jobs: [{ id: "a1", title: "Frontend Engineer", isListed: true, isRemote: true, workplaceType: "Remote", location: "Europe", jobUrl: "https://jobs.ashbyhq.com/linear/a1", descriptionHtml: `<p>${body}</p>`, employmentType: "FullTime", publishedAt: "2026-10-01T00:00:00Z" }, { id: "hidden", title: "Unlisted", isListed: false, jobUrl: "https://jobs.ashbyhq.com/linear/h", descriptionHtml: body }] },
      "apply.workable.com": { name: "Hugging Face", jobs: [{ shortcode: "W1", title: "ML Engineer", url: "https://apply.workable.com/j/W1", telecommuting: true, city: "Paris", country: "France", description: `<p>${body}</p>`, published_on: "2026-05-29" }] },
      "bunq.recruitee.com": { offers: [{ id: 7, title: "Data Scientist", careers_url: "https://careers.bunq.com/o/data-scientist", company_name: "bunq", location: "Amsterdam, Netherlands", remote: false, description: `<p>${body}</p>`, requirements: "<ul><li>Python</li></ul>", published_at: "2026-10-28 13:21:58 UTC", close_at: null }] },
    };
    vi.stubGlobal("fetch", vi.fn(async (url: string) => json(replies[new URL(String(url)).hostname])));
    const ashby = await fetchSource({ type: "ashby", key: "linear", company: "Linear" });
    const workable = await fetchSource({ type: "workable", key: "huggingface", company: "HF" });
    const recruitee = await fetchSource({ type: "recruitee", key: "bunq", company: "bunq" });
    expect(ashby.postings).toHaveLength(1);
    expect(ashby.postings[0]).toMatchObject({ sourceType: "ashby", externalId: "a1", company: "Linear", location: "Remote (Europe)", canonicalUrl: "https://jobs.ashbyhq.com/linear/a1" });
    expect(workable.postings[0]).toMatchObject({ externalId: "W1", company: "Hugging Face", location: "Remote (Paris, France)" });
    expect(recruitee.postings[0]).toMatchObject({ externalId: "7", location: "Amsterdam, Netherlands" });
    expect(recruitee.postings[0].text).toContain("Python");
    expect(ashby.seen).toEqual(["a1"]);
  });

  it("reads SmartRecruiters details only for new postings someone wants, but counts every listed posting as seen", async () => {
    const list = { totalFound: 3, content: [
      { id: "1", name: "Frontend Developer", releasedDate: "2026-11-01T00:00:00Z", location: { city: "Pune", country: "in", remote: false }, company: { name: "Bosch Group" }, typeOfEmployment: { label: "Full-time" } },
      { id: "2", name: "Frontend Developer II", location: { city: "Remote", remote: true, fullLocation: "Anywhere" }, company: { name: "Bosch Group" } },
      { id: "3", name: "Welding Technician", location: { city: "Stuttgart", country: "de" }, company: { name: "Bosch Group" } },
    ] };
    const detail = (id: string) => ({ postingUrl: `https://jobs.smartrecruiters.com/BoschGroup/${id}`, jobAd: { sections: { jobDescription: { text: `<p>${body}</p>` }, qualifications: { text: "<p>React</p>" } } } });
    const calls: string[] = [];
    vi.stubGlobal("fetch", vi.fn(async (url: string) => {
      calls.push(String(url));
      const id = String(url).match(/postings\/([^/?]+)$/)?.[1];
      return json(id ? detail(id) : list);
    }));
    const result = await fetchSource({ type: "smartrecruiters", key: "BoschGroup", company: "Bosch" }, { wanted: (title) => /frontend/i.test(title), known: new Set(["2"]) });
    expect(result.seen).toEqual(["1", "2", "3"]);
    expect(result.postings.map((p) => p.externalId)).toEqual(["1"]);
    expect(result.postings[0]).toMatchObject({ company: "Bosch Group", location: "Pune, IN", canonicalUrl: "https://jobs.smartrecruiters.com/BoschGroup/1" });
    // One list call and one detail call: not for the stored posting (2) or the unwanted one (3).
    expect(calls).toHaveLength(2);
  });
});
