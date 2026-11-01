import { expect, test } from "@playwright/test";
import { FIXTURE_BASE } from "../playwright.config";
import { addFixtureJob, latestEmailLink, logIn, PASSWORD, setUpJobSeeker, signUp, userIdFor, withDb } from "./helpers";

const stamp = Date.now();

test.describe.configure({ mode: "serial" });

test("signed-out visitors are sent to log in for every app page", async ({ page }) => {
  for (const path of ["/app", "/app/jobs", "/app/profile", "/app/billing", "/app/settings/export"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login/);
  }
});

test("people can never open each other's jobs or downloads", async ({ page, browser }) => {
  await setUpJobSeeker(page, `owner-${stamp}@example.com`);
  const jobUrl = await addFixtureJob(page, FIXTURE_BASE);
  const jobId = jobUrl.split("/").pop()!;

  const other = await browser.newPage();
  await signUp(other, `other-${stamp}@example.com`, "Other Person");
  for (const path of [`/app/jobs/${jobId}`, `/app/jobs/${jobId}/cv`, `/app/print/cv/${jobId}`]) {
    const res = await other.goto(path);
    expect(res?.status(), path).toBe(404);
  }
  expect((await other.request.get(`/app/download/cv/${jobId}`, { maxRedirects: 0 })).status()).toBe(303); // free: to billing, not the file
  await other.close();
});

test("confirming email, resetting a password and exporting data work", async ({ page }) => {
  const address = `reset-${stamp}@example.com`;
  await signUp(page, address);
  const link = latestEmailLink(address, "Confirm");
  // A mail scanner fetching the link must not use it up.
  expect((await page.request.get(link)).status()).toBe(200);
  expect((await page.request.get(link)).status()).toBe(200);
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "Confirm your email" })).toBeVisible();
  await page.getByRole("button", { name: "Confirm my email" }).click();
  await expect(page.getByText("Email confirmed.")).toBeVisible();
  // And it works once.
  await page.goto(link);
  await expect(page.getByRole("heading", { name: "This link has expired" })).toBeVisible();
  await page.goto("/app");

  const exported = await page.request.get("/app/settings/export");
  const data = await exported.json();
  expect(data.account.email).toBe(address);
  expect(exported.headers()["content-disposition"]).toContain("shortlist-data.json");

  await page.getByRole("button", { name: "Log out" }).click();
  await page.goto("/forgot-password");
  await page.getByLabel("Email").fill(address);
  await page.getByRole("button", { name: /reset link/i }).click();
  await expect(page.getByText("If an account exists for that email")).toBeVisible();
  await page.goto(latestEmailLink(address, "Reset"));
  await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
  await page.getByLabel("Type it again").fill("a-different-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByLabel("Type it again")).toHaveAttribute("aria-invalid", "true");
  await expect(page.getByLabel("Type it again")).toBeFocused();
  await expect(page.getByText("Enter the same password in both fields.")).toBeVisible();
  await page.getByLabel("New password", { exact: true }).fill("a-brand-new-password");
  await page.getByLabel("Type it again").fill("a-brand-new-password");
  await page.getByRole("button", { name: "Save new password" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Password changed" })).toBeVisible();
  await expect(page).toHaveURL(/\/app$/);
});

test("the daily reminder job needs its secret", async ({ request }) => {
  expect((await request.get("/api/cron-job/daily")).status()).toBe(401);
  expect((await request.get("/api/cron-job/nope?key=e2e-cron-job-secret")).status()).toBe(404);
  const res = await request.get("/api/cron-job/daily?key=e2e-cron-job-secret&wait=1");
  expect(await res.json()).toMatchObject({ job: "daily", result: { sent: expect.any(Number) } });
});

test("deleting the account removes everything", async ({ page }) => {
  const address = `delete-${stamp}@example.com`;
  await setUpJobSeeker(page, address);
  await addFixtureJob(page, FIXTURE_BASE);
  const id = await userIdFor(address);
  await page.goto("/app/settings");
  await page.getByLabel("Confirm with your password").fill(PASSWORD);
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Account deleted" })).toBeVisible();
  const left = await withDb(async (db) => ({
    jobs: await db.collection("jobs").countDocuments({ userId: id }),
    profiles: await db.collection("profiles").countDocuments({ _id: id as never }),
    users: await db.collection("users").countDocuments({ _id: id as never }),
  }));
  expect(left).toEqual({ jobs: 0, profiles: 0, users: 0 });
  await logIn(page, address);
  await expect(page.getByRole("alert").filter({ hasText: "Unable to log in" })).toBeVisible();
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("no page is wider than the screen", async ({ page }) => {
    const fits = async (path: string) => {
      await page.goto(path);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
      expect(overflow, `${path} overflows by ${overflow}px`).toBeLessThanOrEqual(0);
    };
    for (const path of ["/", "/signup", "/login", "/terms", "/privacy", "/refund"]) await fits(path);
    await logIn(page, `owner-${stamp}@example.com`);
    await expect(page).toHaveURL(/\/app$/);
    for (const path of ["/app", "/app/profile", "/app/jobs", "/app/progress", "/app/settings", "/app/billing"]) await fits(path);
    const ownerId = await userIdFor(`owner-${stamp}@example.com`);
    const id = String((await withDb((db) => db.collection("jobs").findOne({ userId: ownerId })))!._id);
    for (const tab of ["", "/cv", "/cover-letter", "/interview"]) await fits(`/app/jobs/${id}${tab}`);
  });
});

test("repeated wrong passwords for one account are slowed down", async ({ page }) => {
  const address = `guess-${Date.now()}@example.com`;
  await signUp(page, address);
  await page.context().clearCookies();
  for (let attempt = 0; attempt < 10; attempt++) {
    await logIn(page, address, `wrong-password-${attempt}`);
    await expect(page.getByText("Incorrect email or password.")).toBeVisible();
  }
  // Even the right password waits once the limit is reached.
  await logIn(page, address);
  await expect(page.getByText("Too many log-in attempts for this account")).toBeVisible();
  await expect(page).toHaveURL(/\/login/);
});
