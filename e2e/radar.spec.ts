import { randomUUID } from "node:crypto";
import { expect, test } from "@playwright/test";
import { setUpJobSeeker, userIdFor, withDb } from "./helpers";

test("a discovered job appears with evidence and enters the application workflow once", async ({ page }) => {
  const email = `radar-${Date.now()}@example.com`;
  await setUpJobSeeker(page, email);
  await page.goto("/app/radar");
  await expect(page.getByRole("heading", { name: "Job Radar" })).toBeVisible();
  await expect(page.getByText("Tell the agent what is realistic for you")).toBeVisible();

  await page.getByLabel("Target roles").fill("Customer Success Lead");
  await page.getByLabel("Target locations").fill("Remote, Asia");
  await page.getByLabel("Countries where you can work").fill("Nepal");
  await page.getByRole("button", { name: "Save Career Passport" }).click();
  await expect(page.getByText("Career Passport saved.")).toBeVisible();

  const userId = await userIdFor(email);
  const recommendationId = randomUUID();
  const discoveredJobId = randomUUID();
  await withDb(async (db) => {
    const strings = (name: string) => db.collection<{ _id: string; [key: string]: unknown }>(name);
    const [passport, profile] = await Promise.all([strings("career_passports").findOne({ _id: userId }), strings("profiles").findOne({ _id: userId })]);
    if (!passport || !profile) throw new Error("Radar test setup is missing the saved profile or Career Passport");
    const now = new Date();
    await strings("discovered_jobs").insertOne({
      _id: discoveredJobId,
      sourceType: "greenhouse",
      sourceKey: "northwind",
      externalId: "radar-1",
      canonicalUrl: "https://example.com/jobs/customer-success-lead",
      company: "Northwind Software",
      title: "Customer Success Lead",
      location: "Remote, Asia",
      text: "Customer Success Lead\nRequirements\n- Experience with Zendesk\n- Experience reducing churn",
      post: { title: "Customer Success Lead", company: "Northwind Software", location: "Remote, Asia", salary: "USD 1800 to 2400 per month", summary: "Own customer success for growing accounts.", requirements: [{ text: "Experience with Zendesk", kind: "must", keywords: ["Zendesk"] }, { text: "Experience reducing churn", kind: "must", keywords: [] }], keywords: ["Zendesk"] },
      contentHash: "radar-e2e-content",
      sourceUpdatedAt: now,
      firstSeenAt: now,
      lastSeenAt: now,
      closedAt: null,
      createdAt: now,
      updatedAt: now,
    });
    await strings("job_recommendations").insertOne({
      _id: recommendationId,
      userId,
      discoveredJobId,
      state: "ready",
      status: "active",
      evidenceScore: 84,
      preferenceScore: 96,
      match: { score: 84, keywords: [{ keyword: "Zendesk", where: "shown", evidence: "Resolved customer tickets using Zendesk" }], requirements: [{ text: "Experience with Zendesk", kind: "must", status: "shown", evidence: "Resolved customer tickets using Zendesk" }, { text: "Experience reducing churn", kind: "must", status: "shown", evidence: "Reduced churn below 3 percent" }] },
      eligibility: [],
      reasons: ["100% role-title fit with Customer Success Lead", "84% of weighted CV evidence is present", "No must-have evidence gaps found"],
      ruleVersion: 1,
      profileUpdatedAt: profile.updatedAt,
      passportVersion: passport.version,
      jobContentHash: "radar-e2e-content",
      notificationVersion: 1,
      trackerJobId: null,
      dismissalReason: null,
      createdAt: now,
      updatedAt: now,
    });
  });

  await page.goto("/app/radar");
  await expect(page.getByRole("heading", { name: "Ready to apply" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Customer Success Lead" })).toBeVisible();
  await expect(page.getByText("84%", { exact: true })).toBeVisible();
  await page.screenshot({ path: "test-results/radar-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "test-results/radar-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1280, height: 720 });
  await page.getByRole("link", { name: "Review evidence" }).click();
  await expect(page.getByRole("heading", { name: "Requirement evidence" })).toBeVisible();
  await expect(page.getByText("Resolved customer tickets using Zendesk")).toBeVisible();

  await page.getByRole("button", { name: "Save and prepare" }).click();
  await expect(page).toHaveURL(/\/app\/jobs\/[0-9a-f-]{36}$/);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Customer Success Lead");
  await expect.poll(() => withDb((db) => db.collection("jobs").countDocuments({ userId }))).toBe(1);
});
