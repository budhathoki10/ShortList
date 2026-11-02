import { mkdirSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { continueWithGoogle, googleIdentity } from "./helpers";

test("a sign-in problem is explained in plain words, keeps the page steady and fits every screen", async ({ page }) => {
  await page.goto("/login");
  const button = page.getByRole("link", { name: "Continue with Google" });
  const before = await button.boundingBox();

  await googleIdentity({ email: "feedback-candidate@example.com", deny: true });
  await continueWithGoogle(page);
  const message = page.getByRole("alert").filter({ hasText: "Sign-in cancelled" });
  await expect(message).toContainText("You closed the Google window before finishing.");
  // The error appears above the button, and the button is still the same size and still works.
  const after = await button.boundingBox();
  expect(Math.abs(after!.width - before!.width), "The button keeps its width when an error appears").toBeLessThanOrEqual(1);
  await expect(button).toBeEnabled();
  expect(page.url()).not.toMatch(/password|email=/);

  mkdirSync("tmp/feedback-audit", { recursive: true });
  for (const width of [320, 390, 768, 1440]) {
    await page.setViewportSize({ width, height: 900 });
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), `login fits ${width}px`).toBe(true);
    expect((await message.boundingBox())!.height, `compact notice at ${width}px`).toBeLessThanOrEqual(120);
  }
  await page.screenshot({ path: "tmp/feedback-audit/login-desktop.png", fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  await page.screenshot({ path: "tmp/feedback-audit/login-mobile.png", fullPage: true });
  await page.emulateMedia({ colorScheme: "dark" });
  await page.screenshot({ path: "tmp/feedback-audit/login-dark.png", fullPage: true, animations: "disabled" });
});
