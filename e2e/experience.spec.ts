import { expect, test } from "@playwright/test";
import { FIXTURE_BASE } from "../playwright.config";
import { addFixtureJob, continueWithGoogle, googleIdentity, logIn, setUpJobSeeker } from "./helpers";

const email = `ux-${Date.now()}@example.com`;
let jobUrl = "";

/** Each test starts in a fresh browser, so tests that need the account log in first. */
async function signedIn(page: import("@playwright/test").Page) {
  await logIn(page, email);
  await expect(page).toHaveURL(/\/app$/);
}

test.describe.configure({ mode: "serial" });

test("every page ships security headers and a script policy the browser honours", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (m) => /Content Security Policy|Refused to (execute|load|connect)/i.test(m.text()) && blocked.push(m.text()));

  const res = await page.goto("/login");
  const h = res!.headers();
  expect(h["content-security-policy"]).toMatch(/script-src [^;]*'nonce-[A-Za-z0-9+/=]+'/);
  expect(h["content-security-policy"]).toContain("frame-ancestors 'none'");
  expect(h["content-security-policy"]).toContain("object-src 'none'");
  expect(h["x-frame-options"]).toBe("DENY");
  expect(h["x-content-type-options"]).toBe("nosniff");
  expect(h["referrer-policy"]).toBe("strict-origin-when-cross-origin");
  expect(h["x-powered-by"]).toBeUndefined();

  // Static-looking pages must load their scripts too: the Google button is a plain link, so check the page really is interactive.
  for (const path of ["/login", "/signup"]) {
    await page.goto(path);
    const google = page.getByRole("link", { name: "Continue with Google" });
    await expect(google).toHaveAttribute("href", "/api/auth/google");
    await expect(page.getByRole("link", { name: "Terms" })).toBeVisible();
  }
  await page.goto("/terms");
  expect(blocked).toEqual([]);
});

test("the Google sign-in start sets only a short-lived, HttpOnly cookie and a locked-down redirect", async ({ request }) => {
  const res = await request.get("/api/auth/google?next=%2Fapp%2Fjobs", { maxRedirects: 0 });
  expect(res.status()).toBe(307);
  const target = new URL(res.headers()["location"]);
  expect(target.searchParams.get("code_challenge_method")).toBe("S256");
  expect(target.searchParams.get("scope")).toBe("openid email profile");
  expect(target.searchParams.get("state")?.length).toBeGreaterThan(10);
  const cookie = res.headers()["set-cookie"];
  expect(cookie).toMatch(/pc_oauth=/);
  expect(cookie).toMatch(/HttpOnly/i);
  expect(cookie).toMatch(/SameSite=lax/i);
  expect(cookie).toMatch(/Max-Age=600/i);
  expect(cookie).not.toMatch(/pc_session/);
});

test("login refuses to redirect off the site", async ({ page }) => {
  await setUpJobSeeker(page, email);
  jobUrl = await addFixtureJob(page, FIXTURE_BASE);
  await page.getByRole("button", { name: "Log out" }).click();
  for (const next of ["//evil.example", "/\\evil.example", "https://evil.example"]) {
    await googleIdentity({ email });
    await page.goto(`/login?next=${encodeURIComponent(next)}`);
    await continueWithGoogle(page);
    await expect(page).toHaveURL(/localhost:\d+\/app$/);
    await page.getByRole("button", { name: "Log out" }).click();
  }
  await googleIdentity({ email });
  await page.goto(`/login?next=${encodeURIComponent("/app/jobs")}`);
  await continueWithGoogle(page);
  await expect(page).toHaveURL(/\/app\/jobs$/);
});

