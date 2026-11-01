import { beforeEach, describe, expect, it } from "vitest";
import { collections } from "@/db/mongo";
import { originalBytes, originalCvFile, originalFileResponse, profileHash } from "@/lib/cv/original";
import { EMPTY_PROFILE } from "@/lib/model/types";
import { deleteUser, exportUserData } from "@/lib/services/account";
import { discardCvImport, getCvImport, stageCvImport } from "@/lib/services/cv-imports";
import { getOriginalCv, getProfileRow, saveProfile } from "@/lib/services/profile";
import { makeUser, resetDb } from "./helpers";

const profile = { ...EMPTY_PROFILE, name: "Alex Example", summary: "Original source wording.", projects: [{ id: "p1", name: "Product", link: "https://product.example.com/", bullets: ["Built and deployed the product."] }] };
// Binary data deliberately includes zero and high bytes, which a string round-trip could corrupt.
const bytes = Buffer.concat([Buffer.from("%PDF-1.7\n"), Buffer.from([0, 255, 128, 10, 13])]);
const original = () => originalCvFile('My "original" CV.pdf', "application/pdf", bytes, profile);

beforeEach(resetDb);

describe("original CV preservation", () => {
  it("retains exact file bytes through Mongo, download and account export; metadata queries exclude bytes", async () => {
    const user = await makeUser();
    await saveProfile(user.id, profile, "source text", original());
    const row = (await getProfileRow(user.id))!;
    expect(row.original).toEqual({ name: 'My "original" CV.pdf', type: "application/pdf" });
    expect(JSON.stringify(row)).not.toContain("bytes");
    const saved = (await getOriginalCv(user.id))!;
    expect(originalBytes(saved)).toEqual(bytes);
    const response = originalFileResponse(saved);
    expect(Buffer.from(await response.arrayBuffer())).toEqual(bytes);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("content-disposition")).toContain("filename*=UTF-8''My%20%22original%22%20CV.pdf");
    expect((await exportUserData(user)).originalCv?.base64).toBe(bytes.toString("base64"));
    expect(await getOriginalCv("another-user")).toBeNull();
  });

  it("retains the original on profile edits and removes it on a pasted replacement", async () => {
    const user = await makeUser();
    await saveProfile(user.id, profile, "source", original());
    await saveProfile(user.id, { ...profile, summary: "Edited profile wording." });
    expect(originalBytes((await getOriginalCv(user.id))!)).toEqual(bytes);
    await saveProfile(user.id, profile, "replacement source", null);
    expect(await getOriginalCv(user.id)).toBeNull();
    expect((await getProfileRow(user.id))?.original).toBeNull();
  });

  it("ignores row IDs and object key order when checking the source snapshot", () => {
    expect(profileHash({ ...profile, projects: profile.projects.map((p) => ({ ...p, id: "other" })) })).toBe(profileHash(profile));
    expect(profileHash(Object.fromEntries(Object.entries(profile).reverse()) as typeof profile)).toBe(profileHash(profile));
  });

  it("binds pending reviews to the owner, enforces expiry before TTL cleanup and keeps saved profiles untouched", async () => {
    const user = await makeUser();
    const id = await stageCvImport(user.id, { profile, sourceText: "source", method: "basic", original: original() });
    expect(await getCvImport("another-user", id)).toBeNull();
    await discardCvImport("another-user", id);
    expect(originalBytes((await getCvImport(user.id, id))!.original!)).toEqual(bytes);
    expect(await getProfileRow(user.id)).toBeNull();
    await (await collections()).cvImports.updateOne({ _id: id }, { $set: { expiresAt: new Date(Date.now() - 1) } });
    expect(await getCvImport(user.id, id)).toBeNull();
  });

  it("replaces abandoned reviews and deletes original files and pending uploads with the account", async () => {
    const user = await makeUser();
    await saveProfile(user.id, profile, "source", original());
    const input = { profile, sourceText: "source", method: "basic" as const, original: original() };
    const old = await stageCvImport(user.id, input);
    const current = await stageCvImport(user.id, input);
    expect(await getCvImport(user.id, old)).toBeNull();
    expect(await getCvImport(user.id, current)).not.toBeNull();
    await deleteUser(user.id);
    expect(await getOriginalCv(user.id)).toBeNull();
    expect(await getCvImport(user.id, current)).toBeNull();
  });
});
