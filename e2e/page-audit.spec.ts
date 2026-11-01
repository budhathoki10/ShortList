import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { FIXTURE_BASE } from "../playwright.config";
import { addFixtureJob, setUpJobSeeker, withDb } from "./helpers";

test("all main pages work on desktop and phone, without the global verification banner", async ({ page, browser }) => {
  test.setTimeout(150_000);
  mkdirSync("tmp/cv-audit/pages", { recursive: true });
  await setUpJobSeeker(page, `pages-${Date.now()}@example.com`);
  const jobUrl = await addFixtureJob(page, FIXTURE_BASE);
  await page.goto(`${jobUrl}/cv`);
  await page.getByRole("button", { name: "Suggest changes" }).click();
  await expect(page.getByRole("heading", { name: "Suggested changes" })).toBeVisible();
  await page.goto(`${jobUrl}/cover-letter`);
  await page.getByRole("button", { name: "Write a draft" }).click();
  await expect(page.getByLabel("Cover letter", { exact: true })).toBeVisible();
  await page.goto(`${jobUrl}/interview`);
  await page.getByRole("button", { name: "Get my questions" }).click();
  await expect(page.getByRole("region", { name: "Current interview question" })).toBeVisible();
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  const paths = ["/app", "/app/radar", "/app/jobs", "/app/jobs?view=board", "/app/profile", "/app/progress", "/app/settings", "/app/billing", jobUrl, `${jobUrl}/cv`, `${jobUrl}/cover-letter`, `${jobUrl}/interview`, jobUrl.replace("/jobs/", "/print/cv/") + "?layout=redesigned"];
  for (const width of [1440, 390]) {
    await page.setViewportSize({ width, height: 900 });
    for (let i = 0; i < paths.length; i++) {
      const response = await page.goto(paths[i]);
      expect(response?.status(), paths[i]).toBe(200);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      await expect(page.getByText("Confirm your email address. We sent a link")).toHaveCount(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${paths[i]} fits ${width}px`).toBe(true);
      await page.screenshot({ path: `tmp/cv-audit/pages/app-${i}-${width}.png`, fullPage: true });
    }
  }
  expect(errors).toEqual([]);

  const guest = await browser.newPage();
  for (const width of [1440, 390]) {
    await guest.setViewportSize({ width, height: 900 });
    for (const path of ["/", "/login", "/signup", "/forgot-password", "/terms", "/privacy", "/refund", "/reset-password/expired", "/verify-email/expired", "/not-a-real-page"]) {
      const response = await guest.goto(path);
      expect(response?.status()).toBe(path === "/not-a-real-page" ? 404 : 200);
      await guest.getByRole("heading", { level: 1 }).first().waitFor();
      expect(await guest.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `${path} fits ${width}px`).toBe(true);
      if (width < 640 && ["/", "/terms", "/privacy", "/refund"].includes(path)) {
        await expect(guest.getByRole("link", { name: "How it works", includeHidden: true })).toBeHidden();
        await expect(guest.getByRole("link", { name: "Pricing", exact: true, includeHidden: true })).toBeHidden();
      }
      await guest.screenshot({ path: `tmp/cv-audit/pages/public-${path.replace(/[^a-z0-9]/gi, "-") || "home"}-${width}.png`, fullPage: true });
    }
  }
  await guest.close();
});

test("legacy job search results get a repair form instead of a misleading zero match", async ({ page }) => {
  await setUpJobSeeker(page, `job-repair-${Date.now()}@example.com`);
  const jobUrl = await addFixtureJob(page, FIXTURE_BASE);
  const id = jobUrl.split("/").pop()!;
  await withDb((db) => db.collection("jobs").updateOne({ _id: id as never }, { $set: { "post.requirements": [], "post.keywords": ["Full Stack", "Software Engineer"], "match.score": 0 } }));
  await page.goto("/app/jobs");
  await expect(page.getByText("Needs description")).toBeVisible();
  await expect(page.getByText("0% match", { exact: true })).toHaveCount(0);
  await page.goto(jobUrl);
  await page.getByLabel("Full job description").fill("Frontend Developer\nCompany: Example\nRequirements\n- Build production interfaces using React and TypeScript\n- Integrate REST APIs using Node.js\n- Use Git and write automated tests for web applications.");
  await page.getByRole("button", { name: "Update job description" }).click();
  await expect(page.getByTestId("match-score")).toBeVisible();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Frontend Developer");
});
