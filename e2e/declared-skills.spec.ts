import { expect, test } from "@playwright/test";
import { FIXTURE_BASE } from "../playwright.config";
import { setUpJobSeeker, withDb } from "./helpers";

test("a candidate declares C at 'Learning now', sees it on the CV, prepares on the stack and gets a practice score", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const email = `declared-${Date.now()}@example.com`;
  await setUpJobSeeker(page, email);
  await page.goto("/app/jobs");
  await page.getByLabel("Link to the job post").fill(`${FIXTURE_BASE}/jobs/systems.html`);
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(page).toHaveURL(/\/app\/jobs\/[0-9a-f-]{36}$/, { timeout: 20_000 });
  const jobUrl = page.url();

  // The level is required; the sentence is optional below work and project.
  await page.getByRole("link", { name: "Tailored CV" }).click();
  const gaps = page.getByRole("region", { name: /Not in your CV yet/ });
  const row = gaps.getByRole("listitem").filter({ hasText: /^\s*C\b/ }).first();
  await row.getByRole("button", { name: "I have this" }).click();
  await expect(row.getByRole("group", { name: /How well do you know it/ })).toBeVisible();
  for (const label of ["Used it at work", "Used it in a project", "Coursework or practice", "Learning now"]) await expect(row.getByText(label, { exact: true })).toBeVisible();
  await row.getByRole("button", { name: "Add to my CV" }).click();
  await expect(row).not.toContainText("Added"); // nothing chosen, nothing saved
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.setViewportSize({ width: 1440, height: 900 });
  await row.getByText("Learning now", { exact: true }).click();
  await expect(row.getByText("Optional")).toBeVisible();
  await row.getByRole("button", { name: "Add to my CV" }).click();
  await expect(row).toContainText("Added");

  // Stored structurally, shown on the CV as chosen, and nothing was written under an employer.
  const saved = await withDb(async (db) => {
    const user = await db.collection("users").findOne({ email });
    return (await db.collection("profiles").findOne({ _id: user!._id }))!.data;
  });
  expect(saved.skillLevels).toEqual({ C: "learning" });
  expect(saved.skills).toContain("C (learning)");
  expect(saved.skills).not.toContain("C");

  // Fit tab: build the full analysis; the declared skill is tagged and leads to the interview tab.
  await page.getByRole("link", { name: "Fit", exact: true }).click();
  await page.getByLabel("Company website", { exact: false }).fill(`${FIXTURE_BASE}/company`);
  await page.getByRole("button", { name: "Build full analysis", exact: true }).click();
  const gapsList = page.getByRole("region", { name: /Gaps to work on/ });
  await expect(gapsList.getByRole("link", { name: "Self-declared · prepare" }).first()).toBeVisible({ timeout: 30_000 });
  await expect(gapsList.getByRole("link", { name: "Self-declared · prepare" }).first()).toHaveAttribute("href", `${new URL(jobUrl).pathname}/interview`);

  // Question practice covers the job's stack and the declared skill, at its level.
  await page.goto(`${jobUrl}/interview`);
  await page.getByRole("button", { name: "Get my questions" }).click();
  const nav = page.getByRole("navigation", { name: "Interview questions" });
  await expect(nav.getByRole("button", { name: /current level in C honestly/ })).toBeVisible();
  await expect(nav.getByRole("button", { name: /pointer/ }).first()).toBeVisible();
  const first = page.getByRole("region", { name: "Current interview question" });
  await first.getByLabel("Your answer").fill("A pointer in C holds a memory address, so a pointer to an int is not the int itself. For example, int x = 5; int *p = &x; stores the address of x, and *p reads 5. I am learning C through small exercises.");
  await first.getByRole("button", { name: "Get feedback" }).click();
  await expect(page.getByText(/Practice score \d+\/100/)).toBeVisible();

  // Mock interview: technical questions first-class, then a clear score at the end.
  await page.getByRole("navigation", { name: "Interview mode" }).getByRole("link", { name: "Mock interview", exact: true }).click();
  await page.getByRole("button", { name: "Start mock interview", exact: true }).click();
  await expect(page).toHaveURL(/\/interview\/mock\/[0-9a-f-]{36}$/);
  const question = page.getByRole("region", { name: "Current mock interview question" });
  await question.getByLabel("Your interview answer", { exact: false }).fill("I am a developer moving towards systems work. I wrote a small tool and I am learning C so I can contribute to low-level software.");
  await question.getByRole("button", { name: "Submit interview answer" }).click();
  await page.getByRole("button", { name: "Continue interview", exact: true }).click();
  // The follow-up to the introduction, then the first technical question: the candidate's own declared skill, at its level.
  await expect(question).toContainText("Follow-up");
  await question.getByLabel("Your interview answer", { exact: false }).fill("My best example is a small command line tool I wrote and tested myself, which is why I am now learning C.");
  await question.getByRole("button", { name: "Submit interview answer" }).click();
  await page.getByRole("button", { name: "Continue interview", exact: true }).click();
  await expect(question.getByRole("heading").first()).toContainText("current level in C honestly");
  await page.getByRole("button", { name: "Finish session and view report", exact: true }).click();
  const report = page.getByRole("region", { name: "Mock interview report" });
  await expect(report).toContainText("Practice score");
  await expect(report.getByText(/^\d+$/).first()).toBeVisible();
  await expect(report.getByLabel("Practice score by area").getByRole("meter").first()).toBeVisible();
  await expect(report).toContainText("Most worth improving");
  await page.setViewportSize({ width: 390, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);

  // The score is saved with the session and shown in the session list.
  await page.goto(`${jobUrl}/interview?mode=mock`);
  await expect(page.getByRole("link", { name: /Practice score \d+\/100/ })).toBeVisible();
  expect(errors).toEqual([]);
});
