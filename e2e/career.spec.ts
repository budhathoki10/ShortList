import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { FIXTURE_BASE } from "../playwright.config";
import { setUpJobSeeker, withDb } from "./helpers";

test("a candidate without Python gets an honest plan, records practice and completes an adaptive mock", async ({ page, browser }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const email = `career-${Date.now()}@example.com`;
  await setUpJobSeeker(page, email);
  await page.goto("/app/jobs");
  await page.getByRole("button", { name: "Or paste the job description" }).click();
  await page.getByLabel("Job description", { exact: true }).fill("Job title: Junior Python Developer\nCompany: Example Company\nLocation: Remote\nRequirements\n- Python programming and automated testing.\n- Strong written communication.\n- At least 2 years of Python experience.\nPreferred\n- Docker knowledge.\nResponsibilities\n- Build and maintain reliable APIs for customer-facing products.\n- Investigate errors and explain the fix to colleagues.");
  await page.getByRole("button", { name: "Add job", exact: true }).click();
  await expect(page).toHaveURL(/\/app\/jobs\/[0-9a-f-]{36}$/);
  const jobUrl = page.url();
  const jobId = jobUrl.split("/").pop()!;
  await page.getByLabel("Company website", { exact: false }).fill(`${FIXTURE_BASE}/company`);
  await page.getByRole("button", { name: "Build full analysis", exact: true }).click();
  // The summary row: the score explains (on hover) that it is evidence coverage, not a hiring probability.
  const fit = page.getByRole("region", { name: "Fit" });
  await expect(fit.locator("[title*='not a hiring probability']")).toHaveCount(1);
  await expect(page.getByRole("heading", { name: /^Requirements/ })).toBeVisible();
  const requirement = page.getByRole("listitem").filter({ has: page.locator("p", { hasText: "Python programming and automated testing." }) }).first();
  await expect(requirement).toContainText("Missing");
  // Company research is folded away until opened.
  await page.getByText("Company research", { exact: true }).click();
  await expect(page.getByText("Our engineering team builds Python services", { exact: false })).toBeVisible();

  const learning = page.locator("section[aria-labelledby=learning-roadmap] li").filter({ hasText: "Python" }).first();
  await learning.locator("summary").click();
  await learning.getByLabel("What you completed and checked").fill("I wrote a small practice tracker, checked invalid input and documented the limitations. This was practice, not professional experience.");
  await learning.getByLabel("I completed these practice checks").check();
  await learning.getByRole("button", { name: "Save learning progress" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Progress saved" })).toBeVisible();
  const savedProfile = await withDb(async (db) => {
    const user = await db.collection("users").findOne({ email });
    return db.collection("profiles").findOne({ _id: user!._id });
  });
  expect(savedProfile!.data.skills).not.toContain("Python");
  const originalFit = await fit.innerText();
  await page.reload();
  await expect(learning.getByLabel("I completed these practice checks")).toBeChecked();
  expect(await fit.innerText()).toBe(originalFit);
  mkdirSync("tmp/cv-audit/career", { recursive: true });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "tmp/cv-audit/career/plan-desktop.png", fullPage: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `plan fits ${width}`).toBe(true);
  }
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "tmp/cv-audit/career/plan-mobile.png", fullPage: true });
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto(`${jobUrl}/interview`);
  await page.getByRole("navigation", { name: "Interview mode" }).getByRole("link", { name: "Mock interview", exact: true }).click();
  await page.getByRole("button", { name: "Start mock interview", exact: true }).click();
  await expect(page).toHaveURL(/\/interview\/mock\/[0-9a-f-]{36}$/);
  const mockUrl = page.url();
  const privateContext = await browser.newContext();
  const guest = await privateContext.request.get(mockUrl);
  expect(guest.url()).toContain("/login");
  await privateContext.close();
  const question = page.getByRole("region", { name: "Current mock interview question" });
  await question.getByLabel("Your interview answer", { exact: false }).fill("I support customers and use Zendesk. I have not used Python professionally. I would start by implementing a small tracker and testing invalid input.");
  await question.getByRole("button", { name: "Submit interview answer" }).click();
  const feedback = page.getByRole("region", { name: "Mock answer feedback" });
  await expect(feedback).toContainText(/\d+\/100/);
  await expect(feedback).toContainText("Practice score (estimate)");
  await expect(feedback).toContainText("overall correctness has not been assessed");
  await page.getByRole("button", { name: "Continue interview", exact: true }).click();
  await expect(question).toContainText("Follow-up");
  await expect(question.getByRole("heading")).toContainText("Which one project");
  await page.reload();
  await expect(question).toContainText("1 answer saved");
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: "tmp/cv-audit/career/mock-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.evaluate(() => window.scrollTo(0, 0));
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.screenshot({ path: "tmp/cv-audit/career/mock-mobile.png", fullPage: true });
  await page.getByRole("button", { name: "Finish session and view report", exact: true }).click();
  const report = page.getByRole("region", { name: "Mock interview report" });
  await expect(report).toContainText("Practice score");
  await expect(report.getByLabel("Practice score by area")).toBeVisible();
  await expect(report).toContainText("an estimate");
  await expect(report).toContainText("not a prediction of any hiring decision");
  const exported = await page.request.get("/app/settings/export");
  const data = await exported.json();
  expect(data.applicationPlans).toHaveLength(1);
  expect(data.mockInterviews).toHaveLength(1);
  await page.goto("/app/strategy");
  await expect(page.getByRole("heading", { name: "Application strategy", exact: true })).toBeVisible();
  await expect(page.getByRole("link", { name: "Review application plan" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // A changed source invalidates the plan rather than silently reusing old evidence.
  await withDb(async (db) => {
    const user = await db.collection("users").findOne({ email });
    await db.collection("profiles").updateOne({ _id: user!._id }, { $set: { "data.summary": "Updated source facts." } });
  });
  await page.goto(`${jobUrl}/plan`);
  await expect(page.getByRole("alert").filter({ hasText: "Your CV or the job changed" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save learning progress" })).toHaveCount(0);
  expect(errors).toEqual([]);
  expect(jobId).toMatch(/^[0-9a-f-]{36}$/);
});
