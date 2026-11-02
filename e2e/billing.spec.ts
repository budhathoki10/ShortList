import { expect, test, type APIRequestContext, type Page } from "@playwright/test";
import { FIXTURE_BASE } from "../playwright.config";
import { DAY, events, SECRET, sign, type FsEvent, type LicenseSpec } from "../tests/support/freemius";
import { addFixtureJob, logIn, setUpJobSeeker, userIdFor, withDb } from "./helpers";

const stamp = Date.now();
const email = `bill-${stamp}@example.com`;
let jobId = "";
const licenseSeq = stamp % 1_000_000;

test.describe.configure({ mode: "serial" });

const post = (request: APIRequestContext, e: FsEvent | string, headers: Record<string, string> = {}) => {
  const body = typeof e === "string" ? e : JSON.stringify(e);
  return request.post("/api/webhooks/freemius", { data: body, headers: { "content-type": "application/json", "x-signature": sign(body), ...headers } });
};
const subs = () => withDb((db) => db.collection("subscriptions").find({ buyerEmail: email }).toArray());
const license = (over: Partial<LicenseSpec> = {}): LicenseSpec => ({ email, licenseId: licenseSeq, subscriptionId: licenseSeq + 1, freemiusUserId: licenseSeq + 2, expiration: new Date(Date.now() + 30 * DAY), ...over });
/** Log in and wait until the app has actually loaded: navigating mid-login would cancel it. */
async function signedIn(page: Page) {
  await logIn(page, email);
  await expect(page).toHaveURL(/\/app$/);
}
const download = (page: Page) => page.request.get(`/app/download/cv/${jobId}`, { maxRedirects: 0 });

