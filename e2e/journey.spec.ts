import { expect, test } from "@playwright/test";
import { FIXTURE_BASE } from "../playwright.config";
import { DAY, events, sign } from "../tests/support/freemius";
import { addDays } from "../src/lib/dates";
import { addFixtureJob, logIn, setUpJobSeeker, withDb } from "./helpers";

const email = `asha-${Date.now()}@example.com`;

test.describe.configure({ mode: "serial" });

test("the home page explains the product and its promise", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("A CV for every job. Nothing made up.");
  await expect(page.getByText("Blocked · Salesforce isn't in your CV")).toBeVisible();
  await expect(page.getByRole("link", { name: "Start free" }).first()).toHaveAttribute("href", "/signup");
});

test("a job seeker goes from CV to application to follow-up, without anything invented", async ({ page }) => {
  // 1. CV: a real PDF upload, read into an editable profile.
  await setUpJobSeeker(page, email);
  await expect(page.getByLabel("Full name")).toHaveValue("Asha Gurung");
  await expect(page.getByLabel("Email")).toHaveValue("asha.gurung@example.com");
  await page.getByRole("navigation", { name: "CV sections" }).getByRole("button", { name: /Experience/ }).click();
  await expect(page.getByLabel("Job title").first()).toHaveValue("Support Specialist");
  await expect(page.getByLabel("Employer").first()).toHaveValue("Brightdesk");
  await expect(page.getByLabel("What you did").first()).toHaveValue(/Onboarded 40 new business accounts/);

  // Fix something by hand, as a user would.
  await page.getByRole("button", { name: "Personal details", exact: true }).click();
  await page.getByLabel("Headline").fill("Customer Support Specialist, 4 years");
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByText("Profile saved.")).toBeVisible();

  // 2. A job by link: the page's structured data is read.
  const jobUrl = await addFixtureJob(page, FIXTURE_BASE);
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Customer Success Lead");
  await expect(page.getByText("Northwind Software · Remote, Asia · USD 1800 to 2400 per month")).toBeVisible();

  // 3. Match check: Zendesk shown, Customer Success only listed, HubSpot missing.
  const score = Number(await page.getByTestId("match-score").innerText().then((t) => t.replace("%", "")));
  expect(score).toBeGreaterThan(20);
  const reqs = page.getByRole("heading", { name: "What they ask for" }).locator("xpath=..");
  await expect(reqs.getByRole("listitem").filter({ hasText: "Experience with Zendesk and HubSpot" })).toContainText("Not in your CV");
  await expect(reqs.getByRole("listitem").filter({ hasText: "Experience reducing churn" })).toContainText("You show this");
  await expect(page.getByText("Show the full post")).toHaveCount(0);

  // 4. Tailored CV: suggestions, preview, PDF.
  await page.getByRole("link", { name: "Tailor my CV" }).click();
  await page.getByRole("button", { name: "Suggest changes" }).click();
  await expect(page.getByRole("heading", { name: "Suggested changes" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Original PDF", exact: true })).toHaveAttribute("aria-pressed", "true");
  await page.getByRole("button", { name: "Tailored version", exact: true }).click();
  const preview = page.getByLabel("CV preview");
  await expect(preview.getByRole("region", { name: "Experience", exact: true }).getByRole("listitem").first()).toContainText("Zendesk");
  await expect(preview).toContainText("Zendesk, Customer Success, Onboarding");
  await expect(preview).not.toContainText("HubSpot");

  // Rejecting a change takes it out of the preview.
  const skills = page.getByRole("listitem").filter({ hasText: "Leads with the skills in the job post" });
  await skills.getByRole("button", { name: "Don't use this" }).click();
  await expect(skills.getByText("Not using")).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent("download"), page.getByRole("link", { name: "Download PDF", exact: true }).click()]);
  expect(download.suggestedFilename()).toBe("asha-gurung-cv-customer-success-lead.pdf");
  const [pdfPage] = await Promise.all([page.waitForEvent("popup"), page.getByRole("link", { name: "Print preview" }).click()]);
  await expect(pdfPage.getByLabel("CV preview")).toContainText("Asha Gurung");
  await expect(pdfPage).toHaveTitle("asha-gurung-cv-customer-success-lead");
  await pdfPage.close();

  // Free plan: no Word button, and no upsell line in its place.
  await expect(page.getByRole("link", { name: "Download Word" })).toHaveCount(0);
  await expect(page.getByText("Word download is included in paid plans")).toHaveCount(0);

  // The tab shows the step is done.
  await expect(page.getByRole("navigation", { name: "This job" }).getByRole("link", { name: "Tailored CV (done)" })).toBeVisible();

  // 5. Cover letter: drafted from the CV, edited, saved, nothing unsupported.
  await page.getByRole("link", { name: "Cover letter" }).click();
  await page.getByRole("button", { name: "Write a draft" }).click();
  const letter = page.getByLabel("Cover letter");
  await expect(letter).toHaveValue(/Customer Success Lead position at Northwind Software/);
  await expect(page.getByText("Check these before sending")).toHaveCount(0);
  await letter.fill(`${await letter.inputValue()}\n\nP.S. I can start in two weeks.`);
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByText("Cover letter saved.")).toBeVisible();

  // 6. Interview prep, with feedback on a typed answer.
  await page.getByRole("link", { name: "Interview", exact: true }).click();
  await page.getByRole("button", { name: "Get my questions" }).click();
  await expect(page.getByRole("navigation", { name: "Interview questions" }).getByRole("button", { name: /HubSpot/ }).first()).toBeVisible();
  const first = page.getByRole("region", { name: "Current interview question" });
  await first
    .getByLabel("Your answer")
    .fill("Our renewals were slipping, so I set up check-in calls two weeks before each renewal and tracked answers in the CRM. Over six months churn on my accounts fell under 3 percent, and the whole team started doing the same.");
  await first.getByRole("button", { name: "Get feedback" }).click();
  await expect(page.getByText("Guided practice · unscored")).toBeVisible();
  await expect(page.getByText("Practised 1 of")).toBeVisible();

  // 7. Apply, then a week passes with no answer.
  await page.getByLabel("Status").selectOption("applied");
  await expect(page.getByLabel("Status")).toHaveValue("applied");
  const jobId = jobUrl.split("/").pop()!;
  const jobs = <T,>(run: (c: import("mongodb").Collection) => Promise<T>) => withDb((db) => run(db.collection("jobs")));
  await expect.poll(async () => (await jobs((c) => c.findOne({ _id: jobId as never })))?.status).toBe("applied");
  const day = new Date().toISOString().slice(0, 10);
  await jobs((c) => c.updateOne({ _id: jobId as never }, { $set: { appliedOn: addDays(day, -8), followUpOn: addDays(day, -1) } }));

  await page.goto("/app");
  await expect(page.getByLabel("1 to follow up")).toBeVisible();
  const due = page.getByRole("region", { name: "Worth a follow-up" });
  await expect(due.getByRole("link", { name: "Customer Success Lead" })).toBeVisible();
  await page.goto(jobUrl);
  await expect(page.getByLabel("Follow-up message")).toHaveValue(/I applied for Customer Success Lead at Northwind Software/);
  await page.getByRole("button", { name: "I followed up" }).click();
  await expect(page.getByLabel("1 to follow up")).toHaveCount(0);

  await page.goto("/app/progress");
  await expect(page.getByText("Applications sent")).toBeVisible();
  await expect(page.locator("dd").filter({ hasText: /^1$/ }).first()).toBeVisible();
});