test("signed-in pages run under the strict policy with no violations", async ({ page }) => {
  const blocked: string[] = [];
  page.on("console", (m) => /Content Security Policy|Refused to/i.test(m.text()) && blocked.push(m.text()));
  page.on("pageerror", (e) => blocked.push(String(e)));
  await signedIn(page);
  const policy = (await page.goto("/app"))!.headers()["content-security-policy"];
  expect(policy).toMatch(/style-src 'self' 'nonce-[^']+'/);
  expect(policy).not.toMatch(/style-src 'self' 'unsafe-inline'/);
  for (const path of ["/app", "/app/jobs", jobUrl.replace(/^https?:\/\/[^/]+/, ""), "/app/profile", "/app/progress", "/app/settings", "/app/billing"]) {
    await page.goto(path);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
  }
  // The one deliberate exception: the billing page (Freemius's checkout overlay) allows inline styles and its iframe; nowhere else does.
  const billing = (await page.goto("/app/billing"))!.headers()["content-security-policy"];
  expect(billing).toMatch(/style-src 'self' 'unsafe-inline'/);
  expect(billing).not.toMatch(/style-src 'self' 'nonce-/);
  expect(billing).toMatch(/script-src [^;]*'nonce-[^']+'/); // scripts stay strict even there
  expect(billing).toContain("frame-src https://checkout.freemius.com");
  expect((await page.goto("/app/settings"))!.headers()["content-security-policy"]).toContain("frame-src 'none'");
  expect((await page.goto("/app/settings"))!.headers()["content-security-policy"]).not.toContain("freemius");
  for (const path of ["/app/settings", "/login", "/"]) {
    expect((await page.goto(path))!.headers()["content-security-policy"], path).toMatch(/style-src 'self' 'nonce-[^']+'/);
  }
  // The meter on Today is a style="" attribute: it must still draw.
  await page.goto("/app");
  expect(await page.getByRole("img", { name: /tailoring runs used/i }).locator("div").evaluate((el) => (el as HTMLElement).style.width)).toMatch(/%$/);
  expect(blocked).toEqual([]);
});

test("the sidebar is an icon rail that opens over the page, without moving it", async ({ page }) => {
  await signedIn(page);
  await page.goto("/app/jobs");
  const panel = page.locator("aside[aria-label='Navigation'] > div");
  // The link is [icon cell][label]; the label is the second child.
  const label = page.getByRole("link", { name: "Progress" }).locator("> span").nth(1);
  const opacity = () => label.evaluate((el) => getComputedStyle(el).opacity);
  const width = async () => Math.round((await panel.boundingBox())!.width);
  const contentX = async () => Math.round((await page.locator("#main").boundingBox())!.x);

  // At rest: icons only, 72px wide, with accessible labels hidden visually.
  expect(await width()).toBe(72);
  expect(await opacity()).toBe("0");
  await expect(page.getByRole("link", { name: "Progress" })).toBeVisible();
  const restingX = await contentX();

  // Hover expands the menu without shifting the content.
  await page.getByRole("link", { name: "Progress" }).hover();
  await expect.poll(width).toBe(240);
  await expect.poll(opacity).toBe("1");
  expect(await contentX()).toBe(restingX);

  // Leaving folds it back.
  await page.mouse.move(900, 400);
  await expect.poll(width).toBe(72);
  await expect.poll(opacity).toBe("0");

  // Keyboard focus opens it too.
  await page.getByRole("link", { name: "Progress" }).focus();
  await expect.poll(width).toBe(240);
});

test("the palette opens from navigation without exposing global shortcuts", async ({ page }) => {
  await signedIn(page);
  const palette = page.getByRole("dialog", { name: "Command palette" });
  await page.getByRole("button", { name: "Search or jump to…" }).click();
  await expect(palette).toBeVisible();
  await expect(palette.getByRole("combobox")).toBeFocused();
  await palette.getByRole("combobox").fill("customer");
  await expect(palette.getByRole("option")).toHaveCount(1);
  await page.keyboard.press("Enter");
  await expect(page).toHaveURL(jobUrl);

  await page.keyboard.press("Control+k");
  await expect(palette).toBeHidden();
  await page.keyboard.press("g");
  await page.keyboard.press("p");
  await expect(page).toHaveURL(jobUrl);
  await expect(page.getByText("Keyboard shortcuts", { exact: true })).toHaveCount(0);
});

test("the job list filters through the URL and says why it is empty", async ({ page }) => {
  await signedIn(page);
  await page.goto("/app/jobs?q=zzz-nothing");
  await expect(page.getByRole("heading", { name: "No jobs match “zzz-nothing”" })).toBeVisible();
  await page.getByRole("link", { name: "Clear filters" }).click();
  await expect(page).toHaveURL(/\/app\/jobs$/);
  await page.goto("/app/jobs?status=offer");
  await expect(page.getByRole("heading", { name: "Nothing under Offer" })).toBeVisible();
  await page.goto("/app/jobs?status=saved");
  await expect(page.getByRole("link", { name: /Customer Success Lead/ })).toBeVisible();
});

test("a status change is instant and can be undone", async ({ page }) => {
  await signedIn(page);
  await page.goto(jobUrl);
  await page.getByLabel("Status").selectOption("applied");
  await expect(page.getByLabel("Status")).toHaveValue("applied");
  await expect(page.getByText("Moved to Applied")).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel("Status")).toHaveValue("saved");
  await page.reload();
  await expect(page.getByLabel("Status")).toHaveValue("saved");
});