test("the billing page offers monthly and yearly, and prepares checkout on the server without leaking a secret", async ({ page }) => {
  await setUpJobSeeker(page, email);
  jobId = (await addFixtureJob(page, FIXTURE_BASE)).split("/").pop()!;
  const violations: string[] = [];
  page.on("console", (m) => /Content Security Policy|Refused to/i.test(m.text()) && violations.push(m.text()));

  await page.goto("/app/billing");
  await expect(page.getByTestId("current-plan")).toHaveText("Free");
  await expect(page.getByText("USD 19 / month")).toBeVisible();
  await expect(page.getByText("USD 90 / year")).toBeVisible();
  await expect(page.getByRole("button", { name: "Subscribe monthly" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Subscribe yearly" })).toBeEnabled();

  // Opening checkout: the server decides everything and the overlay is Freemius's own iframe.
  await page.getByRole("button", { name: "Subscribe monthly" }).click();
  await expect(page.locator("iframe[src*='checkout.freemius.com']")).toBeAttached({ timeout: 20_000 });
  expect(violations).toEqual([]);

  // Nothing secret reached the browser.
  const html = await page.content();
  for (const secret of [SECRET, "test-api-key"]) expect(html).not.toContain(secret);

  // The waiting row exists, is locked to this account's email, and grants nothing.
  const [row] = await subs();
  expect(row).toMatchObject({ status: "pending", interval: "monthly", userId: await userIdFor(email), buyerEmail: email, freemiusLicenseId: null });
  expect((await download(page)).status()).toBe(303); // still free: opening checkout unlocked nothing
});

test("a pending checkout can be cancelled before opening another", async ({ page }) => {
  await signedIn(page);
  await page.goto("/app/billing");
  await expect(page.getByText("A checkout is already open for your account.").first()).toBeVisible();
  await expect(page.getByRole("button", { name: "Subscribe monthly" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Subscribe yearly" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel pending checkout" }).click();
  await expect(page.getByRole("button", { name: "Subscribe monthly" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Subscribe yearly" })).toBeEnabled();
  await expect.poll(async () => (await subs()).length).toBe(0);
});

test("a signed purchase from Freemius activates paid access; the browser alone never can", async ({ page, request }) => {
  await signedIn(page);
  const s = license();
  // Claiming success from the browser changes nothing: the server only ever believes Freemius.
  await page.goto("/app/billing?status=success");
  await expect(page.getByTestId("current-plan")).toHaveText("Free");
  expect((await download(page)).status()).toBe(303);

  expect((await post(request, events.licenseCreated(s))).status()).toBe(200);
  expect((await post(request, events.subscriptionCreated(s))).status()).toBe(200);

  const [row] = await subs();
  expect(row).toMatchObject({ status: "active", interval: "monthly", freemiusLicenseId: String(s.licenseId), userId: await userIdFor(email) });
  expect(await subs()).toHaveLength(1); // the waiting row became the subscription, no duplicate

  await page.goto("/app/billing");
  await expect(page.getByTestId("current-plan")).toHaveText("Paid");
  await expect(page.getByText("Active", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel subscription" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Subscribe monthly" })).toBeDisabled(); // no second subscription
  const file = await download(page); // the paid feature, behind the real server-side check
  expect(file.status()).toBe(200);
  expect(file.headers()["content-type"]).toContain("wordprocessingml");
  expect((await file.body()).subarray(0, 2).toString()).toBe("PK");
});

test("a webhook that isn't properly signed is refused and changes nothing", async ({ request }) => {
  const before = JSON.stringify(await subs());
  const s = license({ expiration: new Date(Date.now() + 999 * DAY) });
  const e = events.licenseExtended(s);
  const body = JSON.stringify(e);
  const cases: [string, Record<string, string>, string][] = [
    ["a made-up signature", { "x-signature": "0".repeat(64) }, body],
    ["no signature", { "x-signature": "" }, body],
    ["not hex", { "x-signature": "not-a-signature" }, body],
    ["another key's signature", { "x-signature": sign(body, "attacker-key-attacker-key-attacker-key") }, body],
    ["a body changed after signing", { "x-signature": sign(body) }, body.replace(String(s.licenseId), "99999999")],
  ];
  for (const [label, headers, sent] of cases) {
    const res = await request.post("/api/webhooks/freemius", { data: sent, headers: { "content-type": "application/json", ...headers } });
    expect(res.status(), label).toBe(401);
  }
  expect(JSON.stringify(await subs())).toBe(before);
  expect((await withDb((db) => db.collection("webhook_events").countDocuments({ eventId: e.id })))).toBe(0); // refused before anything was recorded
});

test("delivering the same event again, and many times at once, is harmless", async ({ request }) => {
  const s = license();
  const e = events.licenseExtended(s, new Date(), `evt_dup_${stamp}`);
  expect((await post(request, e)).status()).toBe(200);
  const snapshot = JSON.stringify(await subs());
  expect((await post(request, e)).status()).toBe(200); // a redelivery
  expect(JSON.stringify(await subs())).toBe(snapshot);

  const race = events.licenseExtended({ ...s, expiration: new Date(Date.now() + 60 * DAY) }, new Date(Date.now() + 5000), `evt_race_${stamp}`);
  const results = await Promise.all(Array.from({ length: 8 }, () => post(request, race)));
  for (const r of results) expect([200, 500]).toContain(r.status()); // done, or "busy, try again": never a second run
  expect(results.some((r) => r.status() === 200)).toBe(true);
  expect(await subs()).toHaveLength(1);
  expect(await withDb((db) => db.collection("webhook_events").countDocuments({ eventId: race.id }))).toBe(1);
  // A retry of a "busy" answer now finds it done.
  expect((await post(request, race)).status()).toBe(200);
});

test("a delayed older event can't undo newer data", async ({ request }) => {
  const s = license();
  const [before] = await subs();
  const stale = events.licenseUpdated({ ...s, expiration: new Date(Date.now() + 1 * DAY), updated: new Date(Date.now() - 30 * DAY) }, new Date(Date.now() - 30 * DAY));
  expect((await post(request, stale)).status()).toBe(200);
  const [after] = await subs();
  expect(after.paidThrough.getTime()).toBe(before.paidThrough.getTime());
});

test("a failed renewal keeps access through the grace period, and recovery restores it", async ({ page, request }) => {
  await signedIn(page);
  const s = license({ expiration: new Date(Date.now() - 3600_000) }); // the paid period just ended
  const at = new Date(Date.now() + 10_000);
  expect((await post(request, events.renewalFailed({ ...s, updated: at }, at))).status()).toBe(200);
  expect((await subs())[0]).toMatchObject({ status: "past_due", failedPayments: 1 });
  await page.goto("/app/billing");
  await expect(page.getByText("Payment failed").first()).toBeVisible();
  expect((await download(page)).status()).toBe(200); // inside the grace period: still in

  const back = new Date(Date.now() + 20_000);
  expect((await post(request, events.licenseExtended(license({ expiration: new Date(Date.now() + 30 * DAY), updated: back }), back))).status()).toBe(200);
  expect((await subs())[0]).toMatchObject({ status: "active", failedPayments: 0 });
});

test("cancelling keeps access until the paid-through date, then expiry removes it", async ({ page, request }) => {
  await signedIn(page);
  const at = new Date(Date.now() + 30_000);
  expect((await post(request, events.subscriptionCancelled(license({ updated: at }), at))).status()).toBe(200);
  expect((await subs())[0]).toMatchObject({ status: "cancelled" });
  await page.goto("/app/billing");
  await expect(page.getByText("Cancelled", { exact: true })).toBeVisible();
  await expect(page.getByTestId("current-plan")).toHaveText("Paid"); // paid for, so still usable
  expect((await download(page)).status()).toBe(200);

  // The period ends (Freemius says the license expired).
  const ended = new Date(Date.now() + 60_000);
  expect((await post(request, events.licenseExpired(license({ expiration: new Date(Date.now() - 1000), updated: ended }), ended))).status()).toBe(200);
  expect((await subs())[0]).toMatchObject({ status: "expired" });
  await page.goto("/app/billing");
  await expect(page.getByTestId("current-plan")).toHaveText("Free");
  const blocked = await download(page);
  expect(blocked.status()).toBe(303); // no access after expiration, enforced on the server
  expect(blocked.headers().location).toContain("/app/billing");
  // And they can subscribe again.
  await expect(page.getByRole("button", { name: "Subscribe monthly" })).toBeEnabled();
});
