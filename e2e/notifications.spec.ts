import { readFileSync } from "node:fs";
import { expect, test } from "@playwright/test";
import { EMAIL_OUTBOX, FIXTURE_BASE } from "../playwright.config";
import { addFixtureJob, signUp, withDb } from "./helpers";

const CRON = { Authorization: "Bearer e2e-cron-job-secret" };

function remindersTo(address: string) {
  let lines: string[] = [];
  try {
    lines = readFileSync(EMAIL_OUTBOX, "utf8").trim().split("\n").filter(Boolean);
  } catch {
    return 0;
  }
  return lines.map((line) => JSON.parse(line) as { to: string; subject: string }).filter((mail) => mail.to === address && /follow up/i.test(mail.subject)).length;
}

test("the notifications switch in Settings persists across a reload and stops follow-up reminders", async ({ page, request }) => {
  const address = `quiet-${Date.now()}@example.com`;
  await signUp(page, address);

  // An application that is due a follow-up, so the daily job would email about it.
  const jobUrl = await addFixtureJob(page, FIXTURE_BASE);
  const jobId = jobUrl.split("/").pop()!;
  const day = new Date().toISOString().slice(0, 10);
  await withDb((db) => db.collection("jobs").updateOne({ _id: jobId as never }, { $set: { status: "applied", appliedOn: day, followUpOn: day } }));

  await page.goto("/app/settings");
  const toggle = page.getByRole("switch", { name: "Notifications", exact: true });
  await expect(toggle).toHaveAttribute("aria-checked", "true");
  await toggle.focus();
  await page.keyboard.press("Space");
  await expect(page.getByText("Notifications turned off")).toBeVisible();
  await expect(toggle).toHaveAttribute("aria-checked", "false");

  await page.reload();
  await expect(page.getByRole("switch", { name: "Notifications", exact: true })).toHaveAttribute("aria-checked", "false");
  await expect(page.getByText("Notifications are off. Nothing from Job Radar")).toBeVisible();

  // Radar's alert settings say so, and link back here.
  await page.goto("/app/radar");
  await expect(page.getByText("Notifications are off for your account")).toBeVisible();
  await expect(page.getByRole("link", { name: "Turn them on in Settings" })).toHaveAttribute("href", "/app/settings#notifications");

  const off = await request.get("/api/cron-job/daily?wait=1", { headers: CRON });
  expect(off.status()).toBe(200);
  expect(remindersTo(address)).toBe(0);

  await page.goto("/app/settings");
  await page.getByRole("switch", { name: "Notifications", exact: true }).click();
  await expect(page.getByRole("switch", { name: "Notifications", exact: true })).toHaveAttribute("aria-checked", "true");
  await page.reload();
  await expect(page.getByRole("switch", { name: "Notifications", exact: true })).toHaveAttribute("aria-checked", "true");

  const on = await request.get("/api/cron-job/daily?wait=1", { headers: CRON });
  expect(on.status()).toBe(200);
  expect(remindersTo(address)).toBe(1);
});
