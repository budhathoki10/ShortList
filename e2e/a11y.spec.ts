import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { logIn, signUp } from "./helpers";

// Reduced motion puts every animation at its end state at once, so contrast is judged on what people actually read.
test.use({ reducedMotion: "reduce" });
test.describe.configure({ mode: "serial" });

const email = `a11y-${Date.now()}@example.com`;
const TAGS = ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"];

async function violations(page: Page) {
  const result = await new AxeBuilder({ page }).withTags(TAGS).analyze();
  return result.violations.map((v) => `${v.id} (${v.impact}): ${v.nodes.length} element(s), e.g. ${v.nodes[0]?.target.join(" ")}`);
}

for (const scheme of ["light", "dark"] as const) {
  test(`public pages have no WCAG A/AA violations (${scheme})`, async ({ browser }) => {
    const page = await (await browser.newContext({ colorScheme: scheme, reducedMotion: "reduce" })).newPage();
    for (const path of ["/", "/login", "/signup", "/templates", "/terms", "/privacy", "/refund"]) {
      await page.goto(path);
      await page.getByRole("heading", { level: 1 }).first().waitFor();
      expect(await violations(page), `${path} (${scheme})`).toEqual([]);
    }
    await page.close();
  });
}

test("signed-in pages have no WCAG A/AA violations", async ({ page }) => {
  await signUp(page, email);
  for (const path of ["/app", "/app/radar", "/app/jobs", "/app/profile", "/app/studio", "/app/studio/templates", "/app/progress", "/app/settings", "/app/billing"]) {
    await page.goto(path);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    expect(await violations(page), path).toEqual([]);
  }
});

test("the signed-in app is also clean in dark mode", async ({ browser }) => {
  const page = await (await browser.newContext({ colorScheme: "dark", reducedMotion: "reduce" })).newPage();
  await logIn(page, email);
  for (const path of ["/app", "/app/radar", "/app/jobs", "/app/billing"]) {
    await page.goto(path);
    await page.getByRole("heading", { level: 1 }).first().waitFor();
    expect(await violations(page), `${path} (dark)`).toEqual([]);
  }
  await page.close();
});