test("notes save themselves when you click away", async ({ page }) => {
  await signedIn(page);
  await page.goto(jobUrl);
  await page.getByLabel("Notes").fill("Recruiter is Maya, call Thursday");
  await page.getByRole("heading", { name: "What they ask for" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Notes saved" })).toBeVisible();
  await page.reload();
  await expect(page.getByLabel("Notes")).toHaveValue("Recruiter is Maya, call Thursday");
});

test("a suggestion switches off and on at once, and the choice is saved", async ({ page }) => {
  await signedIn(page);
  await page.goto(`${jobUrl}/cv`);
  await page.getByRole("button", { name: "Suggest changes" }).click();
  await expect(page.getByRole("heading", { name: "Suggested changes" })).toBeVisible();
  const using = page.getByText(/^Using \d+ of \d+$/);
  const card = page.getByRole("listitem").filter({ hasText: "Leads with the skills in the job post" });

  await expect(card.getByText("Using")).toBeVisible();
  // The plain-code tailoring makes several suggestions; count relative to where it starts.
  const before = Number((await using.textContent())?.match(/^Using (\d+)/)?.[1]);
  // The change shows at once and saves in the background; wait for that save before reloading.
  const saved = page.waitForResponse((r) => r.request().method() === "POST" && r.url().includes("/cv"));
  await card.getByRole("button", { name: "Don't use this" }).click();
  await expect(card.getByText("Not using")).toBeVisible();
  await saved;
  await expect(using).toHaveText(new RegExp(`^Using ${before - 1} of`));

  // It was saved, not just shown.
  await page.reload();
  await expect(page.getByRole("listitem").filter({ hasText: "Leads with the skills in the job post" }).getByText("Not using")).toBeVisible();

  await page.getByRole("listitem").filter({ hasText: "Leads with the skills in the job post" }).getByRole("button", { name: "Use this" }).click();
  await expect(page.getByText(new RegExp(`^Using ${before} of`))).toBeVisible();
});

test("deleting a job names what is lost and can be cancelled with Escape", async ({ page }) => {
  await signedIn(page);
  await page.goto(jobUrl);
  await page.getByRole("button", { name: "Delete this job" }).click();
  const dialog = page.getByRole("dialog", { name: "Delete “Customer Success Lead”?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("tailored CV, cover letter and interview notes");
  await page.keyboard.press("Escape");
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("button", { name: "Delete this job" })).toBeFocused();
  await expect(page).toHaveURL(jobUrl);

  await page.getByRole("button", { name: "Delete this job" }).click();
  await dialog.getByRole("button", { name: "Delete job" }).click();
  await expect(page).toHaveURL(/\/app\/jobs$/);
  await expect(page.getByRole("link", { name: /Customer Success Lead/ })).toHaveCount(0);
});

test.describe("on a phone", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("the menu is a drawer, and the main actions are big enough to tap", async ({ page }) => {
    await signedIn(page);
    await page.goto("/app/jobs");
    await expect(page.getByRole("navigation", { name: "Main" })).toBeHidden();
    await page.getByRole("button", { name: "Open menu" }).click();
    const drawer = page.getByRole("dialog", { name: "Menu" });
    await expect(drawer.getByRole("navigation", { name: "Main" })).toBeVisible();
    await drawer.getByRole("link", { name: "Progress" }).click();
    await expect(page).toHaveURL(/\/app\/progress$/);
    await expect(drawer).toBeHidden();

    await page.goto("/app/jobs");
    for (const control of [page.getByRole("button", { name: "Add job" }), page.getByRole("button", { name: "Open menu" })]) {
      const box = await control.boundingBox();
      // Rounded to whole pixels: an entry animation can leave a sub-pixel offset (43.99998 for a 44px button).
      expect(Math.round(box!.height), "tap target height").toBeGreaterThanOrEqual(44);
      expect(Math.round(box!.width), "tap target width").toBeGreaterThanOrEqual(44);
    }
  });
});
