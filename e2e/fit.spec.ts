import { expect, test } from "@playwright/test";
import { FIXTURE_BASE } from "../playwright.config";
import { addFixtureJob, setUpJobSeeker, withDb } from "./helpers";

test("four steps per job, and a missing skill is added honestly, in the candidate's own words", async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (err) => errors.push(err.message));
  const email = `fit-${Date.now()}@example.com`;
  await setUpJobSeeker(page, email);
  const jobUrl = await addFixtureJob(page, FIXTURE_BASE);

  // Four tabs, one per step. The old plan address lands on Fit.
  const tabs = page.getByRole("navigation", { name: "This job" }).getByRole("link");
  await expect(tabs).toHaveCount(4);
  for (const [i, name] of ["Fit", "Tailored CV", "Cover letter", "Interview"].entries()) await expect(tabs.nth(i)).toHaveAccessibleName(name);
  await page.goto(`${jobUrl}/plan`);
  await expect(page).toHaveURL(jobUrl);
  await expect(page.getByRole("button", { name: "Build full analysis" })).toBeVisible();
  const reqs = page.getByRole("heading", { name: "What they ask for" }).locator("xpath=..");
  await expect(reqs.getByRole("listitem").filter({ hasText: "Experience with Zendesk and HubSpot" })).toContainText("Not in your CV");

  // Tailored CV: HubSpot is missing. The candidate says where they used it.
  await page.getByRole("link", { name: "Tailored CV" }).click();
  const gaps = page.getByRole("region", { name: /Not in your CV yet/ });
  const hubspot = gaps.getByRole("listitem").filter({ hasText: "HubSpot" });
  await hubspot.getByRole("button", { name: "I have this" }).click();
  // A level is required, and it is the candidate's own choice.
  await expect(hubspot.getByRole("group", { name: /How well do you know it/ })).toBeVisible();
  await hubspot.getByText("Used it at work", { exact: true }).click();
  await hubspot.getByLabel("Where did you use it?").selectOption({ index: 0 });
  await hubspot.getByLabel("What did you do with it?").fill("Kept customer records and renewal notes in HubSpot for 60 accounts");
  await hubspot.getByRole("button", { name: "Add to my CV" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Added to your CV" })).toBeVisible();
  await expect(hubspot).toContainText("Added");
  await expect(hubspot.getByRole("button", { name: "I have this" })).toHaveCount(0);

  // Exactly their sentence was saved, nothing else was written for them.
  const saved = await withDb(async (db) => {
    const user = await db.collection("users").findOne({ email });
    return (await db.collection("profiles").findOne({ _id: user!._id }))!.data;
  });
  expect(saved.skills).toContain("HubSpot");
  expect(saved.skillLevels).toEqual({ HubSpot: "work" });
  expect(saved.experience[0].bullets.at(-1)).toBe("Kept customer records and renewal notes in HubSpot for 60 accounts");

  // Fit now shows it.
  await page.getByRole("link", { name: "Fit", exact: true }).click();
  await expect(reqs.getByRole("listitem").filter({ hasText: "Experience with Zendesk and HubSpot" })).toContainText("You show this");

  // Cover letter: a PDF in the same look as the CV, and the tab is ticked.
  await page.getByRole("link", { name: "Cover letter" }).click();
  await page.getByRole("button", { name: "Write a draft" }).click();
  await expect(page.getByLabel("Cover letter")).toHaveValue(/Northwind Software/);
  const [pdf] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: "Download PDF" }).click()]);
  await expect(pdf).toHaveTitle("asha-gurung-cover-letter-customer-success-lead");
  await expect(pdf.locator(".cv-letter-body")).toContainText("Northwind Software");
  await pdf.close();
  await expect(tabs.filter({ hasText: "Cover letter" })).toHaveAccessibleName("Cover letter (done)");
  expect(errors).toEqual([]);
});
