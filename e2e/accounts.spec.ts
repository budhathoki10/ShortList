import { expect, test } from "@playwright/test";
import { FIXTURE_BASE } from "../playwright.config";
import { addFixtureJob, continueWithGoogle, googleIdentity, logIn, setUpJobSeeker, signUp, userIdFor, withDb } from "./helpers";

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

test("signing in with Google makes a verified account that logs back in, and data export works", async ({ page }) => {
  const address = `google-${stamp}@example.com`;
  await signUp(page, address, "Gita Rai");
  const id = await userIdFor(address);
  // Google confirmed the address, there is no password anywhere, and the account is tied to Google's id.
  const stored = await withDb((db) => db.collection("users").findOne({ email: address }));
  expect(stored).toMatchObject({ name: "Gita Rai", googleId: `sub-${address}` });
  expect(stored?.emailVerifiedAt).toBeTruthy();
  expect(stored).not.toHaveProperty("passwordHash");

  await page.goto("/app/settings");
  await expect(page.getByText(`You sign in with Google as ${address}.`)).toBeVisible();
  await expect(page.getByText("Email verified by Google")).toBeVisible();

  const exported = await page.request.get("/app/settings/export");
  const data = await exported.json();
  expect(data.account.email).toBe(address);
  expect(JSON.stringify(data)).not.toMatch(/googleId|passwordHash/);
  expect(exported.headers()["content-disposition"]).toContain("shortlist-data.json");

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/$/);
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);
  await logIn(page, address);
  await expect(page).toHaveURL(/\/app$/);
  expect(await userIdFor(address)).toBe(id); // the same account, not a new one
});

test("an account made before Google sign-in is claimed by the same email, keeping its data", async ({ page }) => {
  const address = `legacy-${stamp}@example.com`;
  const id = "legacy-" + stamp;
  await withDb((db) => db.collection("users").insertOne({ _id: id as never, email: address, name: "Legacy Person", passwordHash: "scrypt$00$00", emailVerifiedAt: null, createdAt: new Date() }));
  await withDb((db) => db.collection("cv_templates").insertOne({ _id: `template-${id}` as never, userId: id, name: "Kept template", createdAt: new Date() }));

  await logIn(page, address);
  await expect(page).toHaveURL(/\/app$/); // not the new-account welcome page
  const user = await withDb((db) => db.collection("users").findOne({ email: address }));
  expect(String(user?._id)).toBe(id);
  expect(user).toMatchObject({ googleId: `sub-${address}`, name: "Legacy Person" });
  expect(user?.emailVerifiedAt).toBeTruthy();
  expect(await withDb((db) => db.collection("users").countDocuments({ email: address }))).toBe(1);
  expect(await withDb((db) => db.collection("cv_templates").countDocuments({ userId: id }))).toBe(1);
});

test("Google sign-in refuses what it should and says why", async ({ page, request }) => {
  const address = `refused-${stamp}@example.com`;
  const alert = page.getByRole("alert");

  // Closing the Google window.
  await googleIdentity({ email: address, deny: true });
  await page.goto("/login");
  await continueWithGoogle(page);
  await expect(page).toHaveURL(/\/login\?error=denied/);
  await expect(alert.filter({ hasText: "Sign-in cancelled" })).toBeVisible();

  // An address Google hasn't verified is never trusted, so no account appears.
  await googleIdentity({ email: address, emailVerified: false });
  await page.goto("/login");
  await continueWithGoogle(page);
  await expect(page).toHaveURL(/\/login\?error=unverified/);
  await expect(alert.filter({ hasText: "Google hasn’t verified this email" })).toBeVisible();
  expect(await withDb((db) => db.collection("users").countDocuments({ email: address }))).toBe(0);

  // A callback that this browser never started (no cookie, forged state) goes nowhere.
  const forged = await request.get("/api/auth/google/callback?code=forged&state=forged", { maxRedirects: 0 });
  expect(forged.status()).toBe(307);
  expect(forged.headers()["location"]).toContain("/login?error=expired");
  expect(forged.headers()["set-cookie"] ?? "").not.toContain("pc_session");

  // The email already belongs to a different Google identity.
  const owner = `owned-${stamp}@example.com`;
  await signUp(page, owner);
  await page.getByRole("button", { name: "Log out" }).click();
  await googleIdentity({ email: owner, sub: "someone-else" });
  await page.goto("/login");
  await continueWithGoogle(page);
  await expect(page).toHaveURL(/\/login\?error=conflict/);
  await expect(alert.filter({ hasText: "A different Google account is linked" })).toBeVisible();
  await page.goto("/app");
  await expect(page).toHaveURL(/\/login/);

  // The old password pages are gone for good.
  for (const path of ["/forgot-password", "/reset-password/abc", "/verify-email/abc"]) {
    await page.goto(path);
    await expect(page, path).toHaveURL(/\/login$/);
  }
});

test("the daily reminder job needs its secret", async ({ request }) => {
  expect((await request.get("/api/cron-job/daily")).status()).toBe(401);
  expect((await request.get("/api/cron-job/nope?key=e2e-cron-job-secret")).status()).toBe(404);
  const res = await request.get("/api/cron-job/daily?key=e2e-cron-job-secret&wait=1");
  expect(await res.json()).toMatchObject({ job: "daily", result: { sent: expect.any(Number) } });
});

test("deleting the account asks for the email address and removes everything", async ({ page }) => {
  const address = `delete-${stamp}@example.com`;
  await setUpJobSeeker(page, address);
  await addFixtureJob(page, FIXTURE_BASE);
  const id = await userIdFor(address);
  await page.goto("/app/settings");
  // A wrong confirmation changes nothing.
  await page.getByLabel("Type your email address to confirm").fill("someone-else@example.com");
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByText("This doesn’t match your account’s email address.")).toBeVisible();
  expect(await userIdFor(address)).toBe(id);

  await page.getByLabel("Type your email address to confirm").fill(address.toUpperCase());
  await page.getByRole("button", { name: "Delete my account" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Account deleted" })).toBeVisible();
  const left = await withDb(async (db) => ({
    jobs: await db.collection("jobs").countDocuments({ userId: id }),
    profiles: await db.collection("profiles").countDocuments({ _id: id as never }),
    users: await db.collection("users").countDocuments({ _id: id as never }),
  }));
  expect(left).toEqual({ jobs: 0, profiles: 0, users: 0 });
  // Signing in with Google again starts a brand-new, empty account.
  await logIn(page, address);
  await expect(page).toHaveURL(/\/app\/profile\?welcome=1/);
  expect(await userIdFor(address)).not.toBe(id);
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
