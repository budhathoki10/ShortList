import { readFileSync } from "node:fs";
import { expect, type Page } from "@playwright/test";
import { MongoClient, type Db } from "mongodb";
import { EMAIL_OUTBOX, FIXTURE_BASE, TEST_MONGODB_DB, TEST_MONGODB_URI } from "../playwright.config";

export const CV_PDF = "test-results/fixtures/asha-gurung-cv.pdf";

/** Tell the stand-in for Google who the next "Continue with Google" will sign in as. */
export async function googleIdentity(identity: { email: string; name?: string; sub?: string; emailVerified?: boolean; deny?: boolean }) {
  await fetch(`${FIXTURE_BASE}/google/_identity`, { method: "POST", body: JSON.stringify({ name: "Asha Gurung", ...identity }) });
}

/** Press "Continue with Google" on a page that is already open. */
export async function continueWithGoogle(page: Page) {
  await page.getByRole("link", { name: "Continue with Google" }).click();
}

/** Log in as an existing account. */
export async function logIn(page: Page, address: string) {
  await googleIdentity({ email: address });
  await page.goto("/login");
  await continueWithGoogle(page);
}

/** Create an account with Google. Google confirms the email, so the free trial is open straight away. */
export async function signUp(page: Page, address: string, name = "Asha Gurung") {
  await googleIdentity({ email: address, name });
  await page.goto("/signup");
  await continueWithGoogle(page);
  await expect(page).toHaveURL(/\/app\/profile\?welcome=1/);
}

/** Sign up and import the fixture CV. */
export async function setUpJobSeeker(page: Page, address: string) {
  await signUp(page, address);
  await page.goto("/app/profile?welcome=1");
  await page.locator("input[type=file][name=file]").setInputFiles(CV_PDF);
  await page.getByRole("button", { name: "Read my CV" }).click();
  await expect(page.getByRole("status").filter({ hasText: "CV imported" })).toBeVisible({ timeout: 20_000 });
}

/** Add the fixture job by link and land on its Fit tab. */
export async function addFixtureJob(page: Page, fixtureBase: string) {
  await page.goto("/app/jobs");
  await page.getByLabel("Link to the job post").fill(`${fixtureBase}/jobs/northwind.html`);
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(page).toHaveURL(/\/app\/jobs\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  return page.url();
}

/** The link in the newest email sent to `to` whose subject contains `subject`. */
export function latestEmailLink(to: string, subject: string): string {
  const emails = readFileSync(EMAIL_OUTBOX, "utf8")
    .trim()
    .split("\n")
    .map((line) => JSON.parse(line) as { to: string; subject: string; text: string })
    .filter((e) => e.to === to && e.subject.includes(subject));
  const link = emails.at(-1)?.text.match(/https?:\/\/\S+/)?.[0];
  if (!link) throw new Error(`No "${subject}" email for ${to}`);
  return link;
}

/** Run something against the test database (setting up state the UI can't, or checking what it stored). */
export async function withDb<T>(run: (db: Db) => Promise<T>): Promise<T> {
  const client = new MongoClient(TEST_MONGODB_URI);
  try {
    await client.connect();
    return await run(client.db(TEST_MONGODB_DB));
  } finally {
    await client.close();
  }
}

export async function userIdFor(address: string): Promise<string> {
  const user = await withDb((db) => db.collection("users").findOne({ email: address }));
  if (!user) throw new Error(`No user ${address}`);
  return String(user._id);
}
