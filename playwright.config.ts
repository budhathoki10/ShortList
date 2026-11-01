import os from "node:os";
import path from "node:path";
import { defineConfig, devices } from "@playwright/test";
import { FREEMIUS_TEST_ENV } from "./tests/support/freemius";

const PORT = Number(process.env.SHORTLIST_E2E_PORT ?? 3200);
const FIXTURES = Number(process.env.SHORTLIST_E2E_FIXTURE_PORT ?? 4200);
// Set TEST_MONGODB_URI to use a MongoDB you run yourself (it is wiped at the start of every run);
// otherwise a throwaway one is started on E2E_MONGO_PORT.
const MONGO_PORT = Number(process.env.E2E_MONGO_PORT ?? 27018);
export const TEST_MONGODB_URI = process.env.TEST_MONGODB_URI ?? `mongodb://127.0.0.1:${MONGO_PORT}`;
export const TEST_MONGODB_DB = PORT === 3200 ? "shortlist_e2e" : `shortlist_e2e_${PORT}`;
// Emails are written here instead of being sent, so tests can follow the links.
export const EMAIL_OUTBOX = path.join(os.tmpdir(), PORT === 3200 ? "shortlist-e2e-outbox.jsonl" : `shortlist-e2e-outbox-${PORT}.jsonl`);
export const FIXTURE_BASE = `http://127.0.0.1:${FIXTURES}`;

// The app runs against its own database, with local stand-ins for job sites, and no AI key.
const appEnv = {
  // Disposable test builds should not fill the disk with a second persistent compiler cache.
  SHORTLIST_BUILD_CACHE: "0",
  SHORTLIST_BUILD_DIR: process.env.SHORTLIST_E2E_DIST_DIR ?? ".next-e2e",
  MONGODB_URI: TEST_MONGODB_URI,
  MONGODB_DB: TEST_MONGODB_DB,
  APP_URL: `http://localhost:${PORT}`,
  FETCH_ALLOW_PRIVATE_HOSTS: "1",
  // Every test browser shares one address, so the per-IP sign-up limit (10 an hour) would block a suite that makes more accounts than that.
  // Zero means "no proxy we trust", which switches the per-IP limits off. The limit's own behaviour is covered by unit tests.
  TRUSTED_PROXY_HOPS: "0",
  // No AI key: the plain-code fallbacks run, so results are deterministic.
  ANTHROPIC_API_KEY: "",
  CRON_JOB_SECRET: "e2e-cron-job-secret",
  ...FREEMIUS_TEST_ENV,
  // No access to Freemius from here: every API lookup finds nothing, and webhooks carry all the data.
  FREEMIUS_SKIP_API_SYNC: "1",
  BILLING_PRICE_LABEL_MONTHLY: "USD 9 / month",
  BILLING_PRICE_LABEL_YEARLY: "USD 90 / year",
  RESEND_API_KEY: "",
  EMAIL_DEV_OUTBOX: EMAIL_OUTBOX,
};

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  fullyParallel: false,
  workers: 1,
  reporter: "list",
  globalSetup: "./e2e/global-setup.ts",
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: [
    ...(process.env.TEST_MONGODB_URI ? [] : [{ command: "node e2e/mongod.mjs", port: MONGO_PORT, timeout: 240_000, reuseExistingServer: true }]),
    {
      command: "node e2e/fixture-sites/server.mjs",
      url: `${FIXTURE_BASE}/jobs/northwind.html`,
      env: { FIXTURE_PORT: String(FIXTURES) },
      reuseExistingServer: true,
    },
    {
      command: `npm run build && npx next start -p ${PORT}`,
      url: `http://localhost:${PORT}`,
      env: appEnv,
      timeout: 240_000,
      reuseExistingServer: false,
    },
  ],
});