test("the free allowance runs out, and a Freemius subscription lifts it and unlocks Word downloads", async ({ page, request }) => {
  await logIn(page, email);
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/jobs");
  await page.getByRole("link", { name: /Customer Success Lead/ }).click();
  await page.getByRole("link", { name: "Tailored CV" }).click();
  await page.getByRole("button", { name: "Tailored version", exact: true }).click();

  // One tailoring used already; two more reach the free trial's 3 runs on this job.
  for (let i = 0; i < 2; i++) {
    await page.getByRole("button", { name: "Suggest again" }).click();
    await expect(page.getByText(/suggested change/)).toBeVisible();
  }
  await page.getByRole("button", { name: "Suggest again" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "You’ve used the free trial’s tailoring for this job" })).toBeVisible();

  // Subscribing: checkout opens, then Freemius (not the browser) confirms the purchase by webhook.
  await page.goto("/app/billing");
  await expect(page.getByTestId("current-plan")).toHaveText("Free");
  await page.getByRole("button", { name: "Subscribe monthly" }).click();
  await expect(page.locator("iframe[src*='checkout.freemius.com']")).toBeAttached({ timeout: 20_000 });
  const s = { email, licenseId: 880_001, subscriptionId: 880_002, freemiusUserId: 880_003, expiration: new Date(Date.now() + 30 * DAY) };
  for (const e of [events.licenseCreated(s), events.subscriptionCreated(s)]) {
    const body = JSON.stringify(e);
    const res = await request.post("/api/webhooks/freemius", { data: body, headers: { "content-type": "application/json", "x-signature": sign(body) } });
    expect(res.status()).toBe(200);
  }
  await page.goto("/app/billing");
  await expect(page.getByTestId("current-plan")).toHaveText("Paid");

  await page.goto("/app/jobs");
  await page.getByRole("link", { name: /Customer Success Lead/ }).click();
  await page.getByRole("link", { name: "Tailored CV" }).click();
  await page.getByRole("button", { name: "Suggest again" }).click();
  await expect(page.getByText(/suggested change/)).toBeVisible();

  await page.getByRole("button", { name: "Tailored version", exact: true }).click();
  const download = await page.request.get((await page.getByRole("link", { name: "Download Word" }).getAttribute("href"))!);
  expect(download.headers()["content-disposition"]).toBe('attachment; filename="asha-gurung-cv-customer-success-lead.docx"');
  expect((await download.body()).subarray(0, 2).toString()).toBe("PK");
});

test("a pasted job works when the site blocks reading", async ({ page }) => {
  await logIn(page, email);
  await expect(page).toHaveURL(/\/app$/);
  await page.goto("/app/jobs");
  await page.getByLabel("Link to the job post").fill(`${FIXTURE_BASE}/jobs/login-wall`);
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "This website restricts access" })).toBeVisible();
  await page.getByLabel("Job description").fill(
    "Staff Nurse\nCompany: City Hospital\nLocation: Lalitpur\n\nRequirements\n- BLS certificate\n- 2 years of ward experience\n- Patient Care\n- Excellent written communication in English",
  );
  await page.getByRole("button", { name: "Add job" }).click();
  await expect(page.getByRole("heading", { level: 1 })).toHaveText("Staff Nurse");
  await expect(page.getByText(/3 must-haves missing/)).toBeVisible();
  await expect(page.getByRole("listitem").filter({ hasText: "BLS certificate" })).toContainText("Not in your CV");
});
