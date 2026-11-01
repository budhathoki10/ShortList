import { expect, test } from "@playwright/test";
import sharp from "sharp";
import { FIXTURE_BASE } from "../playwright.config";
import { addFixtureJob, logIn, setUpJobSeeker, signUp, withDb } from "./helpers";

const stamp = Date.now();
const email = `tpl-${stamp}@example.com`;
const stranger = `tpl-stranger-${stamp}@example.com`;
let jobId = "";
let ownTemplateId = "";

test.describe.configure({ mode: "serial" });

/** Each test starts in a fresh browser, so tests that need the account log in first. */
async function signedIn(page: import("@playwright/test").Page) {
  await logIn(page, email);
  await expect(page).toHaveURL(/\/app$/);
}

test("anyone can browse and search the 100 templates without an account", async ({ page }) => {
  await page.goto("/templates");
  await expect(page.getByRole("heading", { name: "100 free CV and resume templates, honestly labelled." })).toBeVisible();
  const thumbs = page.locator("img[src*='template-thumbs']");
  await expect(thumbs).toHaveCount(100);

  await page.getByLabel("Search templates").fill("charter");
  await expect.poll(() => thumbs.count()).toBeLessThan(100);
  expect(await thumbs.count()).toBeGreaterThan(0);

  // A preview opens with an honest ATS label and a way in.
  await page.getByRole("button", { name: /\bCharter\b/ }).first().click();
  const preview = page.getByRole("dialog", { name: "Charter preview" });
  await expect(preview.getByText(/ATS/).first()).toBeVisible();
  await expect(preview.getByRole("link", { name: "Use this template, free" })).toHaveAttribute("href", "/signup");
  await page.keyboard.press("Escape");
  await expect(preview).toBeHidden();
});

test("the studio starts on Classic, and a template can be made the default", async ({ page }) => {
  await setUpJobSeeker(page, email);
  jobId = (await addFixtureJob(page, FIXTURE_BASE)).split("/").pop()!;

  await page.getByRole("link", { name: "Templates" }).first().click();
  await expect(page).toHaveURL(/\/app\/studio$/);
  await expect(page.getByRole("heading", { name: "CV Studio" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Classic" })).toBeVisible();

  await page.goto("/app/studio/templates");
  await page.getByRole("button", { name: /\bCharter\b/ }).first().click();
  await page.getByRole("button", { name: "Use as my default" }).click();
  await expect(page.getByText("Default CV template updated.")).toBeVisible();

  await page.goto("/app/studio");
  await expect(page.getByRole("heading", { name: "Charter" })).toBeVisible();
});

test("a job's CV follows the default, and a different look can be chosen for just that job", async ({ page }) => {
  await signedIn(page);
  await page.goto(`/app/jobs/${jobId}/cv`);
  await page.getByRole("button", { name: "Suggest changes" }).click();
  await expect(page.getByRole("heading", { name: "Suggested changes" })).toBeVisible();
  // An uploaded PDF opens on the original; the template look belongs to the tailored version.
  await page.getByRole("button", { name: "Tailored version", exact: true }).click();

  const cv = page.getByLabel("CV preview");
  await expect(page.getByText("Look:").locator("xpath=..")).toContainText("Charter");
  await expect(cv).toHaveAttribute("data-layout", "executive");
  const before = await cv.getAttribute("data-layout");

  // Try another look: it applies to this job only.
  await page.getByRole("button", { name: /^Use the .* look for this job$/ }).first().click();
  await expect(page.getByText("Look:").locator("xpath=..")).not.toContainText("Charter", { timeout: 15_000 });
  const lookBar = await page.getByText("Look:").locator("xpath=..").innerText();

  await page.reload();
  await page.getByRole("button", { name: "Tailored version", exact: true }).click();
  const chosen = lookBar.split("\n").map((l) => l.trim()).filter(Boolean)[1]; // the name after "Look:"
  await expect(page.getByText("Look:").locator("xpath=..")).toContainText(chosen);
  await page.goto("/app/studio");
  await expect(page.getByRole("heading", { name: "Charter" })).toBeVisible(); // the default itself is unchanged
  expect(before).toBe("executive");
});

test("print preview uses the job's look, and the CV text is real text", async ({ page }) => {
  await signedIn(page);
  await page.goto(`/app/print/cv/${jobId}?layout=redesigned`);
  const cv = page.getByLabel("CV preview");
  await expect(cv).toBeVisible();
  await expect(cv.getByRole("heading", { level: 1 })).toHaveText("Asha Gurung");
  await expect(cv).toHaveAttribute("data-layout", /.+/);
  // The page size and margins come from the template (Playwright's text matching skips <style>, so read it directly).
  expect(await page.evaluate(() => [...document.querySelectorAll("style")].some((s) => /@page \{ size: (A4|Letter)/.test(s.textContent ?? "")))).toBe(true);
});

test("a template of your own can be made, kept and deleted, and nobody else can open it", async ({ page, browser }) => {
  await signedIn(page);
  await page.goto("/app/studio/edit/sl-001");
  await page.getByLabel("Template name").fill("My plain one");
  await page.getByRole("button", { name: "Save as my template" }).click();
  await expect(page).toHaveURL(/\/app\/studio\/edit\/[0-9a-f-]{36}/);
  ownTemplateId = page.url().match(/edit\/([0-9a-f-]{36})/)![1];

  await page.goto("/app/studio");
  await expect(page.getByText("1 of 50")).toBeVisible();
  await expect(page.getByText("My plain one", { exact: true })).toBeVisible();

  // Stored for this person, with a spec that passed validation.
  const stored = await withDb((db) => db.collection("cv_templates").findOne({ _id: ownTemplateId as never }));
  expect(stored?.name).toBe("My plain one");
  expect(stored?.spec?.version).toBe(1);

  // Somebody else gets "not found", not the template.
  const other = await (await browser.newContext()).newPage();
  await signUp(other, stranger, "Someone Else");
  const res = await other.goto(`/app/studio/edit/${ownTemplateId}`);
  expect(res?.status()).toBe(404);
  await other.close();

  await page.getByRole("button", { name: "Delete My plain one" }).click();
  await expect(page.getByText("Template deleted.")).toBeVisible();
  await expect(page.getByText("0 of 50")).toBeVisible();
  expect(await withDb((db) => db.collection("cv_templates").countDocuments({ _id: ownTemplateId as never }))).toBe(0);
});

test("a photo is re-encoded, shown only to its owner, and removed on request", async ({ page, request }) => {
  await signedIn(page);
  // A real image, so the server has to decode and re-encode it.
  const png = await sharp({ create: { width: 40, height: 40, channels: 3, background: "#778899" } }).png().toBuffer();
  await page.goto("/app/studio");
  await page.locator("input[type=file][name=photo]").setInputFiles({ name: "me.png", mimeType: "image/png", buffer: png }); // submits by itself
  await expect(page.getByText(/Photo saved/)).toBeVisible();

  const mine = await page.request.get("/app/photo");
  expect(mine.status()).toBe(200);
  expect(mine.headers()["content-type"]).toBe("image/webp");
  expect(mine.headers()["cache-control"]).toContain("no-store");
  expect((await mine.body()).subarray(8, 12).toString()).toBe("WEBP");

  // Signed out, the same address gives nothing.
  const anon = await request.get("/app/photo", { maxRedirects: 0 });
  expect([302, 303, 307]).toContain(anon.status());

  await page.getByRole("button", { name: "Remove photo" }).click();
  await expect(page.getByText("Photo removed.")).toBeVisible();
  expect((await page.request.get("/app/photo")).status()).toBe(404);
});
