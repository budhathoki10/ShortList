import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CareerPassportDoc } from "@/db/types";
import type { Profile } from "@/lib/model/types";
import { mergePassport, passportFromCv } from "@/lib/discovery/passport-from-cv";

const now = new Date("2026-11-01T00:00:00Z");
const cv = (title: string, over: Partial<Profile> = {}): Profile => ({
  name: "Asha", headline: title, email: "a@example.com", phone: "", location: "Kathmandu, Nepal", links: [], summary: "",
  experience: [{ id: "e", title, company: "X", location: "Kathmandu", start: "2020", end: "Present", bullets: ["Built things."] }],
  education: [], skills: [], projects: [], certifications: [], languages: [], ...over,
});
const stored = (over: Partial<CareerPassportDoc>): CareerPassportDoc => ({
  _id: "u", targetRoles: ["Frontend developer"], excludedRoles: [], locations: [], workCountries: ["Nepal"], remoteModes: ["remote"], employmentTypes: ["Full-time"],
  discoveryEnabled: true, alertStates: ["ready"], quietStart: "22:00", quietEnd: "08:00", timezone: "Asia/Kathmandu", version: 3, createdAt: now, updatedAt: now, ...over,
});

describe("deriving the Career Passport from a CV", () => {
  it("creates a passport, switched on, from titles, location and arrangement, and never guesses where the person may work", () => {
    const next = mergePassport(null, passportFromCv(cv("Frontend developer"), now));
    expect(next).toMatchObject({ targetRoles: ["Frontend developer"], locations: ["Kathmandu, Nepal"], employmentTypes: ["Full-time"], remoteModes: ["remote", "hybrid", "onsite"], discoveryEnabled: true, alertStates: ["ready"], userSet: false });
    expect(next?.workCountries).toEqual([]);
    expect(next).not.toHaveProperty("emailFrequency");
  });

  it("creates nothing when the CV names no role", () => {
    expect(mergePassport(null, passportFromCv(cv("", { headline: "", experience: [] }), now))).toBeNull();
  });

  it("fills only the fields the person left empty on a passport they saved", () => {
    const next = mergePassport(stored({ userSet: true }), passportFromCv(cv("Backend engineer"), now));
    expect(next).toMatchObject({ targetRoles: ["Frontend developer"], remoteModes: ["remote"], locations: ["Kathmandu, Nepal"], workCountries: ["Nepal"], userSet: true });
  });

  it("treats an old stored passport (no userSet flag) as the person's own", () => {
    expect(mergePassport(stored({}), passportFromCv(cv("Backend engineer"), now))?.targetRoles).toEqual(["Frontend developer"]);
  });

  it("lets a passport that was only ever auto-filled follow a new CV, and keeps the person's quiet hours and switch", () => {
    const auto = stored({ userSet: false, locations: ["Kathmandu, Nepal"], discoveryEnabled: false, quietStart: "21:00" });
    expect(mergePassport(auto, passportFromCv(cv("Data analyst"), now))).toMatchObject({ targetRoles: ["Data analyst"], userSet: false, discoveryEnabled: false, quietStart: "21:00" });
  });

  it("reports no change when the CV gives the same answer, so saving a profile does not bump the version", () => {
    const first = mergePassport(null, passportFromCv(cv("Frontend developer"), now))!;
    expect(mergePassport({ ...stored({}), ...first }, passportFromCv(cv("Frontend developer"), now))).toBeNull();
  });

  it("tolerates removed fields on an old stored document", () => {
    const old = { ...stored({ userSet: false, locations: ["Kathmandu, Nepal"] }), needsSponsorship: true, graduationDate: "2027-05", minimumSalary: 5, excludedCompanies: ["A"], emailFrequency: "off", pushFrequency: "off" } as CareerPassportDoc;
    expect(mergePassport(old, passportFromCv(cv("Data analyst"), now))).toMatchObject({ targetRoles: ["Data analyst"] });
  });
});

// The notification rule: the account switch is the only control.
const db = vi.hoisted(() => ({
  user: { notificationsOff: false as boolean, emailVerifiedAt: new Date() as Date | null },
  devices: 0,
  deliveries: [] as Array<{ _id: string; channel: string; frequency: string }>,
}));
vi.mock("@/db/mongo", () => ({
  collections: async () => ({
    users: { findOne: async () => ({ ...db.user }) },
    pushSubscriptions: { countDocuments: async () => db.devices },
    notificationDeliveries: { updateOne: async (_: unknown, update: { $setOnInsert: { _id: string; channel: string; frequency: string } }) => void db.deliveries.push(update.$setOnInsert) },
  }),
}));

describe("job-alert delivery follows the account notifications switch", () => {
  beforeEach(() => {
    db.user = { notificationsOff: false, emailVerifiedAt: new Date() };
    db.devices = 1;
    db.deliveries = [];
  });
  const enqueue = async () => (await import("@/lib/discovery/notifications")).enqueueRecommendationNotifications(stored({}), "rec", 1);

  it("sends nothing when notifications are off", async () => {
    db.user.notificationsOff = true;
    await enqueue();
    expect(db.deliveries).toEqual([]);
  });

  it("sends the email and the push alert when notifications are on", async () => {
    await enqueue();
    expect(db.deliveries.map((row) => `${row.channel}:${row.frequency}`).sort()).toEqual(["email:immediate", "push:immediate"]);
  });

  it("emails only a confirmed address and pushes only to a saved device", async () => {
    db.user.emailVerifiedAt = null;
    await enqueue();
    expect(db.deliveries.map((row) => row.channel)).toEqual(["push"]);
    db.deliveries = [];
    db.user.emailVerifiedAt = new Date();
    db.devices = 0;
    await enqueue();
    expect(db.deliveries.map((row) => row.channel)).toEqual(["email"]);
  });
});
